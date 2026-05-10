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
import logging
from typing import AsyncGenerator

from llm.factory import get_llm_provider
from llm.types import Message, Tool

from .tools import REQUIRES_PERMISSION, TOOL_EXECUTORS, TOOL_SCHEMAS

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are PMind, an AI Product Manager working inside a workspace the user owns.

You have tools to (a) search the user's knowledge base — uploaded customer interviews, research, PDFs — and read their existing documents, (b) create and edit documents and folders in the current project, and (c) build live UI previews and have a senior-designer agent critique them.

════════════════════════════════════════════════════════════════════════
FOCUS RULE — READ THIS FIRST
════════════════════════════════════════════════════════════════════════
Respond to the MOST RECENT user message only. The conversation history
is context — do not re-execute, summarise, or repeat actions from
earlier turns. If the latest message is a short follow-up ("improve
it", "what else?", "go ahead"), treat it as continuing from where you
left off, not as a reason to redo prior steps.

════════════════════════════════════════════════════════════════════════
TOOL ID RULES — NEVER SKIP THESE
════════════════════════════════════════════════════════════════════════
Doc IDs and folder IDs are UUIDs — e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890".
They are NEVER integers like 1, 2, or 3.

Mandatory sequence for any doc operation:
  1. Call `list_docs` to get the real UUID for the document.
  2. Use that UUID in `read_doc` or `edit_doc`.

NEVER guess, invent, or infer a doc ID. If you do not have the UUID
from a fresh `list_docs` call, call it now before proceeding. Calling
`edit_doc` or `read_doc` with a made-up ID will always fail.

PM workflow:
1. Before drafting any PM artifact, call `search_kb` to find relevant evidence. If you draft without searching, the user gets generic output — that's a failure.
2. When you reference an interview or research excerpt, quote it briefly and attribute it (e.g. "users described X as 'literally unusable' [1]"). Number citations starting at [1] in the order sources first appear.
3. If `search_kb` returns nothing relevant, say so explicitly before falling back to general knowledge — do NOT fabricate quotes.
4. When the user asks about existing work, call `list_docs` or `search_docs` first to see what's already in the project.
5. To save your work, call `create_doc` with markdown content (# heading, - bullets, **bold**, *italic*). The user must approve.
6. For revisions, use `edit_doc` — ALWAYS call `list_docs` first to get the UUID, then `read_doc` to see the current content. The user must approve the edit.
7. Be concise. Lead with the answer, then evidence. Avoid filler.

────────────────────────────────────────────────────────────────────────
DESIGN WORK (`render_ui` and `critique_design`)
────────────────────────────────────────────────────────────────────────

When the user asks for ANY UI — mockup, component, dashboard, landing page, modal, form, card, table, prototype — you BUILD it via `render_ui`, you do not describe it in prose. They get a live preview with Preview/HTML/CSS/JS tabs in the chat.

A. WHEN TO BUILD vs WHEN TO ASK

If the request contains ANY of the following, BUILD IMMEDIATELY — do not ask:
- A style word: glassmorphism, minimal, dark, brutalist, editorial, retro, soft, etc.
- A color or palette: "amber on ivory", "dark blue", "pastel", etc.
- A direction verb: improve, refine, add, update, make it X, change to Y
- Any product/page context: "landing page for X", "dashboard for Y"
- "a website" with any purpose at all

Examples → action:
- "glassmorphism" → BUILD glassmorphism now
- "improve this" → BUILD improved version now (same style, pushed further)
- "dark mode version" → BUILD dark version now
- "add a footer" → BUILD with footer added now
- "amber on ivory, minimal" → BUILD that now
- "make it look better" → BUILD improved version now

If the user needs direction clarification, ask EXACTLY ONE targeted question — not a list, not multiple choices. Ask the ONE most important missing piece. Example: "What's this page for?" or "Prefer dark or light background?" — never both at once.

The only time asking is appropriate: the message has zero context — no product, no style, no purpose whatsoever (e.g., "make something cool"). Ask ONE focused question, then build immediately when they answer.

Default choices when context is thin — pick and build, never ask about these:
- No palette given: dark mode, amber accent on dark slate
- "Website" with no product: SaaS landing page (nav, hero, features, CTA, footer)
- "Improve": same aesthetic, more sections, denser detail, better typography
- "Minimal": Refined Minimalist, ivory background, one accent, generous whitespace

B. FULL WEBSITE CAPABILITY

You CAN build complete, multi-section, fully interactive websites in a single render_ui call. The iframe supports all client-side JavaScript — use it aggressively.

What "a website" means by default (build all of these):
- **Sticky nav** — logo + links, smooth-scroll to sections, hamburger menu on mobile that toggles open/close
- **Hero** — bold headline, subheadline, 1-2 CTA buttons, supporting visual (SVG or CSS art, no external images)
- **Features / Benefits** — 3-6 cards or list items with icons
- **How it works / Process** — numbered steps or timeline
- **Testimonials or social proof** — quotes, ratings, logos (placeholder)
- **Pricing** — 2-3 tier cards
- **FAQ** — accordion that opens/closes on click
- **Footer** — links, copyright

When a user asks for "a website", "a full page", "a landing page", "a product page" → build ALL relevant sections. Don't ask. Pick what fits the context.

Interactive JS you must use in every website:
- Smooth scroll: `document.querySelectorAll('a[href^="#"]')` → `scrollIntoView({ behavior: 'smooth' })`
- Mobile nav toggle: hamburger icon clicks → show/hide nav menu
- Accordion FAQ: click handler shows/hides answer, rotates chevron
- Active nav highlight: `IntersectionObserver` on sections → updates nav link styling
- Subtle scroll animations: `IntersectionObserver` → add a class that fades/slides elements in

You can also build: tab switchers, modal dialogs, carousels/sliders, form validation with inline feedback, counter animations, progress bars, step wizards — anything that doesn't require a network request. Use `window.matchMedia` for responsive JS if needed.

C. THE QUALITY BAR

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

D. ANTI-SLOP — these patterns immediately read as generic AI:
- Purple → pink gradient on white
- Three evenly-spaced cards in a row, plain shadows
- Default Tailwind blue (`blue-500`) for primary
- Inter / Roboto / Arial as the *only* font choice
- "Free / Pro / Enterprise" pricing using the same template every time
- Cookie-cutter hero with ↗ arrow CTAs and a centered subtitle
- Stock-photo placeholder rectangles labeled "Image"

E. COMPLETENESS

`render_ui` is rendered in a sandboxed iframe with `allow-scripts` only — no network fetches from JS. So:
- Use Google Fonts via `<link>` in the html (works during initial page load)
- Use Tailwind via `framework: "tailwind"` (CDN script)
- Inline images via `<svg>` or data URIs only — no external image URLs
- All CSS/JS self-contained

F. IMPROVING AN EXISTING UI

When the user asks to improve, refine, update, or iterate on a UI you already built in this conversation:
1. Look at the most recent `render_ui` tool_call in the conversation history.
2. Take that exact html/css/js as your starting point.
3. Call `render_ui` again with the improved version — do NOT call `list_docs`, `search_kb`, or any other tool first.

NEVER start from scratch when improving — always extend what you built.

G. AFTER YOU BUILD

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
    logger.info("Agent run start — user=%s project=%s model=%s messages=%d",
                user_id, project_id, model or "auto", len(messages))
    try:
        llm = get_llm_provider(model_override=model, provider_override=provider)
    except Exception as e:
        logger.error("LLM provider unavailable: %s", e)
        yield _sse("error", {"message": f"LLM provider not available: {e}"})
        yield _sse("done", {"final_text": ""})
        return

    ctx = {"user_id": user_id, "project_id": project_id}

    system = SYSTEM_PROMPT.replace(
        "{product_context}", product_context.strip() or "(none provided)"
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
    # Strategy: use stream_with_tools for every step so the model can call
    # tools across as many rounds as needed (list_docs → read_doc → render_ui).
    # Text from tool-calling steps is buffered and yielded after we confirm
    # tool calls exist.  When a step returns end_turn (pure text), we redo it
    # with stream_text (no tools in config) so Gemini streams tokens instead of
    # delivering the whole response in one chunk.
    # Exception: if no tools have been used yet we just yield the buffered text
    # to avoid a redundant API round-trip for simple questions.

    any_tools_executed = False

    for step in range(max_steps):
        logger.debug("Agent step %d — user=%s", step + 1, user_id)
        current_text_parts: list[str] = []
        turn_calls: list[dict] = []
        stop_reason = "end_turn"
        error_msg: str | None = None

        llm_gen = llm.stream_with_tools(system=system, messages=canonical_msgs, tools=tools, model=model)

        try:
            async for ev in llm_gen:
                t = ev.get("type")
                if t == "text":
                    # Buffer — don't yield until we know whether there are tool calls.
                    current_text_parts.append(ev.get("delta", ""))
                elif t == "tool_call":
                    call = {
                        "id": ev["id"],
                        "name": ev["name"],
                        "args": ev.get("args") or {},
                        "_thought_sig": ev.get("_thought_sig"),
                    }
                    logger.info("Tool call — name=%s id=%s user=%s", call["name"], call["id"], user_id)
                    turn_calls.append(call)
                    status = (
                        "awaiting_permission"
                        if call["name"] in REQUIRES_PERMISSION
                        else "running"
                    )
                    # Yield tool_call immediately — we now know tools are in play.
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
            logger.error("Agent error at step %d — user=%s: %s", step + 1, user_id, e, exc_info=True)
            yield _sse("error", {"message": f"Agent error: {e}"})
            yield _sse("done", {"final_text": "".join(final_text_parts)})
            return

        if stop_reason == "error":
            yield _sse("error", {"message": error_msg or "Provider error"})
            break

        # ── Pure-text response (no tool calls this step) ──────────────────────
        if not turn_calls:
            if any_tools_executed and hasattr(llm, "stream_text"):
                # Tools were used in a prior step — the buffered text from
                # stream_with_tools is likely delivered as one chunk (Gemini
                # buffers when tools are in the config).  Re-run with
                # stream_text so the final answer streams token-by-token.
                streaming_parts: list[str] = []
                try:
                    async for ev in llm.stream_text(
                        system=system, messages=canonical_msgs, model=model
                    ):
                        t = ev.get("type")
                        if t == "text":
                            delta = ev.get("delta", "")
                            streaming_parts.append(delta)
                            final_text_parts.append(delta)
                            yield _sse("text", {"delta": delta})
                        elif t == "turn_end":
                            if ev.get("error"):
                                yield _sse("error", {"message": ev["error"]})
                            break
                except Exception as e:
                    logger.error("stream_text final step error: %s", e, exc_info=True)
                    yield _sse("error", {"message": f"Agent error: {e}"})
                if streaming_parts:
                    canonical_msgs.append({
                        "role": "assistant",
                        "content": [{"type": "text", "text": "".join(streaming_parts)}],
                    })
            else:
                # First response with no tools — yield the buffered text directly.
                for delta in current_text_parts:
                    final_text_parts.append(delta)
                    yield _sse("text", {"delta": delta})
                if current_text_parts:
                    canonical_msgs.append({
                        "role": "assistant",
                        "content": [{"type": "text", "text": "".join(current_text_parts)}],
                    })
            break

        # ── Tool calls present — append assistant turn, then execute ──────────

        # Yield the pre-tool commentary text (usually brief or empty).
        for delta in current_text_parts:
            final_text_parts.append(delta)
            yield _sse("text", {"delta": delta})

        assistant_blocks: list[dict] = []
        if current_text_parts:
            assistant_blocks.append({
                "type": "text", "text": "".join(current_text_parts),
            })
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
        canonical_msgs.append({"role": "assistant", "content": assistant_blocks})

        if stop_reason != "tool_use":
            break

        # If ANY tool requires permission, pause and wait for resume.
        gated = [c for c in turn_calls if c["name"] in REQUIRES_PERMISSION]
        if gated:
            break

        # All auto — execute and feed results back into history.
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
        any_tools_executed = True

    logger.info("Agent run complete — user=%s steps=%d", user_id, step + 1)
    yield _sse("done", {"final_text": "".join(final_text_parts)})
