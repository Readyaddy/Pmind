"""
Canonical (provider-neutral) types for tool-using agents.

Every LLM provider converts these to/from its own native format inside
`stream_with_tools`. The agent runner only ever speaks canonical.
"""
from typing import Any, Literal, TypedDict


# ── Tool spec ─────────────────────────────────────────────────────────────────


class Tool(TypedDict):
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema for the tool's input


# ── Message content blocks ────────────────────────────────────────────────────


class TextBlock(TypedDict):
    type: Literal["text"]
    text: str


class ToolCallBlock(TypedDict):
    type: Literal["tool_call"]
    id: str       # opaque per-call id (echoed back in tool_result)
    name: str
    args: dict[str, Any]


class ToolResultBlock(TypedDict, total=False):
    type: Literal["tool_result"]
    tool_call_id: str
    content: str
    name: str  # tool name; required by Gemini, ignored by others


# In Python the "|" union form on TypedDicts is not directly usable as a runtime
# type, but we keep these as type hints. The runtime is plain dicts.
ContentBlock = dict  # one of TextBlock / ToolCallBlock / ToolResultBlock


class Message(TypedDict):
    role: Literal["user", "assistant", "tool"]
    content: list[ContentBlock]


# ── Stream events emitted by stream_with_tools ────────────────────────────────


class TextEvent(TypedDict):
    type: Literal["text"]
    delta: str


class ToolCallEvent(TypedDict):
    type: Literal["tool_call"]
    id: str
    name: str
    args: dict[str, Any]


StopReason = Literal["end_turn", "tool_use", "max_tokens", "error"]


class TurnEndEvent(TypedDict):
    type: Literal["turn_end"]
    stop_reason: StopReason
    error: str | None


StreamEvent = dict  # one of the three above
