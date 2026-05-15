"""
Tools the PMind agent can call.

Phase 1 = read-only: search_kb, list_docs, read_doc, search_docs.
Each tool has:
  - an Anthropic tool schema (TOOL_SCHEMAS)
  - an async executor (TOOL_EXECUTORS) that takes (ctx, **args) and returns a dict

Citations: every result includes a `sources` list of {id, kind, title, snippet?}
that the frontend renders as clickable [n] chips.
"""
import json
import logging
import os
import re
from typing import Any

from google import genai
from google.genai import types as genai_types

from deps import get_supabase
from .markdown import markdown_to_tiptap

logger = logging.getLogger(__name__)


# ── Tool schemas (Anthropic format) ──────────────────────────────────────────

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "list_docs",
        "description": (
            "List all documents in the current project with their id, title, and "
            "last-updated time. Use this to discover what already exists before "
            "drafting something new."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "read",
        "description": (
            "Read the full content of a workspace item by its prefixed id. "
            "Pass `doc:<uuid>` for PM documents or `kb:<uuid>` for knowledge "
            "base files. The source_id you receive from search_workspace "
            "already has the correct prefix — pass it as-is. Use this "
            "whenever you need the full text of something a search returned."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "source_id": {
                    "type": "string",
                    "description": "Prefixed id from search_workspace, e.g. 'doc:abc-uuid' or 'kb:xyz-uuid'.",
                },
            },
            "required": ["source_id"],
        },
    },
    {
        "name": "create_doc",
        "description": (
            "Create a new document in the current project. The user must approve "
            "before this is executed. `content` is markdown — use # for headings, "
            "- for bullets, **bold**, *italic*. Place it under `folder_id` if "
            "specified, otherwise at the project root."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the new doc, e.g. 'PRD: Streamlined Checkout'.",
                },
                "content": {
                    "type": "string",
                    "description": "Initial document content in Markdown.",
                },
                "folder_id": {
                    "type": "string",
                    "description": "(optional) Folder id from list_docs to place the doc under.",
                },
            },
            "required": ["title", "content"],
        },
    },
    {
        "name": "edit_doc",
        "description": (
            "Replace the contents of an existing document. The user must approve "
            "before this is executed. Provide `new_content` as full markdown — "
            "this overwrites the document. Use `read_doc` first to know what's there."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doc_id": {
                    "type": "string",
                    "description": "Id of the document to edit.",
                },
                "new_content": {
                    "type": "string",
                    "description": "Full new content in Markdown — replaces existing.",
                },
            },
            "required": ["doc_id", "new_content"],
        },
    },
    {
        "name": "create_folder",
        "description": (
            "Create a new folder in the current project. The user must approve "
            "before this is executed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Folder name.",
                },
                "parent_folder_id": {
                    "type": "string",
                    "description": "(optional) Parent folder id; nests under it.",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "render_ui",
        "description": (
            "Build a working UI preview the user can see, copy, and integrate. "
            "Use this whenever they ask for ANY visual artifact — mockup, "
            "component, dashboard, landing page, modal, card, form, table. "
            "DO NOT describe the UI in prose; build it.\n\n"
            "SINGLE PAGE: provide html/css/js — renders in one sandboxed iframe.\n"
            "MULTI-PAGE WEBSITE: provide `pages` — an array of page objects, each "
            "with {name, html, css?, js?}. The preview shows a file-tab bar so the "
            "user can switch between pages (Home, About, Contact, etc.). Each page "
            "is a fully self-contained HTML document with its own <style> and <script>. "
            "Pages can navigate to each other via links like <a href='#'>About</a> — "
            "the file tabs handle routing. Use this for full websites where each route "
            "is a separate file.\n\n"
            "Quality bar: pick ONE clear aesthetic direction (glassmorphism, "
            "brutalist, editorial, neo-tech, etc.) and execute it precisely. "
            "Use distinctive typography (load Google Fonts via <link> if "
            "needed — avoid plain Arial/Helvetica/Inter as the *only* choice). "
            "One dominant color + one accent, not five faded ones. Asymmetric "
            "layouts beat centered defaults. Add micro-details: hover states, "
            "custom selection color, subtle motion, decorative borders.\n\n"
            "Self-contained: sandbox is `allow-scripts` only — no JS fetches. "
            "Use Google Fonts <link>, Tailwind via the `framework` arg, inline "
            "SVG, or data URIs. No external images.\n\n"
            "Anti-slop: avoid purple-pink gradients on white, default Tailwind "
            "blue, three-evenly-spaced-cards, Inter as only font."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short label shown above the preview, e.g. 'Portfolio Website'.",
                },
                "html": {
                    "type": "string",
                    "description": "Body HTML for single-page renders. Omit when using `pages`.",
                },
                "css": {
                    "type": "string",
                    "description": "(optional) CSS rules for single-page renders.",
                },
                "js": {
                    "type": "string",
                    "description": "(optional) JS for single-page renders.",
                },
                "framework": {
                    "type": "string",
                    "enum": ["vanilla", "tailwind"],
                    "description": "'tailwind' loads the CDN. Default 'vanilla'.",
                },
                "pages": {
                    "type": "array",
                    "description": (
                        "Multi-page website: array of page objects. Use instead of html/css/js. "
                        "Each page is a fully self-contained HTML file."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Page display name, e.g. 'Home', 'About', 'Contact'.",
                            },
                            "html": {
                                "type": "string",
                                "description": "Full body HTML for this page.",
                            },
                            "css": {
                                "type": "string",
                                "description": "(optional) CSS for this page.",
                            },
                            "js": {
                                "type": "string",
                                "description": "(optional) JS for this page.",
                            },
                        },
                        "required": ["name", "html"],
                    },
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "check_calendar",
        "description": (
            "Check the user's meeting schedule for today (or tomorrow / this_week) "
            "to help with time-blocking and planning. Returns a list of meetings with "
            "start/end times, durations, and any detected conflicts (overlaps, "
            "back-to-back blocks, marathon stretches). Use this when the user asks "
            "things like: 'Do I have time to finish this today?', 'When is my next "
            "free block?', 'Am I too busy this week?', or 'Prep me for my next meeting'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "timeframe": {
                    "type": "string",
                    "enum": ["today", "tomorrow"],
                    "description": "Which day to fetch. Default: 'today'.",
                    "default": "today",
                },
            },
            "required": [],
        },
    },
    {
        "name": "search_workspace",
        "description": (
            "PRIMARY search tool — unified semantic search across BOTH the knowledge "
            "base (uploaded PDFs, interviews, research) AND all PM documents in the "
            "project simultaneously. Always call this BEFORE drafting any artifact. "
            "Returns top-k ranked snippets from both sources. Each snippet includes "
            "a doc_id — call read_doc(doc_id) if you need the full document, or "
            "read_kb_document(knowledge_document_id) for a full KB file. "
            "For vague questions, issue 2-3 calls with different query angles "
            "(e.g. 'checkout blockers', 'Q3 roadmap risks', 'user complaints') "
            "then synthesise the combined results."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language query, e.g. 'checkout flow pain points'.",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of results to return (default 5, max 10).",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "analyze_data",
        "description": (
            "Run pandas analysis on an uploaded CSV or Excel file from the knowledge base. "
            "Use this when the user asks to calculate, aggregate, summarise, or explore "
            "data from a spreadsheet (e.g. 'What's the average churn rate?', 'Show me "
            "monthly revenue totals', 'Which product has the highest NPS?').\n\n"
            "Workflow:\n"
            "1. First call with expression='df.head()' to inspect columns and sample data.\n"
            "2. Then call again with the real computation expression.\n\n"
            "Expression examples:\n"
            "  df.describe()\n"
            "  df.groupby('Month')['Revenue'].sum()\n"
            "  df[df['Churn Rate'] > 0.05][['Product', 'Churn Rate']]\n"
            "  df['NPS'].mean()\n"
            "  df.sort_values('Revenue', ascending=False).head(10)\n\n"
            "The expression is evaluated against a pandas DataFrame `df`. "
            "Available: pd (pandas), np (numpy), standard math builtins."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "knowledge_document_id": {
                    "type": "string",
                    "description": "The knowledge_document_id of the CSV or Excel file (from search_workspace results).",
                },
                "expression": {
                    "type": "string",
                    "description": "Pandas expression to evaluate against df. Start with df.head() to explore schema.",
                    "default": "df.head()",
                },
            },
            "required": ["knowledge_document_id"],
        },
    },
    {
        "name": "design_brief",
        "description": (
            "Gather the user's design preferences BEFORE building any UI. "
            "Call this as your FIRST action whenever the user asks for a design, "
            "mockup, website, landing page, component, or dashboard — unless they "
            "have ALREADY specified both an aesthetic direction AND a color palette "
            "in the same message, OR the request is an iteration on something you "
            "already built ('improve', 'refine', 'add a section', 'dark mode version').\n\n"
            "The frontend renders an interactive brief: aesthetic style pickers "
            "(glassmorphism, editorial, neo-tech, brutalist, organic, retro), "
            "color palette swatches, section checkboxes, and a notes field. "
            "After the user submits, their next message contains the full design "
            "spec — use it to call render_ui."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "context": {
                    "type": "string",
                    "description": "1-2 sentence summary of what the user wants to build.",
                },
                "suggested_styles": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["glassmorphism", "editorial", "neo-tech", "brutalist", "organic", "retro"],
                    },
                    "description": "1-2 styles you'd suggest given the context — pre-selected in the form.",
                },
            },
            "required": ["context"],
        },
    },
    {
        "name": "critique_design",
        "description": (
            "Have a senior-designer review-agent critique a UI you just rendered. "
            "Returns structured JSON with strengths, prioritized issues, and "
            "specific fixes (typography, color, spacing, hierarchy, polish, "
            "anti-AI-slop checks). Call this AFTER `render_ui` when the user "
            "asks for a polished result, when you suspect your first pass is "
            "generic, or when the user clicks the Refine button. Then call "
            "`render_ui` again with the improvements applied."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "html": {
                    "type": "string",
                    "description": "The HTML being reviewed (same content you passed to render_ui).",
                },
                "css": {
                    "type": "string",
                    "description": "(optional) CSS being reviewed.",
                },
                "js": {
                    "type": "string",
                    "description": "(optional) JS being reviewed.",
                },
                "framework": {
                    "type": "string",
                    "enum": ["vanilla", "tailwind"],
                    "description": "Which framework was used.",
                },
                "design_goals": {
                    "type": "string",
                    "description": "What the user originally asked for, plus any style direction (e.g. 'glassmorphic pricing card with amber accents').",
                },
            },
            "required": ["html", "design_goals"],
        },
    },
    # ── Handoff tools ──────────────────────────────────────────────────────────
    # These are intercepted by the agent loop (by name prefix) and never reach
    # the tool executor. Their args become the handoff_payload for the
    # receiving agent. No-op executors are registered below as a safety net.
    {
        "name": "handoff_to_designer",
        "description": (
            "Hand the conversation off to the Designer specialist. Use when the "
            "user wants a visual artifact (UI, mockup, website, landing page, "
            "dashboard, component) AND you've gathered the content/research "
            "needed — or there's no research to gather. Pass a structured brief "
            "so the Designer can pre-fill its design_brief form. If you have "
            "nothing to add (e.g. the user already gave the full spec), pass "
            "only `product` and `audience`."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product": {"type": "string", "description": "Product or company name."},
                "tagline": {"type": "string", "description": "Compelling one-liner."},
                "audience": {"type": "string", "description": "Who this is for."},
                "capabilities": {"type": "array", "items": {"type": "string"}, "description": "Key capabilities, 3-6 short bullets."},
                "hero_headline": {"type": "string"},
                "hero_subheadline": {"type": "string"},
                "cta_text": {"type": "string", "description": "Primary call-to-action button text."},
                "features": {"type": "array", "items": {"type": "string"}, "description": "Feature name: short description, one per line."},
                "social_proof": {"type": "string", "description": "Numbers, clients, achievements found in workspace."},
                "cta_goal": {"type": "string", "description": "What the page should get visitors to do."},
                "notes": {"type": "string", "description": "Any extra constraints (sections to include, aesthetic hints, etc.)."},
            },
            "required": ["product", "audience"],
        },
    },
    {
        "name": "handoff_to_pm",
        "description": (
            "Hand the conversation off to the PM specialist. Use when you need "
            "workspace research, document creation/editing, or content the user "
            "hasn't provided and isn't in Product Brain. Pass a focused query — "
            "the PM will search and synthesise, then either return to you with "
            "a structured brief or answer the user directly."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Specific information need or task for the PM agent."},
                "intent": {
                    "type": "string",
                    "enum": ["research", "draft_doc", "edit_doc"],
                    "description": "What kind of PM work is needed.",
                    "default": "research",
                },
                "return_to": {
                    "type": "string",
                    "enum": ["designer", "analyst", "calendar"],
                    "description": "(optional) Which agent the PM should hand back to once done. Omit if the PM should reply to the user directly.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "handoff_to_analyst",
        "description": (
            "Hand off to the data analyst specialist for CSV/Excel computation "
            "(churn, revenue, NPS, aggregations). Pass the question and any "
            "hint about which file to use."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "What numbers / analysis the user wants."},
                "file_hint": {"type": "string", "description": "Filename or topic to help locate the data file."},
            },
            "required": ["question"],
        },
    },
    {
        "name": "handoff_to_calendar",
        "description": (
            "Hand off to the calendar specialist for scheduling, conflicts, "
            "meeting prep, and time-blocking advice."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "description": "What the user wants to know about their schedule."},
                "timeframe": {"type": "string", "enum": ["today", "tomorrow"], "default": "today"},
            },
            "required": ["intent"],
        },
    },
]


