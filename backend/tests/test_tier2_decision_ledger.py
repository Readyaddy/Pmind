"""
Tests for Tier 2 decision ledger:
  - _promote_to_feature: new fields (rationale, predicted_metric, predicted_delta, revisit_at)
    are included in the insert payload and surfaced in the summary
  - missing ledger fields are tolerated (columns are optional)
  - existing dedup / error paths still work
  - tool schema declares the four new parameters

Run from backend/ directory:
    pytest tests/test_tier2_decision_ledger.py -v
"""
import pytest
from unittest.mock import patch, MagicMock


# ── helpers ──────────────────────────────────────────────────────────────────

def _table_result(rows):
    m = MagicMock()
    m.data = rows
    return m


@pytest.fixture
def agent_ctx():
    return {"user_id": "dev_user_123", "project_id": "proj-uuid-1"}


@pytest.fixture
def agent_ctx_no_project():
    return {"user_id": "dev_user_123", "project_id": None}


def _make_supabase(feature_row=None, opportunity_update_ok=True):
    """Return a supabase mock wired for promote_to_feature calls."""
    supabase_mock = MagicMock()

    feature_row = feature_row or {
        "id": "feat-uuid-1",
        "name": "Streamlined Onboarding",
    }

    # features.insert → the new feature row
    supabase_mock.table.return_value.insert.return_value.execute.return_value = \
        _table_result([feature_row])

    # opportunities.update → mark as committed
    if not opportunity_update_ok:
        supabase_mock.table.return_value.update.return_value.in_.return_value.eq.return_value.execute.side_effect = \
            Exception("update failed")
    else:
        supabase_mock.table.return_value.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
            _table_result([])

    return supabase_mock


# ── _promote_to_feature — ledger fields ─────────────────────────────────────

class TestPromoteToFeatureLedger:

    @pytest.mark.asyncio
    async def test_full_ledger_fields_in_payload(self, agent_ctx):
        """All four decision-ledger fields must reach the DB insert payload."""
        inserted_payload = {}

        def fake_insert(payload):
            inserted_payload.update(payload)
            m = MagicMock()
            m.execute.return_value = _table_result([{"id": "feat-1", "name": "Onboarding v2"}])
            return m

        supabase_mock = MagicMock()
        supabase_mock.table.return_value.insert.side_effect = fake_insert
        supabase_mock.table.return_value.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
            _table_result([])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="Onboarding v2",
                opportunity_ids=["opp-uuid-1"],
                summary="Redesign the first-run flow.",
                rationale="Top theme for 3 quarters; 40% of churn attributed here.",
                predicted_metric="30-day activation rate",
                predicted_delta="+15%",
                revisit_at="2026-09-18",
            )

        assert inserted_payload["rationale"] == "Top theme for 3 quarters; 40% of churn attributed here."
        assert inserted_payload["predicted_metric"] == "30-day activation rate"
        assert inserted_payload["predicted_delta"] == "+15%"
        assert inserted_payload["revisit_at"] == "2026-09-18"
        assert "Onboarding v2" in result["summary"]

    @pytest.mark.asyncio
    async def test_ledger_info_surfaces_in_summary(self, agent_ctx):
        """Summary should mention the bet and revisit date when provided."""
        supabase_mock = _make_supabase({"id": "feat-2", "name": "Export Fix"})

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="Export Fix",
                opportunity_ids=["opp-1"],
                rationale="Bulk export crashes reported by 40 enterprise users.",
                predicted_metric="support ticket volume",
                predicted_delta="-30 tickets/week",
                revisit_at="2026-10-01",
            )

        assert "-30 tickets/week" in result["summary"]
        assert "support ticket volume" in result["summary"]
        assert "2026-10-01" in result["summary"]
        assert "Rationale captured" in result["summary"]

    @pytest.mark.asyncio
    async def test_ledger_fields_optional_no_error(self, agent_ctx):
        """Omitting all decision-ledger fields must still succeed — they're optional."""
        supabase_mock = _make_supabase({"id": "feat-3", "name": "Quick Win"})

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="Quick Win",
                opportunity_ids=["opp-2"],
            )

        assert "Quick Win" in result["summary"]
        assert result["sources"][0]["kind"] == "feature"

    @pytest.mark.asyncio
    async def test_none_ledger_fields_excluded_from_payload(self, agent_ctx):
        """None-valued fields must not be sent to Supabase (avoids overwriting
        any column with NULL on a partial update path)."""
        inserted_payload = {}

        def fake_insert(payload):
            inserted_payload.update(payload)
            m = MagicMock()
            m.execute.return_value = _table_result([{"id": "feat-4", "name": "No Ledger"}])
            return m

        supabase_mock = MagicMock()
        supabase_mock.table.return_value.insert.side_effect = fake_insert
        supabase_mock.table.return_value.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
            _table_result([])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            await _promote_to_feature(
                agent_ctx,
                name="No Ledger",
                opportunity_ids=["opp-3"],
                # All ledger fields omitted → default to None → must not appear
            )

        assert "rationale" not in inserted_payload
        assert "predicted_metric" not in inserted_payload
        assert "predicted_delta" not in inserted_payload
        assert "revisit_at" not in inserted_payload

    @pytest.mark.asyncio
    async def test_partial_ledger_only_present_fields_in_payload(self, agent_ctx):
        """Providing only revisit_at should include just that field, not the others."""
        inserted_payload = {}

        def fake_insert(payload):
            inserted_payload.update(payload)
            m = MagicMock()
            m.execute.return_value = _table_result([{"id": "feat-5", "name": "Partial"}])
            return m

        supabase_mock = MagicMock()
        supabase_mock.table.return_value.insert.side_effect = fake_insert
        supabase_mock.table.return_value.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
            _table_result([])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            await _promote_to_feature(
                agent_ctx,
                name="Partial",
                opportunity_ids=["opp-4"],
                revisit_at="2026-12-01",
            )

        assert inserted_payload.get("revisit_at") == "2026-12-01"
        assert "rationale" not in inserted_payload
        assert "predicted_metric" not in inserted_payload

    @pytest.mark.asyncio
    async def test_summary_no_bet_line_when_metric_missing(self, agent_ctx):
        """When predicted_metric is absent, the 'Bet:' line must not appear."""
        supabase_mock = _make_supabase({"id": "feat-6", "name": "No Metric"})

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="No Metric",
                opportunity_ids=["opp-5"],
                rationale="We think this helps.",
                # predicted_metric and predicted_delta omitted
                revisit_at="2026-09-01",
            )

        assert "Bet:" not in result["summary"]
        assert "Rationale captured" in result["summary"]
        assert "2026-09-01" in result["summary"]


