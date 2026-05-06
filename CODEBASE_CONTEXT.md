# PM Cursor — Codebase Context Reference

> Quick-reference for all files, their purpose, key exports, and cross-cutting patterns.
> Current phase: Phase 2 complete, Phase 3 (Jira/Linear) pending.

---

## Directory Layout

```
pm_cursor/
├── CLAUDE.md                        # Dev instructions & vision
├── CODEBASE_CONTEXT.md              # ← this file
├── backend/                         # FastAPI Python backend (port 8000)
│   ├── main.py                      # App entry, CORS, router mounts
│   ├── deps.py                      # DI: get_supabase(), get_user_id()
│   ├── prompts.py                   # AI system prompt templates
│   ├── requirements.txt             # Python deps
│   ├── .env                         # Secrets (not committed)
│   ├── llm/
│   │   ├── base.py                  # LLMProvider ABC
│   │   ├── factory.py               # get_llm_provider() — reads LLM_PROVIDER env
│   │   ├── gemini.py                # Gemini provider (default)
│   │   ├── claude.py                # Claude provider
│   │   └── openai_provider.py       # OpenAI provider
│   └── routers/
│       ├── ai.py                    # POST /ai/complete, /ai/chat, /ai/generate-tickets
│       ├── projects.py              # CRUD /projects + tree + folders
│       ├── documents.py             # CRUD /documents/{id}
│       ├── folders.py               # PUT/DELETE /folders/{id}
│       ├── context.py               # GET/PUT /{project_id}/context (Product Brain)
│       ├── knowledge.py             # POST/GET/DELETE /knowledge (RAG uploads)
│       └── integrations.py          # Phase 3: Jira + Linear connect/export
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
│       │   └── projects/
│       │       ├── page.tsx          # Projects list
│       │       ├── layout.tsx        # Projects shell
│       │       └── [projectId]/
│       │           ├── layout.tsx    # Pass-through (children only)
│       │           ├── page.tsx      # Project home
│       │           ├── docs/[docId]/page.tsx      # Document editor page
│       │           ├── knowledge/[docId]/page.tsx
│       │           └── settings/page.tsx           # Phase 3: integrations settings
│       ├── components/
│       │   ├── Editor.tsx            # Tiptap editor + Cmd+K listener
│       │   ├── AICommandModal.tsx    # Cmd+K modal — tickets command stays open for export
│       │   ├── TicketExportModal.tsx # Phase 3: structured ticket preview + Jira/Linear export
│       │   ├── IntegrationSettings.tsx  # Phase 3: connect/disconnect Jira & Linear
│       │   ├── CursorChat.tsx        # Right-panel chat → /ai/chat (RAG-aware)
│       │   ├── ProductBrain.tsx      # Right-panel context textarea (Zustand only)
│       │   ├── Sidebar.tsx           # Left-panel project+file tree + settings gear icon
│       │   ├── FileTreeItem.tsx      # Recursive tree node component
│       │   ├── KnowledgeBase.tsx     # Upload/manage RAG docs
│       │   ├── ProductBrainWrapper.tsx
│       │   ├── ThemeProvider.tsx
│       │   └── ThemeToggle.tsx
│       ├── store/
│       │   ├── productBrain.ts       # Zustand: contexts map (localStorage)
│       │   └── activeProject.ts      # Zustand: active project id
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
    └── supabase_phase3_integrations.sql   # Phase 3: user_integrations table ← RUN THIS
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
app.include_router(integrations.router,  prefix="/integrations")   # Phase 3
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
    # ⚠️ INSECURE: strips "Bearer " prefix, returns raw value as user ID
    # TODO Stage 3: verify Clerk JWT with CLERK_SECRET_KEY
    return authorization.replace("Bearer ", "")
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
def get_llm_provider() -> LLMProvider:
    # Reads LLM_PROVIDER env var: "gemini" (default) | "claude" | "openai"
    # Reads LLM_MODEL env var for model name override

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

---

### `backend/routers/ai.py`
```
POST /ai/complete          ← Cmd+K modal (no auth — cost exposure risk)
POST /ai/chat              ← Chat sidebar (no auth)
POST /ai/generate-tickets  ← Structured ticket JSON for export (no auth)
```

**`/ai/complete`** request body:
```json
{ "command": "prd|tickets|brief|update|interview|custom",
  "user_input": "...",
  "product_context": "...",
  "document_context": "..." }
