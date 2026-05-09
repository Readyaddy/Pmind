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
    ) -> AsyncGenerator[StreamEvent, None]:
        """
        Stream ONE assistant turn that may include text and tool calls.

        Yields canonical events:
          {"type": "text", "delta": str}
          {"type": "tool_call", "id": str, "name": str, "args": dict}
          {"type": "turn_end", "stop_reason": ..., "error": str | None}

        After a turn_end with stop_reason="tool_use", the runner is expected
        to execute each tool, append a tool message to `messages`, and call
        `stream_with_tools` again with the updated history.
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not implement stream_with_tools"
        )
        yield  # pragma: no cover  (makes this an async generator)
