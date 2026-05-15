"""
Multi-agent orchestrator.

Routes user messages to one or more specialist sub-agents (PM, Designer,
Analyst, Calendar) using a fast LLM intent classifier that reads the full
conversation context. Keyword matching is kept as an instant fallback.

SSE events emitted:
  agent_start  { name, task }          — sub-agent beginning work
  agent_done   { name, summary }       — sub-agent finished
  text / tool_call / tool_result / error  — forwarded from sub-agents
  done         { final_text }          — everything complete
"""
import json
import logging
import re
from typing import AsyncGenerator

from llm.factory import get_llm_provider

from .agents.base import _sse, _wire_to_canonical, _find_pending_tool_calls, run_agent_loop
from .agents import pm as pm_agent
from .agents import designer as designer_agent
from .agents import analyst as analyst_agent
from .agents import calendar as calendar_agent

logger = logging.getLogger(__name__)


# ── Agent registry ────────────────────────────────────────────────────────────

AGENT_MODULES = {
    "pm": pm_agent,
    "designer": designer_agent,
    "analyst": analyst_agent,
    "calendar": calendar_agent,
}

_DOMAIN_TOOL_NAMES: dict[str, list[str]] = {
    domain: mod.TOOL_NAMES for domain, mod in AGENT_MODULES.items()
}

_CANONICAL_ORDER = ["pm", "analyst", "calendar", "designer"]

# ── LLM intent classifier ─────────────────────────────────────────────────────

_CLASSIFIER_SYSTEM = """You are a routing classifier for a multi-agent AI assistant called PMind.
Given a short conversation history and the latest user message, decide which specialist agents to run.

AGENTS:
- pm        Research, documents, PRDs, user stories, knowledge base search. Default agent.
- designer  UI design, websites, landing pages, mockups, visual artifacts, renders.
- analyst   CSV/Excel data analysis, charts, metrics calculations.
- calendar  Calendar events, meetings, scheduling, time blocks.

ROUTING RULES (apply in order, stop at first match):
1. Message contains "aesthetic direction:" OR "color palette:" → ["designer"]
2. Message references designer tools by name (critique_design, render_ui) → ["designer"]
3. Last assistant tool in history was design_brief OR render_ui AND message is short/continuation
   ("now", "go ahead", "yes", "do it", "build it", "the page", "design it") → ["designer"]
4. Last assistant tool was render_ui AND message is iteration
   ("improve", "fix", "change", "refine", "dark mode", "add", "remove", "better") → ["designer"]
5. Message asks for a visual artifact for the FIRST time with no prior design context → ["pm", "designer"]
6. Message is PM work only (PRD, user story, research, summarise, analyse text) → ["pm"]
7. Message is data/spreadsheet work → ["analyst"]
8. Message is calendar/scheduling work → ["calendar"]
9. Anything else → ["pm"]

Respond with ONLY this JSON (no explanation, no markdown):
{"agents": ["pm"]}"""


def _build_classifier_context(messages: list[dict], canonical_msgs: list) -> str:
    """Build a short context string for the classifier from recent history."""
    lines: list[str] = []

    # Last 3 user/assistant exchanges (6 messages max)
    recent = messages[-6:] if len(messages) > 6 else messages
    for m in recent:
        role = m.get("role", "")
        if role not in ("user", "assistant"):
            continue
        content = m.get("content") or ""
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content if b.get("type") == "text"
            )
        lines.append(f"{role.upper()}: {str(content)[:200]}")

    # Append last-tool-used summary from canonical history
    for msg in reversed(canonical_msgs):
        if msg.get("role") != "assistant":
            continue
        for block in reversed(msg.get("content") or []):
            if block.get("type") == "tool_call":
                lines.append(f"[Last tool used: {block['name']}]")
                break
        else:
            continue
        break

    return "\n".join(lines)


async def _classify_domains_llm(
    message: str,
    messages: list[dict],
    canonical_msgs: list,
    model: str | None,
    provider: str | None,
) -> list[str]:
    """Fast LLM call to classify routing intent. Falls back to keywords on error."""
    try:
        llm = get_llm_provider(model_override=model, provider_override=provider)
        context = _build_classifier_context(messages, canonical_msgs)
        prompt = f"{context}\n\nNEW MESSAGE: {message}"

        result = ""
        async for ev in llm.stream_text(
            system=_CLASSIFIER_SYSTEM,
            messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            disable_thinking=True,
        ):
            if ev.get("type") == "text":
                result += ev.get("delta", "")
            elif ev.get("type") == "turn_end":
                break

        # Extract JSON — model may wrap it in markdown
        m = re.search(r'\{[^}]+\}', result, re.DOTALL)
        if m:
            data = json.loads(m.group())
            agents = [a for a in data.get("agents", []) if a in AGENT_MODULES]
            if agents:
                logger.info("LLM classifier → %s (msg: %.60s)", agents, message)
                return sorted(agents, key=lambda d: _CANONICAL_ORDER.index(d) if d in _CANONICAL_ORDER else 99)

    except Exception as e:
        logger.warning("LLM classifier failed (%s), falling back to keywords", e)

    # Keyword fallback
    return _classify_domains_keywords(message, canonical_msgs)


