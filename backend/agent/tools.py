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
from datetime import datetime, timezone
from typing import Any

import httpx

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
        "name": "render_diagram",
        "description": (
            "Render a Mermaid diagram the user can view in the chat. Use this for: "
            "flowcharts, user flows, process maps, sequence diagrams, user journey maps, "
            "mind maps, entity-relationship diagrams, and Gantt charts. "
            "DO NOT describe the diagram in prose — build it. "
            "Always output valid Mermaid syntax in `definition`."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short label shown above the diagram, e.g. 'User Onboarding Flow'.",
                },
                "type": {
                    "type": "string",
                    "enum": ["flowchart", "sequence", "mindmap", "journey", "erDiagram", "gantt", "gitGraph"],
                    "description": "Mermaid diagram type.",
                },
                "definition": {
                    "type": "string",
                    "description": "Complete Mermaid diagram definition. Must start with the diagram keyword (e.g. 'flowchart TD', 'sequenceDiagram', 'mindmap', etc.).",
                },
            },
            "required": ["title", "type", "definition"],
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
    # ── Discovery tools (insights → themes → opportunities → features) ────────
    {
        "name": "list_discovery_themes",
        "description": (
            "List the top customer-feedback themes for the current project, "
            "ranked by how many distinct insights (customer quotes) they "
            "contain. Each theme includes: id, name, total insight_count, "
            "first_seen (when this pain first appeared), last_active (most "
            "recent new signal), this_quarter / last_quarter insight counts, "
            "and trend_pct (% change quarter-over-quarter — positive means "
            "growing, negative means fading). Use trend data to say things "
            "like: 'Onboarding friction — 23 users, up 40% this quarter, "
            "0 features shipped against it.' Call this BEFORE proposing "
            "opportunities — themes are the raw material."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max themes to return (default 20).",
                    "default": 20,
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_discovery_insights",
        "description": (
            "List customer-quote-level insights extracted from uploaded "
            "interviews / support tickets / surveys. Filter by theme_id, "
            "sentiment, or minimum severity. Use this to gather evidence "
            "before drafting a problem statement. Returns quote, paraphrase, "
            "sentiment, severity, persona, and the source filename."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "theme_id": {
                    "type": "string",
                    "description": "(optional) Restrict to insights linked to this theme.",
                },
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "neutral", "negative", "mixed"],
                    "description": "(optional) Filter by sentiment.",
                },
                "min_severity": {
                    "type": "integer",
                    "description": "Only include insights with severity >= this (1-5). Default 1.",
                    "default": 1,
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 25, hard max 100).",
                    "default": 25,
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_opportunities",
        "description": (
            "List opportunities ALREADY SAVED for this project. ALWAYS call "
            "this BEFORE proposing new opportunities — you must not duplicate "
            "what's already there. Returns title, problem, status, and "
            "rice_score for each existing row. Use the returned titles + "
            "problems to skip any new proposal that overlaps substantially."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["proposed", "shortlisted", "discarded", "committed"],
                    "description": "(optional) Filter to one status. Omit to see all.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "save_opportunity",
        "description": (
            "Persist a proposed product opportunity grounded in customer "
            "evidence. The user must approve before this is executed. "
            "Use `evidence_insight_ids` (from list_discovery_insights) to "
            "anchor the opportunity to quotes — never invent IDs. Score "
            "reach/impact/confidence/effort on 1–10 scales; the RICE score "
            "is computed automatically."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short, problem-framed title."},
                "problem": {"type": "string", "description": "Why this matters, grounded in customer evidence."},
                "proposed_solution": {"type": "string", "description": "(optional) Sketch of a solution direction."},
                "evidence_insight_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Insight UUIDs that justify this opportunity. Required for credibility.",
                },
                "theme_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "(optional) Theme UUIDs this opportunity ladders up to.",
                },
                "reach": {"type": "integer", "description": "1-10 — how many users affected."},
                "impact": {"type": "integer", "description": "1-10 — per-user pain reduction."},
                "confidence": {"type": "integer", "description": "1-10 — how sure we are."},
                "effort": {"type": "integer", "description": "1-10 — build cost (HIGHER = MORE effort)."},
                "risks": {"type": "string", "description": "(optional) Key risks / unknowns."},
            },
            "required": ["title", "problem", "evidence_insight_ids"],
        },
    },
    {
        "name": "promote_to_feature",
        "description": (
            "Promote one or more committed opportunities into a Feature — "
            "a buildable initiative that becomes a tracked bet in the decision "
            "ledger. The user must approve.\n\n"
            "BEFORE calling this, ask the PM for:\n"
            "  1. rationale — WHY this, WHY now (the reasoning, not just RICE rank)\n"
            "  2. predicted_metric — which north-star metric do they expect to move?\n"
            "  3. predicted_delta — by how much? (e.g. '+15% 30-day activation')\n"
            "  4. revisit_at — what date should we come back and check? (YYYY-MM-DD)\n\n"
            "If the PM doesn't know the metric or delta, use your best estimate "
            "and flag it as a guess. Always capture revisit_at — suggest 90 days "
            "post-expected ship date if PM doesn't specify.\n\n"
            "Promotion auto-marks linked opportunities as 'committed'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Feature name."},
                "summary": {"type": "string", "description": "1-2 sentence summary of what we're building and why."},
                "opportunity_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Opportunity UUIDs this feature addresses.",
                },
                "rationale": {
                    "type": "string",
                    "description": "Why this feature, why now — the PM's reasoning beyond the RICE score.",
                },
                "predicted_metric": {
                    "type": "string",
                    "description": "The north-star or outcome metric this feature is expected to move (e.g. '30-day activation rate', 'support ticket volume').",
                },
                "predicted_delta": {
                    "type": "string",
                    "description": "The expected change in that metric (e.g. '+15%', '-30 tickets/week', '2x completion rate').",
                },
                "revisit_at": {
                    "type": "string",
                    "description": "Date (YYYY-MM-DD) to revisit and compare prediction to actual outcome. Suggest ~90 days post ship.",
                },
                "prd_document_id": {
                    "type": "string",
                    "description": "(optional) doc_id of the PRD document for this feature.",
                },
            },
            "required": ["name", "opportunity_ids"],
        },
    },
    # ── Outcome capture tools (Tier 3) ────────────────────────────────────────
    {
        "name": "get_features_due_for_revisit",
        "description": (
            "Return features whose revisit_at date has passed and whose outcome "
            "has not yet been recorded. Call this at the start of any session "
            "that might include a check-in, retrospective, or 'how did that "
            "feature do?' conversation. If any are overdue, surface them to the "
            "PM and ask for the actual outcome before continuing. Each row "
            "includes feature name, predicted_metric, predicted_delta, "
            "revisit_at, and days_overdue."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "record_outcome",
        "description": (
            "Record the actual outcome of a shipped feature against its "
            "predicted bet. The user must approve.\n\n"
            "Call this after the PM tells you what actually happened. "
            "Capture:\n"
            "  actual_delta — what actually changed (e.g. '+12%, short of the "
            "+15% target' or 'no measurable change in 90 days')\n"
            "  current_value — the numeric metric value if available "
            "(e.g. 0.42 for 42% activation rate)\n"
            "  notes — PM's reflection: what worked, what didn't, what to do "
            "differently next time\n\n"
            "After recording, tell the PM whether the bet was right, "
            "directionally right, or missed — and what that implies."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "feature_id": {
                    "type": "string",
                    "description": "The feature UUID from get_features_due_for_revisit.",
                },
                "actual_delta": {
                    "type": "string",
                    "description": "Free-text description of what actually happened (e.g. '+12%, short of +15% target').",
                },
                "current_value": {
                    "type": "number",
                    "description": "(optional) Numeric metric value post-ship (e.g. 0.42 for 42%).",
                },
                "notes": {
                    "type": "string",
                    "description": "(optional) PM's reflection on why the outcome differed from prediction.",
                },
            },
            "required": ["feature_id", "actual_delta"],
        },
    },
    # ── Jira sprint tools ─────────────────────────────────────────────────────
    {
        "name": "list_jira_boards",
        "description": (
            "List the user's Jira Scrum boards and whether each has an active sprint. "
            "Call this FIRST whenever the user asks about their sprint, standup, weekly "
            "update, blockers, velocity, or release notes. Use the result to decide "
            "which board to fetch — if there's only one active sprint, proceed directly; "
            "if multiple, ask the user which project (one question only)."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "fetch_jira_sprint",
        "description": (
            "Fetch issues in a Jira sprint grouped into done / in_progress / blocked / todo. "
            "Returns sprint name, dates, goal, completion stats, and per-issue details "
            "(key, title, assignee, story points, blocker reason). Use this to write "
            "sprint updates, standup notes, release notes, or surface risks. "
            "Always call list_jira_boards first to get the board_id."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "board_id": {
                    "type": "integer",
                    "description": "Board ID from list_jira_boards.",
                },
                "state": {
                    "type": "string",
                    "enum": ["active", "next", "closed"],
                    "description": (
                        "'active' (default) for the current sprint; "
                        "'next' for upcoming sprint planning; "
                        "'closed' for the last completed sprint (release notes)."
                    ),
                    "default": "active",
                },
            },
            "required": ["board_id"],
        },
    },
    {
        "name": "search_jira",
        "description": (
            "Search Jira issues using JQL (Jira Query Language). Use this to answer "
            "ANY question about Jira content — all issues in a project, what's assigned "
            "to the user, recently updated tickets, issues by status or priority, etc. "
            "This is more powerful than fetch_jira_sprint — use it whenever the user wants "
            "to browse, list, or find issues beyond just the current board view.\n\n"
            "JQL examples:\n"
            "  project = PT                              → all issues in project PT\n"
            "  project = PT AND status != Done           → all open issues\n"
            "  assignee = currentUser()                  → my issues\n"
            "  project = PT AND status = 'In Progress'   → in-progress only\n"
            "  project = PT ORDER BY priority DESC       → by priority\n"
            "  updated >= -7d                            → changed this week\n"
            "  project = PT AND issuetype = Epic         → only epics\n"
            "  project = PT AND labels = blocked         → blocked issues\n\n"
            "Always construct JQL from what the user is asking — don't ask them to write it."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "jql": {
                    "type": "string",
                    "description": "Valid JQL query string.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max issues to return (default 50, max 100).",
                    "default": 50,
                },
            },
            "required": ["jql"],
        },
    },
    {
        "name": "create_jira_issue",
        "description": (
            "Create a single Jira issue (Story, Epic, Bug, Task, Feature) in a project. "
            "Use this when the user asks to 'write tickets', 'create issues', 'add to Jira', "
            "or wants to push opportunities/PRD items to Jira. "
            "Call this once per issue — call it multiple times to create multiple tickets. "
            "For epics with stories: create the Epic first, then create Stories with parent_key set to the Epic's key."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "project_key": {
                    "type": "string",
                    "description": "Jira project key, e.g. 'PT' or 'KAN'.",
                },
                "title": {
                    "type": "string",
                    "description": "Issue title / summary.",
                },
                "description": {
                    "type": "string",
                    "description": "(optional) Full description — plain text, will be converted to Jira format.",
                },
                "issue_type": {
                    "type": "string",
                    "description": "Issue type. Common values: 'Story', 'Epic', 'Bug', 'Task', 'Feature'. Default: 'Story'.",
                    "default": "Story",
                },
                "parent_key": {
                    "type": "string",
                    "description": "(optional) Parent issue key, e.g. 'PT-6'. Use to nest Stories under an Epic.",
                },
                "priority": {
                    "type": "string",
                    "description": "(optional) Priority: 'Highest', 'High', 'Medium', 'Low', 'Lowest'.",
                },
            },
            "required": ["project_key", "title"],
        },
    },
    {
        "name": "create_jira_sprint",
        "description": (
            "Create a new sprint on a Jira Scrum board. "
            "Only works on Scrum boards — Kanban boards don't support sprints. "
            "Use list_jira_boards first to get the board_id and confirm board type is 'scrum'. "
            "If the user doesn't specify dates, create the sprint without them (Jira allows it)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "board_id": {
                    "type": "integer",
                    "description": "Scrum board ID from list_jira_boards.",
                },
                "name": {
                    "type": "string",
                    "description": "Sprint name, e.g. 'Sprint 1' or 'May Sprint'.",
                },
                "start_date": {
                    "type": "string",
                    "description": "(optional) Start date in YYYY-MM-DD format.",
                },
                "end_date": {
                    "type": "string",
                    "description": "(optional) End date in YYYY-MM-DD format.",
                },
                "goal": {
                    "type": "string",
                    "description": "(optional) Sprint goal — one sentence.",
                },
            },
            "required": ["board_id", "name"],
        },
    },
    {
        "name": "get_jira_issue",
        "description": (
            "Fetch full details of a single Jira issue by its key (e.g. PT-4, KAN-12). "
            "Returns title, status, assignee, priority, description, last 5 comments, "
            "and subtasks. Use this when the user mentions a specific ticket key, "
            "or when you need the full description/comments of an issue found via search_jira."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "issue_key": {
                    "type": "string",
                    "description": "Jira issue key, e.g. 'PT-4' or 'KAN-12'.",
                },
            },
            "required": ["issue_key"],
        },
    },
    # ── Handoff tools ──────────────────────────────────────────────────────────
    # These are intercepted by the agent loop (by name prefix) and never reach
    # the tool executor. Their args become the handoff_payload for the
    # receiving agent. No-op executors are registered below as a safety net.
    {
        "name": "handoff_to_opportunity",
        "description": (
            "Hand the conversation off to the Opportunity specialist. Use "
            "when the user asks 'what should we build next?', wants to "
            "review/score opportunities, or wants to mine themes for "
            "feature ideas. The specialist will pull insights/themes from "
            "the project and propose ranked opportunities with citations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": ["discover", "score", "promote"],
                    "description": "discover=propose new opportunities from themes; score=re-evaluate existing ones; promote=turn opportunity into feature.",
                    "default": "discover",
                },
                "focus": {
                    "type": "string",
                    "description": "(optional) Specific theme/area to focus on, e.g. 'checkout friction'.",
                },
                "top_k": {
                    "type": "integer",
                    "description": "(optional) How many opportunities to surface. Default 3.",
                    "default": 3,
                },
            },
            "required": [],
        },
    },
    {
        "name": "handoff_to_designer",
        "description": (
            "Hand the conversation off to the Designer specialist. Use when the "
            "user wants a visual artifact (UI, mockup, website, landing page, "
            "dashboard, component) AND you've gathered the content/research "
            "needed — or there's no research to gather. Pass a structured brief "
            "so the Designer can pre-fill its design_brief form. If you have "
            "nothing to add (e.g. the user already gave the full spec), pass "
            "only `product` and `audience`. Set `return_to='pm'` when the user's "
            "actual request is a multi-part synthesis (e.g. 'design + write the "
            "launch copy') and you need the Designer's output back for stitching."
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
                "return_to": {
                    "type": "string",
                    "enum": ["pm"],
                    "description": "(optional) Set to 'pm' if the Designer should hand its render summary back to PM for synthesis instead of replying to the user directly.",
                },
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
            "a structured brief or answer the user directly. When called as a "
            "synthesis-back handoff (the upstream PM passed you `return_to='pm'`), "
            "set `intent='synthesize'` and put your findings in `findings` so the "
            "PM can weave them into a final cross-domain answer."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Specific information need or task for the PM agent. For synthesis-back, restate the original user question."},
                "intent": {
                    "type": "string",
                    "enum": ["research", "draft_doc", "edit_doc", "synthesize"],
                    "description": "What kind of PM work is needed. Use 'synthesize' when handing findings back to PM after the PM originally delegated this work.",
                    "default": "research",
                },
                "return_to": {
                    "type": "string",
                    "enum": ["designer", "analyst", "calendar"],
                    "description": "(optional) Which agent the PM should hand back to once done. Omit if the PM should reply to the user directly.",
                },
                "findings": {
                    "type": "string",
                    "description": "(optional) When intent='synthesize', the specialist's findings to hand back — numbers, design summary, schedule details. PM uses these to ground its final answer.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "handoff_to_analyst",
        "description": (
            "Hand off to the data analyst specialist for any CSV/Excel file analysis — "
            "both numeric (churn, revenue, NPS, aggregations) AND text-heavy files "
            "(reading feedback columns, categorising responses, finding themes, "
            "counting values, summarising what's in a spreadsheet). Pass the question "
            "and any hint about which file to use. Set `return_to='pm'` when the user's "
            "real request is multi-domain and you need the Analyst's findings back so YOU "
            "can synthesise the final answer — otherwise the Analyst will reply directly."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "What numbers / analysis the user wants."},
                "file_hint": {"type": "string", "description": "Filename or topic to help locate the data file."},
                "return_to": {
                    "type": "string",
                    "enum": ["pm"],
                    "description": "(optional) Set to 'pm' if the Analyst should hand its findings back to PM for cross-domain synthesis instead of replying to the user directly.",
                },
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
    {
        "name": "handoff_to_whiteboard",
        "description": (
            "Hand off to the Whiteboard specialist for diagrams, flow maps, "
            "brainstorming, and mind maps. Use when the user asks for: flowcharts, "
            "user flows, sequence diagrams, process maps, mind maps, journey maps, "
            "brainstorming sessions, SWOT analysis, HMW exercises, or any visual "
            "thinking artifact."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "description": "What the user wants to create or explore.",
                },
                "topic": {
                    "type": "string",
                    "description": "The subject matter — e.g. 'user onboarding flow', 'Q3 strategy brainstorm'.",
                },
                "context": {
                    "type": "string",
                    "description": "(optional) Relevant context from workspace research to ground the diagram/brainstorm.",
                },
                "return_to": {
                    "type": "string",
                    "enum": ["pm"],
                    "description": "(optional) Set to 'pm' if Whiteboard should hand findings back to PM for synthesis.",
                },
            },
            "required": ["intent", "topic"],
        },
    },
]


