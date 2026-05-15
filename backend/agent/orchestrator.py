"""
Multi-agent orchestrator.

Routes user messages to one or more specialist sub-agents (PM, Designer,
Analyst, Calendar) based on keyword intent classification. Each sub-agent
runs the shared agent loop from agents/base.py and shares a single
canonical_msgs history so later agents see earlier agents' work.

SSE events emitted:
  agent_start  { name, task }          — sub-agent beginning work
  agent_done   { name, summary }       — sub-agent finished
  text / tool_call / tool_result / error  — forwarded from sub-agents
  done         { final_text }          — everything complete
"""
import json
import logging
from typing import AsyncGenerator

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

# ── Intent classifier ─────────────────────────────────────────────────────────

_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "designer": [
        "mockup", "ui ", " ui", "landing page", "website", "component",
        "dashboard", "layout", "interface", "wireframe", "design brief",
        "build a page", "make a page", "render ", "visual design",
        "design a", "build me a", "make me a", "create a page",
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


def classify_domains(message: str) -> list[str]:
    msg = message.lower()
    domains: set[str] = set()
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        if any(k in msg for k in keywords):
            domains.add(domain)

    # pm is the default; always runs alongside designer (provides research context)
    if not domains or "designer" in domains:
        domains.add("pm")

    return sorted(domains, key=lambda d: _CANONICAL_ORDER.index(d) if d in _CANONICAL_ORDER else 99)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_loop_end(chunk: str) -> dict | None:
    """Extract payload from an `event: _loop_end` SSE chunk, or None."""
    if "_loop_end" not in chunk:
        return None
    lines = chunk.strip().split("\n")
    event_type = None
    data_str = None
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
    """Find which domain has unresolved pending tool calls (permission resume)."""
    pending = _find_pending_tool_calls(canonical_msgs)
    for call in pending:
        for domain, tool_names in _DOMAIN_TOOL_NAMES.items():
            if call["name"] in tool_names:
                return domain
    return None


def _domains_from_resume(resume_domain: str, last_user_text: str) -> list[str]:
    """Return domains starting from the resume domain in canonical order."""
    all_domains = classify_domains(last_user_text)
    if resume_domain in all_domains:
        idx = all_domains.index(resume_domain)
        return all_domains[idx:]
    return [resume_domain]


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
            domains = _domains_from_resume(resume_domain, last_user_text)
        else:
            domains = classify_domains(last_user_text)
    else:
        domains = classify_domains(last_user_text)

    logger.info(
        "Orchestrator start — user=%s domains=%s pending_decisions=%d",
        user_id, domains, len(pending_decisions or []),
    )

    final_texts: list[str] = []
    passed_context = ""

    for domain in domains:
        agent_mod = AGENT_MODULES[domain]

        yield _sse("agent_start", {
            "name": agent_mod.DISPLAY_NAME,
            "task": last_user_text[:120],
        })

        system = agent_mod.get_system_prompt(
            product_context=product_context,
            passed_context=passed_context,
            document_context=document_context,
            mentions_context=mentions_context,
        )

        agent_final_text = ""
        hit_permission_gate = False

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
                # Never forward _loop_end to the HTTP client
                continue
            yield chunk

        yield _sse("agent_done", {
            "name": agent_mod.DISPLAY_NAME,
            "summary": agent_final_text[:300],
        })

        if hit_permission_gate:
            yield _sse("done", {"final_text": agent_final_text})
            return

        passed_context = agent_final_text
        if agent_final_text:
            final_texts.append(agent_final_text)

    yield _sse("done", {"final_text": "\n\n".join(final_texts)})