# Tools whose execution requires explicit user approval.
REQUIRES_PERMISSION: set[str] = {"create_doc", "edit_doc", "create_folder"}

# Tools that halt the agent loop after running so the user can interact with a
# frontend form. The loop emits the tool_call/result and then ends; the user's
# next message resumes the conversation (no pending_decision tuple needed —
# the form submits as a new user message).
STOPS_FOR_USER_INPUT: set[str] = {"design_brief"}

# Handoff tools never reach an executor — the loop intercepts them by this
# prefix and switches to the target agent. The no-op executors registered in
# TOOL_EXECUTORS exist only as a safety net in case the intercept is skipped.
HANDOFF_TOOL_PREFIX = "handoff_to_"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _embed(query: str) -> list[float]:
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY", ""))
    res = client.models.embed_content(
        model="gemini-embedding-2",
        contents=query,
        config=genai_types.EmbedContentConfig(output_dimensionality=768),
    )
    if hasattr(res, "embeddings"):
        return res.embeddings[0].values
    return res[0].values  # legacy fallback


def _tiptap_to_text(content: Any) -> str:
    """Best-effort flatten Tiptap JSON to plain text."""
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        out = []
        if content.get("type") == "text" and "text" in content:
            out.append(content["text"])
        for child in content.get("content", []) or []:
            out.append(_tiptap_to_text(child))
        # Add line breaks between block-level nodes
        block_types = {"paragraph", "heading", "bulletList", "orderedList", "listItem"}
        if content.get("type") in block_types:
            out.append("\n")
        return "".join(out)
    if isinstance(content, list):
        return "".join(_tiptap_to_text(c) for c in content)
    return ""


