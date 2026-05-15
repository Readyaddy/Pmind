from typing import Any, AsyncGenerator

import anthropic

from .base import LLMProvider
from .types import Message, StreamEvent, Tool


class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def complete(
        self, system_prompt: str, user_message: str, stream: bool = True
    ) -> AsyncGenerator[str, None]:
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        ) as s:
            async for text in s.text_stream:
                yield text

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
        anth_tools = [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"],
            }
            for t in tools
        ]
        anth_messages = _to_anthropic_messages(messages)
        extra: dict = {}
        if tool_choice == "any" and anth_tools:
            extra["tool_choice"] = {"type": "any"}

        try:
            async with self.client.messages.stream(
                model=model or self.model,
                max_tokens=4096,
                system=system,
                tools=anth_tools,
                messages=anth_messages,
                **extra,
            ) as stream:
                stop_reason: str = "end_turn"
                async for event in stream:
                    et = getattr(event, "type", None)

                    if et == "content_block_delta":
                        delta = event.delta
                        if getattr(delta, "type", None) == "text_delta":
                            yield {"type": "text", "delta": delta.text}

                    elif et == "content_block_stop":
                        block = event.content_block
                        if block.type == "tool_use":
                            yield {
                                "type": "tool_call",
                                "id": block.id,
                                "name": block.name,
                                "args": block.input or {},
                            }

                final_msg = await stream.get_final_message()
                stop_reason = final_msg.stop_reason or "end_turn"
                yield {"type": "turn_end", "stop_reason": stop_reason, "error": None}

        except anthropic.APIError as e:
            yield {"type": "turn_end", "stop_reason": "error", "error": str(e)}


def _to_anthropic_messages(messages: list[Message]) -> list[dict[str, Any]]:
    """Canonical messages → Anthropic format.

    Anthropic uses a `user` message containing `tool_result` blocks for tool
    outputs (no separate `tool` role).
    """
    out: list[dict[str, Any]] = []
    for m in messages:
        role = m["role"]
        content = m["content"]

        if role == "tool":
            # Map every tool_result block under role=user
            tool_blocks = [
                {
                    "type": "tool_result",
                    "tool_use_id": b["tool_call_id"],
                    "content": b["content"],
                }
                for b in content
                if b.get("type") == "tool_result"
            ]
            if tool_blocks:
                out.append({"role": "user", "content": tool_blocks})
            continue

        # user / assistant
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue

        blocks: list[dict[str, Any]] = []
        for b in content:
            t = b.get("type")
            if t == "text":
                blocks.append({"type": "text", "text": b["text"]})
            elif t == "tool_call":
                blocks.append({
                    "type": "tool_use",
                    "id": b["id"],
                    "name": b["name"],
                    "input": b["args"],
                })
        if blocks:
            out.append({"role": role, "content": blocks})
    return out
