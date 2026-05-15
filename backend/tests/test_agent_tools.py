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


# ─── _read (unified) ────────────────────────────────────────────────────────

class TestUnifiedRead:
    @pytest.mark.asyncio
    async def test_doc_prefix_dispatches_to_read_doc(self, agent_ctx):
        from agent.tools import _read
        with patch("agent.tools._read_doc", new=AsyncMock(return_value={"summary": "doc!", "sources": []})) as m:
            result = await _read(agent_ctx, source_id="doc:abc-uuid")
        m.assert_awaited_once()
        assert m.call_args.kwargs.get("doc_id") == "abc-uuid"
        assert result["summary"] == "doc!"

    @pytest.mark.asyncio
    async def test_kb_prefix_dispatches_to_read_kb_document(self, agent_ctx):
        from agent.tools import _read
        with patch("agent.tools._read_kb_document", new=AsyncMock(return_value={"summary": "kb!", "sources": []})) as m:
            result = await _read(agent_ctx, source_id="kb:xyz-uuid")
        m.assert_awaited_once()
        assert m.call_args.kwargs.get("knowledge_document_id") == "xyz-uuid"
        assert result["summary"] == "kb!"

    @pytest.mark.asyncio
    async def test_tolerates_trailing_index(self, agent_ctx):
        """search_workspace emits ids like 'doc:uuid:3' — read must strip the index."""
        from agent.tools import _read
        with patch("agent.tools._read_doc", new=AsyncMock(return_value={"summary": "ok", "sources": []})) as m:
            await _read(agent_ctx, source_id="doc:abc-uuid:7")
        assert m.call_args.kwargs.get("doc_id") == "abc-uuid"

    @pytest.mark.asyncio
    async def test_bad_prefix_returns_helpful_error(self, agent_ctx):
        from agent.tools import _read
        result = await _read(agent_ctx, source_id="folder:abc")
        assert "Unknown source_id prefix" in result["summary"]
        assert result["sources"] == []

    @pytest.mark.asyncio
    async def test_no_colon_returns_helpful_error(self, agent_ctx):
        from agent.tools import _read
        result = await _read(agent_ctx, source_id="abc-uuid")
        assert "Bad source_id" in result["summary"]


# ─── Tool inventory per agent ───────────────────────────────────────────────

class TestAgentToolInventory:
    """Verify each agent exposes exactly the tools it should — no more, no less.

    Counts come from the handoff-driven design: each agent has its work tools
    plus the handoff tools relevant to its role.
    """
    def test_pm_tool_count(self):
        from agent.agents import pm
        names = {t["name"] for t in pm.get_tools()}
        expected = {
            "search_workspace", "read", "list_docs",
            "create_doc", "edit_doc", "create_folder",
            "handoff_to_designer", "handoff_to_analyst", "handoff_to_calendar",
        }
        assert names == expected, f"PM tools diverged: {names ^ expected}"

    def test_designer_tool_count(self):
        from agent.agents import designer
        names = {t["name"] for t in designer.get_tools()}
        expected = {"design_brief", "render_ui", "critique_design", "handoff_to_pm"}
        assert names == expected

    def test_analyst_tool_count(self):
        from agent.agents import analyst
        names = {t["name"] for t in analyst.get_tools()}
        expected = {"analyze_data", "search_workspace", "read", "handoff_to_pm"}
        assert names == expected

    def test_calendar_tool_count(self):
        from agent.agents import calendar
        names = {t["name"] for t in calendar.get_tools()}
        expected = {"check_calendar", "handoff_to_pm"}
        assert names == expected

    def test_no_agent_exposes_deprecated_tools(self):
        """search_kb, search_docs, read_doc, read_kb_document must not be in any
        agent's tool list (their schemas were removed from TOOL_SCHEMAS)."""
        from agent.agents import pm, designer, analyst, calendar
        deprecated = {"search_kb", "search_docs", "read_doc", "read_kb_document"}
        for mod in (pm, designer, analyst, calendar):
            names = {t["name"] for t in mod.get_tools()}
            leaked = names & deprecated
            assert not leaked, f"{mod.DISPLAY_NAME} still exposes deprecated tools: {leaked}"


# ─── Handoff & stops-for-input registration ─────────────────────────────────

