"""
Shared agent loop and utilities.

run_agent_loop() is the core agentic LLM loop, extracted from the original
runner.py. It:
  1. Resolves any pending tool calls from a previous run (permission resume).
  2. Runs the plan→execute→reflect loop until done or a permission gate is hit.
  3. Yields typed SSE strings. The final yield is always:
       event: _loop_end
       data: {"final_text": "...", "hit_permission_gate": true/false}
     This sentinel is NEVER forwarded to the HTTP client; the orchestrator
     reads it to decide whether to continue with the next sub-agent.
"""
import json
import logging
from typing import AsyncGenerator

from llm.factory import get_llm_provider
from llm.types import Message, Tool

from ..tools import REQUIRES_PERMISSION, TOOL_EXECUTORS

logger = logging.getLogger(__name__)


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse(event_type: str, payload: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── Wire → canonical conversion ───────────────────────────────────────────────

def _wire_to_canonical(messages: list[dict]) -> list[Message]:
    out: list[Message] = []
    for m in messages:
        role = m.get("role")
        if role not in ("user", "assistant", "tool"):
            continue
        if m.get("blocks"):
            out.append({"role": role, "content": list(m["blocks"])})
        elif m.get("content"):
            out.append({
                "role": role,
                "content": [{"type": "text", "text": m["content"]}],
            })
    return out


def _find_pending_tool_calls(messages: list[Message]) -> list[dict]:
    """Tool calls in the last assistant turn whose results haven't been provided."""
    if not messages or messages[-1]["role"] not in ("assistant", "tool"):
        return []

    asst_idx = None
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "assistant":
            asst_idx = i
            break
    if asst_idx is None:
        return []

    asst_calls = [
        b for b in messages[asst_idx]["content"] if b.get("type") == "tool_call"
    ]
    if not asst_calls:
        return []

    fulfilled: set[str] = set()
    for m in messages[asst_idx + 1:]:
        if m["role"] == "tool":
            for b in m["content"]:
                if b.get("type") == "tool_result":
                    fulfilled.add(b.get("tool_call_id", ""))

    return [c for c in asst_calls if c["id"] not in fulfilled]


# ── Tool execution helpers ────────────────────────────────────────────────────

async def _execute_call(call: dict, ctx: dict) -> dict:
    name = call["name"]
    executor = TOOL_EXECUTORS.get(name)
    if not executor:
        return {"summary": f"Unknown tool '{name}'.", "sources": []}
    try:
        return await executor(ctx, **(call.get("args") or {}))
    except TypeError as e:
        return {"summary": f"Bad tool arguments: {e}", "sources": []}
    except Exception as e:
        return {"summary": f"Tool '{name}' failed: {e}", "sources": []}


def _result_block(call: dict, result: dict) -> dict:
    content = result.get("summary", "") or ""
    if result.get("data"):
        content += "\n\n" + str(result["data"])
    return {
        "type": "tool_result",
        "tool_call_id": call["id"],
        "name": call["name"],
        "content": content[:8000],
    }


# ── Core agent loop ───────────────────────────────────────────────────────────

async def run_agent_loop(
    *,
    system: str,
    tools: list[Tool],
    canonical_msgs: list[Message],
    ctx: dict,
    decisions_by_id: dict,
    model: str | None = None,
    provider: str | None = None,
    max_steps: int = 8,
) -> AsyncGenerator[str, None]:
    """
    Core agentic LLM loop.

    Mutates canonical_msgs in place so sub-agents share conversation history.
    Always ends with `event: _loop_end` (never forwarded to the HTTP client).
    """
    logger.info(
        "Agent loop start — user=%s project=%s tools=%d",
        ctx.get("user_id"), ctx.get("project_id"), len(tools),
    )

    try:
        llm = get_llm_provider(model_override=model, provider_override=provider)
    except Exception as e:
        logger.error("LLM provider unavailable: %s", e)
        yield _sse("error", {"message": f"LLM provider not available: {e}"})
        yield _sse("_loop_end", {"final_text": "", "hit_permission_gate": False})
        return

    final_text_parts: list[str] = []

    # ── Pre-loop: resolve pending tool_calls from a previous run ─────────────
    pending = _find_pending_tool_calls(canonical_msgs)
    if pending:
        tool_blocks: list[dict] = []
        for call in pending:
            requires_perm = call["name"] in REQUIRES_PERMISSION
            if requires_perm:
                decision = decisions_by_id.get(call["id"])
                if not decision:
                    # Still awaiting — re-emit the permission prompt and stop
                    yield _sse("tool_call", {
                        "id": call["id"],
                        "name": call["name"],
                        "args": call.get("args") or {},
                        "status": "awaiting_permission",
                    })
                    yield _sse("_loop_end", {"final_text": "", "hit_permission_gate": True})
                    return
                if decision.get("decision") == "deny":
                    reason = (decision.get("reason") or "").strip()
                    deny_msg = "User denied this action."
                    if reason:
                        deny_msg += f" Reason: {reason}"
                    yield _sse("tool_result", {
                        "id": call["id"],
                        "summary": deny_msg,
                        "sources": [],
                    })
                    tool_blocks.append({
                        "type": "tool_result",
                        "tool_call_id": call["id"],
                        "name": call["name"],
                        "content": deny_msg,
                    })
                    continue
                # Approved — fall through to execute

            result = await _execute_call(call, ctx)
            yield _sse("tool_result", {
                "id": call["id"],
                "summary": result.get("summary", ""),
                "sources": result.get("sources", []),
                "payload": result.get("critique"),
            })
            tool_blocks.append(_result_block(call, result))

        if tool_blocks:
            canonical_msgs.append({"role": "tool", "content": tool_blocks})

    # ── Main loop ─────────────────────────────────────────────────────────────
    for step in range(max_steps):
        logger.debug("Agent step %d — user=%s", step + 1, ctx.get("user_id"))
        current_text_parts: list[str] = []
        turn_calls: list[dict] = []
        stop_reason = "end_turn"
        error_msg: str | None = None

        # Force a tool call on the very first step of each agent's run so
        # agents can't output plain text before searching/acting.
        # Don't force when last msg is "tool" — that's a resume after permission
        # approval, where the agent may legitimately produce a final text response.
        last_role = canonical_msgs[-1]["role"] if canonical_msgs else None
        is_first_agent_step = step == 0 and bool(tools) and last_role != "tool"
        llm_gen = llm.stream_with_tools(
            system=system,
            messages=canonical_msgs,
            tools=tools,
            model=model,
            tool_choice="any" if is_first_agent_step else None,
        )

        try:
            async for ev in llm_gen:
                t = ev.get("type")
                if t == "text":
                    delta = ev.get("delta", "")
                    current_text_parts.append(delta)
                    final_text_parts.append(delta)
                    yield _sse("text", {"delta": delta})
                elif t == "tool_call":
                    call = {
                        "id": ev["id"],
                        "name": ev["name"],
                        "args": ev.get("args") or {},
                        "_thought_sig": ev.get("_thought_sig"),
                    }
                    logger.info(
                        "Tool call — name=%s id=%s user=%s",
                        call["name"], call["id"], ctx.get("user_id"),
                    )
                    turn_calls.append(call)
                    status = (
                        "awaiting_permission"
                        if call["name"] in REQUIRES_PERMISSION
                        else "running"
                    )
                    yield _sse("tool_call", {
                        "id": call["id"],
                        "name": call["name"],
                        "args": call["args"],
                        "status": status,
                        "_thought_sig": call["_thought_sig"],
                    })
                elif t == "turn_end":
                    stop_reason = ev.get("stop_reason") or "end_turn"
                    error_msg = ev.get("error")
                    break
        except Exception as e:
            logger.error(
                "Agent error at step %d — user=%s: %s",
                step + 1, ctx.get("user_id"), e, exc_info=True,
            )
            yield _sse("error", {"message": f"Agent error: {e}"})
            yield _sse("_loop_end", {
                "final_text": "".join(final_text_parts),
                "hit_permission_gate": False,
            })
            return

        # Append this assistant turn to shared history
        assistant_blocks: list[dict] = []
        if current_text_parts:
            assistant_blocks.append({"type": "text", "text": "".join(current_text_parts)})
        for call in turn_calls:
            block: dict = {
                "type": "tool_call",
                "id": call["id"],
                "name": call["name"],
                "args": call["args"],
            }
            if call.get("_thought_sig"):
                block["_thought_sig"] = call["_thought_sig"]
            assistant_blocks.append(block)
        if assistant_blocks:
            canonical_msgs.append({"role": "assistant", "content": assistant_blocks})

        if stop_reason == "error":
            yield _sse("error", {"message": error_msg or "Provider error"})
            break

        if stop_reason != "tool_use" or not turn_calls:
            break

        # Permission gate — stop loop, let orchestrator surface the prompt
        gated = [c for c in turn_calls if c["name"] in REQUIRES_PERMISSION]
        if gated:
            yield _sse("_loop_end", {
                "final_text": "".join(final_text_parts),
                "hit_permission_gate": True,
            })
            return

        # Auto-execute all tool calls and feed results back
        tool_blocks = []
        for call in turn_calls:
            result = await _execute_call(call, ctx)
            yield _sse("tool_result", {
                "id": call["id"],
                "summary": result.get("summary", ""),
                "sources": result.get("sources", []),
                "payload": result.get("critique"),
            })
            tool_blocks.append(_result_block(call, result))
        canonical_msgs.append({"role": "tool", "content": tool_blocks})

    logger.info("Agent loop complete — user=%s steps=%d", ctx.get("user_id"), step + 1)
    yield _sse("_loop_end", {
        "final_text": "".join(final_text_parts),
        "hit_permission_gate": False,
    })
