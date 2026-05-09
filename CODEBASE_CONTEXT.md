# PMind — Codebase Context Reference

> Quick-reference for all files, their purpose, key exports, and cross-cutting patterns.
> Current phase: Phase 4 complete (billing, JWT auth, model selector, chat threads, global search, templates).
> App name: **PMind** (formerly PM Cursor).

---

## Directory Layout

```
pm_cursor/
├── CLAUDE.md                        # Dev instructions & vision
├── CODEBASE_CONTEXT.md              # ← this file
├── DESIGN.md                        # UI design system notes
├── landing/                         # Standalone PMind beta landing page (NOT part of Next.js app)
│   ├── index.html                   # Single-file dark amber landing page with animations
│   └── vercel.json                  # Vercel static deployment config
├── backend/                         # FastAPI Python backend (port 8000)
│   ├── main.py                      # App entry, CORS, router mounts
│   ├── deps.py                      # DI: get_supabase(), get_user_id() — now verifies Clerk JWT
│   ├── prompts.py                   # AI system prompt templates
│   ├── requirements.txt             # Python deps
│   ├── .env                         # Secrets (not committed)
│   ├── llm/
│   │   ├── base.py                  # LLMProvider ABC
│   │   ├── factory.py               # get_llm_provider(model_override?) — reads LLM_PROVIDER env
│   │   ├── gemini.py                # Gemini provider (default)
│   │   ├── claude.py                # Claude provider
│   │   └── openai_provider.py       # OpenAI provider
│   └── routers/
│       ├── ai.py                    # /ai/* — complete, chat (threaded+RAG), generate-tickets, apply, search, review-ui
│       ├── projects.py              # CRUD /projects + tree + folders
│       ├── documents.py             # CRUD /documents/{id}
│       ├── folders.py               # PUT/DELETE /folders/{id}
│       ├── context.py               # GET/PUT /{project_id}/context (Product Brain)
│       ├── knowledge.py             # POST/GET/DELETE /knowledge (RAG uploads)
│       ├── integrations.py          # Jira + Linear connect/export
│       ├── billing.py               # Stripe subscription management
│       └── templates.py             # PM document templates
│
├── cursor-for-pms/                  # Next.js 15 frontend (port 3000)
│   ├── package.json
│   ├── .env                         # Secrets (not committed)
│   └── src/
│       ├── middleware.ts             # Clerk auth guard (bypassed in dev mode)
│       ├── app/
│       │   ├── layout.tsx            # Root: ClerkProvider + ThemeProvider
│       │   ├── page.tsx              # Home redirect
│       │   ├── sign-in/             # Clerk sign-in
│       │   ├── billing/
│       │   │   └── page.tsx          # Billing / subscription management page
│       │   └── projects/
│       │       ├── page.tsx          # Projects list
│       │       ├── layout.tsx        # Projects shell
│       │       └── [projectId]/
│       │           ├── layout.tsx    # Pass-through (children only)
│       │           ├── page.tsx      # Project home
│       │           ├── docs/[docId]/page.tsx      # Document editor page
│       │           ├── knowledge/[docId]/page.tsx
│       │           └── settings/page.tsx           # Integrations settings
│       ├── components/
│       │   ├── Editor.tsx            # Tiptap editor + Cmd+K + EditorToolbar + Image/Link extensions
│       │   ├── EditorToolbar.tsx     # Sticky formatting toolbar (bold, H1-H3, lists, image upload, link)
│       │   ├── AICommandModal.tsx    # Cmd+K modal — model_override from localStorage
│       │   ├── TicketExportModal.tsx # Structured ticket preview + Jira/Linear export
│       │   ├── IntegrationSettings.tsx  # Connect/disconnect Jira & Linear
│       │   ├── CursorChat.tsx        # Right-panel chat — model picker, thread history, RAG, markdown rendering
│       │   ├── GlobalSearch.tsx      # Full-screen global search (semantic + text)
│       │   ├── ProductBrain.tsx      # Right-panel context textarea (Zustand only)
│       │   ├── Sidebar.tsx           # Left-panel project+file tree + settings gear icon
│       │   ├── FileTreeItem.tsx      # Recursive tree node component
│       │   ├── KnowledgeBase.tsx     # Upload/manage RAG docs
│       │   ├── ProductBrainWrapper.tsx
│       │   ├── ProjectsShortcutWrapper.tsx
│       │   ├── ThemeProvider.tsx
│       │   └── ThemeToggle.tsx
│       ├── store/
│       │   ├── productBrain.ts       # Zustand: contexts map (localStorage)
│       │   ├── activeProject.ts      # Zustand: active project id
│       │   └── editorStore.ts        # Zustand: editor state (active doc, panel tabs, etc.)
│       ├── hooks/
│       │   └── useCustomAuth.ts      # Clerk + dev-mode override
│       └── lib/
│           └── auth.ts               # Server-side auth() wrapper
│
└── SQL Migrations (run manually in Supabase SQL editor)
    ├── supabase_schema.sql                # Phase 0: documents, context_chunks
    ├── supabase_phase0.sql                # Phase 0: projects table
    ├── supabase_phase1_filetree.sql       # Phase 1: folders table + RLS
    ├── supabase_phase2_chat.sql           # Phase 2: chat_threads, chat_messages
    ├── supabase_phase2_rag.sql            # Phase 2: knowledge_documents, knowledge_chunks
    ├── supabase_phase2b_storage.sql       # Phase 2b: knowledge-files storage bucket
    ├── supabase_phase3_integrations.sql   # Phase 3: user_integrations table
    ├── supabase_phase4_billing.sql        # Phase 4: user_subscriptions, usage_logs ← RUN THIS
    └── supabase_phase4_search.sql         # Phase 4: match_all_knowledge_chunks RPC ← RUN THIS
```

