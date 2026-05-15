import json
from typing import Any, AsyncGenerator

from openai import AsyncOpenAI

from .base import LLMProvider
from .types import Message, StreamEvent, Tool


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def complete(
        self, system_prompt: str, user_message: str, stream: bool = True
    ) -> AsyncGenerator[str, None]:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            stream=stream,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ── Tool use ──────────────────────────────────────────────────────────────

    async def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[Tool],
        model: str | None = None,
        tool_choice: str | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        oai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in tools
        ]
        oai_messages = _to_openai_messages(system, messages)
        extra: dict = {}
        if tool_choice == "any" and oai_tools:
            extra["tool_choice"] = "required"

        try:
            stream = await self.client.chat.completions.create(
                model=model or self.model,
                messages=oai_messages,
                tools=oai_tools,
                stream=True,
                **extra,
            )

            # Tool calls arrive in deltas; assemble by index
            pending: dict[int, dict[str, Any]] = {}
            finish_reason: str | None = None

            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta
                if delta and delta.content:
                    yield {"type": "text", "delta": delta.content}
                if delta and getattr(delta, "tool_calls", None):
                    for tc in delta.tool_calls:
                        idx = tc.index
                        slot = pending.setdefault(
                            idx,
                            {"id": "", "name": "", "arguments": ""},
                        )
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                slot["name"] = tc.function.name
                            if tc.function.arguments:
                                slot["arguments"] += tc.function.arguments
                if choice.finish_reason:
                    finish_reason = choice.finish_reason

            # Emit tool_call events once per assembled call
            for slot in pending.values():
                args: dict[str, Any] = {}
                if slot["arguments"]:
                    try:
                        args = json.loads(slot["arguments"])
                    except json.JSONDecodeError:
                        args = {"_raw": slot["arguments"]}
                yield {
                    "type": "tool_call",
                    "id": slot["id"] or f"call_{slot['name']}",
                    "name": slot["name"],
                    "args": args,
                }

            stop = "tool_use" if finish_reason == "tool_calls" else "end_turn"
            yield {"type": "turn_end", "stop_reason": stop, "error": None}

        except Exception as e:
            yield {"type": "turn_end", "stop_reason": "error", "error": str(e)}


def _to_openai_messages(system: str, messages: list[Message]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for m in messages:
        role = m["role"]
        content = m["content"]

        if role == "tool":
            for b in content:
                if b.get("type") == "tool_result":
                    out.append({
                        "role": "tool",
                        "tool_call_id": b["tool_call_id"],
                        "content": b["content"],
                    })
            continue

        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue

        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []
        for b in content:
            t = b.get("type")
            if t == "text":
                text_parts.append(b["text"])
            elif t == "tool_call":
                tool_calls.append({
                    "id": b["id"],
                    "type": "function",
                    "function": {
                        "name": b["name"],
                        "arguments": json.dumps(b["args"], ensure_ascii=False),
                    },
                })

        if role == "assistant":
            msg: dict[str, Any] = {"role": "assistant"}
            msg["content"] = "".join(text_parts) if text_parts else None
            if tool_calls:
                msg["tool_calls"] = tool_calls
            out.append(msg)
        else:
            # user content (no tool_calls expected)
            out.append({"role": "user", "content": "".join(text_parts) or ""})

    return out
