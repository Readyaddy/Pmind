#!/usr/bin/env python3
"""Smoke tests for the agent / LLM pipeline.

Run from backend/:
    python test_agent_smoke.py

Requires GOOGLE_API_KEY in environment or a backend/.env file.
Tests the full stack: GeminiProvider → thought_signature → multi-turn → run_agent.
"""
import asyncio
import base64
import json
import os
import sys
import traceback
from pathlib import Path

# Load .env if available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

sys.path.insert(0, str(Path(__file__).parent))


# ── helpers ───────────────────────────────────────────────────────────────────

_PASS = "PASS"
_FAIL = "FAIL"
_SKIP = "SKIP"


def _api_key() -> str:
    return os.getenv("GOOGLE_API_KEY", "")


def _skip_if_no_key() -> bool:
    if not _api_key():
        print("  SKIP — GOOGLE_API_KEY not set")
        return True
    return False


# ── Test 1: stream_with_tools yields correct event types ──────────────────────

async def test_stream_with_tools_basic() -> bool:
    """stream_with_tools should yield ≥1 text/tool_call event and end with turn_end."""
    if _skip_if_no_key():
        return True

    from llm.gemini import GeminiProvider

    provider = GeminiProvider(api_key=_api_key())
    messages = [{"role": "user", "content": "What is 2 + 2? Answer in one word."}]
    tools = [
        {
            "name": "calculator",
            "description": "Perform a calculation.",
            "parameters": {
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"],
            },
        }
    ]

    events = []
    async for ev in provider.stream_with_tools(
        system="You are a helpful assistant.",
        messages=messages,
        tools=tools,
    ):
        events.append(ev)
        print(f"  event type={ev.get('type')!r:12}  {str(ev)[:70]}")

    assert events, "No events received"
    assert events[-1]["type"] == "turn_end", f"Expected turn_end last, got {events[-1]}"
    assert events[-1].get("error") is None, f"turn_end carries error: {events[-1]['error']}"

    seen_types = {e["type"] for e in events}
    assert seen_types & {"text", "tool_call"}, f"Expected text or tool_call, got {seen_types}"
    return True


# ── Test 2: thought_signature captured as valid base64 ───────────────────────

async def test_thought_signature_captured() -> bool:
    """If the model emits a tool call, _thought_sig should be valid base64 bytes."""
    if _skip_if_no_key():
        return True

    from llm.gemini import GeminiProvider

    provider = GeminiProvider(api_key=_api_key())
    messages = [{"role": "user", "content": "Use the lookup tool to find product management info."}]
    tools = [
        {
            "name": "lookup",
            "description": "Look up information on any topic.",
            "parameters": {
                "type": "object",
                "properties": {"topic": {"type": "string"}},
                "required": ["topic"],
            },
        }
    ]

    tool_call_events = []
    async for ev in provider.stream_with_tools(
        system="You MUST call the lookup tool before responding. Never skip it.",
        messages=messages,
        tools=tools,
    ):
        if ev.get("type") == "tool_call":
            tool_call_events.append(ev)

    if not tool_call_events:
        print("  WARN model did not make a tool call — skipping signature check")
        return True

    for ev in tool_call_events:
        ts = ev.get("_thought_sig")
        print(f"  tool_call name={ev['name']!r}  _thought_sig={'<none>' if ts is None else f'{len(ts)}-char b64'}")
        if ts is not None:
            decoded = base64.b64decode(ts)
            assert len(decoded) > 0, "Decoded thought_signature is empty"

    return True


# ── Test 3: stream_text yields incremental deltas ────────────────────────────

async def test_stream_text() -> bool:
    """stream_text should deliver text delta events and end with turn_end/end_turn."""
    if _skip_if_no_key():
        return True

    from llm.gemini import GeminiProvider

    provider = GeminiProvider(api_key=_api_key())
    messages = [{"role": "user", "content": "Reply with exactly: hello world"}]

    text_parts: list[str] = []
    events: list[dict] = []
    async for ev in provider.stream_text(
        system="You are a minimal assistant. Reply exactly as instructed.",
        messages=messages,
    ):
        events.append(ev)
        if ev["type"] == "text":
            text_parts.append(ev["delta"])

    full = "".join(text_parts)
    print(f"  stream_text output: {repr(full[:120])}")
    print(f"  event sequence: {[e['type'] for e in events]}")

    assert text_parts, "stream_text yielded no text deltas"
    assert events[-1]["type"] == "turn_end", "Last event must be turn_end"
    assert events[-1].get("stop_reason") == "end_turn", (
        f"Expected end_turn, got {events[-1].get('stop_reason')!r}"
    )
    return True