# ── Tool executors ───────────────────────────────────────────────────────────

# Each executor receives `ctx` = {"user_id": str, "project_id": str | None}
# and the tool's named arguments. Returns:
#   { "summary": str, "data": ..., "sources": [{id, kind, title, snippet?}] }


async def _search_kb(ctx: dict, query: str, top_k: int = 5) -> dict:
    project_id = ctx.get("project_id")
    if not project_id:
        return {"summary": "No active project — KB search unavailable.", "sources": []}

    top_k = max(1, min(int(top_k or 5), 10))
    supabase = get_supabase()

    try:
        vector = _embed(query)
    except Exception as e:
        return {"summary": f"Embedding failed: {e}", "sources": []}

    try:
        res = supabase.rpc(
            "match_knowledge_chunks",
            {
                "query_embedding": vector,
                "match_threshold": 0.4,
                "match_count": top_k,
                "p_project_id": project_id,
            },
        ).execute()
    except Exception as e:
        return {"summary": f"KB search RPC failed: {e}", "sources": []}

    rows = res.data or []
    if not rows:
        return {"summary": "No relevant excerpts found in the knowledge base.", "sources": []}

    # Best-effort: enrich with filename if returned, else look up
    doc_ids = list({r["knowledge_document_id"] for r in rows if r.get("knowledge_document_id")})
    filenames: dict[str, str] = {}
    if doc_ids:
        try:
            docs_res = (
                supabase.table("knowledge_documents")
                .select("id, filename")
                .in_("id", doc_ids)
                .execute()
            )
            filenames = {d["id"]: d["filename"] for d in (docs_res.data or [])}
        except Exception:
            pass

    sources = []
    excerpts_text = []
    for i, r in enumerate(rows):
        doc_id = r.get("knowledge_document_id", "")
        title = filenames.get(doc_id, "Untitled file")
        snippet = (r.get("content") or "")[:240]
        sources.append({
            "id": f"kb:{doc_id}:{i}",
            "kind": "kb",
            "title": title,
            "snippet": snippet,
        })
        excerpts_text.append(f"[{i + 1}] {title} · knowledge_document_id:{doc_id}\n{r.get('content', '')}")

    return {
        "summary": f"Found {len(rows)} excerpt(s) across {len(set(filenames.values()))} file(s).",
        "data": "\n\n---\n\n".join(excerpts_text),
        "sources": sources,
    }


