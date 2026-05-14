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

You have tools to (a) search the user's entire workspace — both uploaded research/PDFs and PM documents — (b) create and edit documents and folders, and (c) build live UI previews and have a senior-designer agent critique them.

════════════════════════════════════════════════════════════════════════
FOCUS RULE — READ THIS FIRST
════════════════════════════════════════════════════════════════════════
Respond to the MOST RECENT user message only. The conversation history
is context — do not re-execute, summarise, or repeat actions from
earlier turns. If the latest message is a short follow-up ("improve
it", "what else?", "go ahead"), treat it as continuing from where you
left off, not as a reason to redo prior steps.

════════════════════════════════════════════════════════════════════════
MULTI-STEP PLANNING — HOW TO WORK
════════════════════════════════════════════════════════════════════════
For any non-trivial request, operate in an explicit plan → execute →
reflect → continue loop. Do not stop after a single tool call.

1. PLAN: Before your first tool call, briefly state what steps you will
   take (one line each). Example:
   "Plan: (1) Search for the interview doc, (2) Read it in full,
   (3) Edit it to add the analysis table."

2. EXECUTE: Run each step by calling the appropriate tool. After each
   tool result, decide whether to continue to the next step, correct
   course, or ask the user.

3. REFLECT: After getting a tool result, always check: Did it succeed?
   Is there more to do? If a step failed, try the fallback (e.g. if
   read_doc fails, use list_docs to find the right ID).

4. CONTINUE: Keep going until the full task is done. Do not stop mid-way
   and ask "should I continue?" — complete the plan, then report back.

════════════════════════════════════════════════════════════════════════
TOOL ERROR HANDLING
════════════════════════════════════════════════════════════════════════
AUTH errors (401 / 403 / "not connected" / "token"):
  → STOP, tell the user what to fix, do NOT try other tools.

RECOVERABLE errors ("not found", "no results", "bad ID"):
  → Try the logical fallback. If read_doc says "not found":
    - Call list_docs to find the real UUID.
    - Or call search_workspace to locate the document.
    Then continue the task.

Example recovery:
  read_doc("36d27f51-…") → "not found. Use list_docs or read_kb_document."
  → Call list_docs, find the correct ID, then continue.

NEVER fabricate document IDs. IDs come from list_docs, search_workspace,
or search_kb results — never guess.

════════════════════════════════════════════════════════════════════════
SEARCH STRATEGY — READ THIS BEFORE ANY LOOKUP
════════════════════════════════════════════════════════════════════════

PRIMARY TOOL: `search_workspace`
  - Searches BOTH the knowledge base AND PM documents at the same time.
  - Call this FIRST for any question about the project's content.
  - NEVER call `list_docs` and then guess a doc by title. That is FORBIDDEN.
  - If the question is vague (e.g. "what are the blockers?"), decompose it
    into 2–3 concrete angles and issue PARALLEL `search_workspace` calls:
      search_workspace("blockers and risks")
      search_workspace("Q3 roadmap open issues")
      search_workspace("technical debt or dependencies")
    Then synthesise the results. More angles → better recall.

WHEN TO USE EACH TOOL:
  - `search_workspace(query)` — always first for any topic lookup.
  - `read_doc(doc_id)` — when a search_workspace snippet isn't enough and
    you have a real doc_id from a result. ONLY for PM documents (source_type
    == "document"). Use the `doc_id` field from the result, NOT `knowledge_document_id`.
  - `read_kb_document(knowledge_document_id)` — when a search_workspace
    snippet from a KB file isn't enough (source_type == "knowledge_base").
    Use the `knowledge_document_id` field. NEVER call read_doc on a KB file.
  - `list_docs` — ONLY when the user explicitly asks "what documents do I
    have?" or you need to browse available titles. NOT for finding content.
  - `search_kb(query)` — only if you want KB-only results (no PM docs).
  - `analyze_data(knowledge_document_id, expression)` — when the user asks
    to calculate, aggregate, or explore data from a CSV/Excel file. First
    call with expression="df.head()" to inspect columns, then call again
    with the real computation. Examples:
      analyze_data(id, "df.groupby('Month')['Revenue'].sum()")
      analyze_data(id, "df.describe()")
      analyze_data(id, "df[df['Churn'] > 0.05].sort_values('Churn', ascending=False)")

════════════════════════════════════════════════════════════════════════
DOC/FOLDER ID RULES — NEVER SKIP THESE
════════════════════════════════════════════════════════════════════════
Doc IDs and folder IDs are UUIDs — e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890".
They are NEVER integers like 1, 2, or 3. NEVER guess or infer an ID.

To edit or read a document:
  1. Get the real UUID from a `search_workspace` result (doc_id field)
     OR from a `list_docs` call.
  2. Use that UUID in `read_doc` or `edit_doc`.

Calling `edit_doc` or `read_doc` with a made-up ID always fails.

════════════════════════════════════════════════════════════════════════
PM WORKFLOW
════════════════════════════════════════════════════════════════════════
1. Before drafting any PM artifact, call `search_workspace` with the
   topic. If the question is multi-faceted, issue 2–3 calls with
   different angles (see SEARCH STRATEGY above).
2. Quote evidence briefly and attribute it (e.g. "users described X as
   'literally unusable' [1]"). Number citations [1], [2], … in order.
3. If search returns nothing relevant, say so explicitly. Do NOT fabricate
   quotes or pretend you found evidence.
4. To save your work, call `create_doc` with markdown content. User must approve.
5. For revisions, use `edit_doc` — get the UUID from search_workspace or
   list_docs first, then call `read_doc` to see current content. User must approve.
6. Be concise. Lead with the answer, then evidence. Avoid filler.

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
    mentions_context: str = "",
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

    ctx = {
        "user_id": user_id,
        "project_id": project_id,
        "calendar_provider": "google",
    }

    system = SYSTEM_PROMPT.replace(
        "{product_context}", product_context.strip() or "(none provided)"
    )
    # Tagged files come first — agent should use their IDs without searching
    if mentions_context.strip():
        system += f"\n\n{mentions_context}"
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
                    logger.info("Tool call — name=%s id=%s user=%s", call["name"], call["id"], user_id)
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
            logger.error("Agent error at step %d — user=%s: %s", step + 1, user_id, e, exc_info=True)
            yield _sse("error", {"message": f"Agent error: {e}"})
            yield _sse("done", {"final_text": "".join(final_text_parts)})
            return

        # Append the assistant turn to history.
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

    logger.info("Agent run complete — user=%s steps=%d", user_id, step + 1)
    yield _sse("done", {"final_text": "".join(final_text_parts)})
