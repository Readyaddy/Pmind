"""
Shared fixtures for the PM Cursor backend test suite.
"""
import os
import sys
import pytest

# Make sure 'backend/' is on the path so imports like `from agent.tools import …` work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ------------------------------------------------------------------
# Environment stubs: prevent real API calls during tests
# ------------------------------------------------------------------
os.environ.setdefault("GOOGLE_API_KEY", "test-key")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("LLM_PROVIDER", "gemini")
os.environ.setdefault("LLM_MODEL", "gemini-2.5-flash-lite")
os.environ.setdefault("NEXT_PUBLIC_DEV_MODE", "true")


# ------------------------------------------------------------------
# Common mock data factories
# ------------------------------------------------------------------

def make_kb_chunk(
    doc_id: str = "kb-doc-uuid-1",
    content: str = "Users said checkout is confusing and slow.",
    similarity: float = 0.85,
):
    return {
        "id": "chunk-uuid-1",
        "knowledge_document_id": doc_id,
        "content": content,
        "similarity": similarity,
    }


def make_doc_chunk(
    document_id: str = "pm-doc-uuid-1",
    project_id: str = "proj-uuid-1",
    content: str = "Q3 roadmap: ship checkout redesign by end of August.",
    similarity: float = 0.80,
):
    return {
        "id": "doc-chunk-uuid-1",
        "document_id": document_id,
        "project_id": project_id,
        "content": content,
        "similarity": similarity,
    }


def make_kb_document(doc_id: str = "kb-doc-uuid-1", filename: str = "customer_interviews.pdf"):
    return {"id": doc_id, "filename": filename}


def make_pm_document(doc_id: str = "pm-doc-uuid-1", title: str = "Q3 Roadmap"):
    return {"id": doc_id, "title": title, "content": {"type": "doc", "content": []}}


@pytest.fixture
def agent_ctx():
    return {"user_id": "dev_user_123", "project_id": "proj-uuid-1"}


@pytest.fixture
def agent_ctx_no_project():
    return {"user_id": "dev_user_123", "project_id": None}