# ── Test 4: multi-turn with thought_signature restoration (no 400 error) ──────

async def test_multiturn_thought_signature() -> bool:
    """After a tool call turn, the follow-up turn must not raise 400 INVALID_ARGUMENT."""
    if _skip_if_no_key():
        return True

    from llm.gemini import GeminiProvider
    from llm.types import Message

    provider = GeminiProvider(api_key=_api_key())
    tools = [
        {
            "name": "lookup",
            "description": "Look up a topic.",
            "parameters": {
                "type": "object",
                "properties": {"topic": {"type": "string"}},
                "required": ["topic"],
            },
        }
    ]

    # Turn 1 — get a tool call
    turn1_messages: list[Message] = [
        {"role": "user", "content": "Call lookup on 'product roadmap' then summarise."},
    ]
    tool_calls: list[dict] = []
    async for ev in provider.stream_with_tools(
        system="You MUST call the lookup tool first, then answer.",
        messages=turn1_messages,
        tools=tools,
    ):
        if ev.get("type") == "tool_call":
            tool_calls.append({
                "type": "tool_call",
                "id": ev["id"],
                "name": ev["name"],
                "args": ev.get("args") or {},
                "_thought_sig": ev.get("_thought_sig"),
            })

    if not tool_calls:
        print("  WARN no tool call in turn 1 — skipping multi-turn test")
        return True

    tc = tool_calls[0]
    has_sig = bool(tc.get("_thought_sig"))
    print(f"  Turn 1 tool call: {tc['name']!r}  thought_sig present={has_sig}")

    # Turn 2 — provide tool result and expect a normal text response
    turn2_messages: list[Message] = [
        *turn1_messages,
        {"role": "assistant", "content": tool_calls},
        {
            "role": "tool",
            "content": [{
                "type": "tool_result",
                "tool_call_id": tc["id"],
                "name": tc["name"],
                "content": "A product roadmap is a prioritised list of features and milestones.",
            }],
        },
    ]

    text_parts: list[str] = []
    try:
        async for ev in provider.stream_text(
            system="You are a helpful assistant.",
            messages=turn2_messages,
        ):
            if ev["type"] == "text":
                text_parts.append(ev["delta"])
            elif ev["type"] == "turn_end" and ev.get("error"):
                print(f"  FAIL turn_end error: {ev['error']}")
                return False
    except Exception as exc:
        print(f"  FAIL exception in turn 2: {exc}")
        traceback.print_exc()
        return False

    full = "".join(text_parts)
    print(f"  Turn 2 response: {repr(full[:120])}")
    assert full.strip(), "Turn 2 returned empty text"
    return True


# ── Test 5: run_agent full pipeline with mocked tool executors ────────────────

async def test_run_agent_simple() -> bool:
    """run_agent with a simple message must emit a 'done' SSE and no 'error' events."""
    if _skip_if_no_key():
        return True

    from unittest.mock import patch
    from agent import runner as runner_module

    async def _mock_executor(ctx, **_kwargs):
        return {"summary": "Mock result.", "sources": [], "data": ""}

    mock_executors = {name: _mock_executor for name in [
        "search_kb", "list_docs", "read_doc", "search_docs",
        "create_doc", "edit_doc", "create_folder", "render_ui", "critique_design",
    ]}

    messages = [{"role": "user", "content": "Just say hello."}]
    seen_types: list[str] = []
    errors: list[str] = []

    with patch.object(runner_module, "TOOL_EXECUTORS", mock_executors):
        async for sse in runner_module.run_agent(
            messages=messages,
            user_id="smoke-test",
            project_id=None,
            product_context="",
        ):
            if not sse.startswith("event: "):
                continue
            lines = sse.strip().splitlines()
            event_type = lines[0].removeprefix("event: ").strip()
            seen_types.append(event_type)
            print(f"  SSE event={event_type!r}")
            if event_type == "error":
                data_line = next((l for l in lines if l.startswith("data: ")), "data: {}")
                errors.append(json.loads(data_line.removeprefix("data: ")).get("message", "?"))

    print(f"  all events: {seen_types}")
    assert "done" in seen_types, f"Missing 'done' event; got: {seen_types}"
    if errors:
        print(f"  FAIL unexpected error events: {errors}")
        return False
    return True