class TestHandoffWiring:
    def test_handoff_executors_registered(self):
        from agent.tools import TOOL_EXECUTORS, HANDOFF_TOOL_PREFIX
        handoff_names = [n for n in TOOL_EXECUTORS if n.startswith(HANDOFF_TOOL_PREFIX)]
        assert set(handoff_names) == {
            "handoff_to_pm", "handoff_to_designer",
            "handoff_to_analyst", "handoff_to_calendar",
        }

    def test_handoff_schemas_registered(self):
        from agent.tools import TOOL_SCHEMAS, HANDOFF_TOOL_PREFIX
        handoff_schemas = [
            t for t in TOOL_SCHEMAS if t["name"].startswith(HANDOFF_TOOL_PREFIX)
        ]
        assert len(handoff_schemas) == 4
        # handoff_to_designer must accept a structured brief
        designer_schema = next(t for t in handoff_schemas if t["name"] == "handoff_to_designer")
        props = designer_schema["parameters"]["properties"]
        assert "product" in props
        assert "audience" in props
        assert "features" in props

    def test_stops_for_user_input_contains_design_brief(self):
        from agent.tools import STOPS_FOR_USER_INPUT
        assert "design_brief" in STOPS_FOR_USER_INPUT

    def test_design_brief_not_in_requires_permission(self):
        """design_brief uses the stops-for-input path, NOT the permission-gate path."""
        from agent.tools import REQUIRES_PERMISSION
        assert "design_brief" not in REQUIRES_PERMISSION

    @pytest.mark.asyncio
    async def test_handoff_noop_returns_safety_message(self, agent_ctx):
        """If the loop ever forgets to intercept a handoff, the no-op executor
        surfaces a clear message rather than silently doing nothing."""
        from agent.tools import _handoff_noop
        result = await _handoff_noop(agent_ctx, product="X", audience="Y")
        assert "bug" in result["summary"].lower() or "not intercepted" in result["summary"].lower()


# ─── Orchestrator state machine ─────────────────────────────────────────────

def _collect_events(sse_chunks):
    """Parse a list of SSE chunks into (event_type, data) tuples."""
    import json as _json
    events = []
    for chunk in sse_chunks:
        lines = chunk.strip().split("\n")
        event_type = data_str = None
        for line in lines:
            if line.startswith("event: "):
                event_type = line[7:].strip()
            elif line.startswith("data: "):
                data_str = line[6:].strip()
        if event_type:
            try:
                data = _json.loads(data_str) if data_str else {}
            except Exception:
                data = {"raw": data_str}
            events.append((event_type, data))
    return events


