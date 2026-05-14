"""
Unit tests for agent tool executors.

Run from backend/ directory:
    pip install -r requirements-test.txt
    pytest tests/ -v

All Supabase and Gemini API calls are mocked — no real network traffic.
"""
import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

from tests.conftest import (
    make_kb_chunk, make_doc_chunk, make_kb_document, make_pm_document
)


# ─── helpers ────────────────────────────────────────────────────────────────

def _rpc_result(rows):
    m = MagicMock()
    m.data = rows
    return m


def _table_result(rows):
    m = MagicMock()
    m.data = rows
    return m


def _fake_vector():
    return [0.1] * 768


# ─── _search_kb ─────────────────────────────────────────────────────────────

class TestSearchKb:
    @pytest.mark.asyncio
    async def test_returns_excerpts_and_sources(self, agent_ctx):
        chunk = make_kb_chunk()
        kb_doc = make_kb_document()

        supabase_mock = MagicMock()
        supabase_mock.rpc.return_value.execute.return_value = _rpc_result([chunk])
        supabase_mock.table.return_value.select.return_value.in_.return_value.execute.return_value = \
            _table_result([kb_doc])

        with patch("agent.tools._embed", return_value=_fake_vector()), \
             patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _search_kb
            result = await _search_kb(agent_ctx, query="checkout pain points")

        assert "Found 1 excerpt" in result["summary"]
        assert len(result["sources"]) == 1
        assert result["sources"][0]["kind"] == "kb"
        assert "checkout is confusing" in result["data"]

    @pytest.mark.asyncio
    async def test_no_project_returns_early(self, agent_ctx_no_project):
        from agent.tools import _search_kb
        result = await _search_kb(agent_ctx_no_project, query="anything")
        assert "No active project" in result["summary"]
        assert result["sources"] == []

    @pytest.mark.asyncio
    async def test_empty_results_handled(self, agent_ctx):
        supabase_mock = MagicMock()
        supabase_mock.rpc.return_value.execute.return_value = _rpc_result([])

        with patch("agent.tools._embed", return_value=_fake_vector()), \
             patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _search_kb
            result = await _search_kb(agent_ctx, query="nonexistent topic")

        assert "No relevant excerpts" in result["summary"]
        assert result["sources"] == []


# ─── _read_doc ───────────────────────────────────────────────────────────────

class TestReadDoc:
    @pytest.mark.asyncio
    async def test_returns_plain_text(self, agent_ctx):
        tiptap_content = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Hello PRD world."}]}
            ],
        }
        doc = {"id": "pm-doc-uuid-1", "title": "My PRD", "content": tiptap_content}

        supabase_mock = MagicMock()
        supabase_mock.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = \
            _table_result(doc)

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _read_doc
            result = await _read_doc(agent_ctx, doc_id="pm-doc-uuid-1")

        assert "Hello PRD world" in result["data"]
        assert result["sources"][0]["kind"] == "doc"
        assert "My PRD" in result["summary"]

    @pytest.mark.asyncio
    async def test_not_found_returns_error(self, agent_ctx):
        supabase_mock = MagicMock()
        supabase_mock.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = \
            Exception("PGRST116")

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _read_doc
            result = await _read_doc(agent_ctx, doc_id="bad-id")

        assert "not found" in result["summary"].lower() or "denied" in result["summary"].lower()


# ─── _search_workspace ──────────────────────────────────────────────────────