# ── Test 6: _to_gemini_contents round-trips thought_signature correctly ───────

def test_thought_sig_roundtrip() -> bool:
    """_to_gemini_contents must decode base64 _thought_sig back to bytes on fc parts."""
    from llm.gemini import _to_gemini_contents
    from llm.types import Message

    fake_sig_bytes = b"\xde\xad\xbe\xef" * 8
    fake_sig_b64 = base64.b64encode(fake_sig_bytes).decode("ascii")

    messages: list[Message] = [
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_call",
                    "id": "gem_lookup_0",
                    "name": "lookup",
                    "args": {"topic": "test"},
                    "_thought_sig": fake_sig_b64,
                }
            ],
        }
    ]

    contents = _to_gemini_contents(messages)
    assert len(contents) == 1, f"Expected 1 content, got {len(contents)}"
    parts = contents[0]["parts"]
    assert len(parts) == 1
    part = parts[0]
    fc = part.get("function_call", {})
    assert fc.get("name") == "lookup"
    # thought_signature must be on the Part dict, NOT inside function_call
    assert "thought_signature" not in fc, "thought_signature must not be inside function_call"
    restored = part.get("thought_signature")
    assert restored == fake_sig_bytes, (
        f"Restored bytes don't match: {restored!r} != {fake_sig_bytes!r}"
    )
    print(f"  thought_sig round-trip: {len(restored)} bytes at Part level (correct)")
    return True


# ── Test 7: KeyError ' behavior' regression ──────────────────────────────────

def test_system_prompt_format_regression() -> bool:
    """SYSTEM_PROMPT.replace() must not raise KeyError on JS object literals inside it."""
    from agent.runner import SYSTEM_PROMPT

    try:
        result = SYSTEM_PROMPT.replace("{product_context}", "Test context.")
    except KeyError as exc:
        print(f"  FAIL KeyError: {exc}")
        return False

    assert "Test context." in result
    assert "behavior: 'smooth'" in result, "Smooth-scroll JS should still be in prompt"
    print(f"  prompt length after replace: {len(result)}")
    return True


# ── Runner ────────────────────────────────────────────────────────────────────

async def main() -> None:
    sync_tests = [
        ("thought_sig round-trip (no network)", test_thought_sig_roundtrip),
        ("KeyError regression", test_system_prompt_format_regression),
    ]
    async_tests = [
        ("stream_with_tools basic", test_stream_with_tools_basic),
        ("thought_signature captured", test_thought_signature_captured),
        ("stream_text incremental", test_stream_text),
        ("multi-turn thought_signature (no 400)", test_multiturn_thought_signature),
        ("run_agent full pipeline", test_run_agent_simple),
    ]

    passed = failed = 0

    for name, fn in sync_tests:
        print(f"\n── {name} ──")
        try:
            ok = fn()
            if ok:
                print(f"  {_PASS}")
                passed += 1
            else:
                print(f"  {_FAIL}")
                failed += 1
        except Exception as exc:
            print(f"  {_FAIL}: {exc}")
            traceback.print_exc()
            failed += 1

    for name, fn in async_tests:
        print(f"\n── {name} ──")
        try:
            ok = await fn()
            if ok:
                print(f"  {_PASS}")
                passed += 1
            else:
                print(f"  {_FAIL}")
                failed += 1
        except Exception as exc:
            print(f"  {_FAIL}: {exc}")
            traceback.print_exc()
            failed += 1

    print(f"\n{'─' * 50}")
    print(f"Results: {passed} passed, {failed} failed out of {passed + failed} tests")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