---

## Backend Files

### `backend/main.py`
Entry point. Mounts all routers.

```python
app.include_router(projects.router,      prefix="/projects")
app.include_router(documents.router,     prefix="/documents")
app.include_router(folders.router,       prefix="/folders")
app.include_router(ai.router,            prefix="/ai")
app.include_router(knowledge.router,     prefix="/knowledge")
app.include_router(integrations.router,  prefix="/integrations")
app.include_router(billing.router,       prefix="/billing")
app.include_router(templates.router,     prefix="/templates")
```

CORS: allows `http://localhost:*` with credentials.

---

### `backend/deps.py`
Two DI functions used across all routers:

```python
def get_supabase() -> Client:
    # Returns Supabase CLIENT with SERVICE KEY (bypasses RLS)
    # Uses: SUPABASE_URL, SUPABASE_SERVICE_KEY env vars

def get_user_id(authorization: str = Header(...)) -> str:
    # Dev mode: NEXT_PUBLIC_DEV_MODE=true → returns "dev_user_123" without verification
    # Production: verifies Clerk JWT using CLERK_SECRET_KEY, extracts sub claim
    # Raises 401 if token is invalid or missing
```

**Pattern**: Every authenticated endpoint does `user_id: str = Depends(get_user_id)` and passes it as a `.eq("user_id", user_id)` filter on all Supabase queries.

---

### `backend/prompts.py`
System prompt templates:

```python
BASE_SYSTEM  # Shared system prompt with {product_context} slot

COMMAND_PROMPTS = {
    "prd":       # PRD sections: Problem, Who, Solution, Metrics, OOS, Questions
    "tickets":   # Ticket breakdown: Title, Description, AC, Size — grouped by Frontend/Backend/Infra
    "brief":     # One-pager: What, Why Now, Who, Success, Not Doing
    "update":    # Stakeholder update: This Week, Next Week, Blockers, Metrics
    "interview": # Research synthesis: Themes, Quotes, Surprises, Implications, Next Steps
    "custom":    # Empty — model uses base system only
}

def get_system_prompt(command: str, product_context: str) -> str:
    # Combines BASE_SYSTEM + COMMAND_PROMPTS[command]
```

---

### `backend/llm/`
Strategy pattern for LLM providers.

```python
# factory.py
def get_llm_provider(model_override: str | None = None) -> LLMProvider:
    # model_override takes priority over LLM_MODEL env var
    # Reads LLM_PROVIDER env var: "gemini" (default) | "claude" | "openai"
    # Reads LLM_MODEL env var for default model name

# base.py — ABC
class LLMProvider:
    async def complete(system_prompt, user_message, stream=True) -> AsyncGenerator[str, None]
```

