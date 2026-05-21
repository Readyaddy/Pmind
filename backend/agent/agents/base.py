"""
Shared agent loop and utilities.

run_agent_loop() is the core agentic LLM loop. It:
  1. Resolves any pending tool calls from a previous run (permission resume).
  2. Runs the plan→execute→reflect loop until done, a permission gate is hit,
     the agent requests a handoff to another specialist, or the agent calls
     a STOPS_FOR_USER_INPUT tool (e.g. design_brief).
  3. Yields typed SSE strings. The final yield is always:
       event: _loop_end
       data: {
         "final_text": str,
         "hit_permission_gate": bool,
         "stopped_for_input": bool,
         "handoff_target": str | None,
         "handoff_payload": dict | None,
         "errored": bool,
       }
     This sentinel is NEVER forwarded to the HTTP client; the orchestrator
     reads it to decide whether to continue, switch agent, or terminate.
"""
import json
import logging
from typing import AsyncGenerator

from llm.factory import get_llm_provider
from llm.types import Message, Tool

from ..tools import (
    HANDOFF_TOOL_PREFIX,
    REQUIRES_PERMISSION,
    STOPS_FOR_USER_INPUT,
    TOOL_EXECUTORS,
)

logger = logging.getLogger(__name__)


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse(event_type: str, payload: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _loop_end(
    final_text: str,
    *,
    hit_permission_gate: bool = False,
    stopped_for_input: bool = False,
    handoff_target: str | None = None,
    handoff_payload: dict | None = None,
    errored: bool = False,
) -> str:
    """Construct the canonical _loop_end sentinel with every key populated."""
    return _sse("_loop_end", {
        "final_text": final_text,
        "hit_permission_gate": hit_permission_gate,
        "stopped_for_input": stopped_for_input,
        "handoff_target": handoff_target,
        "handoff_payload": handoff_payload,
        "errored": errored,
    })


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
        yield _loop_end("", errored=True)
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
                    yield _loop_end("", hit_permission_gate=True)
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

        llm_gen = llm.stream_with_tools(
            system=system,
            messages=canonical_msgs,
            tools=tools,
            model=model,
            tool_choice=None,
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
            yield _loop_end("".join(final_text_parts), errored=True)
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
            yield _loop_end("".join(final_text_parts), errored=True)
            return

        if stop_reason != "tool_use" or not turn_calls:
            break

        # ── Handoff request — surrender to the orchestrator ──────────────────
        handoff_calls = [
            c for c in turn_calls if c["name"].startswith(HANDOFF_TOOL_PREFIX)
        ]
        if handoff_calls:
            call = handoff_calls[0]
            target = call["name"][len(HANDOFF_TOOL_PREFIX):]
            payload = call.get("args") or {}
            logger.info(
                "Handoff requested — from_user=%s to=%s payload_keys=%s",
                ctx.get("user_id"), target, list(payload.keys()),
            )
            # Emit a synthetic tool_result so the frontend doesn't see a
            # dangling tool_call, and so canonical_msgs stays well-formed
            # for any subsequent resume.
            result_summary = f"Handing off to {target.title()} with structured brief."
            yield _sse("tool_result", {
                "id": call["id"],
                "summary": result_summary,
                "sources": [],
            })
            canonical_msgs.append({"role": "tool", "content": [{
                "type": "tool_result",
                "tool_call_id": call["id"],
                "name": call["name"],
                "content": result_summary,
            }]})
            yield _loop_end(
                "".join(final_text_parts),
                handoff_target=target,
                handoff_payload=payload,
            )
            return

        # ── Permission gate — stop loop, orchestrator surfaces the prompt ────
        gated = [c for c in turn_calls if c["name"] in REQUIRES_PERMISSION]
        if gated:
            yield _loop_end(
                "".join(final_text_parts),
                hit_permission_gate=True,
            )
            return

        # ── Auto-execute all tool calls and feed results back ────────────────
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

        # ── Stops-for-user-input gate — halt deterministically ───────────────
        # Tools like design_brief render a frontend form; the user's next
        # message resumes the conversation as a new user turn.
        if any(c["name"] in STOPS_FOR_USER_INPUT for c in turn_calls):
            logger.info(
                "Loop halted for user input — tools=%s user=%s",
                [c["name"] for c in turn_calls if c["name"] in STOPS_FOR_USER_INPUT],
                ctx.get("user_id"),
            )
            yield _loop_end(
                "".join(final_text_parts),
                stopped_for_input=True,
            )
            return

    logger.info("Agent loop complete — user=%s steps=%d", ctx.get("user_id"), step + 1)
    yield _loop_end("".join(final_text_parts))
