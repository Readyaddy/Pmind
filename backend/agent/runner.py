"""
Agent loop runner — provider-agnostic, with permission gating.

Streams Server-Sent Events:
  text         { delta }
  tool_call    { id, name, args, status }   status ∈ "running" | "awaiting_permission"
  tool_result  { id, summary, sources }
  error        { message }
  done         { final_text }

Permission flow:
  - Read-only tools (search_kb, list_docs, read_doc, search_docs) auto-execute.
  - Write tools (create_doc, edit_doc, create_folder) emit `tool_call` with
    status="awaiting_permission" and the run ends. The client renders an
    approve/deny card and resumes by re-POSTing the same conversation plus
    `pending_decisions` for the gated calls.
  - On resume the runner finds pending tool_calls in the trailing assistant
    turn, applies decisions (or re-runs auto tools), then continues the loop.
"""
import json
from typing import AsyncGenerator

from llm.factory import get_llm_provider
from llm.types import Message, Tool

from .tools import REQUIRES_PERMISSION, TOOL_EXECUTORS, TOOL_SCHEMAS


SYSTEM_PROMPT = """You are PMind, an AI Product Manager working inside a workspace the user owns.

You have tools to (a) search the user's knowledge base — uploaded customer interviews, research, PDFs — and read their existing documents, (b) create and edit documents and folders in the current project, and (c) build live UI previews and have a senior-designer agent critique them.

PM workflow:
1. Before drafting any PM artifact, call `search_kb` to find relevant evidence. If you draft without searching, the user gets generic output — that's a failure.
2. When you reference an interview or research excerpt, quote it briefly and attribute it (e.g. "users described X as 'literally unusable' [1]"). Number citations starting at [1] in the order sources first appear.
3. If `search_kb` returns nothing relevant, say so explicitly before falling back to general knowledge — do NOT fabricate quotes.
4. When the user asks about existing work, call `list_docs` or `search_docs` first to see what's already in the project.
5. To save your work, call `create_doc` with markdown content (# heading, - bullets, **bold**, *italic*). The user must approve.
6. For revisions, use `edit_doc` — call `read_doc` first to see what's there. The user must approve.
7. Be concise. Lead with the answer, then evidence. Avoid filler.

────────────────────────────────────────────────────────────────────────
DESIGN WORK (`render_ui` and `critique_design`)
────────────────────────────────────────────────────────────────────────

When the user asks for ANY UI — mockup, component, dashboard, landing page, modal, form, card, table, prototype — you BUILD it via `render_ui`, you do not describe it in prose. They get a live preview with Preview/HTML/CSS/JS tabs in the chat.

A. ASK BEFORE YOU BUILD (when style is ambiguous)

If the user's request doesn't specify a clear visual direction, ask ONE concise clarifying message before calling `render_ui`. Offer 2-4 concrete style directions plus colors. Format like:

  "Quick check before I build — what direction?
   • **Glassmorphism** — frosted blur, layered transparency, soft depth
   • **Editorial** — serif headlines, generous whitespace, asymmetric grid
   • **Brutalist** — raw, mono fonts, hard edges, unapologetic
   • **Neo-tech** — dark mode, sharp accents, precise type
   And any color preference (e.g. amber on ivory, indigo on slate)?"

If they DID specify ("a glassmorphic pricing card with amber accents"), just build — don't over-clarify.

B. THE QUALITY BAR

Pick ONE clear aesthetic direction and execute with intent. Bold maximalism and refined minimalism both work — what kills a UI is timidity and defaults.

Aesthetic vocabulary you can pull from:
- **Glassmorphism** — backdrop-blur, layered transparency, soft white inner highlights, subtle borders, gentle drop shadows
- **Neumorphism** — soft monochrome, dual inner/outer shadows, low contrast (use sparingly)
- **Brutalist** — raw, monospace headings, hard edges, no rounded corners, unapologetic colors, intentional ugliness
- **Editorial / Magazine** — serif display (Playfair, EB Garamond), generous whitespace, asymmetric grids, drop caps, ruled lines
- **Retro / Synthwave** — neon gradients, geometric, 80s palette, scanline overlays, chrome
- **Neo-tech / Terminal** — dark mode, mono type (JetBrains Mono / Fira Code), sharp amber/lime accents, ascii dividers
- **Organic / Soft** — rounded corners, pastel palette, hand-drawn elements, friendly tone
- **Bauhaus / Geometric** — primary colors, hard geometry, sans display, structured grid
- **Maximalist** — dense, layered, intentionally busy, decorative
- **Refined Minimalist** — restraint, masterful whitespace, one accent, perfect type rhythm

Quality details you must consider every time:
- **Typography**: AVOID generic defaults (Arial, Helvetica, system-ui as the only choice, plain Inter/Roboto). Pair a distinctive display font with a refined body font. Examples: Playfair Display + Inter, Space Grotesk + IBM Plex Mono, EB Garamond + Söhne, Bricolage Grotesque + Manrope. Ship distinctive type via Google Fonts `<link>` in the html if you need.
- **Color**: One dominant color + one sharp accent — not five faded colors evenly distributed. Avoid the cliché purple-on-white gradient. Avoid default Tailwind blue/indigo unless the user asked for it.
- **Spatial composition**: Either generous whitespace OR controlled density — pick a side. Use asymmetry. Don't always center everything.
- **Backgrounds**: Match the aesthetic — gradient mesh, noise texture, geometric pattern, layered transparencies, dramatic shadows, grain overlays. Solid white is a choice you make on purpose, not a default.
- **Micro-details**: Hover states, focus rings, custom selection color, subtle animations on key elements, decorative borders, inner highlights. The difference between "AI-looking" and "designed" lives in details.

C. ANTI-SLOP — these patterns immediately read as generic AI:
- Purple → pink gradient on white
- Three evenly-spaced cards in a row, plain shadows
- Default Tailwind blue (`blue-500`) for primary
- Inter / Roboto / Arial as the *only* font choice
- "Free / Pro / Enterprise" pricing using the same template every time
- Cookie-cutter hero with ↗ arrow CTAs and a centered subtitle
- Stock-photo placeholder rectangles labeled "Image"

D. COMPLETENESS

`render_ui` is rendered in a sandboxed iframe with `allow-scripts` only — no network fetches from JS. So:
- Use Google Fonts via `<link>` in the html (works during initial page load)
- Use Tailwind via `framework: "tailwind"` (CDN script)
- Inline images via `<svg>` or data URIs only — no external image URLs
- All CSS/JS self-contained

E. AFTER YOU BUILD

After `render_ui`, you MAY call `critique_design` to have a senior-designer agent review your work and return structured feedback. Use it when:
- The user asked for a "polished" or "production-grade" version
- Your first pass might be generic
- The user clicks the Refine button (which sends a "review and improve" message)

After receiving the critique, address the high-severity issues by calling `render_ui` AGAIN with the improved version. Briefly summarize what you changed.

────────────────────────────────────────────────────────────────────────

Product context (always-on background from the user's Product Brain):
{product_context}
""".strip()