All three providers (gemini.py, claude.py, openai_provider.py) implement async streaming via the same interface.

**Env vars:**
```
LLM_PROVIDER=gemini   LLM_MODEL=gemini-2.5-flash    GOOGLE_API_KEY=...
LLM_PROVIDER=claude   LLM_MODEL=claude-sonnet-4-6   ANTHROPIC_API_KEY=...
LLM_PROVIDER=openai   LLM_MODEL=gpt-4o              OPENAI_API_KEY=...
```

**Model override flow**: User selects model in CursorChat dropdown → stored in `localStorage["pm_cursor_model"]` → read by CursorChat, Editor (apply), and AICommandModal → sent as `model_override` in every AI request body → factory uses it instead of env var default.

---

### `backend/routers/ai.py`
```
POST /ai/complete          ← Cmd+K modal (AICommandModal)
POST /ai/chat              ← Chat sidebar (CursorChat) — threaded, persisted, RAG-aware
POST /ai/generate-tickets  ← Structured ticket JSON for TicketExportModal
POST /ai/apply             ← Inline document diffs
POST /ai/search            ← Semantic + text search
POST /ai/review-ui         ← Multimodal screenshot review (vision model)
GET  /ai/threads           ← List chat threads for a project
POST /ai/threads           ← Create new chat thread
GET  /ai/threads/{id}/messages  ← Thread message history
DELETE /ai/threads/{id}    ← Delete thread + messages
```

**Free-tier rate limiting**: `_check_usage(user_id, endpoint)` enforces `FREE_LIMIT = 20` AI requests/day. Checks `user_subscriptions` table for plan; non-free users skip the check. Logs each request to `usage_logs`. All wrapped in try/except so missing tables don't break the app.

**`/ai/complete`** request body:
```json
{ "command": "prd|tickets|brief|update|interview|custom",
  "user_input": "...",
  "product_context": "...",
  "document_context": "...",
  "project_id": "uuid-or-null",
  "model_override": "gemini-2.5-flash" }
```

**`/ai/chat`** request body:
```json
{ "messages": [{"role": "user|assistant", "content": "..."}],
  "document_context": "...",
  "project_id": "uuid-or-null",
  "thread_id": "uuid-or-null",
  "model_override": "gemini-2.5-flash" }
```
- Auto-creates a thread on first message (title = first 60 chars of user message)
- Persists user message before streaming, assistant reply after streaming completes
- RAG: embeds last user message via Gemini `gemini-embedding-2`, calls `match_knowledge_chunks` RPC
- Returns `X-Thread-Id` response header so frontend can track newly-created threads

**`/ai/apply`** request body:
```json
{ "current_content": "...", "ai_suggestion": "...", "model_override": "..." }
```
Returns: `{ "changes": [{ "find": "exact text", "replace": "new text" }] }`

**`/ai/review-ui`**: multipart form with `image` (file), `prompt`, `document_context`, `model_override`. Uses vision-capable Gemini model, defaults to `gemini-2.5-flash`.

**SSE format** (complete + chat only): backend sends `data: <chunk>\n\n`, newlines escaped as `\\n`. Final frame: `data: [DONE]\n\n`.

**Thread CRUD**: all wrapped in try/except — return empty data gracefully when `chat_threads`/`chat_messages` tables don't exist yet.

---

### `backend/routers/projects.py`
```
GET    /projects/                        list_projects
POST   /projects/                        create_project
GET    /projects/{id}                    get_project
PUT    /projects/{id}                    update_project  (name, description, color)
DELETE /projects/{id}                    delete_project
GET    /projects/{id}/documents/         list_project_documents
POST   /projects/{id}/documents/         create_project_document
GET    /projects/{id}/tree               get_project_tree → {folders: [], docs: []}
POST   /projects/{id}/folders/           create_folder
```

---

### `backend/routers/documents.py`
```
GET    /documents/{id}    get_document
PUT    /documents/{id}    update_document  (title, content jsonb)
DELETE /documents/{id}    delete_document
```

---

### `backend/routers/folders.py`
```
PUT    /folders/{id}    rename_folder  (body: {name})
DELETE /folders/{id}    delete_folder
```

---

### `backend/routers/integrations.py`
Jira and Linear integration management.

