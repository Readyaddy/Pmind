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

When the user asks for ANY UI — mockup, component, dashboard, landing page, modal, form, card, table, prototype — BUILD it via `render_ui` immediately. Do not describe it in prose. Do not ask for design preferences — infer everything from context and build.

A. BUILD IMMEDIATELY — INFER, DON'T ASK

Read the user query + product context, pick a visual direction, and build. Only ask if the request is genuinely empty of context (e.g. "make something" with zero product info).

Auto-infer style from context:
- B2B SaaS / PM tool → Glassmorphism or Refined Minimalist, neutral palette (slate, zinc, stone)
- Consumer app / startup → Colorful + rounded, vibrant primary, friendly type
- Analytics / data product → Neo-tech or Editorial, dark mode preferred
- Enterprise / formal product → Editorial, serif display type, restrained jewel-tone palette
- Health / wellness → Organic/Soft, rounded, pastel palette
- Fintech / crypto → Dark mode, sharp accents (amber, lime, cyan), precise monospace type
- If a brand color is mentioned → use it as primary, derive accent from complementary hue
- If aesthetic is named ("glassmorphic", "brutalist") → execute that precisely

The user must not need to specify padding, fonts, shadow depth, or border radius — those are YOUR decisions.

B. MANDATORY TECHNICAL RULES — every render_ui must follow these

SPACING — 8px grid (non-negotiable):
- All spacing is a multiple of 8: 8, 16, 24, 32, 48, 64, 80px
- Card/section padding: 24px standard, 16px compact, 48px spacious
- Vertical rhythm between sections: 48–64px
- Gap between related elements: 16–24px
- Never use arbitrary values (13px, 22px, 37px)

TYPOGRAPHY — 1.25 modular scale:
- Body: 16px / 1.6 line-height / font-weight 400
- H1: 32px / 1.15 line-height / -0.02em tracking / font-weight 700
- H2: 26px / 1.2 line-height / font-weight 600–700
- H3: 21px / 1.3 line-height / font-weight 600
- Small: 14px | Micro labels: 12px / 0.08em tracking / uppercase / font-weight 600
- ALWAYS pair a display/heading font with a body font via Google Fonts <link>
  Proven pairs: Playfair Display + Inter · Space Grotesk + DM Sans · Fraunces + Manrope
  Bricolage Grotesque + Source Sans 3 · Syne + Inter · Cabinet Grotesk + DM Sans
- Avoid: Inter/Roboto/Arial as the ONLY font — must have a display companion

COLOR:
- One dominant primary + one sharp accent. Not five faded shades.
- All body text: minimum 4.5:1 contrast on its background (WCAG AA)
- Large text / headings: minimum 3:1 contrast
- Never use default Tailwind blue-500 (#3B82F6) as primary unless the user asked
- Avoid purple-pink gradient on white — it's the #1 AI slop signal
- Neutrals: pick a tint family (zinc, slate, stone, warm gray) and stay in it

SHADOWS — elevation system (pick the right level, don't apply to everything):
- Flat:   no shadow (body, section backgrounds)
- Low:    box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.06)  → cards, chips
- Mid:    box-shadow: 0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.05) → dropdowns, hover cards
- High:   box-shadow: 0 20px 40px rgba(0,0,0,.12), 0 8px 16px rgba(0,0,0,.08) → modals, popovers
- Never apply identical shadows to every element on the page

BORDER RADIUS — consistent single value:
- Formal/enterprise: 4px | Modern SaaS: 8px | Friendly/consumer: 12–16px
- Pill buttons are acceptable as a deliberate CTA choice (border-radius: 9999px)
- Never mix radii (8px cards + 4px inputs + 20px buttons = incoherent)

BUTTONS — always production-quality:
- Minimum height: 44px (mobile-safe). Standard: 48px
- Padding: 12px 24px. Compact: 8px 16px
- CTA copy: strong action verb — "Start Free Trial", "Generate Report", "Book Demo"
- Include ALL states in CSS:
  :hover  { filter: brightness(0.88); box-shadow: [mid]; cursor: pointer; }
  :focus  { outline: 3px solid [primary]; outline-offset: 2px; }
  :active { transform: scale(0.97); }
  :disabled { opacity: 0.45; cursor: not-allowed; }
- Primary button must have 4.5:1 contrast between label and background

INTERACTIONS (apply to every clickable element):
- All transitions: 150–200ms ease-in-out
- Cards on hover: translateY(-2px) + shadow level up
- Links: color shift + underline on hover
- Always include: @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }

C. AESTHETIC VOCABULARY (pick ONE, execute fully):
- **Glassmorphism** — backdrop-filter: blur(20px), rgba backgrounds 70–80% opacity, subtle white inner border, soft drop shadow, vibrant accent on frosted surface
- **Neumorphism** — monochromatic, dual concave/convex shadows, light source top-left, embossed feel (use sparingly — accessibility risk)
- **Brutalist / Neo-Brutalist** — 2–4px solid borders, blocky layout, monospace display, raw high-contrast colors, intentional asymmetry
- **Editorial / Magazine** — serif display (Playfair, Fraunces, EB Garamond), generous whitespace, asymmetric grids, ruled lines, drop caps, muted jewel palette
- **Retro / Synthwave** — neon gradients, geometric shapes, 80s palette, scanline overlays, chrome text effects
- **Neo-tech / Terminal** — dark bg, JetBrains Mono / Fira Code display, amber/lime/cyan sharp accents, ASCII dividers, precise grid
- **Organic / Soft** — rounded 16–24px corners, pastel palette, subtle grain texture, friendly rounded type, hand-drawn accents
- **Bauhaus / Geometric** — primary RGB colors, hard geometry, sans display, strict modular grid
- **Maximalist** — dense, layered, intentionally rich, decorative type, pattern backgrounds
- **Refined Minimalist** — one accent, masterful whitespace, pure type hierarchy, no decorative elements

D. ANTI-SLOP — these patterns immediately signal AI-generated:
- Purple → pink gradient on white background
- Three evenly-spaced identical cards, generic box-shadow
- Default Tailwind blue-500 as primary color
- Inter or Roboto as the ONLY font (no display companion)
- "Free / Pro / Enterprise" pricing laid out identically every time
- Centered hero: big headline + subtitle + two buttons + generic gradient
- Placeholder rectangles labeled "Image" or "Photo here"
- Every element has the same border-radius and shadow
- No hover states on any interactive element

E. COMPLETENESS (sandboxed iframe — allow-scripts only):
- Google Fonts via <link> in HTML head (CDN works at load time)
- Tailwind via `framework: "tailwind"` arg (CDN script injected automatically)
- Inline SVGs for icons and illustrations — no external image URLs
- No JS fetch() or XHR (blocked by sandbox)
- All CSS/JS self-contained — works offline

F. ALWAYS SELF-CRITIQUE AFTER BUILDING

After every `render_ui`, immediately call `critique_design` automatically — do not wait for the user to ask. Treat it as mandatory QA. If the critique returns any high-severity issue, fix it and call `render_ui` again with the improved version. Tell the user briefly what changed.

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
