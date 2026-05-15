from abc import ABC, abstractmethod
from typing import AsyncGenerator

from .types import Message, StreamEvent, Tool


class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_message: str,
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Single-shot text completion. Used by Cmd+K / non-agent flows."""
        pass

    async def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[Tool],
        model: str | None = None,
        tool_choice: str | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream ONE assistant turn that may include text and tool calls.

        tool_choice="any" forces at least one tool call (no plain-text response).

        Yields canonical events:
          {"type": "text", "delta": str}
          {"type": "tool_call", "id": str, "name": str, "args": dict}
          {"type": "turn_end", "stop_reason": ..., "error": str | None}
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not implement stream_with_tools"
        )
        yield  # pragma: no cover

    async def stream_text(
        self,
        *,
        system: str,
        messages: list[Message],
        model: str | None = None,
        disable_thinking: bool = False,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream a text-only response (no tool declarations).

        Providers that buffer responses when tools are configured should
        override this to call generate_content_stream without tools so the
        user sees tokens arriving in real time.

        disable_thinking: Gemini-specific — sets thinking_budget=0 so the
        first token arrives immediately (safe for synthesis steps where the
        model already has all context from tool results).

        Default: delegates to stream_with_tools with an empty tool list.
        """
        async for ev in self.stream_with_tools(
            system=system,
            messages=messages,
            tools=[],
            model=model,
        ):
            yield ev
