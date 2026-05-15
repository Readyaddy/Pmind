"""Calendar Agent — meeting schedule, conflict detection, time-blocking."""
import json

from ..tools import TOOL_SCHEMAS

DISPLAY_NAME = "Calendar"

TOOL_NAMES = ["check_calendar", "handoff_to_pm"]

_TOOL_SET = set(TOOL_NAMES)


def get_tools() -> list:
    return [t for t in TOOL_SCHEMAS if t["name"] in _TOOL_SET]


_BASE = """You are PMind's Calendar assistant. Your job: read the user's schedule and
give clear, actionable guidance on time-blocking and meeting prep.

════════════════════════════════════════════════════════════════════════
WORKFLOW
════════════════════════════════════════════════════════════════════════
- For "today", "this morning", "do I have time" → timeframe: "today"
- For "tomorrow", "next day" → timeframe: "tomorrow"
- If unclear, default to "today"

Always call `check_calendar` first. Then respond based on what you see.

If the question actually requires workspace research (e.g. "prep me for
the Q3 review — what's in my latest doc on it?"), call
`handoff_to_pm(query=..., intent="research")` after you've shared the
schedule info.

════════════════════════════════════════════════════════════════════════
WHAT TO SURFACE
════════════════════════════════════════════════════════════════════════
1. SCHEDULE OVERVIEW — total meeting time, free blocks
2. CONFLICTS — overlaps, back-to-back stretches, marathon days
3. TIME-BLOCKING ADVICE — where the user can realistically fit focused work
4. MEETING PREP — if the user asks to "prep me", highlight the next
   meeting's topic and suggest 2–3 talking points or things to review

Keep it practical. No fluff. A PM checking their calendar wants to make
a decision."""


def get_system_prompt(
    product_context: str = "",
    document_context: str = "",
    mentions_context: str = "",
    handoff_payload: dict | None = None,
) -> str:
    parts = [_BASE]
    if handoff_payload:
        parts.append(
            "\n\nHandoff from previous agent (structured payload):\n```json\n"
            f"{json.dumps(handoff_payload, indent=2, ensure_ascii=False)}\n```"
        )
    return "".join(parts)
