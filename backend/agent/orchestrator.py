"""
Multi-agent orchestrator — handoff-driven state machine.

Routes a user message to ONE starting specialist via a cheap flash-lite
classifier (or zero LLM calls on a permission/form resume), then runs
sub-agents in a state machine. Agents themselves request handoffs via
`handoff_to_<other>` tools — the orchestrator switches when one fires.

SSE events emitted:
  agent_start  { name, task }       — sub-agent beginning work
  text / tool_call / tool_result / error  — forwarded from sub-agents
  done         { final_text }       — everything complete
"""
import json
import logging
from typing import AsyncGenerator

from llm.factory import get_llm_provider

from .agents.base import _sse, _wire_to_canonical, _find_pending_tool_calls, run_agent_loop
from .agents import pm as pm_agent
from .agents import designer as designer_agent
from .agents import analyst as analyst_agent
from .agents import calendar as calendar_agent
from .agents import opportunity as opportunity_agent
from .agents import whiteboard as whiteboard_agent

logger = logging.getLogger(__name__)


# ── Agent registry ────────────────────────────────────────────────────────────

AGENT_MODULES = {
    "pm": pm_agent,
    "designer": designer_agent,
    "analyst": analyst_agent,
    "calendar": calendar_agent,
    "opportunity": opportunity_agent,
    "whiteboard": whiteboard_agent,
}

_DOMAIN_TOOL_NAMES: dict[str, list[str]] = {
    domain: mod.TOOL_NAMES for domain, mod in AGENT_MODULES.items()
}

# Worst case: 1 starting agent + MAX_HANDOFFS switches = MAX_HANDOFFS + 1 runs.
# Realistic multi-domain chain with synthesis-back is:
#   PM → Analyst → PM → Designer → PM  (4 handoffs).
# 5 gives one round of headroom for edge cases without enabling runaway loops.
MAX_HANDOFFS = 5

# Always-cheap router. Independent of the user's selected model so a fast Pro
# user doesn't pay Pro rates for routing, and a free user doesn't burn their
# limited model quota on it.
ROUTER_PROVIDER = "gemini"
ROUTER_MODEL = "gemini-2.5-flash-lite"

ROUTER_SYSTEM = """Pick the specialist who should handle the user's latest message.

pm           — DEFAULT for almost everything. Research, PRDs, user stories, docs,
               knowledge-base search, Jira, document analysis, content review,
               "what's wrong with this", "improve this doc", "analyze themes",
               document structure feedback. When in doubt, pick pm.
designer     — ONLY for visual/UI work: mockups, websites, landing pages,
               UI components, dashboards, wireframes. The word "design" alone
               does NOT mean designer — only pick designer if the request is
               explicitly about building or reviewing a VISUAL artifact.
               "improve this design doc" → pm. "build me a landing page" → designer.
analyst      — CSV/Excel analysis — both numeric (metrics, churn, revenue, NPS) and
               text (reading feedback columns, finding themes, counting categories,
               analysing what's in a spreadsheet).
calendar     — schedules, meetings, time-blocking, "do I have time", "prep me".
opportunity  — "what should we build?", "rank opportunities", "mine themes",
               "biggest pain points by RICE", promoting opportunity → feature.
whiteboard   — diagrams, flowcharts, flow maps, user flows, sequence diagrams,
               mind maps, journey maps, brainstorming, SWOT, HMW, ideation,
               "draw", "visualise", "map out", "brainstorm".

Return ONLY the name. No JSON. No explanation. Just one word: pm, designer, analyst, calendar, or opportunity."""


# ── Routing ───────────────────────────────────────────────────────────────────

def _history_tail(messages: list[dict], max_msgs: int = 4) -> str:
    """Stringify the last few user/assistant turns for router context."""
    lines: list[str] = []
    recent = messages[-max_msgs:] if len(messages) > max_msgs else messages
    for m in recent:
        role = m.get("role", "")
        if role not in ("user", "assistant"):
            continue
        content = m.get("content") or ""
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content if b.get("type") == "text"
            )
        if not content:
            continue
        lines.append(f"{role.upper()}: {str(content)[:200]}")
    return "\n".join(lines)