# Tools whose execution requires explicit user approval.
REQUIRES_PERMISSION: set[str] = {
    "create_doc", "edit_doc", "create_folder",
    "save_opportunity", "promote_to_feature",
    "create_jira_issue", "create_jira_sprint",
    "record_outcome",
}

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
    """Best-effort flatten Tiptap JSON to plain text.

    Handles three content shapes:
    1. Standard Tiptap doc JSON  (type: "doc", content: [...])
    2. Rendered UI artifact      ({"html": "...", "css": "...", "js": "..."})
    3. Plain string
    """
    if not content:
        return ""

    if isinstance(content, str):
        # Could be a JSON string — try to parse it
        stripped = content.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                return _tiptap_to_text(json.loads(stripped))
            except Exception:
                pass
        return content

    if isinstance(content, dict):
        # ── Rendered UI artifact ────────────────────────────────────────────
        # Produced by the designer agent: {"html": "...", "css": "...", "js": "..."}
        if "html" in content and "type" not in content:
            html = content.get("html", "")
            # Strip tags to get readable text
            text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
            text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            parts = [f"[Rendered UI — visible text content]\n{text}"]
            if content.get("css"):
                parts.append(f"\n[CSS: {len(content['css'])} chars]")
            if content.get("js"):
                parts.append(f"\n[JS: {len(content['js'])} chars]")
            if content.get("pages"):
                page_names = [p.get("name", "") for p in content["pages"]]
                parts.append(f"\n[Multi-page: {', '.join(page_names)}]")
            return "".join(parts)

        # ── Standard Tiptap node ────────────────────────────────────────────
        out = []
        if content.get("type") == "text" and "text" in content:
            out.append(content["text"])
        for child in content.get("content", []) or []:
            out.append(_tiptap_to_text(child))
        block_types = {"paragraph", "heading", "bulletList", "orderedList",
                       "listItem", "tableRow", "blockquote", "codeBlock"}
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
    doc     = res.data[0]
    raw     = doc.get("content") or {}
    title   = doc.get("title") or "Untitled"

    # Rendered UI artifact — return the actual HTML/CSS/JS so the agent can
    # pass it to handoff_to_designer for improvements.
    if isinstance(raw, dict) and "html" in raw and "type" not in raw:
        html = raw.get("html", "")
        css  = raw.get("css",  "")
        js   = raw.get("js",   "")
        data = (
            f"[RENDERED_UI: \"{title}\"]\n"
            f"Pass these to handoff_to_designer notes field as:\n"
            f"  EXISTING_HTML:<html below>\n  EXISTING_CSS:<css below>\n  IMPROVEMENTS:\\n- ...\n\n"
            f"--- HTML ---\n{html}\n"
            + (f"\n--- CSS ---\n{css}\n" if css else "")
            + (f"\n--- JS ---\n{js}\n"   if js  else "")
        )
        return {
            "summary": f"Read rendered UI '{title}' (HTML: {len(html)}ch, CSS: {len(css)}ch, JS: {len(js)}ch).",
            "data": data,
            "sources": [{"id": f"doc:{doc['id']}", "kind": "doc", "title": title}],
        }

    text = _tiptap_to_text(raw).strip() or "(empty document)"
    return {
        "summary": f"Read '{title}' ({len(text)} chars).",
        "data": text,
        "sources": [{"id": f"doc:{doc['id']}", "kind": "doc", "title": title}],
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

    # Deduplicate title — append _1, _2, … if name already exists
    base = (title or "Untitled").strip()
    existing_titles = set()
    try:
        ex = (supabase.table("documents").select("title")
              .eq("project_id", project_id).eq("user_id", user_id).execute())
        existing_titles = {r["title"] for r in (ex.data or [])}
    except Exception:
        pass
    if base in existing_titles:
        i = 1
        while f"{base}_{i}" in existing_titles:
            i += 1
        base = f"{base}_{i}"

    tiptap = markdown_to_tiptap(content)
    try:
        res = (
            supabase.table("documents")
            .insert({
                "user_id": user_id,
                "project_id": project_id,
                "folder_id": folder_id,
                "title": base,
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


async def _render_diagram(
    ctx: dict,
    title: str,
    type: str,
    definition: str,
) -> dict:
    """No-op server-side. The frontend reads the args off the tool_call event
    and renders the Mermaid diagram itself."""
    return {
        "summary": f"Rendered '{title}' ({type} diagram). User is viewing it in the chat.",
        "sources": [],
    }


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


async def _list_discovery_themes(ctx: dict, limit: int = 20) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — themes unavailable.", "sources": []}

    supabase = get_supabase()
    try:
        res = (
            supabase.table("themes")
            .select("id, name, description, insight_count, summary, created_at, updated_at")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .order("insight_count", desc=True)
            .limit(max(1, min(int(limit or 20), 100)))
            .execute()
        )
    except Exception as e:
        return {"summary": f"Theme lookup failed: {e}", "sources": []}

    rows = res.data or []
    if not rows:
        return {
            "summary": (
                "No themes yet. Upload customer interviews / support tickets / "
                "surveys to the knowledge base — insights and themes are "
                "extracted automatically after upload."
            ),
            "sources": [],
        }

    # Compute current and previous quarter labels (YYYY-Q1 format).
    now = datetime.now(timezone.utc)
    cur_q = (now.month - 1) // 3 + 1
    cur_period = f"{now.year}-Q{cur_q}"
    prev_year, prev_q = (now.year - 1, 4) if cur_q == 1 else (now.year, cur_q - 1)
    prev_period = f"{prev_year}-Q{prev_q}"

    # Fetch per-theme, per-period insight counts in one query.
    theme_ids = [r["id"] for r in rows]
    period_counts: dict[str, dict[str, int]] = {tid: {} for tid in theme_ids}
    try:
        period_res = (
            supabase.table("insights")
            .select("theme_id, period")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .in_("theme_id", theme_ids)
            .in_("period", [cur_period, prev_period])
            .execute()
        )
        for row in period_res.data or []:
            tid = row.get("theme_id")
            p = row.get("period")
            if tid and p:
                period_counts.setdefault(tid, {})
                period_counts[tid][p] = period_counts[tid].get(p, 0) + 1
    except Exception as e:
        logger.warning("Period count query failed (trend data unavailable): %s", e)

    lines = []
    for r in rows:
        tid = r["id"]
        this_q = period_counts.get(tid, {}).get(cur_period, 0)
        last_q = period_counts.get(tid, {}).get(prev_period, 0)

        if last_q > 0:
            trend_pct = round((this_q - last_q) / last_q * 100)
            trend_str = f"+{trend_pct}% vs last quarter" if trend_pct >= 0 else f"{trend_pct}% vs last quarter"
        elif this_q > 0:
            trend_str = "new this quarter"
        else:
            trend_str = "no signal this quarter"

        first_seen = (r.get("created_at") or "")[:10]
        last_active = (r.get("updated_at") or "")[:10]

        line = (
            f"- {r['name']} (id: {r['id']}) · {r['insight_count']} total insight(s)"
            f" · first seen: {first_seen} · last active: {last_active}"
            f" · {cur_period}: {this_q} insight(s), {prev_period}: {last_q} ({trend_str})"
        )
        if r.get("summary"):
            line += f"\n  Summary: {r['summary']}"
        lines.append(line)

    return {
        "summary": f"Found {len(rows)} theme(s). Current quarter: {cur_period}.",
        "data": "\n".join(lines),
        "sources": [],
    }


async def _list_discovery_insights(
    ctx: dict,
    theme_id: str | None = None,
    sentiment: str | None = None,
    min_severity: int = 1,
    limit: int = 25,
) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — insights unavailable.", "sources": []}

    supabase = get_supabase()
    try:
        q = (
            supabase.table("insights")
            .select("id, quote, paraphrase, sentiment, severity, persona, themes, knowledge_document_id")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .gte("severity", max(1, min(int(min_severity or 1), 5)))
            .order("severity", desc=True)
            .limit(max(1, min(int(limit or 25), 100)))
        )
        if theme_id:
            q = q.eq("theme_id", theme_id)
        if sentiment:
            q = q.eq("sentiment", sentiment)
        res = q.execute()
    except Exception as e:
        return {"summary": f"Insight lookup failed: {e}", "sources": []}

    rows = res.data or []
    if not rows:
        return {
            "summary": "No insights match those filters.",
            "sources": [],
        }

    # Enrich with filenames
    kb_ids = list({r["knowledge_document_id"] for r in rows if r.get("knowledge_document_id")})
    fnames: dict[str, str] = {}
    if kb_ids:
        try:
            d = (
                supabase.table("knowledge_documents")
                .select("id, filename")
                .in_("id", kb_ids)
                .execute()
            )
            fnames = {x["id"]: x["filename"] for x in (d.data or [])}
        except Exception:
            pass

    lines = []
    sources = []
    for i, r in enumerate(rows):
        src = fnames.get(r.get("knowledge_document_id") or "", "Unknown source")
        persona = f" [{r['persona']}]" if r.get("persona") else ""
        themes_str = f" themes={r['themes']}" if r.get("themes") else ""
        lines.append(
            f"[{i + 1}] (id: {r['id']}) sev={r['severity']} {r['sentiment']}{persona}"
            f"{themes_str} — \"{r['quote']}\" (source: {src})"
        )
        sources.append({
            "id": f"insight:{r['id']}",
            "kind": "insight",
            "title": src,
            "snippet": r["quote"][:200],
        })

    return {
        "summary": f"Found {len(rows)} insight(s).",
        "data": "\n".join(lines),
        "sources": sources,
    }


async def _list_opportunities(ctx: dict, status: str | None = None) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — opportunities unavailable.", "sources": []}

    supabase = get_supabase()
    try:
        q = (
            supabase.table("opportunities")
            .select("id, title, problem, status, rice_score, created_at")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )
        if status:
            q = q.eq("status", status)
        res = q.execute()
    except Exception as e:
        return {"summary": f"Opportunity lookup failed: {e}", "sources": []}

    rows = res.data or []
    if not rows:
        return {
            "summary": "No existing opportunities saved for this project yet.",
            "data": "",
            "sources": [],
        }

    lines = [
        f"- [{r['status']}] {r['title']} (id: {r['id']})"
        + (f" · RICE {r['rice_score']}" if r.get("rice_score") else "")
        + f"\n  Problem: {(r.get('problem') or '')[:200]}"
        for r in rows
    ]
    return {
        "summary": f"Found {len(rows)} existing opportunity(ies).",
        "data": "\n".join(lines),
        "sources": [
            {"id": f"opportunity:{r['id']}", "kind": "opportunity", "title": r["title"]}
            for r in rows
        ],
    }


async def _save_opportunity(
    ctx: dict,
    title: str,
    problem: str,
    evidence_insight_ids: list[str],
    proposed_solution: str | None = None,
    theme_ids: list[str] | None = None,
    reach: int | None = None,
    impact: int | None = None,
    confidence: int | None = None,
    effort: int | None = None,
    risks: str | None = None,
) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — cannot save opportunity.", "sources": []}

    if not evidence_insight_ids:
        return {
            "summary": (
                "Refusing to save opportunity without evidence. Pass at "
                "least one insight id in evidence_insight_ids."
            ),
            "sources": [],
        }

    # Dedupe — the agent occasionally passes the same insight id twice.
    # Preserve order so the strongest quote (first) stays first.
    seen: set[str] = set()
    evidence_insight_ids = [
        x for x in evidence_insight_ids if not (x in seen or seen.add(x))
    ]

    supabase = get_supabase()

    # Defensive dedup — if a non-discarded opportunity with the same title
    # already exists for this project, return it without re-inserting.
    try:
        existing = (
            supabase.table("opportunities")
            .select("id, title, status")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .ilike("title", title.strip())
            .neq("status", "discarded")
            .limit(1)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            return {
                "summary": (
                    f"Opportunity '{row['title']}' already exists (status: "
                    f"{row['status']}). Skipped duplicate save."
                ),
                "sources": [{
                    "id": f"opportunity:{row['id']}",
                    "kind": "opportunity",
                    "title": row["title"],
                }],
            }
    except Exception as e:
        logger.warning("Dedup check failed (continuing with insert): %s", e)

    payload = {
        "project_id": project_id,
        "user_id": user_id,
        "title": title,
        "problem": problem,
        "proposed_solution": proposed_solution,
        "evidence_insight_ids": evidence_insight_ids,
        "theme_ids": theme_ids or [],
        "reach": reach,
        "impact": impact,
        "confidence": confidence,
        "effort": effort,
        "risks": risks,
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    try:
        res = supabase.table("opportunities").insert(payload).execute()
    except Exception as e:
        return {"summary": f"Opportunity insert failed: {e}", "sources": []}

    if not res.data:
        return {"summary": "Insert returned no row.", "sources": []}
    row = res.data[0]
    rice = row.get("rice_score")
    return {
        "summary": (
            f"Saved opportunity '{title}' (id: {row['id']})"
            f"{f' · RICE={rice}' if rice else ''}."
        ),
        "sources": [{
            "id": f"opportunity:{row['id']}",
            "kind": "opportunity",
            "title": title,
        }],
    }


async def _promote_to_feature(
    ctx: dict,
    name: str,
    opportunity_ids: list[str],
    summary: str | None = None,
    rationale: str | None = None,
    predicted_metric: str | None = None,
    predicted_delta: str | None = None,
    revisit_at: str | None = None,
    prd_document_id: str | None = None,
) -> dict:
    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — cannot create feature.", "sources": []}
    if not opportunity_ids:
        return {"summary": "Need at least one opportunity_id to promote.", "sources": []}

    supabase = get_supabase()
    payload = {
        "project_id": project_id,
        "user_id": user_id,
        "name": name,
        "summary": summary,
        "opportunity_ids": opportunity_ids,
        "rationale": rationale,
        "predicted_metric": predicted_metric,
        "predicted_delta": predicted_delta,
        "revisit_at": revisit_at,
        "prd_document_id": prd_document_id,
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    try:
        res = supabase.table("features").insert(payload).execute()
    except Exception as e:
        return {"summary": f"Feature insert failed: {e}", "sources": []}
    if not res.data:
        return {"summary": "Feature insert returned no row.", "sources": []}
    feature = res.data[0]

    # Mark linked opportunities as committed
    try:
        (
            supabase.table("opportunities")
            .update({"status": "committed"})
            .in_("id", opportunity_ids)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        logger.warning("Could not bump opportunity status on promotion: %s", e)

    # Auto-create a metrics row so Tier 3 (outcome capture) has a target to
    # update on revisit_at. Only created when the PM provided a predicted_metric.
    if predicted_metric:
        try:
            supabase.table("metrics").insert({
                "feature_id": feature["id"],
                "user_id": user_id,
                "name": predicted_metric,
                "predicted_delta": predicted_delta,
            }).execute()
        except Exception as e:
            logger.warning("Could not auto-create metrics row for feature %s: %s", feature["id"], e)

    ledger_parts = []
    if rationale:
        ledger_parts.append("Rationale captured.")
    if predicted_metric and predicted_delta:
        ledger_parts.append(f"Bet: {predicted_delta} on {predicted_metric}.")
    if revisit_at:
        ledger_parts.append(f"Revisit: {revisit_at}.")

    summary_str = (
        f"Created feature '{name}' (id: {feature['id']}) from "
        f"{len(opportunity_ids)} opportunity(ies)."
        + (f" {' '.join(ledger_parts)}" if ledger_parts else "")
    )
    return {
        "summary": summary_str,
        "sources": [{
            "id": f"feature:{feature['id']}",
            "kind": "feature",
            "title": name,
        }],
    }


async def _list_jira_boards(ctx: dict) -> dict:
    user_id = ctx["user_id"]
    supabase = get_supabase()

    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return {
            "summary": "Jira is not connected. Go to Project Settings → Integrations to connect.",
            "sources": [],
        }

    config = result.data[0]["config"]

    try:
        from routers.integrations import _fetch_jira_boards
        boards = await _fetch_jira_boards(config)
    except Exception as e:
        return {"summary": f"Failed to fetch Jira boards: {e}", "sources": []}

    if not boards:
        return {
            "summary": "No boards found in your Jira workspace.",
            "sources": [],
        }

    scrum_boards  = [b for b in boards if b["board_type"] == "scrum"]
    kanban_boards = [b for b in boards if b["board_type"] != "scrum"]
    active        = [b for b in boards if b["has_active_sprint"]]

    lines = []
    for b in boards:
        btype = b["board_type"].upper()
        if b["has_active_sprint"]:
            status = f"active sprint: {b['active_sprint_name']} (sprint_id: {b['active_sprint_id']})"
        elif b["board_type"] == "scrum":
            status = "Scrum board — no active sprint (use search_jira to list issues)"
        else:
            status = "Kanban — no sprints, use search_jira or fetch_jira_sprint to list issues"
        lines.append(
            f"- [{btype}] {b['project_name'] or b['board_name']} "
            f"(board_id: {b['board_id']}, project_key: {b['project_key']}) — {status}"
        )

    # Build a clear instruction for the agent
    if active:
        instruction = f"{len(active)} active sprint(s) found — call fetch_jira_sprint with the board_id."
    elif kanban_boards:
        keys = ", ".join(b["project_key"] for b in kanban_boards if b["project_key"])
        instruction = (
            f"All boards are Kanban (no sprints). "
            f"Use search_jira with JQL like 'project IN ({keys})' to list their issues. "
            f"Do NOT say 'no sprint found' — just search the issues directly."
        )
    else:
        keys = ", ".join(b["project_key"] for b in scrum_boards if b["project_key"])
        instruction = (
            f"Scrum boards found but no active sprint. "
            f"Use search_jira with JQL like 'project IN ({keys})' to list issues, "
            f"or ask the user if they want to create a sprint."
        )

    return {
        "summary": f"Found {len(boards)} board(s): {len(scrum_boards)} Scrum, {len(kanban_boards)} Kanban. {instruction}",
        "data": "\n".join(lines),
        "sources": [],
    }


async def _fetch_jira_sprint(ctx: dict, board_id: int, state: str = "active") -> dict:
    user_id = ctx["user_id"]
    supabase = get_supabase()

    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return {
            "summary": "Jira is not connected. Go to Project Settings → Integrations to connect.",
            "sources": [],
        }

    config = result.data[0]["config"]

    try:
        from routers.integrations import _fetch_board_issues
        data = await _fetch_board_issues(config, board_id, state)
    except Exception as e:
        return {"summary": f"Failed to fetch board issues: {e}", "sources": []}

    sprint = data.get("sprint")  # None for Kanban
    stats  = data["stats"]
    board_type = data.get("board_type", "kanban")

    # Build a readable summary for the LLM
    if sprint:
        lines = [
            f"Sprint: {sprint['name']}",
            f"Goal: {sprint['goal']}" if sprint.get("goal") else "",
            f"Dates: {sprint['start_date']} → {sprint['end_date']}",
        ]
    else:
        lines = [f"Board type: Kanban (no sprints — showing all active issues)"]

    lines += [
        f"Progress: {stats['done']}/{stats['total']} done ({stats['completion_pct']}%)"
        f" | {stats['in_progress']} in progress"
        f" | {stats['blocked']} blocked"
        f" | {stats['todo']} todo",
        "",
    ]

    def _fmt_bucket(label: str, items: list) -> list[str]:
        if not items:
            return []
        out = [f"{label}:"]
        for it in items:
            line = f"  [{it['key']}] {it['title']} — {it['assignee']}"
            if it.get("points"):
                line += f" ({it['points']}pts)"
            if it.get("reason"):
                line += f" | blocked: {it['reason']}"
            out.append(line)
        return out

    lines += _fmt_bucket("Done", data["done"])
    lines += _fmt_bucket("In Progress", data["in_progress"])
    lines += _fmt_bucket("Blocked", data["blocked"])
    lines += _fmt_bucket("To Do", data["todo"])

    domain = config.get("domain", "")
    sources = [
        {
            "id": f"jira:{it['key']}",
            "kind": "jira",
            "title": f"{it['key']}: {it['title'][:60]}",
            "snippet": it.get("reason", ""),
        }
        for it in data.get("blocked", [])
    ]

    label = sprint["name"] if sprint else f"Kanban board"
    return {
        "summary": (
            f"{label} — {stats['completion_pct']}% complete, "
            f"{stats['blocked']} blocked."
        ),
        "data": "\n".join(l for l in lines if l is not None),
        "sources": sources,
    }


async def _create_jira_issue(
    ctx: dict,
    project_key: str,
    title: str,
    description: str = "",
    issue_type: str = "Story",
    parent_key: str | None = None,
    priority: str | None = None,
) -> dict:
    user_id  = ctx["user_id"]
    supabase = get_supabase()

    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return {"summary": "Jira is not connected.", "sources": []}

    config = result.data[0]["config"]
    try:
        from routers.integrations import _create_jira_issue as _jira_create
        data = await _jira_create(config, project_key, title, description, issue_type, parent_key, priority)
    except Exception as e:
        return {"summary": f"Could not create issue: {e}", "sources": []}

    return {
        "summary": f"Created {data['type']} [{data['key']}]: {data['title']} — {data['url']}",
        "data": f"Key: {data['key']}\nURL: {data['url']}",
        "sources": [{"id": f"jira:{data['key']}", "kind": "jira", "title": f"{data['key']}: {data['title'][:60]}"}],
    }


async def _create_jira_sprint(
    ctx: dict,
    board_id: int,
    name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    goal: str | None = None,
) -> dict:
    user_id  = ctx["user_id"]
    supabase = get_supabase()

    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return {"summary": "Jira is not connected.", "sources": []}

    config = result.data[0]["config"]
    try:
        from routers.integrations import _create_sprint
        data = await _create_sprint(config, board_id, name, start_date, end_date, goal)
    except Exception as e:
        return {"summary": f"Could not create sprint: {e}", "sources": []}

    return {
        "summary": f"Created sprint '{data['name']}' (id: {data['sprint_id']}) on board {board_id}.",
        "data": (
            f"Sprint: {data['name']}\n"
            f"State: {data['state']}\n"
            + (f"Dates: {data['start_date']} → {data['end_date']}\n" if data.get("start_date") else "")
            + (f"Goal: {data['goal']}\n" if data.get("goal") else "")
        ),
        "sources": [],
    }


async def _search_jira(ctx: dict, jql: str, max_results: int = 50) -> dict:
    user_id  = ctx["user_id"]
    supabase = get_supabase()

    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return {"summary": "Jira is not connected. Go to Project Settings → Integrations to connect.", "sources": []}

    config = result.data[0]["config"]
    try:
        from routers.integrations import _search_jira as _jira_search
        data = await _jira_search(config, jql, max_results)
    except Exception as e:
        return {"summary": f"Jira search failed: {e}", "sources": []}

    issues = data.get("issues", [])
    if not issues:
        return {
            "summary": f"No issues found for: {jql}",
            "data": "No results.",
            "sources": [],
        }

    lines = [f"Found {data['total']} issue(s) (showing {data['returned']}):", ""]
    for it in issues:
        line = f"[{it['key']}] {it['title']} — {it['status']}"
        if it["assignee"] != "Unassigned":
            line += f" · {it['assignee']}"
        if it.get("priority"):
            line += f" · {it['priority']}"
        lines.append(line)

    sources = [
        {"id": f"jira:{it['key']}", "kind": "jira", "title": f"{it['key']}: {it['title'][:60]}"}
        for it in issues
    ]

    return {
        "summary": f"Found {data['total']} Jira issue(s) matching: {jql}",
        "data": "\n".join(lines),
        "sources": sources,
    }


async def _get_jira_issue(ctx: dict, issue_key: str) -> dict:
    user_id  = ctx["user_id"]
    supabase = get_supabase()

    result = (
        supabase.table("user_integrations")
        .select("config")
        .eq("user_id", user_id)
        .eq("integration_type", "jira")
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return {"summary": "Jira is not connected.", "sources": []}

    config = result.data[0]["config"]
    try:
        from routers.integrations import _get_issue
        data = await _get_issue(config, issue_key)
    except Exception as e:
        return {"summary": f"Could not fetch {issue_key}: {e}", "sources": []}

    lines = [
        f"[{data['key']}] {data['title']}",
        f"Type: {data['type']} | Status: {data['status']} | Priority: {data['priority']}",
        f"Assignee: {data['assignee']}",
    ]
    if data.get("labels"):
        lines.append(f"Labels: {', '.join(data['labels'])}")
    if data.get("description"):
        lines.append(f"\nDescription:\n{data['description']}")
    if data.get("subtasks"):
        lines.append(f"\nSubtasks:")
        for s in data["subtasks"]:
            lines.append(f"  [{s['key']}] {s['title']}")
    if data.get("comments"):
        lines.append(f"\nLast {len(data['comments'])} comment(s):")
        for c in data["comments"]:
            lines.append(f"  {c['author']} ({c['date']}): {c['body']}")

    return {
        "summary": f"{data['key']}: {data['title']} ({data['status']})",
        "data": "\n".join(lines),
        "sources": [{"id": f"jira:{data['key']}", "kind": "jira", "title": f"{data['key']}: {data['title'][:60]}"}],
    }


async def _get_features_due_for_revisit(ctx: dict) -> dict:
    from datetime import date

    project_id = ctx.get("project_id")
    user_id = ctx["user_id"]
    if not project_id:
        return {"summary": "No active project — revisit check unavailable.", "sources": []}

    supabase = get_supabase()
    today = date.today().isoformat()

    # Features with a revisit date that has passed and aren't archived.
    try:
        feat_res = (
            supabase.table("features")
            .select("id, name, predicted_metric, predicted_delta, revisit_at, status")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .lte("revisit_at", today)
            .neq("status", "archived")
            .order("revisit_at")
            .execute()
        )
    except Exception as e:
        return {"summary": f"Revisit query failed: {e}", "sources": []}

    features = feat_res.data or []
    if not features:
        return {
            "summary": "No features are currently due for a revisit.",
            "sources": [],
        }

    # Filter to only those with no recorded outcome (metrics.current IS NULL).
    feature_ids = [f["id"] for f in features]
    recorded: set[str] = set()
    try:
        met_res = (
            supabase.table("metrics")
            .select("feature_id, current")
            .in_("feature_id", feature_ids)
            .eq("user_id", user_id)
            .execute()
        )
        for row in met_res.data or []:
            if row.get("current") is not None:
                recorded.add(row["feature_id"])
    except Exception as e:
        logger.warning("Metrics check failed during revisit query: %s", e)

    pending = [f for f in features if f["id"] not in recorded]
    if not pending:
        return {
            "summary": "All due features have already had their outcomes recorded.",
            "sources": [],
        }

    lines = []
    for f in pending:
        revisit = f.get("revisit_at") or "?"
        days_over = (date.today() - date.fromisoformat(revisit)).days if revisit != "?" else 0
        overdue_str = f"{days_over} day(s) overdue" if days_over > 0 else "due today"
        line = (
            f"- {f['name']} (id: {f['id']}) · {overdue_str}"
            + (f" · predicted: {f['predicted_delta']} on {f['predicted_metric']}" if f.get("predicted_metric") else "")
            + f" · revisit_at: {revisit}"
        )
        lines.append(line)

    return {
        "summary": f"{len(pending)} feature(s) due for revisit.",
        "data": "\n".join(lines),
        "sources": [],
    }


async def _record_outcome(
    ctx: dict,
    feature_id: str,
    actual_delta: str,
    current_value: float | None = None,
    notes: str | None = None,
) -> dict:
    user_id = ctx["user_id"]
    supabase = get_supabase()

    # Verify the feature exists and belongs to this user.
    try:
        feat_res = (
            supabase.table("features")
            .select("id, name, predicted_metric, predicted_delta, revisit_at")
            .eq("id", feature_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        return {"summary": f"Feature lookup failed: {e}", "sources": []}

    if not feat_res.data:
        return {"summary": "Feature not found or access denied.", "sources": []}

    feature = feat_res.data[0]

    # Find the metric row; create one if the PM skipped it during promotion.
    metric_update = {
        "actual_delta": actual_delta,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }
    if current_value is not None:
        metric_update["current"] = current_value
    if notes:
        metric_update["source"] = notes  # repurpose source as notes field

    try:
        met_res = (
            supabase.table("metrics")
            .select("id")
            .eq("feature_id", feature_id)
            .eq("user_id", user_id)
            .execute()
        )
        existing = met_res.data or []
    except Exception as e:
        return {"summary": f"Metrics lookup failed: {e}", "sources": []}

    try:
        if existing:
            supabase.table("metrics").update(metric_update).eq("id", existing[0]["id"]).execute()
        else:
            metric_update["feature_id"] = feature_id
            metric_update["user_id"] = user_id
            metric_update["name"] = feature.get("predicted_metric") or "outcome"
            supabase.table("metrics").insert(metric_update).execute()
    except Exception as e:
        return {"summary": f"Outcome save failed: {e}", "sources": []}

    # Build a calibration verdict so the agent can give the PM signal.
    predicted = feature.get("predicted_delta") or ""
    verdict_parts = [f"Outcome recorded for '{feature['name']}'."]
    if predicted:
        verdict_parts.append(f"Predicted: {predicted}. Actual: {actual_delta}.")

    return {
        "summary": " ".join(verdict_parts),
        "data": f"feature_id: {feature_id}\npredicted: {predicted}\nactual: {actual_delta}",
        "sources": [{
            "id": f"feature:{feature_id}",
            "kind": "feature",
            "title": feature["name"],
        }],
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
    "render_diagram": _render_diagram,
    "critique_design": _critique_design,
    "list_discovery_themes": _list_discovery_themes,
    "list_discovery_insights": _list_discovery_insights,
    "list_opportunities": _list_opportunities,
    "save_opportunity": _save_opportunity,
    "promote_to_feature": _promote_to_feature,
    "get_features_due_for_revisit": _get_features_due_for_revisit,
    "record_outcome": _record_outcome,
    # Jira tools
    "list_jira_boards":   _list_jira_boards,
    "fetch_jira_sprint":  _fetch_jira_sprint,
    "search_jira":        _search_jira,
    "get_jira_issue":     _get_jira_issue,
    "create_jira_issue":  _create_jira_issue,
    "create_jira_sprint": _create_jira_sprint,
    # Handoff executors — never actually invoked; intercepted by loop.
    "handoff_to_pm": _handoff_noop,
    "handoff_to_designer": _handoff_noop,
    "handoff_to_analyst": _handoff_noop,
    "handoff_to_calendar": _handoff_noop,
    "handoff_to_opportunity": _handoff_noop,
    "handoff_to_whiteboard": _handoff_noop,
}
