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

    # ── Tool use ──────────────────────────────────────────────────────────────

    async def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[Tool],
        model: str | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
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

        try:
            saw_function_call = False
            call_counter = 0

            async for chunk in await self.client.aio.models.generate_content_stream(
                model=model or self.model,
                contents=contents,
                config=config,
            ):
                # Streamed text
                if chunk.text:
                    yield {"type": "text", "delta": chunk.text}

                # Function calls come on candidates -> content -> parts
                cand = (chunk.candidates or [None])[0]
                if not cand or not cand.content:
                    continue
                for part in cand.content.parts or []:
                    fc = getattr(part, "function_call", None)
                    if fc and fc.name:
                        saw_function_call = True
                        # Gemini doesn't return an id; synthesize a stable one
                        call_id = f"gem_{fc.name}_{call_counter}"
                        call_counter += 1
                        yield {
                            "type": "tool_call",
                            "id": call_id,
                            "name": fc.name,
                            "args": dict(fc.args or {}),
                        }

            stop = "tool_use" if saw_function_call else "end_turn"
            yield {"type": "turn_end", "stop_reason": stop, "error": None}

        except Exception as e:
            yield {"type": "turn_end", "stop_reason": "error", "error": str(e)}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _clean_schema_for_gemini(schema: dict[str, Any]) -> dict[str, Any]:
    """Gemini's parameters schema rejects some JSON Schema fields (default,
    additionalProperties on objects, etc). Strip the ones we use."""
    if not isinstance(schema, dict):
        return schema
    out = {k: v for k, v in schema.items() if k not in ("additionalProperties",)}
    if "properties" in out and isinstance(out["properties"], dict):
        out["properties"] = {
            k: _clean_schema_for_gemini(v) for k, v in out["properties"].items()
        }
        # Strip 'default' from each property
        for v in out["properties"].values():
            if isinstance(v, dict):
                v.pop("default", None)
    return out


def _to_gemini_contents(messages: list[Message]) -> list[dict[str, Any]]:
    """Canonical messages → Gemini `contents` list.

    Gemini uses role='user' for tool results too (with function_response parts)
    and role='model' for assistant turns. The order of (function_call,
    function_response) MUST match for the model to ground the next turn.
    """
    contents: list[dict[str, Any]] = []
    # Keep a map name->id for matching tool_results back to function_calls
    # (Gemini doesn't track ids — match by name + order.)
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
                parts.append({
                    "function_call": {
                        "name": b["name"],
                        "args": b["args"] or {},
                    }
                })
        if parts:
            contents.append({"role": _role_for_gemini(role), "parts": parts})

    return contents


def _role_for_gemini(role: str) -> str:
    return "model" if role == "assistant" else "user"


def _name_from_id(call_id: str) -> str:
    # ids are "gem_<name>_<n>"
    if call_id.startswith("gem_"):
        rest = call_id[4:]
        last_underscore = rest.rfind("_")
        if last_underscore > 0:
            return rest[:last_underscore]
    return ""