```

**`/ai/chat`** request body:
```json
{ "messages": [{"role": "user|assistant", "content": "..."}],
  "document_context": "...",
  "project_id": "uuid-or-null" }
```
When `project_id` is provided, embeds the last user message via Gemini embeddings and calls `match_knowledge_chunks` RPC in Supabase for RAG context.

**`/ai/generate-tickets`** request body:
```json
{ "user_input": "...", "product_context": "...", "document_context": "..." }
```
Returns structured JSON (non-streaming): `{ "epics": [{ "title", "description", "stories": [{ "title", "description", "acceptance_criteria", "story_points" }] }] }`. Used by `TicketExportModal`. Strips markdown fences if the LLM wraps output in them.

**SSE format** (complete + chat only): backend sends `data: <chunk>\n\n`, newlines escaped as `\\n`. Final frame: `data: [DONE]\n\n`.

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
Phase 3 — Jira and Linear integration management.

```
GET    /integrations/status          → { jira: {connected, domain?, email?}, linear: {connected} }
POST   /integrations/jira            connect Jira  body: {domain, email, api_token}
DELETE /integrations/jira            disconnect
GET    /integrations/jira/projects   → [{key, name, id}]  (requires connected)
POST   /integrations/jira/export     create tickets  body: {project_key, tickets: Epic[]}
POST   /integrations/linear          connect Linear  body: {api_key}
DELETE /integrations/linear          disconnect
GET    /integrations/linear/teams    → [{id, name, key}]  (requires connected)
POST   /integrations/linear/export   create issues   body: {team_id, tickets: Epic[]}
```

All endpoints require `Authorization: Bearer {userId}` header.

**Credentials stored** in `user_integrations` table as JSONB config. Jira verifies via `GET /rest/api/3/myself`. Linear verifies via `{ viewer { id } }` GraphQL query.

**Jira export** creates Epics then Stories under each epic using `customfield_10014` (Epic Link). Uses Atlassian Document Format (ADF) for descriptions via `_adf()` helper.

**Linear export** uses GraphQL `issueCreate` mutation, setting `parentId` to link stories to epics.

**Tickets payload shape** (both Jira and Linear export):
```json
[{ "title": "...", "description": "...", "stories": [{ "title", "description", "acceptance_criteria": [] }] }]
```

---

### `backend/routers/context.py`
Product Brain per-project singleton (stored as a sentinel `context_chunks` row):
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

- Renders `EditorContent` with StarterKit + Placeholder extensions
- Listens for `Cmd+K` / `Ctrl+K` → opens `AICommandModal`
- `onSave` called on every `editor.onUpdate` (debounced 2s in `docs/[docId]/page.tsx`)
- Passes `productContext` from Zustand to `AICommandModal`
- Passes `editor.getText()` as `documentContext` to `AICommandModal`

---

### `cursor-for-pms/src/components/AICommandModal.tsx`
Cmd+K overlay. Props: `{ onClose, onOutput, projectId, productContext, documentContext }`.

Commands: `prd | tickets | brief | update | interview | custom`

Flow:
1. User selects command + types input → clicks Generate or presses Enter
2. Calls `POST /ai/complete` (no auth header)
3. Streams SSE response, unescapes `\\n → \n`
4. On completion: calls `onOutput(fullText)` → Editor inserts text into document
5. Non-tickets commands: modal closes. Tickets command: modal stays open, shows **"Export to Jira / Linear ↗"** button
6. Export button click → renders `<TicketExportModal>` on top; closing the export modal also closes AICommandModal

---

### `cursor-for-pms/src/components/TicketExportModal.tsx`
Phase 3 — structured ticket preview and one-click export. Props: `{ userInput, productContext, documentContext, onClose }`.

On mount (parallel): fetches `GET /integrations/status` + calls `POST /ai/generate-tickets`.

**UI states:** `generating` → main view → `exporting` → `success` / `error`

**Right panel has two modes depending on connection state:**

_No integrations connected_ — shows "Connect your issue tracker" with Jira and Linear cards. Clicking a card expands an inline connect form (no navigation away). `handleConnect` calls `POST /integrations/{type}`, then `refreshStatus()` which re-fetches status and auto-switches to the destination selector. "Connect & Continue" label makes the intent clear.

_At least one connected_ — shows destination selector buttons (Jira / Linear), lazy-loads projects or teams on selection, project/team `<select>` dropdown, then Export button.

After connecting one integration, a dashed `+ Connect Linear` / `+ Connect Jira` button appears so the user can add the second without leaving.

Export calls `POST /integrations/jira/export` or `/linear/export`. Success state lists all created tickets with `ExternalLink` icons.

**Key internal state:**
```typescript
connectingTo: 'jira' | 'linear' | null   // which inline form is open
jiraDomain/jiraEmail/jiraToken            // Jira form fields
linearKey                                 // Linear form field
destination: 'jira' | 'linear' | null    // selected export target
selectedProject / selectedTeam            // chosen Jira project key / Linear team id
exportState: 'idle' | 'exporting' | 'success' | 'error'
```

---

### `cursor-for-pms/src/components/IntegrationSettings.tsx`
Phase 3 — connection management UI. No props (reads userId from `useCustomAuth`).

On mount: fetches `GET /integrations/status`.

Jira card: domain + email + API token inputs → `POST /integrations/jira` (validates credentials before saving). Shows connected domain/email + Disconnect button when connected.

Linear card: API key input → `POST /integrations/linear`. Shows connected status + Disconnect button.

Both cards link to their respective token management pages.

---

### `cursor-for-pms/src/app/projects/[projectId]/settings/page.tsx`
Phase 3 — settings page at `/projects/[id]/settings`. Renders `<IntegrationSettings>`. Accessible via gear icon (⚙) on each project row in the Sidebar.

---

### `cursor-for-pms/src/components/CursorChat.tsx`
Right sidebar chat. No props — reads `projectId` from `useParams()`.

Flow:
1. User types message → sends `POST /ai/chat` with message history + document context + project_id
2. Streams SSE, renders each message bubble
3. "Copy to Apply" button on assistant messages (copies to clipboard)

---

### `cursor-for-pms/src/components/ProductBrain.tsx`
Right sidebar product context. Optional prop `projectId` (falls back to URL params).

- Reads/writes `useProductBrain()` Zustand store only (localStorage)
- Shows char count and "Active" badge
- ⚠️ **Not synced to backend** — `context.py` endpoints unused

---

### `cursor-for-pms/src/components/Sidebar.tsx`
Left panel project + file tree. No props.

**Button layout per project row (Phase 3 update):**
- `Settings2` gear icon — **always visible** (not hover-gated). Dimmed on inactive projects, amber-tinted on active project. Navigates to `/projects/[id]/settings`.
- Edit controls (Pencil rename, FolderPlus, FilePlus, Trash2 delete) — wrapped in a nested `<span>` with `opacity-0 group-hover:opacity-100` so they stay hidden until hover. Keeps the sidebar clean while the settings entry point remains permanently discoverable.

Key state:
```typescript
projects: Project[]               // from GET /projects/
treeByProject: Record<id, {folders, docs}>  // from GET /projects/{id}/tree
expanded: Set<string>             // which projects are expanded
expandedFolders: Set<string>      // which folders are open
pendingCreate: PendingCreate      // inline create input state
```

Auth header factory: `() => ({ Authorization: \`Bearer \${userId}\`, "Content-Type": "application/json" })`

Tree loading: guarded by `loadedProjectsRef` — each project fetched exactly once per session.

---

### `cursor-for-pms/src/components/KnowledgeBase.tsx`
File upload component inside Sidebar. Prop: `{ projectId }`.

- Accepts PDF/DOCX/TXT via `<input type="file">`
- POSTs as FormData to `POST /knowledge/` with `Authorization` header
- Lists uploaded docs, shows delete button
- Download via signed URL

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

### `cursor-for-pms/src/app/projects/[projectId]/page.tsx`
Project home page — shown when navigating to a project without a document open.

On mount fetches (parallel): project list (for name), knowledge docs, **integration status** (`GET /integrations/status`).

**Sections:**
1. Project name header
2. Quick actions grid (New Document, New Folder, Knowledge Base upload)
3. Knowledge Base file list
4. **Integrations / Issue Tracker section (Phase 3)** — two side-by-side cards (Jira, Linear). Connected state: green badge + domain. Disconnected state: `Connect →` link to `/projects/[id]/settings`. Hint copy when both disconnected: *"Connect Jira or Linear to export AI-generated tickets from Cmd+K → Break into tickets."* Settings link in section header.
5. Tips callout

**New state:** `integrations: IntegrationStatus` — `{ jira: {connected, domain?, email?}, linear: {connected} }`

---

### `cursor-for-pms/src/app/projects/[projectId]/docs/[docId]/page.tsx`
Document editor page. Loads doc from `GET /documents/{docId}`, renders `<Editor>`.

Auto-save: debounced 2s via `setTimeout` in `handleSave` — calls `PUT /documents/{docId}`.

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
  -- Product Brain stored as row where title = '__product_brain__'

-- RAG
knowledge_documents (id uuid PK, project_id uuid, user_id text, filename, file_type,
                     storage_path, created_at)
knowledge_chunks    (id uuid PK, knowledge_document_id uuid FK, user_id text,
                     content text, embedding vector(768), created_at)

-- Chat (tables exist, not yet used by frontend)
chat_threads     (id uuid PK, user_id text, project_id uuid, title, created_at, updated_at)
chat_messages    (id uuid PK, thread_id uuid FK, user_id text, role text, content, created_at)

-- Phase 3: Integrations
user_integrations (id uuid PK, user_id text, integration_type text CHECK IN ('jira','linear'),
                   config jsonb,   -- {domain,email,api_token} for Jira | {api_key} for Linear
                   is_active boolean, created_at, updated_at,
                   UNIQUE(user_id, integration_type))
```

### RLS
All tables have `user_id = auth.uid()::text` policy. Backend uses service key (bypasses RLS). Frontend never calls Supabase directly.

### Supabase Storage
Bucket: `knowledge-files`. Path: `{user_id}/{project_id}/{filename}`. Signed URL expiry: 1hr.

### RPC
`match_knowledge_chunks(query_embedding, match_threshold, match_count, p_project_id)` — pgvector similarity search, used by `/ai/chat`.

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

### Dev Mode
```
NEXT_PUBLIC_DEV_MODE=true  →  userId = "dev_user_123", skips Clerk entirely
```
Set in `cursor-for-pms/.env`. Checked in `middleware.ts`, `useCustomAuth.ts`, `lib/auth.ts`.

---

## Known Issues / TODOs

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | `folders` table may not exist in Supabase | Run `supabase_phase1_filetree.sql` | 🔴 High |
| 2 | JWT not verified — raw userId trusted | `backend/deps.py:get_user_id` | 🔴 High |
| 3 | `/ai/complete`, `/ai/chat`, `/ai/generate-tickets` unauthenticated | `backend/routers/ai.py` | 🔴 High |
| 4 | `user_integrations` table not yet in Supabase | Run `supabase_phase3_integrations.sql` | 🔴 Required for Phase 3 |
| 5 | ProductBrain not synced to DB | `frontend/ProductBrain.tsx` → `backend/context.py` unused | 🟡 Medium |
| 6 | RAG embeddings hardcoded to Gemini | `backend/routers/ai.py`, `knowledge.py` | 🟡 Medium |
| 7 | Chat history not persisted | `CursorChat.tsx` — `chat_threads/messages` tables unused | 🟡 Medium |

---

## Phase 3 Status — COMPLETE ✓

### Files created
- [x] `supabase_phase3_integrations.sql` — `user_integrations` table (run in Supabase SQL editor)
- [x] `backend/routers/integrations.py` — connect/disconnect Jira & Linear, list projects/teams, export
- [x] `cursor-for-pms/src/components/IntegrationSettings.tsx` — Jira + Linear connection UI
- [x] `cursor-for-pms/src/components/TicketExportModal.tsx` — ticket tree preview + export
- [x] `cursor-for-pms/src/app/projects/[projectId]/settings/page.tsx` — settings page

### Files modified
- [x] `backend/main.py` — mounts `integrations.router` at `/integrations`
- [x] `backend/routers/ai.py` — added `POST /ai/generate-tickets`
- [x] `cursor-for-pms/src/components/AICommandModal.tsx` — "Export to Jira / Linear ↗" after tickets
- [x] `cursor-for-pms/src/components/Sidebar.tsx` — settings gear always visible; edit controls remain hover-only
- [x] `cursor-for-pms/src/components/TicketExportModal.tsx` — inline connect flow (no navigation away when not connected)
- [x] `cursor-for-pms/src/app/projects/[projectId]/page.tsx` — Integrations section with live status cards