class TestOrchestratorStateMachine:
    @pytest.mark.asyncio
    async def test_no_handoff_runs_one_agent_then_done(self, agent_ctx):
        """Router returns 'pm'; agent ends naturally → orchestrator emits done."""
        from agent import orchestrator as orch

        async def fake_loop(**kwargs):
            yield orch._sse("text", {"delta": "Here is the answer."})
            yield orch._sse("_loop_end", {
                "final_text": "Here is the answer.",
                "hit_permission_gate": False, "stopped_for_input": False,
                "handoff_target": None, "handoff_payload": None, "errored": False,
            })

        async def fake_route(message, history):
            return "pm"

        chunks = []
        with patch.object(orch, "run_agent_loop", fake_loop), \
             patch.object(orch, "_route", new=AsyncMock(side_effect=fake_route)):
            async for c in orch.run_orchestrated(
                messages=[{"role": "user", "content": "what's a PRD?"}],
                user_id="u1", project_id=None,
            ):
                chunks.append(c)

        events = _collect_events(chunks)
        types = [t for t, _ in events]
        assert types.count("agent_start") == 1
        assert "done" in types
        # final done payload includes the agent's final text
        done = next(d for t, d in events if t == "done")
        assert "Here is the answer." in done["final_text"]

    @pytest.mark.asyncio
    async def test_pm_to_designer_handoff_switches_agent(self, agent_ctx):
        """PM emits handoff_to_designer → orchestrator runs Designer next."""
        from agent import orchestrator as orch

        call_log = []

        async def fake_loop(*, system, **kwargs):
            # Use the system prompt to detect which agent is running.
            if "PM specialist" in system or "PM research agent" in system or "PM Agent" in (kwargs.get("ctx") or {}).get("_agent", "") or "PMind's PM" in system:
                call_log.append("pm")
                yield orch._sse("tool_call", {"id": "h1", "name": "handoff_to_designer",
                                              "args": {"product": "Acme", "audience": "PMs"},
                                              "status": "running"})
                yield orch._sse("tool_result", {"id": "h1", "summary": "Handing off to Designer.", "sources": []})
                yield orch._sse("_loop_end", {
                    "final_text": "", "hit_permission_gate": False,
                    "stopped_for_input": False,
                    "handoff_target": "designer",
                    "handoff_payload": {"product": "Acme", "audience": "PMs"},
                    "errored": False,
                })
            else:
                call_log.append("designer")
                yield orch._sse("text", {"delta": "Built the page."})
                yield orch._sse("_loop_end", {
                    "final_text": "Built the page.", "hit_permission_gate": False,
                    "stopped_for_input": False, "handoff_target": None,
                    "handoff_payload": None, "errored": False,
                })

        with patch.object(orch, "run_agent_loop", fake_loop), \
             patch.object(orch, "_route", new=AsyncMock(return_value="pm")):
            chunks = []
            async for c in orch.run_orchestrated(
                messages=[{"role": "user", "content": "build me a website"}],
                user_id="u1", project_id=None,
            ):
                chunks.append(c)

        assert call_log == ["pm", "designer"], f"agent sequence was {call_log}"
        events = _collect_events(chunks)
        # Two agent_start events: PM then Designer
        agent_starts = [d["name"] for t, d in events if t == "agent_start"]
        assert agent_starts == ["PM Agent", "Designer"]
        done = next(d for t, d in events if t == "done")
        assert "Built the page." in done["final_text"]

    @pytest.mark.asyncio
    async def test_stops_for_input_terminates(self, agent_ctx):
        """When sub-agent reports stopped_for_input, orchestrator emits done immediately."""
        from agent import orchestrator as orch

        async def fake_loop(**kwargs):
            yield orch._sse("tool_call", {"id": "db1", "name": "design_brief",
                                          "args": {"context": "portfolio"}, "status": "running"})
            yield orch._sse("tool_result", {"id": "db1", "summary": "Form shown.", "sources": []})
            yield orch._sse("_loop_end", {
                "final_text": "", "hit_permission_gate": False,
                "stopped_for_input": True,
                "handoff_target": None, "handoff_payload": None, "errored": False,
            })

        with patch.object(orch, "run_agent_loop", fake_loop), \
             patch.object(orch, "_route", new=AsyncMock(return_value="designer")):
            chunks = []
            async for c in orch.run_orchestrated(
                messages=[{"role": "user", "content": "design a portfolio page"}],
                user_id="u1", project_id=None,
            ):
                chunks.append(c)

        events = _collect_events(chunks)
        types = [t for t, _ in events]
        assert "done" in types
        # No second agent_start — loop halted for user input
        assert sum(1 for t in types if t == "agent_start") == 1

    @pytest.mark.asyncio
    async def test_handoff_chain_capped(self, agent_ctx):
        """If agents keep handing off, the chain is capped at MAX_HANDOFFS."""
        from agent import orchestrator as orch

        # Alternating handoffs: pm → designer → pm → designer → ...
        cycle = ["designer", "pm", "designer", "pm", "designer"]
        idx = {"i": 0}

        async def fake_loop(**kwargs):
            target = cycle[idx["i"] % len(cycle)]
            idx["i"] += 1
            yield orch._sse("_loop_end", {
                "final_text": "", "hit_permission_gate": False,
                "stopped_for_input": False,
                "handoff_target": target,
                "handoff_payload": {"product": "x", "audience": "y"} if target == "designer" else {"query": "more"},
                "errored": False,
            })

        with patch.object(orch, "run_agent_loop", fake_loop), \
             patch.object(orch, "_route", new=AsyncMock(return_value="pm")):
            chunks = []
            async for c in orch.run_orchestrated(
                messages=[{"role": "user", "content": "spin"}],
                user_id="u1", project_id=None,
            ):
                chunks.append(c)

        events = _collect_events(chunks)
        # MAX_HANDOFFS = 3 → starting agent + 3 handoff switches = 4 agent_start events
        agent_starts = sum(1 for t, _ in events if t == "agent_start")
        assert agent_starts == orch.MAX_HANDOFFS + 1, f"got {agent_starts} agent_start events"
        assert "done" in [t for t, _ in events]

    @pytest.mark.asyncio
    async def test_resume_with_pending_decisions_skips_router(self, agent_ctx):
        """When pending_decisions is provided, the agent is picked deterministically
        from the tool name — no router LLM call."""
        from agent import orchestrator as orch

        route_called = {"n": 0}

        async def fake_route(*args, **kwargs):
            route_called["n"] += 1
            return "pm"

        async def fake_loop(**kwargs):
            yield orch._sse("text", {"delta": "Created."})
            yield orch._sse("_loop_end", {
                "final_text": "Created.", "hit_permission_gate": False,
                "stopped_for_input": False, "handoff_target": None,
                "handoff_payload": None, "errored": False,
            })

        messages = [
            {"role": "user", "content": "make a doc"},
            {"role": "assistant", "blocks": [
                {"type": "tool_call", "id": "c1", "name": "create_doc",
                 "args": {"title": "X", "content": "Y"}},
            ]},
        ]
        pending = [{"tool_call_id": "c1", "decision": "approve"}]

        with patch.object(orch, "run_agent_loop", fake_loop), \
             patch.object(orch, "_route", new=AsyncMock(side_effect=fake_route)):
            async for _ in orch.run_orchestrated(
                messages=messages, user_id="u1", project_id=None,
                pending_decisions=pending,
            ):
                pass

        assert route_called["n"] == 0, "Router should not be called on resume"


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