```
GET    /integrations/status          → { jira: {connected, domain?, email?}, linear: {connected} }
POST   /integrations/jira            connect Jira  body: {domain, email, api_token}
DELETE /integrations/jira            disconnect
GET    /integrations/jira/projects   → [{key, name, id}]
POST   /integrations/jira/export     create tickets  body: {project_key, tickets: Epic[]}
POST   /integrations/linear          connect Linear  body: {api_key}
DELETE /integrations/linear          disconnect
GET    /integrations/linear/teams    → [{id, name, key}]
POST   /integrations/linear/export   create issues   body: {team_id, tickets: Epic[]}
```

Credentials stored in `user_integrations` table as JSONB config.

---

### `backend/routers/billing.py`
Stripe subscription management.

```
GET    /billing/status          → current plan + subscription info
POST   /billing/checkout        create Stripe checkout session
POST   /billing/portal          create Stripe customer portal session
POST   /billing/webhook         Stripe webhook handler (updates user_subscriptions)
```

Plans: `free` | `pro`. Reads `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` env vars.

---

### `backend/routers/templates.py`
PM document templates.

```
GET  /templates/          list available templates
GET  /templates/{id}      get template content (Tiptap JSON)
POST /templates/{id}/use  create new document from template (returns document id)
```

Templates are stored as JSON in the backend (not in Supabase) and represent common PM artifacts: PRD, OKR planning, sprint review, competitor analysis, one-pager, interview synthesis.

---

### `backend/routers/context.py`
Product Brain per-project singleton:
```
GET  /context/{project_id}/context   → {content: "..."}
PUT  /context/{project_id}/context   body: {content: "..."}
```
⚠️ **Not called by frontend** — ProductBrain.tsx reads/writes Zustand only (localStorage).

---

### `backend/routers/knowledge.py`
RAG document pipeline:
```
POST   /knowledge/           upload file (PDF/DOCX/TXT) → chunk → embed → store
GET    /knowledge/           list docs   (?project_id=...)
GET    /knowledge/{id}       get doc metadata
GET    /knowledge/{id}/url   signed download URL (1hr)
GET    /knowledge/{id}/chunks  list text chunks (no vectors)
DELETE /knowledge/{id}       delete doc + chunks
```

Upload flow: extract text → upload to Supabase Storage (`knowledge-files` bucket) → insert `knowledge_documents` row → chunk (1000 chars / 200 overlap) → embed via Gemini `gemini-embedding-2` (768 dims) → insert `knowledge_chunks` rows.

---

## Frontend Files

### Auth pattern
```typescript
// hooks/useCustomAuth.ts
export function useCustomAuth() {
  // If NEXT_PUBLIC_DEV_MODE=true, returns userId="dev_user_123"
  // Otherwise wraps @clerk/nextjs useAuth()
}
// All components use: const { userId } = useCustomAuth()
// All fetch calls use: Authorization: `Bearer ${userId}`
```

---

### `cursor-for-pms/src/components/Editor.tsx`
Tiptap editor wrapper. Props: `{ docId, projectId, initialContent, onSave }`.

- Renders `EditorContent` with StarterKit + Placeholder + **Image** + **Link** extensions
  - `Image.configure({ inline: false, allowBase64: true })` — base64 images embed directly in Tiptap JSON
  - `Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-amber-600 dark:text-amber underline..." } })`
- Renders `<EditorToolbar editor={editor} />` above `EditorContent`
- Listens for `Cmd+K` / `Ctrl+K` → opens `AICommandModal`
- `onSave` called on every `editor.onUpdate` (debounced 2s in `docs/[docId]/page.tsx`)
- AI Apply: reads `localStorage.getItem("pm_cursor_model") || "gemini-2.5-flash"` for model selection

---

### `cursor-for-pms/src/components/EditorToolbar.tsx`
Sticky formatting toolbar that sits above the Tiptap editor. Props: `{ editor: Editor | null }`.

Uses `onMouseDown + e.preventDefault()` pattern on all buttons to prevent editor blur before running commands.

**Buttons:** Undo, Redo | H1, H2, H3 | Bold, Italic, Inline Code | Bullet List, Ordered List | Blockquote, Code Block | Horizontal Rule | Link (prompts for URL), Image Upload (FileReader → base64 → `setImage`).

