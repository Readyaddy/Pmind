import base64
from typing import Any, AsyncGenerator

from google import genai
from google.genai import types as gtypes

from .base import LLMProvider
from .types import Message, StreamEvent, Tool


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    async def complete(
        self, system_prompt: str, user_message: str, stream: bool = True
    ) -> AsyncGenerator[str, None]:
        config = gtypes.GenerateContentConfig(system_instruction=system_prompt)
        async for chunk in await self.client.aio.models.generate_content_stream(
            model=self.model,
            contents=user_message,
            config=config,
        ):
            if chunk.text:
                yield chunk.text

    # ── Tool use (non-streaming, so thought_signatures are intact) ────────────

    async def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[Tool],
        model: str | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream one assistant turn with tool detection.

        Phase 1 — streaming: text tokens are yielded immediately so the UI
        updates in real time.  Function-call parts are collected but not emitted.

        Phase 2 — non-streaming (only when tool calls were found): re-runs
        generate_content to get thought_signature bytes on each function_call
        Part.  Gemini 2.5 thinking models attach these signatures and require
        them to be echoed back on subsequent turns; they are only reliable on
        the complete response object, not on individual stream chunks.

        If Phase 1 yields no function calls the response is complete and no
        second API call is made.
        """
        gem_tool = gtypes.Tool(
            function_declarations=[
                gtypes.FunctionDeclaration(
                    name=t["name"],
                    description=t["description"],
                    parameters=_clean_schema_for_gemini(t["parameters"]),
                )
                for t in tools
            ],
        )
        config = gtypes.GenerateContentConfig(
            system_instruction=system,
            tools=[gem_tool],
        )
        contents = _to_gemini_contents(messages)

        # ── Phase 1: streaming pass ─────────────────────────────────────────
        # Stream text tokens immediately; collect function-call info.

        stream_calls: list[tuple[str, dict]] = []  # (name, args) in order

        try:
            async for chunk in await self.client.aio.models.generate_content_stream(
                model=model or self.model,
                contents=contents,
                config=config,
            ):
                cand = (chunk.candidates or [None])[0]
                if not cand or not cand.content or not cand.content.parts:
                    try:
                        text = chunk.text
                        if text:
                            yield {"type": "text", "delta": text}
                    except Exception:
                        pass
                    continue

                for part in cand.content.parts or []:
                    if getattr(part, "thought", False):
                        continue
                    part_text = getattr(part, "text", None)
                    if part_text:
                        yield {"type": "text", "delta": part_text}
                    fc = getattr(part, "function_call", None)
                    if fc and getattr(fc, "name", None):
                        stream_calls.append((fc.name, dict(fc.args or {})))

        except Exception as e:
            yield {"type": "turn_end", "stop_reason": "error", "error": str(e)}
            return

        if not stream_calls:
            # Pure text response — already fully streamed, no second call needed.
            yield {"type": "turn_end", "stop_reason": "end_turn", "error": None}
            return

        # ── Phase 2: non-streaming for thought_signature ────────────────────
        # Re-run generate_content so thought_signature bytes are present on
        # each function_call Part.  Tool-call events are emitted from here.

        try:
            response = await self.client.aio.models.generate_content(
                model=model or self.model,
                contents=contents,
                config=config,
            )

            # Collect function_call Parts from complete response (in order).
            ns_fc_parts: list = []
            candidate = (response.candidates or [None])[0]
            if candidate and candidate.content:
                for part in candidate.content.parts or []:
                    if getattr(part, "thought", False):
                        continue
                    fc = getattr(part, "function_call", None)
                    if fc and getattr(fc, "name", None):
                        ns_fc_parts.append(part)

            # Emit tool_call events — names/args from Phase 1 (consistent with
            # text already shown); thought_sig from Phase 2 at the same position.
            for i, (stream_name, stream_args) in enumerate(stream_calls):
                call_id = f"gem_{stream_name}_{i}"
                ns_part = ns_fc_parts[i] if i < len(ns_fc_parts) else None
                ts_bytes = getattr(ns_part, "thought_signature", None) if ns_part else None
                yield {
                    "type": "tool_call",
                    "id": call_id,
                    "name": stream_name,
                    "args": stream_args,
                    "_thought_sig": (
                        base64.b64encode(ts_bytes).decode("ascii")
                        if ts_bytes else None
                    ),
                }

            yield {"type": "turn_end", "stop_reason": "tool_use", "error": None}

        except Exception as e:
            yield {"type": "turn_end", "stop_reason": "error", "error": str(e)}

    # ── Text-only streaming (no tools config → true incremental streaming) ─────

    async def stream_text(
        self,
        *,
        system: str,
        messages: list[Message],
        model: str | None = None,
        disable_thinking: bool = False,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream a text response without tool declarations.

        Omitting tools from the config enables true token-by-token streaming
        (Gemini buffers responses when tools are present).  Use this for the
        final response turn after all tools have been executed.

        disable_thinking=True sets thinking_budget=0, eliminating the internal
        reasoning pause so the first token arrives almost immediately.  Safe to
        use when the model already has all context it needs (e.g. tool results).
        """
        cfg_kwargs: dict = {"system_instruction": system}
        if disable_thinking:
            try:
                cfg_kwargs["thinking_config"] = gtypes.ThinkingConfig(thinking_budget=0)
            except Exception:
                pass  # older SDK versions may not support this field
        config = gtypes.GenerateContentConfig(**cfg_kwargs)
        contents = _to_gemini_contents(messages)

        try:
            async for chunk in await self.client.aio.models.generate_content_stream(
                model=model or self.model,
                contents=contents,
                config=config,
            ):
                cand = (chunk.candidates or [None])[0]
                if not cand or not cand.content or not cand.content.parts:
                    try:
                        text = chunk.text
                        if text:
                            yield {"type": "text", "delta": text}
                    except Exception:
                        pass
                    continue
                for part in cand.content.parts or []:
                    # Skip internal reasoning parts from thinking models.
                    if getattr(part, "thought", False):
                        continue
                    part_text = getattr(part, "text", None)
                    if part_text:
                        yield {"type": "text", "delta": part_text}

            yield {"type": "turn_end", "stop_reason": "end_turn", "error": None}
        except Exception as e:
            yield {"type": "turn_end", "stop_reason": "error", "error": str(e)}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _clean_schema_for_gemini(schema: dict[str, Any]) -> dict[str, Any]:
    """Strip JSON Schema fields Gemini rejects (default, additionalProperties)."""
    if not isinstance(schema, dict):
        return schema
    out = {k: v for k, v in schema.items() if k not in ("additionalProperties",)}
    if "properties" in out and isinstance(out["properties"], dict):
        out["properties"] = {
            k: _clean_schema_for_gemini(v) for k, v in out["properties"].items()
        }
        for v in out["properties"].values():
            if isinstance(v, dict):
                v.pop("default", None)
    return out


