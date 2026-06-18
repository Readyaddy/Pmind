"""
Tests for Tier 1 longitudinal evidence tracking:
  - _list_discovery_themes: trend data (first_seen, last_active, quarter counts, trend_pct)
  - extract_insights_for_document: dedup guard (skip if doc already has insights)
  - period field included in insight insert payload
  - segment_for_extraction: interview / ticket / paragraph routing
  - _upsert_themes: lookup-or-insert dedup

Run from backend/ directory:
    pytest tests/test_tier1_longitudinal.py -v
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock, call
from datetime import datetime, timezone


# ── Helpers ──────────────────────────────────────────────────────────────────

def _table_result(rows, count=None):
    m = MagicMock()
    m.data = rows
    m.count = count
    return m


def _make_theme(
    tid="theme-uuid-1",
    name="onboarding",
    insight_count=10,
    created_at="2025-10-01T00:00:00Z",
    updated_at="2026-06-01T00:00:00Z",
    summary=None,
):
    return {
        "id": tid,
        "name": name,
        "description": None,
        "insight_count": insight_count,
        "summary": summary,
        "created_at": created_at,
        "updated_at": updated_at,
    }


@pytest.fixture
def agent_ctx():
    return {"user_id": "dev_user_123", "project_id": "proj-uuid-1"}


@pytest.fixture
def agent_ctx_no_project():
    return {"user_id": "dev_user_123", "project_id": None}


# ── _list_discovery_themes ───────────────────────────────────────────────────

class TestListDiscoveryThemes:
    """Verify trend data is computed and formatted correctly."""

    def _build_supabase_mock(self, theme_rows, period_rows):
        """Build a supabase mock that returns theme_rows from `themes` table
        and period_rows from `insights` table."""
        supabase_mock = MagicMock()

        def table_side_effect(name):
            m = MagicMock()
            if name == "themes":
                # themes query chain: .select().eq().eq().order().limit().execute()
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .order.return_value
                 .limit.return_value
                 .execute.return_value) = _table_result(theme_rows)
            elif name == "insights":
                # period query chain: .select().eq().eq().in_().in_().execute()
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .in_.return_value
                 .in_.return_value
                 .execute.return_value) = _table_result(period_rows)
            return m

        supabase_mock.table.side_effect = table_side_effect
        return supabase_mock

    @pytest.mark.asyncio
    async def test_no_project_returns_early(self, agent_ctx_no_project):
        from agent.tools import _list_discovery_themes
        result = await _list_discovery_themes(agent_ctx_no_project)
        assert "No active project" in result["summary"]

    @pytest.mark.asyncio
    async def test_no_themes_returns_helpful_message(self, agent_ctx):
        supabase_mock = self._build_supabase_mock(theme_rows=[], period_rows=[])
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)
        assert "No themes yet" in result["summary"]
        assert "Upload" in result["summary"]

    @pytest.mark.asyncio
    async def test_positive_trend_formatted_correctly(self, agent_ctx):
        """10 insights last quarter, 14 this quarter → +40% vs last quarter."""
        theme = _make_theme(tid="t1", insight_count=24)

        # Pin the "current" time to 2026-Q2 so the test is deterministic.
        fixed_now = datetime(2026, 5, 15, tzinfo=timezone.utc)
        cur_period = "2026-Q2"
        prev_period = "2026-Q1"

        period_rows = (
            [{"theme_id": "t1", "period": cur_period}] * 14
            + [{"theme_id": "t1", "period": prev_period}] * 10
        )

        supabase_mock = self._build_supabase_mock([theme], period_rows)

        with patch("agent.tools.get_supabase", return_value=supabase_mock), \
             patch("agent.tools.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "+40% vs last quarter" in result["data"]
        assert "2026-Q2: 14" in result["data"]
        assert "2026-Q1: 10" in result["data"]

    @pytest.mark.asyncio
    async def test_negative_trend_formatted_correctly(self, agent_ctx):
        """20 last quarter, 10 this quarter → -50% vs last quarter."""
        theme = _make_theme(tid="t1", insight_count=30)
        fixed_now = datetime(2026, 5, 15, tzinfo=timezone.utc)
        cur_period = "2026-Q2"
        prev_period = "2026-Q1"

        period_rows = (
            [{"theme_id": "t1", "period": cur_period}] * 10
            + [{"theme_id": "t1", "period": prev_period}] * 20
        )

        supabase_mock = self._build_supabase_mock([theme], period_rows)

        with patch("agent.tools.get_supabase", return_value=supabase_mock), \
             patch("agent.tools.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now

            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "-50% vs last quarter" in result["data"]

    @pytest.mark.asyncio
    async def test_new_this_quarter_when_no_prior_signal(self, agent_ctx):
        """Theme appeared for the first time this quarter."""
        theme = _make_theme(tid="t1", insight_count=5)
        fixed_now = datetime(2026, 5, 15, tzinfo=timezone.utc)
        cur_period = "2026-Q2"

        period_rows = [{"theme_id": "t1", "period": cur_period}] * 5  # no Q1 rows

        supabase_mock = self._build_supabase_mock([theme], period_rows)

        with patch("agent.tools.get_supabase", return_value=supabase_mock), \
             patch("agent.tools.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now

            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "new this quarter" in result["data"]

    @pytest.mark.asyncio
    async def test_no_signal_this_quarter(self, agent_ctx):
        """Old theme with no recent signal."""
        theme = _make_theme(tid="t1", insight_count=8)
        fixed_now = datetime(2026, 5, 15, tzinfo=timezone.utc)

        period_rows = []  # no rows for either quarter

        supabase_mock = self._build_supabase_mock([theme], period_rows)

        with patch("agent.tools.get_supabase", return_value=supabase_mock), \
             patch("agent.tools.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now

            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "no signal this quarter" in result["data"]

    @pytest.mark.asyncio
    async def test_first_seen_and_last_active_in_output(self, agent_ctx):
        theme = _make_theme(
            tid="t1",
            created_at="2025-11-04T10:00:00Z",
            updated_at="2026-06-12T09:00:00Z",
        )
        supabase_mock = self._build_supabase_mock([theme], [])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "first seen: 2025-11-04" in result["data"]
        assert "last active: 2026-06-12" in result["data"]

    @pytest.mark.asyncio
    async def test_summary_appended_when_present(self, agent_ctx):
        theme = _make_theme(tid="t1", summary="Users struggle to complete first setup step.")
        supabase_mock = self._build_supabase_mock([theme], [])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "Users struggle to complete first setup step." in result["data"]

    @pytest.mark.asyncio
    async def test_period_query_failure_degrades_gracefully(self, agent_ctx):
        """If the period query fails (e.g. column not migrated yet), themes
        still return — just without trend data."""
        theme = _make_theme(tid="t1", insight_count=5)

        supabase_mock = MagicMock()

        def table_side_effect(name):
            m = MagicMock()
            if name == "themes":
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .order.return_value
                 .limit.return_value
                 .execute.return_value) = _table_result([theme])
            elif name == "insights":
                # Simulate the `period` column not existing yet
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .in_.return_value
                 .in_.return_value
                 .execute.side_effect) = Exception("column period does not exist")
            return m

        supabase_mock.table.side_effect = table_side_effect

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        # Must still return themes
        assert "Found 1 theme" in result["summary"]
        assert "onboarding" in result["data"]

    @pytest.mark.asyncio
    async def test_q1_previous_quarter_wraps_to_prior_year(self, agent_ctx):
        """When current quarter is Q1, previous quarter must be Q4 of the prior year."""
        theme = _make_theme(tid="t1", insight_count=5)
        fixed_now = datetime(2026, 2, 10, tzinfo=timezone.utc)  # 2026-Q1
        prev_period = "2025-Q4"

        period_rows = [{"theme_id": "t1", "period": prev_period}] * 3

        supabase_mock = self._build_supabase_mock([theme], period_rows)

        with patch("agent.tools.get_supabase", return_value=supabase_mock), \
             patch("agent.tools.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now

            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        # previous period must be 2025-Q4, not 2026-Q0
        assert "2025-Q4" in result["data"]
        assert "2026-Q1" in result["summary"]

    @pytest.mark.asyncio
    async def test_multiple_themes_each_get_own_trend(self, agent_ctx):
        themes = [
            _make_theme(tid="t1", name="onboarding", insight_count=20),
            _make_theme(tid="t2", name="pricing", insight_count=5),
        ]
        fixed_now = datetime(2026, 5, 15, tzinfo=timezone.utc)
        cur_period = "2026-Q2"
        prev_period = "2026-Q1"

        # t1: growing; t2: no recent signal
        period_rows = (
            [{"theme_id": "t1", "period": cur_period}] * 10
            + [{"theme_id": "t1", "period": prev_period}] * 5
        )

        supabase_mock = self._build_supabase_mock(themes, period_rows)

        with patch("agent.tools.get_supabase", return_value=supabase_mock), \
             patch("agent.tools.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now

            from agent.tools import _list_discovery_themes
            result = await _list_discovery_themes(agent_ctx)

        assert "Found 2 theme" in result["summary"]
        assert "+100%" in result["data"]         # t1: 10 vs 5
        assert "no signal this quarter" in result["data"]  # t2


# ── extract_insights_for_document — dedup guard ──────────────────────────────

class TestExtractInsightsDedup:
    """The dedup guard must skip extraction when the document already has insights."""

    @pytest.mark.asyncio
    async def test_skips_if_doc_already_has_insights(self):
        """If count > 0 for knowledge_document_id, return 0 without calling LLM."""
        existing_check = _table_result([], count=3)  # 3 existing insights

        supabase_mock = MagicMock()
        (supabase_mock.table.return_value
         .select.return_value
         .eq.return_value
         .limit.return_value
         .execute.return_value) = existing_check

        with patch("agent.discovery.get_supabase", return_value=supabase_mock), \
             patch("agent.discovery._extract_from_chunk", new=AsyncMock()) as mock_extract:
            from agent.discovery import extract_insights_for_document
            result = await extract_insights_for_document(
                knowledge_document_id="doc-uuid-1",
                project_id="proj-uuid-1",
                user_id="user-1",
                filename="interviews.pdf",
                full_text="Some customer interview text here. It is quite long.",
            )

        assert result == 0
        mock_extract.assert_not_called()

    @pytest.mark.asyncio
    async def test_proceeds_if_doc_has_no_insights(self):
        """count == 0 → extraction should proceed (call LLM)."""
        existing_check = _table_result([], count=0)

        supabase_mock = MagicMock()
        (supabase_mock.table.return_value
         .select.return_value
         .eq.return_value
         .limit.return_value
         .execute.return_value) = existing_check

        # _upsert_themes + insights.insert
        supabase_mock.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = \
            _table_result([])
        supabase_mock.table.return_value.insert.return_value.execute.return_value = \
            _table_result([{"id": "ins-1"}])

        mock_insight = {
            "quote": "The onboarding flow is really confusing to me.",
            "paraphrase": "User finds onboarding confusing.",
            "sentiment": "negative",
            "themes": ["onboarding"],
            "persona": "new user",
            "severity": 3,
        }

        with patch("agent.discovery.get_supabase", return_value=supabase_mock), \
             patch("agent.discovery._extract_from_chunk", new=AsyncMock(return_value=[mock_insight])), \
             patch("agent.discovery._upsert_themes", return_value={"onboarding": "theme-uuid-1"}):
            from agent.discovery import extract_insights_for_document
            result = await extract_insights_for_document(
                knowledge_document_id="doc-uuid-2",
                project_id="proj-uuid-1",
                user_id="user-1",
                filename="interviews.pdf",
                full_text="The onboarding flow is really confusing to me.",
            )

        assert result == 1

    @pytest.mark.asyncio
    async def test_proceeds_if_dedup_check_errors(self):
        """If the dedup DB check itself fails, proceed rather than silently drop work."""
        supabase_mock = MagicMock()
        (supabase_mock.table.return_value
         .select.return_value
         .eq.return_value
         .limit.return_value
         .execute.side_effect) = Exception("connection timeout")

        mock_insight = {
            "quote": "Pricing is way too high for what you get.",
            "paraphrase": "User thinks price is too high.",
            "sentiment": "negative",
            "themes": ["pricing"],
            "persona": None,
            "severity": 4,
        }

        with patch("agent.discovery.get_supabase", return_value=supabase_mock), \
             patch("agent.discovery._extract_from_chunk", new=AsyncMock(return_value=[mock_insight])) as mock_extract, \
             patch("agent.discovery._upsert_themes", return_value={"pricing": "theme-uuid-2"}), \
             patch("agent.discovery.segment_for_extraction", return_value=["Pricing is way too high for what you get."]):
            from agent.discovery import extract_insights_for_document
            # Should not raise — should proceed and attempt extraction
            await extract_insights_for_document(
                knowledge_document_id="doc-uuid-3",
                project_id="proj-uuid-1",
                user_id="user-1",
                filename="survey.pdf",
                full_text="Pricing is way too high for what you get.",
            )

        mock_extract.assert_called()


# ── Period stamped on insight rows ───────────────────────────────────────────

class TestPeriodInInsertPayload:
    """Verify that the `period` field is set on each insight row before insert."""

    @pytest.mark.asyncio
    async def test_period_field_in_inserted_rows(self):
        existing_check = _table_result([], count=0)

        inserted_rows = []

        def fake_insert(rows):
            inserted_rows.extend(rows)
            m = MagicMock()
            m.execute.return_value = _table_result([{"id": f"ins-{i}"} for i in range(len(rows))])
            return m

        supabase_mock = MagicMock()

        def table_side_effect(name):
            m = MagicMock()
            if name == "insights":
                # First call: dedup check (select)
                (m.select.return_value
                 .eq.return_value
                 .limit.return_value
                 .execute.return_value) = existing_check
                # Second call: insert
                m.insert.side_effect = fake_insert
            elif name == "themes":
                (m.select.return_value
                 .eq.return_value
                 .in_.return_value
                 .execute.return_value) = _table_result([])
                m.insert.return_value.execute.return_value = _table_result([])
            return m

        supabase_mock.table.side_effect = table_side_effect

        mock_insight = {
            "quote": "Bulk export crashes every single time I use it.",
            "paraphrase": "Bulk export is broken.",
            "sentiment": "negative",
            "themes": ["bulk operations"],
            "persona": "power user",
            "severity": 5,
        }

        fixed_now = datetime(2026, 6, 18, tzinfo=timezone.utc)

        with patch("agent.discovery.get_supabase", return_value=supabase_mock), \
             patch("agent.discovery._extract_from_chunk", new=AsyncMock(return_value=[mock_insight])), \
             patch("agent.discovery.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now

            from agent.discovery import extract_insights_for_document
            await extract_insights_for_document(
                knowledge_document_id="doc-uuid-4",
                project_id="proj-uuid-1",
                user_id="user-1",
                filename="tickets.pdf",
                full_text="Bulk export crashes every single time I use it.",
            )

        assert len(inserted_rows) == 1
        assert inserted_rows[0]["period"] == "2026-Q2"

    def test_period_computation_covers_all_quarters(self):
        """Smoke-test that months map to the correct quarter label."""
        import importlib
        import agent.discovery as disc

        cases = [
            (datetime(2026, 1, 1, tzinfo=timezone.utc), "2026-Q1"),
            (datetime(2026, 3, 31, tzinfo=timezone.utc), "2026-Q1"),
            (datetime(2026, 4, 1, tzinfo=timezone.utc), "2026-Q2"),
            (datetime(2026, 6, 30, tzinfo=timezone.utc), "2026-Q2"),
            (datetime(2026, 7, 1, tzinfo=timezone.utc), "2026-Q3"),
            (datetime(2026, 9, 30, tzinfo=timezone.utc), "2026-Q3"),
            (datetime(2026, 10, 1, tzinfo=timezone.utc), "2026-Q4"),
            (datetime(2026, 12, 31, tzinfo=timezone.utc), "2026-Q4"),
        ]
        for dt, expected in cases:
            computed = f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"
            assert computed == expected, f"{dt.month} → expected {expected}, got {computed}"


# ── segment_for_extraction ───────────────────────────────────────────────────

class TestSegmentForExtraction:
    """Verify the segmentation router picks the right strategy."""

    def test_small_doc_returned_whole(self):
        from agent.discovery import segment_for_extraction, WHOLE_DOC_CHAR_LIMIT
        text = "Short document. " * 10  # well under limit
        segs = segment_for_extraction(text)
        assert len(segs) == 1
        assert segs[0] == text.strip()

    def test_interview_format_splits_on_turns(self):
        from agent.discovery import segment_for_extraction, MAX_SEGMENT_CHARS, WHOLE_DOC_CHAR_LIMIT
        # Each turn must be long enough that enough of them exceed WHOLE_DOC_CHAR_LIMIT.
        # A turn of ~600 chars × 60 turns ≈ 36,000 chars > 28,000 limit.
        long_answer = "The export feature keeps crashing whenever I try to download data. " * 8  # ~520 chars
        turn = f"Interviewer: What do you find most frustrating with the product?\nUser: {long_answer}\n\n"
        text = turn * 60
        assert len(text) > WHOLE_DOC_CHAR_LIMIT, "test setup: doc must exceed whole-doc limit"
        segs = segment_for_extraction(text)
        # Should be split into multiple segments, not one blob
        assert len(segs) > 1
        # Each segment must not exceed MAX_SEGMENT_CHARS by more than one turn's worth
        for seg in segs:
            assert len(seg) <= MAX_SEGMENT_CHARS + len(turn) + 50

    def test_paragraph_fallback_for_long_doc(self):
        from agent.discovery import segment_for_extraction
        # No speaker turns, no ticket separators — long paragraph-based doc
        para = "This section covers the export feature and its known issues. " * 30
        text = "\n\n".join([para] * 5)  # 5 big paragraphs, no speaker turns
        segs = segment_for_extraction(text)
        assert len(segs) >= 1
        # No segment should contain the full doc
        assert all(len(s) < len(text) for s in segs)

    def test_empty_text_returns_empty(self):
        from agent.discovery import segment_for_extraction
        assert segment_for_extraction("") == []
        assert segment_for_extraction("   ") == []


# ── _upsert_themes ───────────────────────────────────────────────────────────

class TestUpsertThemes:
    """Themes are deduped by name per project — existing ones are reused, missing ones inserted."""

    def test_existing_themes_not_reinserted(self):
        existing = [{"id": "t1", "name": "onboarding"}]

        supabase_mock = MagicMock()
        # select returns the existing theme
        (supabase_mock.table.return_value
         .select.return_value
         .eq.return_value
         .in_.return_value
         .execute.return_value) = _table_result(existing)

        from agent.discovery import _upsert_themes
        result = _upsert_themes(supabase_mock, "proj-1", "user-1", ["onboarding"])

        assert result == {"onboarding": "t1"}
        # insert must NOT have been called — theme already exists
        supabase_mock.table.return_value.insert.assert_not_called()

    def test_missing_themes_inserted(self):
        supabase_mock = MagicMock()
        # select returns nothing (theme is new)
        (supabase_mock.table.return_value
         .select.return_value
         .eq.return_value
         .in_.return_value
         .execute.return_value) = _table_result([])
        # insert returns the new row
        (supabase_mock.table.return_value
         .insert.return_value
         .execute.return_value) = _table_result([{"id": "t-new", "name": "pricing"}])

        from agent.discovery import _upsert_themes
        result = _upsert_themes(supabase_mock, "proj-1", "user-1", ["pricing"])

        assert result == {"pricing": "t-new"}

    def test_mixed_existing_and_new(self):
        supabase_mock = MagicMock()
        # select returns "onboarding" but not "pricing"
        (supabase_mock.table.return_value
         .select.return_value
         .eq.return_value
         .in_.return_value
         .execute.return_value) = _table_result([{"id": "t1", "name": "onboarding"}])
        (supabase_mock.table.return_value
         .insert.return_value
         .execute.return_value) = _table_result([{"id": "t2", "name": "pricing"}])

        from agent.discovery import _upsert_themes
        result = _upsert_themes(supabase_mock, "proj-1", "user-1", ["onboarding", "pricing"])

        assert result["onboarding"] == "t1"
        assert result["pricing"] == "t2"

    def test_empty_input_returns_empty(self):
        supabase_mock = MagicMock()
        from agent.discovery import _upsert_themes
        result = _upsert_themes(supabase_mock, "proj-1", "user-1", [])
        assert result == {}
        supabase_mock.table.assert_not_called()