Image upload flow: `<input type="file" accept="image/*">` → `FileReader.readAsDataURL()` → `editor.chain().focus().setImage({ src: reader.result }).run()`. Images embed directly in the document as base64; no backend upload needed.

---

### `cursor-for-pms/src/components/AICommandModal.tsx`
Cmd+K overlay. Props: `{ onClose, onOutput, projectId, productContext, documentContext }`.

Commands: `prd | tickets | brief | update | interview | custom`

Flow:
1. User selects command + types input → clicks Generate or presses Enter
2. Reads `localStorage["pm_cursor_model"]` for `model_override`
3. Calls `POST /ai/complete` with `Authorization` header
4. Streams SSE response, unescapes `\\n → \n`
5. On completion: calls `onOutput(fullText)` → Editor inserts text into document
6. Non-tickets commands: modal closes. Tickets command: modal stays open, shows **"Export to Jira / Linear ↗"** button

---

### `cursor-for-pms/src/components/CursorChat.tsx`
Right sidebar chat. No props — reads `projectId` from `useParams()`.

**Model selector**: Dropdown in header lets user pick the Gemini model. Selection persisted to `localStorage["pm_cursor_model"]` and read by Editor and AICommandModal too.

```typescript
const GEMINI_MODELS = [
  { id: "gemini-2.5-flash",           label: "2.5 Flash" },
  { id: "gemini-2.5-flash-lite",      label: "2.5 Flash Lite" },
  { id: "gemini-3-flash-preview",     label: "3 Flash Preview" },
  { id: "gemini-3.1-flash-lite-preview", label: "3.1 Flash Lite" },
  { id: "gemini-2.0-flash",           label: "2.0 Flash" },
];
```

**Thread history**: Left panel lists threads from `GET /ai/threads?project_id=...`. Selecting a thread loads messages from `GET /ai/threads/{id}/messages`. Deleting calls `DELETE /ai/threads/{id}`. Thread rows use `<div role="button">` (not `<button>`) to avoid nested button HTML violation.

**Markdown rendering**: AI messages rendered via `<ReactMarkdown remarkPlugins={[remarkGfm]}>` with `chat-markdown` CSS class for themed styling.

**Design**: Uses `glass-pane` CSS class (NOT inline rgba styles). Message bubbles: user = `bg-amber-100/50 dark:bg-amber-900/20`, AI = `bg-white/50 dark:bg-black/20`. Tailwind tokens consistent with Sidebar.

**Empty state**: Shows 3 suggested prompts.

---

### `cursor-for-pms/src/components/GlobalSearch.tsx`
Full-screen search overlay. Calls `POST /ai/search` with semantic + text results.

```typescript
// Search scopes: "project" (current project only) | "all" (across all projects)
// Results: knowledge chunks (vector similarity) + document titles (text match)
// Each result shows type badge, content preview, similarity score
```

---

### `cursor-for-pms/src/app/billing/page.tsx`
Billing and subscription management page.

- Shows current plan (free / pro)
- Upgrade button → calls `POST /billing/checkout` → redirects to Stripe Checkout
- Manage subscription button → calls `POST /billing/portal` → redirects to Stripe Customer Portal
- Shows usage stats (AI requests today vs. limit)

---

### `cursor-for-pms/src/components/TicketExportModal.tsx`
Structured ticket preview and one-click export. Props: `{ userInput, productContext, documentContext, onClose }`.

On mount (parallel): fetches `GET /integrations/status` + calls `POST /ai/generate-tickets`.

**UI states:** `generating` → main view → `exporting` → `success` / `error`

**Right panel:** No integrations → inline connect forms. Connected → destination selector, project/team dropdown, Export button.

---

### `cursor-for-pms/src/components/IntegrationSettings.tsx`
Jira + Linear connection management. Fetches `GET /integrations/status` on mount.

---

### `cursor-for-pms/src/components/ProductBrain.tsx`
Right sidebar product context. Reads/writes `useProductBrain()` Zustand store only (localStorage). ⚠️ **Not synced to backend**.

---

### `cursor-for-pms/src/components/Sidebar.tsx`
Left panel project + file tree. No props.

