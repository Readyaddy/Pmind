# PM Cursor 📝🤖

PM Cursor is an AI-native workspace designed specifically for Product Managers. Just like Cursor is an AI-first IDE for engineers, PM Cursor is an AI-first document editor for product workflows. It integrates powerful AI assistance directly into your editing experience, rather than treating it as an afterthought chatbot.

## ✨ What You Can Do With This Right Now

**1. Create and Edit PM Documents with AI**
- Use the **Tiptap-based rich text editor** to write your product documents seamlessly.
- Press **Cmd+K** (or Ctrl+K) to bring up the AI command modal directly within your workflow.
- **Generate content seamlessly**: The AI streams its output directly into your document in real-time.

**2. Built-in PM Workflows**
The AI is pre-configured with prompt templates tailored for standard Product Management tasks:
- **PRD Writing**: Generate sections or entire Product Requirements Documents.
- **Ticket Breakdown**: Break down features into User Stories and Acceptance Criteria.
- **Product Briefs**: Draft concise one-pagers and product briefs.
- **User Research**: Synthesize raw user research notes into actionable insights.
- **Stakeholder Updates**: Draft structured updates to keep your team aligned.
- **Custom Commands**: Ask the AI to write, rewrite, expand, or brainstorm anything else.

**3. The "Product Brain"**
- A dedicated right sidebar where you can paste your overarching **product strategy, target audience, and context**.
- **Contextual AI**: This "Product Brain" context is automatically injected into *every* AI request you make. This ensures the AI generates highly specific, grounded output for your actual product, rather than generic templates.
- Currently, this context is auto-saved locally to your browser.

**4. Document Management & Auto-Save**
- View and manage your documents in the left sidebar.
- **Auto-save**: Your document edits are debounced and automatically saved to Supabase every 2 seconds so you never lose your work.

---

## 🛠️ Architecture & Tech Stack

This project is split into a modern frontend and a powerful API backend.

**Frontend (`/cursor-for-pms`)**
- **Framework**: Next.js 14 (App Router) with TypeScript
- **Editor**: Tiptap (ProseMirror)
- **Styling**: Tailwind CSS + shadcn/ui primitives
- **State Management**: Zustand (for persisting Product Brain context)
- **Authentication**: Clerk (`@clerk/nextjs`)

**Backend (`/backend`)**
- **Framework**: FastAPI (Python) + Uvicorn
- **Database**: Supabase (PostgreSQL)
- **LLM Integration**: Pluggable Strategy Pattern supporting Google Gemini (default), Anthropic Claude, and OpenAI. Uses Server-Sent Events (SSE) for streaming text.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Accounts for [Clerk](https://clerk.com/) (Auth), [Supabase](https://supabase.com/) (Database), and your chosen LLM provider (Gemini/Claude/OpenAI).

### 1. Database Setup
Run the SQL script provided in `supabase_schema.sql` in your Supabase SQL editor to create the necessary `documents` and `context_chunks` tables with Row Level Security (RLS) configured.

### 2. Backend Setup
Navigate to the backend directory and set up a virtual environment:
```bash
cd backend
python -m venv venv

# On Windows:
venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory (use `.env.example` as a reference) and add your keys. You can easily switch LLM providers:
```env
# Example using Gemini
LLM_PROVIDER=gemini
LLM_MODEL=gemini-1.5-flash
GOOGLE_API_KEY=your_api_key_here
```

Start the backend server:
```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup
Open a new terminal and install the frontend dependencies:
```bash
cd cursor-for-pms
npm install
```

Create a `.env.local` file in the `cursor-for-pms` directory (refer to `.env.local.example`) and add your Clerk and backend URLs:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Start the frontend server:
```bash
npm run dev
```

Visit `http://localhost:3000` to sign in and start writing!

---

## 🗺️ Roadmap (Upcoming Features)
- **Stage 2**: Migrate Product Brain storage from local storage to Supabase `context_chunks`.
- **Stage 2**: Implement `pgvector` for semantic context retrieval.
- **Stage 2**: Integrations with Linear, Jira, and Notion.
- **Stage 3**: Team workspaces and shared Product Brains.
- **Stage 4**: Stripe billing integration.
