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
import os
import re
from typing import Any

from google import genai
from google.genai import types as genai_types

from deps import get_supabase
from .markdown import markdown_to_tiptap


# ── Tool schemas (Anthropic format) ──────────────────────────────────────────

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "search_kb",
        "description": (
            "Semantic search over the project's knowledge base (uploaded customer "
            "interviews, research, PDFs, docs). Use this BEFORE drafting any PM "
            "artifact to ground output in real evidence. Returns relevant excerpts "
            "with source filenames."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language query, e.g. 'pain points around checkout flow'.",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of excerpts to retrieve (default 5, max 10).",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
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
        "name": "read_doc",
        "description": (
            "Read the full plain-text content of one document by id. Use after "
            "list_docs or search_docs to pull context from a specific doc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doc_id": {
                    "type": "string",
                    "description": "Document id from list_docs or search_docs.",
                },
            },
            "required": ["doc_id"],
        },
    },
    {
        "name": "search_docs",
        "description": (
            "Full-text search over the titles of documents in the current project. "
            "Faster than list_docs when you know roughly what you're looking for."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Substring to match against document titles.",
                },
            },
            "required": ["query"],
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
            "DO NOT describe the UI in prose; build it. Output renders in a "
            "sandboxed iframe with Preview/HTML/CSS/JS tabs.\n\n"
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
                    "description": "Short label shown above the preview, e.g. 'Pricing card'.",
                },
                "html": {
                    "type": "string",
                    "description": "Body HTML — what goes inside <body>. Self-contained.",
                },
                "css": {
                    "type": "string",
                    "description": "(optional) CSS rules — injected into <style>.",
                },
                "js": {
                    "type": "string",
                    "description": "(optional) JS — runs after the body in a <script> tag.",
                },
                "framework": {
                    "type": "string",
                    "enum": ["vanilla", "tailwind"],
                    "description": "'tailwind' loads the CDN. Default 'vanilla'.",
                },
            },
            "required": ["title", "html"],
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
]


# Tools whose execution requires explicit user approval.
REQUIRES_PERMISSION: set[str] = {"create_doc", "edit_doc", "create_folder"}


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
        excerpts_text.append(f"[{i + 1}] {title}\n{r.get('content', '')}")

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
            .single()
            .execute()
        )
    except Exception as e:
        return {"summary": f"Doc not found or access denied ({e}).", "sources": []}

    doc = res.data
    if not doc:
        return {"summary": "Document not found.", "sources": []}

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


async def _render_ui(
    ctx: dict,
    title: str,
    html: str,
    css: str | None = None,
    js: str | None = None,
    framework: str = "vanilla",
) -> dict:
    """No-op server-side. The frontend reads the args off the tool_call event
    and renders the iframe preview itself. We return a short summary for the
    agent so it knows the user saw it."""
    parts = [f"html: {len(html)} chars"]
    if css: parts.append(f"css: {len(css)}")
    if js: parts.append(f"js: {len(js)}")
    parts.append(f"framework: {framework or 'vanilla'}")
    return {
        "summary": f"Rendered '{title}' ({', '.join(parts)}). User is viewing it in the chat.",
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
    "search_kb": _search_kb,
    "list_docs": _list_docs,
    "read_doc": _read_doc,
    "search_docs": _search_docs,
    "create_doc": _create_doc,
    "edit_doc": _edit_doc,
    "create_folder": _create_folder,
    "render_ui": _render_ui,
    "critique_design": _critique_design,
}