# ── Keyword fallback classifier ───────────────────────────────────────────────

_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "designer": [
        "mockup", "ui ", " ui", "landing page", "website", "component",
        "dashboard", "layout", "interface", "wireframe", "design brief",
        "build a page", "make a page", "render ", "visual design",
        "design a", "design me", "design the", "design it", "design this",
        "build me a", "make me a", "create a page",
        "create a site", "create a website",
    ],
    "analyst": [
        "csv", "excel", "spreadsheet", "analyze data", "analyse data",
        "calculate", "average", "total revenue", "churn", "metrics chart",
        "data analysis", "run analysis", "analyze the",
    ],
    "calendar": [
        "calendar", "meeting", "schedule", " today", "tomorrow",
        "busy", "free slot", "time block", "prep me", "my schedule",
        "do i have time", "when is my",
    ],
}

_BRIEF_MARKERS = ["aesthetic direction:", "build the full design now using render_ui", "color palette:"]
_DESIGNER_TOOLS = {"critique_design", "render_ui", "design_brief"}
_ITERATION_WORDS = [
    "improve", "refine", "fix", "update", "change", "adjust", "make it",
    "redo", "dark mode", "light mode", "lighter", "darker", "bigger",
    "smaller", "font", "color", "layout", "section", "better", "nicer",
    "cleaner", "bolder", "add a", "remove", "critique", "review",
    "design", "build", "now", "go ahead", "proceed", "page",
]


def _last_active_tool(canonical_msgs: list) -> str | None:
    for msg in reversed(canonical_msgs):
        if msg.get("role") != "assistant":
            continue
        for block in reversed(msg.get("content") or []):
            if block.get("type") == "tool_call":
                return block.get("name")
    return None


def _classify_domains_keywords(message: str, canonical_msgs: list | None = None) -> list[str]:
    msg = message.lower()

    if sum(1 for m in _BRIEF_MARKERS if m in msg) >= 2:
        return ["designer"]

    if any(t in msg for t in _DESIGNER_TOOLS):
        if not any(w in msg for w in ["search", "research", "find", "document"]):
            return ["designer"]

    if canonical_msgs:
        last_tool = _last_active_tool(canonical_msgs)
        if last_tool in _DESIGNER_TOOLS and any(w in msg for w in _ITERATION_WORDS):
            return ["designer"]

    domains: set[str] = set()
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        if any(k in msg for k in keywords):
            domains.add(domain)

    if not domains or "designer" in domains:
        domains.add("pm")

    return sorted(domains, key=lambda d: _CANONICAL_ORDER.index(d) if d in _CANONICAL_ORDER else 99)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_loop_end(chunk: str) -> dict | None:
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


def _get_resume_domain(canonical_msgs: list) -> str | None:
    pending = _find_pending_tool_calls(canonical_msgs)
    for call in pending:
        for domain, tool_names in _DOMAIN_TOOL_NAMES.items():
            if call["name"] in tool_names:
                return domain
    return None


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

    if pending_decisions:
        resume_domain = _get_resume_domain(canonical_msgs)
        if resume_domain:
            # Resume: find the domain that was paused and run from there
            all_domains = await _classify_domains_llm(
                last_user_text, messages, canonical_msgs, model, provider
            )
            if resume_domain in all_domains:
                domains = all_domains[all_domains.index(resume_domain):]
            else:
                domains = [resume_domain]
        else:
            domains = await _classify_domains_llm(
                last_user_text, messages, canonical_msgs, model, provider
            )
    else:
        domains = await _classify_domains_llm(
            last_user_text, messages, canonical_msgs, model, provider
        )

    logger.info(
        "Orchestrator start — user=%s domains=%s pending=%d",
        user_id, domains, len(pending_decisions or []),
    )

    final_texts: list[str] = []
    passed_context = ""

    for domain in domains:
        agent_mod = AGENT_MODULES[domain]

        yield _sse("agent_start", {"name": agent_mod.DISPLAY_NAME, "task": last_user_text[:120]})

        system = agent_mod.get_system_prompt(
            product_context=product_context,
            passed_context=passed_context,
            document_context=document_context,
            mentions_context=mentions_context,
        )

        agent_final_text = ""
        hit_permission_gate = False
        agent_errored = False

        async for chunk in run_agent_loop(
            system=system,
            tools=agent_mod.get_tools(),
            canonical_msgs=canonical_msgs,
            ctx=ctx,
            decisions_by_id=decisions_by_id,
            model=model,
            provider=provider,
            max_steps=max_steps,
        ):
            loop_end = _parse_loop_end(chunk)
            if loop_end is not None:
                agent_final_text = loop_end.get("final_text", "")
                hit_permission_gate = loop_end.get("hit_permission_gate", False)
                continue
            if "event: error\n" in chunk:
                agent_errored = True
            yield chunk

        yield _sse("agent_done", {"name": agent_mod.DISPLAY_NAME, "summary": agent_final_text[:300]})

        if hit_permission_gate or agent_errored:
            yield _sse("done", {"final_text": agent_final_text})
            return

        passed_context = agent_final_text
        if agent_final_text:
            final_texts.append(agent_final_text)

    yield _sse("done", {"final_text": "\n\n".join(final_texts)})