Settings gear icon always visible per project row (not hover-gated). Navigates to `/projects/[id]/settings`. Edit controls (rename, add folder/doc, delete) are `opacity-0 group-hover:opacity-100`.

---

### `cursor-for-pms/src/components/KnowledgeBase.tsx`
File upload (PDF/DOCX/TXT) to RAG pipeline. POSTs as FormData to `POST /knowledge/`.

---

### `cursor-for-pms/src/store/productBrain.ts`
```typescript
interface ProductBrainStore {
  contexts: Record<string, string>;  // projectId → context text
  getContext(projectId: string): string;
  setContext(projectId: string, value: string): void;
}
// Persisted to localStorage key: "product-brain-v2"
```

---

### `cursor-for-pms/src/store/editorStore.ts`
Zustand store for editor UI state (active document, right panel tab selection, etc.). Not persisted to localStorage.

---

## Database Schema

### Tables (Supabase PostgreSQL)

```sql
-- Core
projects         (id uuid PK, user_id text, name, color, description, created_at, updated_at)
documents        (id uuid PK, user_id text, project_id uuid FK→projects, folder_id uuid FK→folders,
                  title text, content jsonb, created_at, updated_at)
folders          (id uuid PK, user_id text, project_id uuid FK→projects,
                  parent_folder_id uuid FK→folders self-ref, name text, created_at, updated_at)
context_chunks   (id uuid PK, user_id text, project_id uuid, title text, content text, created_at)

-- RAG
knowledge_documents (id uuid PK, project_id uuid, user_id text, filename, file_type,
                     storage_path, created_at)
knowledge_chunks    (id uuid PK, knowledge_document_id uuid FK, user_id text,
                     content text, embedding vector(768), created_at)

-- Chat (threaded, persisted)
chat_threads     (id uuid PK, user_id text, project_id uuid, title, created_at, updated_at)
chat_messages    (id uuid PK, thread_id uuid FK, user_id text, role text, content, created_at)

-- Integrations
user_integrations (id uuid PK, user_id text, integration_type text CHECK IN ('jira','linear'),
                   config jsonb, is_active boolean, created_at, updated_at,
                   UNIQUE(user_id, integration_type))

-- Billing (Phase 4) — run supabase_phase4_billing.sql
user_subscriptions (id uuid PK, user_id text UNIQUE, plan text DEFAULT 'free',
                    stripe_customer_id text, stripe_subscription_id text,
                    status text, current_period_end timestamptz, created_at, updated_at)
usage_logs         (id uuid PK, user_id text, endpoint text, created_at)
  -- One row per AI request; used for free-tier rate limiting (20 req/day)
```

### RLS
All tables have `user_id = auth.uid()::text` policy. Backend uses service key (bypasses RLS). Frontend never calls Supabase directly.

### Supabase Storage
Bucket: `knowledge-files`. Path: `{user_id}/{project_id}/{filename}`. Signed URL expiry: 1hr.

### RPC Functions
- `match_knowledge_chunks(query_embedding, match_threshold, match_count, p_project_id)` — pgvector similarity search within a project, used by `/ai/chat`
- `match_all_knowledge_chunks(query_embedding, match_threshold, match_count, p_user_id)` — cross-project search, used by `/ai/search` with `scope=all` — run `supabase_phase4_search.sql`

---

## Key Patterns

### SSE Streaming
```python
# Backend (ai.py)
async def generate():
    async for chunk in provider.complete(system_prompt, user_message):
        escaped = chunk.replace("\n", "\\n")
        yield f"data: {escaped}\n\n"
    yield "data: [DONE]\n\n"
return StreamingResponse(generate(), media_type="text/event-stream")
```
```typescript
// Frontend (AICommandModal.tsx, CursorChat.tsx)
for (const line of lines) {
  if (line.startsWith("data: ") && !line.includes("[DONE]")) {
    const text = line.slice(6).replace(/\\n/g, "\n");
    fullText += text;
  }
}
```

### Auth Header
Every authenticated API call:
```typescript
headers: { Authorization: `Bearer ${userId}` }
// userId = "dev_user_123" in dev mode, Clerk userId in prod
```