class TestSearchWorkspace:
    @pytest.mark.asyncio
    async def test_merges_kb_and_doc_results(self, agent_ctx):
        kb_chunk = make_kb_chunk(similarity=0.90)
        doc_chunk = make_doc_chunk(similarity=0.75)
        kb_doc = make_kb_document()
        pm_doc = make_pm_document()

        supabase_mock = MagicMock()
        # match_knowledge_chunks RPC
        # match_document_chunks RPC
        # Alternate returns based on call order
        call_count = [0]
        def rpc_side_effect(name, params):
            m = MagicMock()
            if name == "match_knowledge_chunks":
                m.execute.return_value = _rpc_result([kb_chunk])
            else:
                m.execute.return_value = _rpc_result([doc_chunk])
            return m

        supabase_mock.rpc.side_effect = rpc_side_effect

        def table_side_effect(name):
            m = MagicMock()
            if name == "knowledge_documents":
                m.select.return_value.in_.return_value.execute.return_value = _table_result([kb_doc])
            elif name == "documents":
                m.select.return_value.eq.return_value.in_.return_value.execute.return_value = _table_result([pm_doc])
            return m

        supabase_mock.table.side_effect = table_side_effect

        with patch("agent.tools._embed", return_value=_fake_vector()), \
             patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _search_workspace
            result = await _search_workspace(agent_ctx, query="checkout roadmap")

        assert "1 from knowledge base" in result["summary"]
        assert "1 from PM documents" in result["summary"]
        # KB result has higher similarity → should appear first in data
        assert result["data"].index("(KB)") < result["data"].index("(Doc)")
        assert len(result["sources"]) == 2

    @pytest.mark.asyncio
    async def test_degrades_gracefully_when_doc_chunks_missing(self, agent_ctx):
        """Table may not exist if migration hasn't run — only KB results returned."""
        kb_chunk = make_kb_chunk()
        kb_doc = make_kb_document()

        supabase_mock = MagicMock()

        def rpc_side_effect(name, params):
            m = MagicMock()
            if name == "match_knowledge_chunks":
                m.execute.return_value = _rpc_result([kb_chunk])
            else:
                m.execute.side_effect = Exception("relation document_chunks does not exist")
            return m

        supabase_mock.rpc.side_effect = rpc_side_effect
        supabase_mock.table.return_value.select.return_value.in_.return_value.execute.return_value = \
            _table_result([kb_doc])

        with patch("agent.tools._embed", return_value=_fake_vector()), \
             patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _search_workspace
            result = await _search_workspace(agent_ctx, query="checkout")

        # Should still return KB results without crashing
        assert "1 from knowledge base" in result["summary"]
        assert len(result["sources"]) == 1

    @pytest.mark.asyncio
    async def test_no_project_returns_early(self, agent_ctx_no_project):
        from agent.tools import _search_workspace
        result = await _search_workspace(agent_ctx_no_project, query="anything")
        assert "No active project" in result["summary"]

    @pytest.mark.asyncio
    async def test_top_k_respected(self, agent_ctx):
        chunks = [make_kb_chunk(content=f"chunk {i}", similarity=0.9 - i * 0.05) for i in range(8)]

        supabase_mock = MagicMock()

        def rpc_side_effect(name, params):
            m = MagicMock()
            if name == "match_knowledge_chunks":
                m.execute.return_value = _rpc_result(chunks)
            else:
                m.execute.return_value = _rpc_result([])
            return m

        supabase_mock.rpc.side_effect = rpc_side_effect
        supabase_mock.table.return_value.select.return_value.in_.return_value.execute.return_value = \
            _table_result([make_kb_document()])

        with patch("agent.tools._embed", return_value=_fake_vector()), \
             patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _search_workspace
            result = await _search_workspace(agent_ctx, query="content", top_k=3)

        assert len(result["sources"]) == 3

    @pytest.mark.asyncio
    async def test_empty_workspace_returns_helpful_message(self, agent_ctx):
        supabase_mock = MagicMock()
        supabase_mock.rpc.return_value.execute.return_value = _rpc_result([])

        with patch("agent.tools._embed", return_value=_fake_vector()), \
             patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _search_workspace
            result = await _search_workspace(agent_ctx, query="blockers")

        assert "No relevant results" in result["summary"]
        assert "list_docs" in result["summary"]  # suggests fallback


# ─── _read_kb_document ──────────────────────────────────────────────────────