def _to_gemini_contents(messages: list[Message]) -> list[dict[str, Any]]:
    """Canonical messages → Gemini contents list.

    Restores thought_signature bytes on function_call parts so Gemini 2.5
    thinking models don't reject the request with 400 INVALID_ARGUMENT.
    """
    contents: list[dict[str, Any]] = []
    for m in messages:
        role = m["role"]
        content = m["content"]

        if role == "tool":
            parts = []
            for b in content:
                if b.get("type") == "tool_result":
                    name = b.get("name") or _name_from_id(b.get("tool_call_id", ""))
                    parts.append({
                        "function_response": {
                            "name": name or "tool",
                            "response": {"content": b.get("content", "")},
                        }
                    })
            if parts:
                contents.append({"role": "user", "parts": parts})
            continue

        if isinstance(content, str):
            contents.append({"role": _role_for_gemini(role), "parts": [{"text": content}]})
            continue

        parts: list[dict[str, Any]] = []
        for b in content:
            t = b.get("type")
            if t == "text":
                parts.append({"text": b["text"]})
            elif t == "tool_call":
                fc_dict: dict[str, Any] = {
                    "name": b["name"],
                    "args": b.get("args") or {},
                }
                ts_b64 = b.get("_thought_sig")
                # thought_signature belongs on the Part dict, not inside
                # function_call — this is what Gemini 2.5 thinking models
                # require when echoing back a prior function call.
                part_dict: dict[str, Any] = {"function_call": fc_dict}
                if ts_b64:
                    try:
                        part_dict["thought_signature"] = base64.b64decode(ts_b64)
                    except Exception:
                        pass
                parts.append(part_dict)
        if parts:
            contents.append({"role": _role_for_gemini(role), "parts": parts})

    return contents


def _role_for_gemini(role: str) -> str:
    return "model" if role == "assistant" else "user"


def _name_from_id(call_id: str) -> str:
    if call_id.startswith("gem_"):
        rest = call_id[4:]
        last_underscore = rest.rfind("_")
        if last_underscore > 0:
            return rest[:last_underscore]
    return ""