async def _list_docs(ctx: dict) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project.", "sources": []}

    supabase = get_supabase()
    try:
        res = (
            supabase.table("documents")
            .select("id, title, updated_at")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
    except Exception as e:
        return {"summary": f"List docs failed: {e}", "sources": []}

    rows = res.data or []
    sources = [
        {"id": f"doc:{d['id']}", "kind": "doc", "title": d["title"] or "Untitled"}
        for d in rows
    ]
    listing = "\n".join(
        f"- {d['title'] or 'Untitled'} (id: {d['id']})" for d in rows
    ) or "No documents in this project yet."
    return {
        "summary": f"{len(rows)} document(s) in this project.",
        "data": listing,
        "sources": sources,
    }


async def _read_doc(ctx: dict, doc_id: str) -> dict:
    user_id = ctx["user_id"]
    supabase = get_supabase()
    try:
        res = (
            supabase.table("documents")
            .select("id, title, content")
            .eq("id", doc_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        return {"summary": f"Doc lookup failed: {e}.", "sources": []}

    if not res.data:
        return {
            "summary": (
                f"Document '{doc_id}' not found. "
                "Use list_docs or search_workspace to find the correct UUID, "
                "or use read_kb_document if this is a knowledge base file."
            ),
            "sources": [],
        }
    doc = res.data[0]

    text = _tiptap_to_text(doc.get("content")).strip() or "(empty document)"
    return {
        "summary": f"Read '{doc['title']}' ({len(text)} chars).",
        "data": text,
        "sources": [{
            "id": f"doc:{doc['id']}",
            "kind": "doc",
            "title": doc["title"] or "Untitled",
        }],
    }


async def _search_docs(ctx: dict, query: str) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project.", "sources": []}

    supabase = get_supabase()
    try:
        res = (
            supabase.table("documents")
            .select("id, title, updated_at")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .ilike("title", f"%{query}%")
            .order("updated_at", desc=True)
            .limit(20)
            .execute()
        )
    except Exception as e:
        return {"summary": f"Search failed: {e}", "sources": []}

    rows = res.data or []
    sources = [
        {"id": f"doc:{d['id']}", "kind": "doc", "title": d["title"] or "Untitled"}
        for d in rows
    ]
    listing = "\n".join(
        f"- {d['title'] or 'Untitled'} (id: {d['id']})" for d in rows
    ) or "No documents matching that query."
    return {
        "summary": f"{len(rows)} match(es) for '{query}'.",
        "data": listing,
        "sources": sources,
    }


async def _create_doc(
    ctx: dict, title: str, content: str, folder_id: str | None = None
) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — cannot create doc.", "sources": []}

    supabase = get_supabase()
    tiptap = markdown_to_tiptap(content)
    try:
        res = (
            supabase.table("documents")
            .insert({
                "user_id": user_id,
                "project_id": project_id,
                "folder_id": folder_id,
                "title": title or "Untitled",
                "content": tiptap,
            })
            .execute()
        )
    except Exception as e:
        return {"summary": f"Create failed: {e}", "sources": []}

    if not res.data:
        return {"summary": "Create returned no row.", "sources": []}
    doc = res.data[0]
    return {
        "summary": f"Created '{doc['title']}' (id: {doc['id']}).",
        "sources": [{
            "id": f"doc:{doc['id']}",
            "kind": "doc",
            "title": doc["title"] or "Untitled",
        }],
    }


async def _edit_doc(ctx: dict, doc_id: str, new_content: str) -> dict:
    user_id = ctx["user_id"]
    supabase = get_supabase()
    tiptap = markdown_to_tiptap(new_content)
    try:
        res = (
            supabase.table("documents")
            .update({"content": tiptap})
            .eq("id", doc_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        return {"summary": f"Edit failed: {e}", "sources": []}

    if not res.data:
        return {"summary": "Edit affected no rows (doc not found?).", "sources": []}
    doc = res.data[0]
    return {
        "summary": f"Updated '{doc['title']}'.",
        "sources": [{
            "id": f"doc:{doc['id']}",
            "kind": "doc",
            "title": doc["title"] or "Untitled",
        }],
    }


CRITIC_SYSTEM_PROMPT = """You are a senior product designer reviewing a UI another designer just built. Your job: surface what's good, what's wrong, and what to fix — concretely.

You output ONLY valid JSON in EXACTLY this shape (no markdown, no prose):

{
  "verdict": "strong" | "decent" | "weak",
  "aesthetic_direction": "<one-line read of the visual direction, e.g. 'attempted glassmorphism, lands on default-Tailwind'>",
  "strengths": ["<short specific strength>", ...],
  "issues": [
    {
      "severity": "high" | "med" | "low",
      "area": "typography" | "color" | "spacing" | "hierarchy" | "polish" | "accessibility" | "ai_slop",
      "detail": "<the problem, in one sentence>",
      "fix": "<concrete fix — actionable, specific values when relevant>"
    }
  ],
  "improvement_summary": "<one paragraph: what to change to take this from current verdict to strong>"
}

Review rubric — go through these systematically:

1. AESTHETIC DIRECTION — Is there one clear vision (glassmorphism, brutalist, editorial, neo-tech, etc.) executed precisely, OR is this generic-with-hints? Most UIs fail here.

2. TYPOGRAPHY — Distinctive type choices? Or default Arial/Inter/Roboto? Is there a display + body pairing? Type scale rhythm coherent? Line-height appropriate for size?

3. COLOR — One dominant + one accent, or five faded colors? Default Tailwind blue? Purple-pink-on-white slop? Contrast sufficient?

4. SPACING & RHYTHM — Generous OR controlled-dense, not in-between? Asymmetry used? Centered-everything default? Padding/margin scale consistent?

5. HIERARCHY — Eye knows where to go first? CTA visually dominant? Headings have weight contrast?

6. POLISH DETAILS — Hover states, focus rings, custom selection, subtle animations, decorative borders, inner highlights, dividers with intent?

7. ACCESSIBILITY — Sufficient contrast (WCAG AA at minimum)? Focus states visible? Semantic HTML?

8. AI-SLOP CHECK — Does this scream "generated by AI"? Specific tells: purple gradients, evenly-spaced-three-cards, generic stock-icon CTAs, "Free / Pro / Enterprise" template, default sans-serif everywhere, lazy default shadows.

Be specific in `fix` — say "use Playfair Display 56px / 1.05 line-height for the H1 with -0.02em tracking" not "improve typography". Reference exact selectors/values when possible.

Aim for 3-6 issues. Order by severity. If the design is genuinely strong, say so — don't manufacture criticism.
"""


async def _critique_design(
    ctx: dict,
    html: str,
    design_goals: str,
    css: str | None = None,
    js: str | None = None,
    framework: str | None = None,
) -> dict:
    """Run a senior-designer critic LLM on the rendered UI. Returns structured
    JSON the frontend renders inline and the agent can use to iterate."""
    # Lazy import to avoid a circular dependency
    from llm.factory import get_llm_provider

    try:
        llm = get_llm_provider()
    except Exception as e:
        return {"summary": f"Critic LLM unavailable: {e}", "sources": []}

    user_prompt = (
        f"DESIGN GOAL: {design_goals or '(none specified)'}\n"
        f"FRAMEWORK: {framework or 'vanilla'}\n\n"
        f"HTML:\n{html[:8000]}\n\n"
    )
    if css:
        user_prompt += f"CSS:\n{css[:4000]}\n\n"
    if js:
        user_prompt += f"JS:\n{js[:4000]}\n\n"
    user_prompt += "Output the JSON critique now."

    try:
        text_parts: list[str] = []
        async for chunk in llm.complete(CRITIC_SYSTEM_PROMPT, user_prompt):
            text_parts.append(chunk)
        raw = "".join(text_parts).strip()
    except Exception as e:
        return {"summary": f"Critic call failed: {e}", "sources": []}

    # Strip code fences if the model added them
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned).strip()

    try:
        critique = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fall back to returning the raw text — the agent can still read it
        return {
            "summary": "Critic returned non-JSON output; raw text below.",
            "data": raw[:4000],
            "sources": [],
        }

    issues = critique.get("issues", []) or []
    high = sum(1 for i in issues if i.get("severity") == "high")
    verdict = critique.get("verdict", "?")
    summary = (
        f"Critique: {verdict.upper()} · "
        f"{len(issues)} issue(s){f' ({high} high)' if high else ''}. "
        f"{critique.get('improvement_summary', '')}"
    )
    return {
        "summary": summary[:600],
        # `data` is sent to the agent so it can iterate; the frontend reads
        # the full structured critique by parsing its own copy of args.
        "data": json.dumps(critique, ensure_ascii=False),
        "sources": [],
        # Surface the structured critique on the tool_result so the frontend
        # can render it without re-parsing.
        "critique": critique,
    }


async def _design_brief(
    ctx: dict,
    context: str,
    suggested_styles: list[str] | None = None,
) -> dict:
    """No-op server-side. Frontend renders the interactive design brief card."""
    return {
        "summary": (
            "Design brief form shown to user — awaiting their selections. "
            "Do NOT call render_ui now. STOP and wait. "
            "The user's next message will contain their chosen aesthetic, "
            "color palette, sections, and any extra requirements. "
            "Use that full spec to call render_ui."
        ),
        "sources": [],
    }


async def _render_ui(
    ctx: dict,
    title: str,
    html: str | None = None,
    css: str | None = None,
    js: str | None = None,
    framework: str = "vanilla",
    pages: list[dict] | None = None,
) -> dict:
    """No-op server-side. The frontend reads the args off the tool_call event
    and renders the iframe preview itself. We return a short summary for the
    agent so it knows the user saw it."""
    if pages:
        summary = f"Rendered '{title}' — {len(pages)} pages: {', '.join(p['name'] for p in pages)}. User is viewing it in the chat."
    else:
        parts = [f"html: {len(html or '')} chars"]
        if css:
            parts.append(f"css: {len(css)}")
        if js:
            parts.append(f"js: {len(js)}")
        parts.append(f"framework: {framework or 'vanilla'}")
        summary = f"Rendered '{title}' ({', '.join(parts)}). User is viewing it in the chat."
    return {"summary": summary, "sources": []}


async def _check_calendar(ctx: dict, timeframe: str = "today") -> dict:
    """Fetch the user's Google/Microsoft calendar events and highlight conflicts."""
    user_id = ctx.get("user_id")
    provider = ctx.get("calendar_provider", "google")

    from datetime import datetime, timezone, timedelta

    today = datetime.now(timezone.utc)
    target = today + timedelta(days=1) if timeframe == "tomorrow" else today

    try:
        from routers.integrations import (
            _get_clerk_oauth_token,
            _fetch_google_events, _fetch_microsoft_events, _detect_conflicts,
        )
        clerk_provider = f"oauth_{provider}"
        token = await _get_clerk_oauth_token(user_id or "", clerk_provider)

        if not token:
            return {
                "summary": (
                    "Google Calendar is not connected. "
                    "To fix this, go to your account settings and enable Google Calendar access "
                    "(calendar.readonly scope must be added to the Google social connection in Clerk Dashboard)."
                ),
                "sources": [],
            }

        if provider == "microsoft":
            events = await _fetch_microsoft_events(token, target)
        else:
            events = await _fetch_google_events(token, target)
    except Exception as e:
        return {"summary": f"Calendar fetch failed: {e}", "sources": []}

    conflicts = _detect_conflicts(events)
    clean = [{k: v for k, v in ev.items() if not k.startswith("_")} for ev in events]

    if not clean:
        day_label = "tomorrow" if timeframe == "tomorrow" else "today"
        return {
            "summary": f"No meetings scheduled {day_label}. The calendar is clear.",
            "data": f"No meetings {day_label}.",
            "sources": [],
        }

    total_min = sum(ev["duration_minutes"] for ev in clean if not ev["is_all_day"])
    lines = [f"Schedule for {timeframe} — {total_min // 60}h {total_min % 60}m total:"]
    for ev in clean:
        if ev["is_all_day"]:
            lines.append(f"  • All day — {ev['title']}")
        else:
            lines.append(f"  • {ev['start_formatted']}–{ev['end_formatted']} ({ev['duration_minutes']}min) — {ev['title']}")

    if conflicts:
        lines.append("\nScheduling issues:")
        for c in conflicts:
            lines.append(f"  ⚠ [{c['type'].upper()}] {c['message']}")

    return {
        "summary": f"{len(clean)} meeting(s) {timeframe}, {total_min // 60}h {total_min % 60}m total. {len(conflicts)} conflict(s).",
        "data": "\n".join(lines),
        "sources": [],
    }


async def _search_workspace(ctx: dict, query: str, top_k: int = 5) -> dict:
    """Unified semantic search across KB chunks AND PM document chunks."""
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — workspace search unavailable.", "sources": []}

    top_k = max(1, min(int(top_k or 5), 10))

    try:
        vector = _embed(query)
    except Exception as e:
        return {"summary": f"Embedding failed: {e}", "sources": []}

    supabase = get_supabase()
    kb_rows: list[dict] = []
    doc_rows: list[dict] = []

    # ── KB chunks ─────────────────────────────────────────────────────────────
    try:
        kb_res = supabase.rpc(
            "match_knowledge_chunks",
            {
                "query_embedding": vector,
                "match_threshold": 0.35,
                "match_count": top_k,
                "p_project_id": project_id,
            },
        ).execute()
        kb_rows = kb_res.data or []
    except Exception as e:
        logger.warning("KB chunk search failed: %s", e)

    # ── Document chunks ────────────────────────────────────────────────────────
    try:
        doc_res = supabase.rpc(
            "match_document_chunks",
            {
                "query_embedding": vector,
                "match_threshold": 0.35,
                "match_count": top_k,
                "p_project_id": project_id,
            },
        ).execute()
        doc_rows = doc_res.data or []
    except Exception as e:
        # Table may not exist yet if migration hasn't run — degrade gracefully
        logger.warning("Document chunk search unavailable (migration not run?): %s", e)

    if not kb_rows and not doc_rows:
        return {
            "summary": (
                "No relevant results found in the workspace. "
                "Try a different query, or use list_docs to browse document titles."
            ),
            "sources": [],
        }

    # ── Enrich KB rows with filenames ─────────────────────────────────────────
    kb_doc_ids = list({r["knowledge_document_id"] for r in kb_rows if r.get("knowledge_document_id")})
    kb_filenames: dict[str, str] = {}
    if kb_doc_ids:
        try:
            docs_res = (
                supabase.table("knowledge_documents")
                .select("id, filename")
                .in_("id", kb_doc_ids)
                .execute()
            )
            kb_filenames = {d["id"]: d["filename"] for d in (docs_res.data or [])}
        except Exception:
            pass

    # ── Enrich document rows with titles ─────────────────────────────────────
    pm_doc_ids = list({r["document_id"] for r in doc_rows if r.get("document_id")})
    pm_titles: dict[str, str] = {}
    if pm_doc_ids:
        try:
            titles_res = (
                supabase.table("documents")
                .select("id, title")
                .eq("user_id", user_id)
                .in_("id", pm_doc_ids)
                .execute()
            )
            pm_titles = {d["id"]: (d["title"] or "Untitled") for d in (titles_res.data or [])}
        except Exception:
            pass

    # ── Merge and rank by similarity ──────────────────────────────────────────
    merged: list[dict] = []

    for r in kb_rows:
        kb_doc_id = r.get("knowledge_document_id", "")
        merged.append({
            "_similarity": r.get("similarity", 0.0),
            "source_type": "knowledge_base",
            "knowledge_document_id": kb_doc_id,
            "doc_id": None,
            "title": kb_filenames.get(kb_doc_id, "Untitled file"),
            "content": r.get("content", ""),
            "similarity": r.get("similarity", 0.0),
        })

    for r in doc_rows:
        pm_doc_id = r.get("document_id", "")
        merged.append({
            "_similarity": r.get("similarity", 0.0),
            "source_type": "document",
            "knowledge_document_id": None,
            "doc_id": pm_doc_id,
            "title": pm_titles.get(pm_doc_id, "Untitled document"),
            "content": r.get("content", ""),
            "similarity": r.get("similarity", 0.0),
        })

    merged.sort(key=lambda x: x["_similarity"], reverse=True)
    top = merged[:top_k]

    sources = []
    excerpts = []
    for i, item in enumerate(top):
        if item["source_type"] == "knowledge_base":
            src_id = f"kb:{item['knowledge_document_id']}:{i}"
            src_kind = "kb"
        else:
            src_id = f"doc:{item['doc_id']}:{i}"
            src_kind = "doc"

        snippet = item["content"][:240]
        sources.append({
            "id": src_id,
            "kind": src_kind,
            "title": item["title"],
            "snippet": snippet,
            "doc_id": item["doc_id"],
            "knowledge_document_id": item["knowledge_document_id"],
        })
        ref = item["title"]
        tag = "(KB)" if item["source_type"] == "knowledge_base" else "(Doc)"
        if item["source_type"] == "knowledge_base":
            id_label = f" · knowledge_document_id:{item['knowledge_document_id']}"
        else:
            id_label = f" · doc_id:{item['doc_id']}"
        excerpts.append(f"[{i + 1}] {ref} {tag}{id_label}\n{item['content']}")

    total = len(kb_rows) + len(doc_rows)
    summary = (
        f"Found {total} result(s) — {len(kb_rows)} from knowledge base, "
        f"{len(doc_rows)} from PM documents."
    )
    return {
        "summary": summary,
        "data": "\n\n---\n\n".join(excerpts),
        "sources": sources,
    }


async def _read_kb_document(ctx: dict, knowledge_document_id: str) -> dict:
    """Return the full concatenated text of all chunks for a KB document."""
    user_id = ctx["user_id"]
    supabase = get_supabase()

    # Verify ownership
    try:
        doc_res = (
            supabase.table("knowledge_documents")
            .select("id, filename")
            .eq("id", knowledge_document_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        return {"summary": f"KB document lookup failed: {e}", "sources": []}

    if not doc_res.data:
        return {"summary": "KB document not found or access denied.", "sources": []}

    filename = doc_res.data[0].get("filename", "Untitled")

    # Fetch all chunks ordered by index
    try:
        chunks_res = (
            supabase.table("knowledge_chunks")
            .select("content, created_at")
            .eq("knowledge_document_id", knowledge_document_id)
            .eq("user_id", user_id)
            .order("created_at")
            .execute()
        )
    except Exception as e:
        return {"summary": f"Chunk fetch failed: {e}", "sources": []}

    rows = chunks_res.data or []
    if not rows:
        return {"summary": f"No content found for '{filename}'.", "sources": []}

    # Chunks overlap by 150–200 chars; deduplicate via simple join
    full_text = "\n".join(r["content"] for r in rows)

    return {
        "summary": f"Full text of '{filename}' ({len(full_text)} chars, {len(rows)} chunks).",
        "data": full_text,
        "sources": [{
            "id": f"kb:{knowledge_document_id}",
            "kind": "kb",
            "title": filename,
        }],
    }


async def _analyze_data(
    ctx: dict,
    knowledge_document_id: str,
    expression: str = "df.head()",
) -> dict:
    """Download a CSV/Excel KB file and evaluate a pandas expression against it."""
    import io
    import pandas as pd
    import numpy as np

    user_id = ctx["user_id"]
    supabase = get_supabase()

    # 1. Verify ownership and get storage path
    try:
        doc_res = (
            supabase.table("knowledge_documents")
            .select("filename, storage_path, file_type")
            .eq("id", knowledge_document_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        return {"summary": f"Document lookup failed: {e}", "sources": []}

    if not doc_res.data:
        return {"summary": "Data file not found or access denied.", "sources": []}

    doc = doc_res.data[0]
    filename = doc.get("filename", "file")
    storage_path = doc.get("storage_path")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        return {
            "summary": f"'{filename}' is not a CSV or Excel file. analyze_data only works on tabular data.",
            "sources": [],
        }

    if not storage_path:
        return {"summary": "Original file was not stored — cannot analyze.", "sources": []}

    # 2. Download from Supabase Storage
    try:
        file_bytes = supabase.storage.from_("knowledge-files").download(storage_path)
    except Exception as e:
        return {"summary": f"Could not download '{filename}': {e}", "sources": []}

    # 3. Load into DataFrame
    try:
        if ext == ".csv":
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as e:
        return {"summary": f"Could not parse '{filename}': {e}", "sources": []}

    # 4. Safe eval — whitelist builtins, expose pd + np + df only
    safe_globals = {
        "pd": pd,
        "np": np,
        "__builtins__": {
            k: v for k, v in vars(__builtins__ if isinstance(__builtins__, dict) else __builtins__).items()  # type: ignore[arg-type]
            if k in (
                "len", "sum", "min", "max", "round", "abs", "sorted",
                "list", "dict", "str", "int", "float", "bool", "range",
                "enumerate", "zip", "print", "repr", "isinstance", "type",
            )
        } if not isinstance(__builtins__, dict) else {
            k: __builtins__[k] for k in (  # type: ignore[index]
                "len", "sum", "min", "max", "round", "abs", "sorted",
                "list", "dict", "str", "int", "float", "bool", "range",
                "enumerate", "zip", "print", "repr",
            ) if k in __builtins__  # type: ignore[operator]
        },
    }

    schema_info = (
        f"File: {filename} | {df.shape[0]} rows × {df.shape[1]} cols\n"
        f"Columns: {list(df.columns)}\n"
        f"Dtypes:\n{df.dtypes.to_string()}"
    )

    try:
        result = eval(expression, safe_globals, {"df": df})  # noqa: S307
        if hasattr(result, "to_string"):
            result_str = result.to_string()
        elif hasattr(result, "to_markdown"):
            result_str = str(result)
        else:
            result_str = str(result)

        summary = (
            f"Ran `{expression}` on '{filename}' "
            f"({df.shape[0]} rows × {df.shape[1]} cols):\n\n{result_str[:4000]}"
        )
        return {
            "summary": summary,
            "data": result_str[:4000],
            "sources": [{"id": f"kb:{knowledge_document_id}", "kind": "kb", "title": filename}],
        }
    except Exception as e:
        return {
            "summary": (
                f"Expression error: {e}\n\n"
                f"Schema for reference:\n{schema_info}\n\n"
                f"Sample data:\n{df.head(3).to_string()}"
            ),
            "sources": [{"id": f"kb:{knowledge_document_id}", "kind": "kb", "title": filename}],
        }


async def _read(ctx: dict, source_id: str) -> dict:
    """Unified read — dispatches to _read_doc or _read_kb_document based on prefix.

    Accepts the prefixed `source_id` shape that search_workspace emits, e.g.
    `doc:abc-uuid` or `kb:xyz-uuid`. Tolerates the optional trailing `:i` index
    (e.g. `doc:abc-uuid:3`) by stripping anything after the second colon.
    """
    if not isinstance(source_id, str) or ":" not in source_id:
        return {
            "summary": (
                f"Bad source_id '{source_id}'. Use the prefixed id from "
                f"search_workspace, e.g. 'doc:<uuid>' or 'kb:<uuid>'."
            ),
            "sources": [],
        }

    prefix, _, rest = source_id.partition(":")
    raw_id = rest.split(":", 1)[0]  # tolerate trailing :<index>

    if prefix == "doc":
        return await _read_doc(ctx, doc_id=raw_id)
    if prefix == "kb":
        return await _read_kb_document(ctx, knowledge_document_id=raw_id)
    return {
        "summary": (
            f"Unknown source_id prefix '{prefix}'. Use 'doc:<uuid>' for PM "
            f"documents or 'kb:<uuid>' for knowledge base files."
        ),
        "sources": [],
    }


async def _handoff_noop(ctx: dict, **kwargs) -> dict:
    """Safety net. The agent loop intercepts handoff_to_* tools by name prefix
    and never reaches this executor — if it does, something has gone wrong."""
    return {
        "summary": "Handoff tool was not intercepted by the orchestrator (this is a bug).",
        "sources": [],
    }


async def _create_folder(
    ctx: dict, name: str, parent_folder_id: str | None = None
) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — cannot create folder.", "sources": []}

    supabase = get_supabase()
    try:
        res = (
            supabase.table("folders")
            .insert({
                "user_id": user_id,
                "project_id": project_id,
                "name": name or "New Folder",
                "parent_folder_id": parent_folder_id,
            })
            .execute()
        )
    except Exception as e:
        return {"summary": f"Folder create failed: {e}", "sources": []}

    if not res.data:
        return {"summary": "Folder create returned no row.", "sources": []}
    folder = res.data[0]
    return {
        "summary": f"Created folder '{folder['name']}'.",
        "sources": [],
    }


TOOL_EXECUTORS = {
    "design_brief": _design_brief,
    "check_calendar": _check_calendar,
    "analyze_data": _analyze_data,
    "search_workspace": _search_workspace,
    "read": _read,
    "list_docs": _list_docs,
    "create_doc": _create_doc,
    "edit_doc": _edit_doc,
    "create_folder": _create_folder,
    "render_ui": _render_ui,
    "critique_design": _critique_design,
    # Handoff executors — never actually invoked; intercepted by loop.
    "handoff_to_pm": _handoff_noop,
    "handoff_to_designer": _handoff_noop,
    "handoff_to_analyst": _handoff_noop,
    "handoff_to_calendar": _handoff_noop,
}