# ── SSE helpers ───────────────────────────────────────────────────────────────


def _sse(event_type: str, payload: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── Wire → canonical conversion ───────────────────────────────────────────────


def _wire_to_canonical(messages: list[dict]) -> list[Message]:
    """Convert wire messages to canonical.

    A wire message can be either:
      {"role": "user"|"assistant", "content": str}
      {"role": "user"|"assistant"|"tool", "blocks": [...canonical content blocks...]}
    """
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
    """Tool calls in the LAST assistant turn whose results haven't been provided.

    Pending means: assistant emitted a tool_call block, and no subsequent
    tool message (role='tool') contains a tool_result with that id.
    """
    if not messages or messages[-1]["role"] not in ("assistant", "tool"):
        return []

    # Walk backward to find the last assistant turn
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

    # Collect ids of tool_results in messages after the assistant turn
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


# ── Runner ────────────────────────────────────────────────────────────────────


async def run_agent(
    *,
    messages: list[dict],
    user_id: str,
    project_id: str | None,
    product_context: str = "",
    document_context: str = "",
    pending_decisions: list[dict] | None = None,
    model: str | None = None,
    provider: str | None = None,
    max_steps: int = 8,
) -> AsyncGenerator[str, None]:
    """Run the agent loop and stream SSE strings to the HTTP client."""
    try:
        llm = get_llm_provider(model_override=model, provider_override=provider)
    except Exception as e:
        yield _sse("error", {"message": f"LLM provider not available: {e}"})
        yield _sse("done", {"final_text": ""})
        return

    ctx = {"user_id": user_id, "project_id": project_id}

    system = SYSTEM_PROMPT.format(
        product_context=product_context.strip() or "(none provided)"
    )
    if document_context.strip():
        system += (
            f"\n\nThe user is currently viewing this document:\n---\n"
            f"{document_context[:4000]}\n---"
        )

    tools: list[Tool] = TOOL_SCHEMAS  # canonical
    canonical_msgs = _wire_to_canonical(messages)
    decisions_by_id = {
        d["tool_call_id"]: d for d in (pending_decisions or [])
    }

    final_text_parts: list[str] = []

    # ── Pre-loop: resolve any pending tool_calls from a previous run ──────────

    pending = _find_pending_tool_calls(canonical_msgs)
    if pending:
        tool_blocks: list[dict] = []
        for call in pending:
            requires_perm = call["name"] in REQUIRES_PERMISSION
            if requires_perm:
                decision = decisions_by_id.get(call["id"])
                if not decision:
                    # Still awaiting — re-emit and exit
                    yield _sse("tool_call", {
                        "id": call["id"],
                        "name": call["name"],
                        "args": call.get("args") or {},
                        "status": "awaiting_permission",
                    })
                    yield _sse("done", {"final_text": ""})
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
                # else fall through and execute (approved)

            # Auto-execute (read-only or pre-approved)
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

    # ── Normal loop ───────────────────────────────────────────────────────────

    for step in range(max_steps):
        current_text_parts: list[str] = []
        turn_calls: list[dict] = []  # tool_calls collected this turn
        stop_reason = "end_turn"
        error_msg: str | None = None

        try:
            async for ev in llm.stream_with_tools(
                system=system,
                messages=canonical_msgs,
                tools=tools,
                model=model,
            ):
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
                    }
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
                    })
                elif t == "turn_end":
                    stop_reason = ev.get("stop_reason") or "end_turn"
                    error_msg = ev.get("error")
                    break
        except Exception as e:
            yield _sse("error", {"message": f"Agent error: {e}"})
            yield _sse("done", {"final_text": "".join(final_text_parts)})
            return

        # Append the assistant turn
        assistant_blocks: list[dict] = []
        if current_text_parts:
            assistant_blocks.append({
                "type": "text", "text": "".join(current_text_parts),
            })
        for call in turn_calls:
            assistant_blocks.append({
                "type": "tool_call",
                "id": call["id"],
                "name": call["name"],
                "args": call["args"],
            })
        if assistant_blocks:
            canonical_msgs.append({"role": "assistant", "content": assistant_blocks})

        if stop_reason == "error":
            yield _sse("error", {"message": error_msg or "Provider error"})
            break

        if stop_reason != "tool_use" or not turn_calls:
            break

        # If ANY tool requires permission, pause: don't execute anything this
        # turn (would leave the assistant turn with mixed completed/pending
        # results, which the next provider call wouldn't accept). The client
        # resumes via pending_decisions, at which point we re-execute the
        # auto tools too — cheap and keeps the runner stateless.
        gated = [c for c in turn_calls if c["name"] in REQUIRES_PERMISSION]
        if gated:
            break  # done event below

        # All auto — execute and feed back
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

    yield _sse("done", {"final_text": "".join(final_text_parts)})