def _resume_agent(canonical_msgs: list, pending_decisions: list[dict] | None) -> str | None:
    """If a previous turn ended at a permission gate (pending_decisions present),
    or with an unfulfilled tool_call on the assistant turn (e.g. design_brief
    form awaiting submission), return the agent that owns the pending tool."""
    if not pending_decisions:
        return None
    pending = _find_pending_tool_calls(canonical_msgs)
    for call in pending:
        for domain, tool_names in _DOMAIN_TOOL_NAMES.items():
            if call["name"] in tool_names:
                return domain
    return None


import re as _re

_VISUAL_BUILD_KEYWORDS = {
    "build", "create a", "design a", "make a", "mockup", "mock up",
    "landing page", "website", "render", "component", "dashboard",
    "wireframe", "prototype", "figma", "ui for", "page for",
}


async def _route(message: str, history_tail: str, has_mentions: bool = False) -> str:
    """Single cheap LLM call. Returns one of: pm | designer | analyst | calendar.
    Falls back to 'pm' on any error."""
    if not message.strip():
        return "pm"

    msg_lower = message.lower()

    # @mentions (from pre-loaded context OR raw @-text in message) mean the user
    # is referencing a document — always PM unless they explicitly want a visual build.
    has_at_mention = has_mentions or bool(_re.search(r"@\w", message))
    if has_at_mention:
        if not any(kw in msg_lower for kw in _VISUAL_BUILD_KEYWORDS):
            logger.info("Router → pm (@mention present, no visual-build keywords)")
            return "pm"

    try:
        llm = get_llm_provider(
            model_override=ROUTER_MODEL,
            provider_override=ROUTER_PROVIDER,
        )
        prompt = (
            f"{history_tail}\n\nLATEST USER MESSAGE: {message}"
            if history_tail else f"USER: {message}"
        )

        result = ""
        async for ev in llm.stream_text(
            system=ROUTER_SYSTEM,
            messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            disable_thinking=True,
        ):
            if ev.get("type") == "text":
                result += ev.get("delta", "")
            elif ev.get("type") == "turn_end":
                break

        # Take the first whitespace-separated token, lowercase, strip punctuation.
        token = result.strip().lower().split()[0] if result.strip() else ""
        token = token.strip(".,!?\"'`")
        if token in AGENT_MODULES:
            logger.info("Router → %s (msg: %.60s)", token, message)
            return token
        logger.warning("Router returned unknown '%s' — defaulting to pm", token)
    except Exception as e:
        logger.warning("Router failed (%s) — defaulting to pm", e)

    return "pm"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_loop_end(chunk: str) -> dict | None:
    """Pluck the _loop_end sentinel payload out of an SSE chunk."""
    if "_loop_end" not in chunk:
        return None
    lines = chunk.strip().split("\n")
    event_type = data_str = None
    for line in lines:
        if line.startswith("event: "):
            event_type = line[7:].strip()
        elif line.startswith("data: "):
            data_str = line[6:].strip()
    if event_type == "_loop_end" and data_str:
        try:
            return json.loads(data_str)
        except json.JSONDecodeError:
            pass
    return None


