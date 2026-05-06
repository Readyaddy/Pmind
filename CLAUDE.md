# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Vision

**PM Cursor** is an AI-native workspace for Product Managers — the equivalent of Cursor (the AI code editor) but for PM workflows. It provides a Tiptap-based document editor with Cmd+K AI assistance deeply integrated, not bolted on as a chatbot.

Core PM workflows:
- PRD writing with contextual AI generation
- User story / acceptance criteria breakdown
- User research synthesis
- Stakeholder update drafting
- One-pagers and product briefs

The "Product Brain" sidebar lets users paste their product strategy/context once; it is injected into every AI call to produce grounded, product-specific output rather than generic templates.

## Repo Structure

```
pm_cursor/
  cursor-for-pms/     # Next.js 14 frontend
  backend/            # FastAPI Python backend
  CLAUDE.md
```

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) |
| Editor | Tiptap (ProseMirror) |
| Styling | Tailwind CSS + shadcn/ui primitives |
| Auth | Clerk (`@clerk/nextjs`) |
| Client state | Zustand (persisted Product Brain context) |
| Backend | FastAPI + uvicorn |
| LLM | Pluggable via `LLM_PROVIDER` env var — Gemini (default), Claude, OpenAI |
| Database | Supabase (PostgreSQL) — documents + context_chunks tables |

## Commands

### Frontend (`cursor-for-pms/`)
```bash
npm run dev          # localhost:3000
npm run build
npm run typecheck    # tsc --noEmit
npm run lint
```

### Backend (`backend/`)
```bash
# First time
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Run dev server
uvicorn main:app --reload --port 8000

# Run both together (from repo root)
# Terminal 1: cd backend && uvicorn main:app --reload --port 8000
# Terminal 2: cd cursor-for-pms && npm run dev
```

## LLM Provider Layer

The backend uses a strategy pattern. Swap providers via env vars — no code changes needed.

```
backend/llm/
  base.py          # LLMProvider ABC with async complete() -> AsyncGenerator[str]
  factory.py       # get_llm_provider() reads LLM_PROVIDER env var
  gemini.py        # Default
  claude.py        # LLM_PROVIDER=claude
  openai_provider.py
```

**Env vars to switch providers:**
```
LLM_PROVIDER=gemini    LLM_MODEL=gemini-1.5-flash    GOOGLE_API_KEY=...
LLM_PROVIDER=claude    LLM_MODEL=claude-sonnet-4-6   ANTHROPIC_API_KEY=...
LLM_PROVIDER=openai    LLM_MODEL=gpt-4o              OPENAI_API_KEY=...
```

## Backend Architecture

```
backend/
  main.py            # FastAPI app, CORS, router mounts
  prompts.py         # System prompt templates per command (prd, tickets, brief, etc.)
  requirements.txt
  llm/               # Provider abstraction (see above)
  routers/
    ai.py            # POST /ai/complete → SSE streaming endpoint
    documents.py     # CRUD /documents + /documents/{id}
    context.py       # CRUD /context (Product Brain saved chunks)
```

All AI calls go through `POST /ai/complete`. The request body includes `command`, `user_input`, `product_context`, and `document_context`. Response is `text/event-stream`.

## Frontend Architecture

```
cursor-for-pms/src/
  app/
    layout.tsx                      # ClerkProvider root
    page.tsx                        # Redirect: authed → /editor, else → /sign-in
    sign-in/[[...sign-in]]/page.tsx
    editor/
      layout.tsx                    # Auth guard + 3-panel layout (Sidebar | Editor | ProductBrain)
      [docId]/page.tsx              # Loads doc, wires debounced auto-save (2s)
  components/
    Editor.tsx          # Tiptap instance, Cmd+K listener, streams AI output into doc
    AICommandModal.tsx  # Cmd+K modal: command picker + textarea + SSE streaming preview
    ProductBrain.tsx    # Right sidebar: textarea persisted to Zustand
    Sidebar.tsx         # Left sidebar: doc list + "New document" button
  store/
    productBrain.ts     # Zustand store (persisted to localStorage)
```

## Key Patterns

- **Auto-save**: debounced 2s after `editor.onUpdate` — calls `PUT /documents/{id}`
- **Streaming**: fetch + `ReadableStream` reader, parses `data: <chunk>\n\n` SSE lines, stops at `data: [DONE]`
- **Product Brain context** flows: Zustand store → `Editor.tsx` prop → `AICommandModal` → `POST /ai/complete` body → FastAPI `get_system_prompt()` → injected into LLM system prompt
- **Commands**: `prd | tickets | brief | update | interview | custom` — each has a prompt template in `backend/prompts.py`

## Supabase Schema

```sql
-- documents: id, user_id (Clerk), title, content (Tiptap JSON), created_at, updated_at
-- context_chunks: id, user_id, title, content, created_at
-- RLS: user_id = auth.uid()::text on both tables
```

## Stage 2 TODOs (don't build yet)

```
// TODO Stage 2: Replace localStorage ProductBrain with Supabase context_chunks
// TODO Stage 2: pgvector embeddings for context retrieval
// TODO Stage 2: Linear / Jira integration
// TODO Stage 2: Notion import
// TODO Stage 3: Team workspaces + shared Product Brain
// TODO Stage 4: Stripe billing
```