# ── existing behaviour preserved ─────────────────────────────────────────────

class TestPromoteToFeatureExisting:

    @pytest.mark.asyncio
    async def test_no_project_returns_early(self, agent_ctx_no_project):
        from agent.tools import _promote_to_feature
        result = await _promote_to_feature(
            agent_ctx_no_project,
            name="X",
            opportunity_ids=["opp-1"],
        )
        assert "No active project" in result["summary"]

    @pytest.mark.asyncio
    async def test_empty_opportunity_ids_returns_error(self, agent_ctx):
        from agent.tools import _promote_to_feature
        result = await _promote_to_feature(agent_ctx, name="X", opportunity_ids=[])
        assert "at least one" in result["summary"].lower()

    @pytest.mark.asyncio
    async def test_opportunities_marked_committed(self, agent_ctx):
        """After promotion, the linked opportunities must be set to 'committed'."""
        supabase_mock = MagicMock()
        supabase_mock.table.return_value.insert.return_value.execute.return_value = \
            _table_result([{"id": "feat-7", "name": "Committed Test"}])
        supabase_mock.table.return_value.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
            _table_result([])

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            await _promote_to_feature(
                agent_ctx,
                name="Committed Test",
                opportunity_ids=["opp-a", "opp-b"],
            )

        # Verify update was called with status=committed and the right IDs
        update_call = supabase_mock.table.return_value.update.call_args
        assert update_call is not None
        assert update_call[0][0].get("status") == "committed"

        in_call = supabase_mock.table.return_value.update.return_value.in_.call_args
        assert in_call is not None
        passed_ids = in_call[0][1]  # in_("id", [ids...]) → second positional arg
        assert "opp-a" in passed_ids
        assert "opp-b" in passed_ids

    @pytest.mark.asyncio
    async def test_opportunity_update_failure_non_fatal(self, agent_ctx):
        """If marking opportunities as committed fails, the feature is still returned."""
        supabase_mock = _make_supabase(
            feature_row={"id": "feat-8", "name": "Robust"},
            opportunity_update_ok=False,
        )

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="Robust",
                opportunity_ids=["opp-c"],
            )

        # Feature was still created — opportunity update failure is logged, not raised
        assert "Robust" in result["summary"]
        assert result["sources"][0]["kind"] == "feature"

    @pytest.mark.asyncio
    async def test_feature_returned_as_source(self, agent_ctx):
        supabase_mock = _make_supabase({"id": "feat-9", "name": "Source Check"})

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="Source Check",
                opportunity_ids=["opp-d"],
            )

        assert len(result["sources"]) == 1
        src = result["sources"][0]
        assert src["id"] == "feature:feat-9"
        assert src["kind"] == "feature"
        assert src["title"] == "Source Check"


# ── tool schema ──────────────────────────────────────────────────────────────

class TestPromoteToFeatureSchema:

    def _get_schema(self):
        from agent.tools import TOOL_SCHEMAS
        return next(t for t in TOOL_SCHEMAS if t["name"] == "promote_to_feature")

    def test_new_fields_in_schema(self):
        schema = self._get_schema()
        props = schema["parameters"]["properties"]
        assert "rationale" in props
        assert "predicted_metric" in props
        assert "predicted_delta" in props
        assert "revisit_at" in props

    def test_name_and_opportunity_ids_still_required(self):
        schema = self._get_schema()
        required = schema["parameters"]["required"]
        assert "name" in required
        assert "opportunity_ids" in required

    def test_ledger_fields_not_required(self):
        """Decision-ledger fields are encouraged but not required — PM may not
        know the metric upfront."""
        schema = self._get_schema()
        required = set(schema["parameters"]["required"])
        for field in ("rationale", "predicted_metric", "predicted_delta", "revisit_at"):
            assert field not in required, f"{field} must not be required"

    def test_description_mentions_ledger_intent(self):
        schema = self._get_schema()
        desc = schema["description"].lower()
        assert "rationale" in desc
        assert "revisit" in desc
        assert "metric" in desc