def _get_last_user_text(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") != "user":
            continue
        content = m.get("content")
        if isinstance(content, str):
            return content
        blocks = m.get("blocks") or []
        for b in blocks:
            if b.get("type") == "text":
                return b["text"]
    return ""


# ── Orchestrator ──────────────────────────────────────────────────────────────

async def run_orchestrated(
    *,
    messages: list[dict],
    user_id: str,
    project_id: str | None,
    product_context: str = "",
    document_context: str = "",
    mentions_context: str = "",
    pending_decisions: list[dict] | None = None,
    model: str | None = None,
    provider: str | None = None,
    calendar_provider: str = "google",
    max_steps: int = 8,
) -> AsyncGenerator[str, None]:
    ctx = {
        "user_id": user_id,
        "project_id": project_id,
        "calendar_provider": calendar_provider,
    }

    canonical_msgs = _wire_to_canonical(messages)
    decisions_by_id = {d["tool_call_id"]: d for d in (pending_decisions or [])}
    last_user_text = _get_last_user_text(messages)

    # Pick the starting agent.
    current = _resume_agent(canonical_msgs, pending_decisions)
    if current is None:
        # @mentions mean the user is referencing a specific doc/KB file.
        # Short-circuit to PM unless the request is explicitly about building
        # a new visual artifact ("build", "mockup", "landing page", etc.).
        has_mentions = bool(mentions_context and mentions_context.strip()) or bool(
            _re.search(r"@\w", last_user_text)
        )
        if has_mentions and not any(
            kw in last_user_text.lower() for kw in _VISUAL_BUILD_KEYWORDS
        ):
            logger.info("Router → pm (has @mention, no visual-build keyword)")
            current = "pm"
        else:
            current = await _route(
                last_user_text,
                _history_tail(messages),
                has_mentions=has_mentions,
            )

    logger.info(
        "Orchestrator start — user=%s start_agent=%s pending=%d",
        user_id, current, len(pending_decisions or []),
    )

    handoff_payload: dict | None = None
    final_texts: list[str] = []
    handoffs_used = 0

    while True:
        agent_mod = AGENT_MODULES[current]

        yield _sse("agent_start", {
            "name": agent_mod.DISPLAY_NAME,
            "task": last_user_text[:120],
        })

        system = agent_mod.get_system_prompt(
            product_context=product_context,
            document_context=document_context,
            mentions_context=mentions_context,
            handoff_payload=handoff_payload,
        )
        # handoff_payload is consumed by the receiving agent; reset for the next
        # iteration unless the agent itself requests another handoff.
        handoff_payload = None

        # Designer must always call a tool first — never output text before render_ui
        force_tool_first = (current == "designer")

        loop_result: dict = {}
        async for chunk in run_agent_loop(
            system=system,
            tools=agent_mod.get_tools(),
            canonical_msgs=canonical_msgs,
            ctx=ctx,
            decisions_by_id=decisions_by_id,
            model=model,
            provider=provider,
            max_steps=max_steps,
            force_tool_first=force_tool_first,
        ):
            parsed = _parse_loop_end(chunk)
            if parsed is not None:
                loop_result = parsed
                continue
            yield chunk

        # Terminal conditions — propagate `done` and stop the state machine.
        if loop_result.get("hit_permission_gate") or loop_result.get("stopped_for_input"):
            yield _sse("done", {"final_text": loop_result.get("final_text", "")})
            return
        if loop_result.get("errored"):
            yield _sse("done", {"final_text": loop_result.get("final_text", "")})
            return

        # Handoff requested — switch agent and re-enter the loop.
        target = loop_result.get("handoff_target")
        if target and target in AGENT_MODULES:
            if loop_result.get("final_text"):
                final_texts.append(loop_result["final_text"])
            handoffs_used += 1
            if handoffs_used > MAX_HANDOFFS:
                logger.warning(
                    "Handoff chain hit MAX_HANDOFFS=%d — stopping (user=%s)",
                    MAX_HANDOFFS, user_id,
                )
                yield _sse("done", {"final_text": "\n\n".join(t for t in final_texts if t)})
                return
            handoff_payload = loop_result.get("handoff_payload") or {}
            current = target
            continue

        # Natural end of turn.
        if loop_result.get("final_text"):
            final_texts.append(loop_result["final_text"])
        break

    yield _sse("done", {"final_text": "\n\n".join(t for t in final_texts if t)})