class TestReadKbDocument:
    @pytest.mark.asyncio
    async def test_returns_full_concatenated_text(self, agent_ctx):
        kb_doc = make_kb_document()
        chunks = [
            {"content": "Part one of the interview.", "created_at": "2025-01-01T00:00:00Z"},
            {"content": "Part two continues here.", "created_at": "2025-01-01T00:00:01Z"},
        ]

        supabase_mock = MagicMock()

        def table_side_effect(name):
            m = MagicMock()
            if name == "knowledge_documents":
                m.select.return_value.eq.return_value.eq.return_value.execute.return_value = \
                    _table_result([kb_doc])
            elif name == "knowledge_chunks":
                (m.select.return_value.eq.return_value.eq.return_value
                 .order.return_value.execute.return_value) = _table_result(chunks)
            return m

        supabase_mock.table.side_effect = table_side_effect

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _read_kb_document
            result = await _read_kb_document(agent_ctx, knowledge_document_id="kb-doc-uuid-1")

        assert "Part one" in result["data"]
        assert "Part two" in result["data"]
        assert result["sources"][0]["kind"] == "kb"
        assert "customer_interviews.pdf" in result["summary"]

    @pytest.mark.asyncio
    async def test_not_found_returns_error(self, agent_ctx):
        supabase_mock = MagicMock()
        supabase_mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = \
            _table_result([])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _read_kb_document
            result = await _read_kb_document(agent_ctx, knowledge_document_id="bad-id")

        assert "not found" in result["summary"].lower()

    @pytest.mark.asyncio
    async def test_empty_chunks_handled(self, agent_ctx):
        kb_doc = make_kb_document()

        supabase_mock = MagicMock()

        def table_side_effect(name):
            m = MagicMock()
            if name == "knowledge_documents":
                m.select.return_value.eq.return_value.eq.return_value.execute.return_value = \
                    _table_result([kb_doc])
            elif name == "knowledge_chunks":
                (m.select.return_value.eq.return_value.eq.return_value
                 .order.return_value.execute.return_value) = _table_result([])
            return m

        supabase_mock.table.side_effect = table_side_effect

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _read_kb_document
            result = await _read_kb_document(agent_ctx, knowledge_document_id="kb-doc-uuid-1")

        assert "No content found" in result["summary"]


# ─── documents router background task ────────────────────────────────────────

class TestEmbedDocumentChunks:
    """Tests for the background embedding task in routers/documents.py."""

    def test_chunks_inserted_on_content_save(self):
        tiptap_content = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [
                    {"type": "text", "text": "This is a product requirements document."}
                ]}
            ],
        }
        fake_vector = [0.2] * 768
        fake_emb = MagicMock()
        fake_emb.values = fake_vector

        supabase_mock = MagicMock()
        supabase_mock.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
        supabase_mock.table.return_value.insert.return_value.execute.return_value = MagicMock()

        fake_embeddings_res = MagicMock()
        fake_embeddings_res.embeddings = [fake_emb]

        with patch("routers.documents.get_supabase", return_value=supabase_mock), \
             patch("routers.documents.os.getenv", return_value="test-key"):
            import sys
            # Patch the genai client
            genai_mock = MagicMock()
            genai_mock.Client.return_value.models.embed_content.return_value = fake_embeddings_res

            with patch.dict("sys.modules", {"google": MagicMock(), "google.genai": genai_mock}):
                from routers.documents import _embed_document_chunks
                _embed_document_chunks(
                    doc_id="doc-uuid-1",
                    project_id="proj-uuid-1",
                    user_id="user-1",
                    content=tiptap_content,
                )

        # Verify delete + insert were called
        supabase_mock.table.assert_any_call("document_chunks")

    def test_empty_content_skips_embedding(self):
        empty_content = {"type": "doc", "content": []}
        supabase_mock = MagicMock()

        with patch("routers.documents.get_supabase", return_value=supabase_mock):
            from routers.documents import _embed_document_chunks
            _embed_document_chunks("d1", "p1", "u1", empty_content)

        # No Supabase calls should have been made
        supabase_mock.table.assert_not_called()


# ─── _tiptap_to_text ────────────────────────────────────────────────────────

class TestTiptapToText:
    def test_extracts_text_from_nested_content(self):
        from agent.tools import _tiptap_to_text
        content = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Hello "}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "world."}]},
            ],
        }
        result = _tiptap_to_text(content)
        assert "Hello" in result
        assert "world" in result

    def test_handles_empty_doc(self):
        from agent.tools import _tiptap_to_text
        assert _tiptap_to_text({}) == ""
        assert _tiptap_to_text(None) == ""
        assert _tiptap_to_text({"type": "doc", "content": []}) == ""

    def test_handles_plain_string(self):
        from agent.tools import _tiptap_to_text
        assert _tiptap_to_text("plain text") == "plain text"