### Model Selection
```typescript
// Persisted across components via localStorage
const model = localStorage.getItem("pm_cursor_model") || "gemini-2.5-flash";
// Set in CursorChat dropdown, read in CursorChat + Editor (apply) + AICommandModal
// Sent to backend as model_override field on all AI request bodies
```

### Dev Mode
```
NEXT_PUBLIC_DEV_MODE=true  →  userId = "dev_user_123", skips Clerk entirely, skips rate limiting
```
Set in `cursor-for-pms/.env`. Checked in `middleware.ts`, `useCustomAuth.ts`, `lib/auth.ts`, `backend/deps.py`.

---

## Landing Page (`landing/`)

Standalone static page — **not part of the Next.js app**, deployed separately to Vercel.

- **File**: `landing/index.html` — single dark amber static page for PMind beta signups
- **Config**: `landing/vercel.json` — `@vercel/static` build
- **Excluded from main repo**: `landing/` is in `.gitignore`; must be deployed from its own repo or folder

**Page structure**: Nav → Hero (two-column with animated product mockup) → Why PMs need this → Features grid → How it works → PM quotes → Signup CTA → Footer

**CTA**: Links to Google Form at `https://docs.google.com/forms/d/e/1FAIpQLSfUYt54gUHDzzDxoDH8YZ0pp8RPW5wXtZRRKFBD7ecfNRqQDw/viewform` (opens in new tab, NOT embedded)

**Background**: dot grid (CSS `::before`), amber ambient glows (CSS `::after` animated), CSS light beams (`.beam`), canvas sparkle particles (JS)

**Hero visual**: 3D-tilted fake editor card with blinking cursor, AI suggestion card (slides in with `aiCardFloat` animation), floating ticket card, ⌘K keyboard hint

---

## Known Issues / TODOs

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | ProductBrain not synced to DB | `ProductBrain.tsx` → `context.py` endpoints unused | 🟡 Medium |
| 2 | RAG embeddings hardcoded to Gemini | `backend/routers/ai.py`, `knowledge.py` | 🟡 Medium |
| 3 | Stripe billing not wired to Supabase in prod | `billing.py` webhook + `supabase_phase4_billing.sql` needed | 🟡 Medium |
| 4 | `chat_threads`/`chat_messages` tables may not exist | Run `supabase_phase2_chat.sql` | 🟡 Medium |
| 5 | `user_subscriptions`/`usage_logs` tables may not exist | Run `supabase_phase4_billing.sql` | 🟡 Required for billing |
| 6 | `match_all_knowledge_chunks` RPC may not exist | Run `supabase_phase4_search.sql` | 🟡 Required for global search |

---

## Phase 4 Status — COMPLETE ✓

### New backend files
- [x] `backend/routers/billing.py` — Stripe subscription management
- [x] `backend/routers/templates.py` — PM document templates
- [x] `supabase_phase4_billing.sql` — `user_subscriptions`, `usage_logs` tables
- [x] `supabase_phase4_search.sql` — `match_all_knowledge_chunks` RPC

### New frontend files
- [x] `cursor-for-pms/src/components/EditorToolbar.tsx` — rich text formatting toolbar
- [x] `cursor-for-pms/src/components/GlobalSearch.tsx` — semantic + text search overlay
- [x] `cursor-for-pms/src/store/editorStore.ts` — editor UI state store
- [x] `cursor-for-pms/src/app/billing/page.tsx` — billing management page

### Modified files
- [x] `backend/deps.py` — JWT verification (Clerk) with dev bypass
- [x] `backend/llm/factory.py` — `model_override` parameter
- [x] `backend/routers/ai.py` — `model_override` on all AI endpoints, threaded chat with persistence, usage tracking, `review-ui` model fix, all thread CRUD in try/except
- [x] `cursor-for-pms/src/components/Editor.tsx` — EditorToolbar, Image extension (base64), Link extension
- [x] `cursor-for-pms/src/components/CursorChat.tsx` — model picker dropdown, thread history panel, ReactMarkdown rendering, `glass-pane` design system compliance
- [x] `cursor-for-pms/src/components/AICommandModal.tsx` — `model_override` from localStorage

### Landing page
- [x] `landing/index.html` — PMind beta signup page (deployed separately to Vercel)
- [x] `landing/vercel.json` — static deployment config
- [x] `.gitignore` — `landing/` excluded from main repo
