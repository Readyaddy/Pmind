"""
Tests for Tier 3 outcome capture + calibration:
  - _get_features_due_for_revisit: returns overdue features without recorded outcomes
  - _record_outcome: writes actual_delta, current_value, notes to metrics row
  - _promote_to_feature auto-creates metrics row when predicted_metric is set
  - tool schemas are correct
  - REQUIRES_PERMISSION includes record_outcome

Run from backend/ directory:
    pytest tests/test_tier3_outcome_capture.py -v
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import date, timedelta


# ── helpers ──────────────────────────────────────────────────────────────────

def _table_result(rows, count=None):
    m = MagicMock()
    m.data = rows
    m.count = count
    return m


@pytest.fixture
def agent_ctx():
    return {"user_id": "dev_user_123", "project_id": "proj-uuid-1"}


@pytest.fixture
def agent_ctx_no_project():
    return {"user_id": "dev_user_123", "project_id": None}


def _make_feature(
    fid="feat-uuid-1",
    name="Streamlined Onboarding",
    predicted_metric="30-day activation rate",
    predicted_delta="+15%",
    revisit_at=None,
    status="shipped",
):
    revisit_at = revisit_at or (date.today() - timedelta(days=5)).isoformat()
    return {
        "id": fid,
        "name": name,
        "predicted_metric": predicted_metric,
        "predicted_delta": predicted_delta,
        "revisit_at": revisit_at,
        "status": status,
    }


# ── _get_features_due_for_revisit ────────────────────────────────────────────

class TestGetFeaturesDueForRevisit:

    def _build_supabase(self, features, metric_rows):
        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .lte.return_value
                 .neq.return_value
                 .order.return_value
                 .execute.return_value) = _table_result(features)
            elif name == "metrics":
                (m.select.return_value
                 .in_.return_value
                 .eq.return_value
                 .execute.return_value) = _table_result(metric_rows)
            return m

        supabase_mock.table.side_effect = table_side
        return supabase_mock

    @pytest.mark.asyncio
    async def test_no_project_returns_early(self, agent_ctx_no_project):
        from agent.tools import _get_features_due_for_revisit
        result = await _get_features_due_for_revisit(agent_ctx_no_project)
        assert "No active project" in result["summary"]

    @pytest.mark.asyncio
    async def test_no_overdue_features(self, agent_ctx):
        supabase_mock = self._build_supabase(features=[], metric_rows=[])
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _get_features_due_for_revisit
            result = await _get_features_due_for_revisit(agent_ctx)
        assert "No features" in result["summary"]

    @pytest.mark.asyncio
    async def test_returns_features_without_recorded_outcomes(self, agent_ctx):
        feature = _make_feature()
        # No metric row with current set → pending
        supabase_mock = self._build_supabase(
            features=[feature],
            metric_rows=[{"feature_id": feature["id"], "current": None}],
        )
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _get_features_due_for_revisit
            result = await _get_features_due_for_revisit(agent_ctx)

        assert "1 feature(s)" in result["summary"]
        assert "Streamlined Onboarding" in result["data"]
        assert "+15%" in result["data"]
        assert "30-day activation rate" in result["data"]

    @pytest.mark.asyncio
    async def test_excludes_features_with_recorded_outcomes(self, agent_ctx):
        feature = _make_feature()
        # Metric row has current set → already recorded
        supabase_mock = self._build_supabase(
            features=[feature],
            metric_rows=[{"feature_id": feature["id"], "current": 0.42}],
        )
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _get_features_due_for_revisit
            result = await _get_features_due_for_revisit(agent_ctx)

        assert "already had their outcomes recorded" in result["summary"]

    @pytest.mark.asyncio
    async def test_mixed_recorded_and_pending(self, agent_ctx):
        f1 = _make_feature(fid="feat-1", name="Feature Alpha")
        f2 = _make_feature(fid="feat-2", name="Feature Beta")
        # f1 recorded, f2 not
        supabase_mock = self._build_supabase(
            features=[f1, f2],
            metric_rows=[
                {"feature_id": "feat-1", "current": 0.38},
                {"feature_id": "feat-2", "current": None},
            ],
        )
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _get_features_due_for_revisit
            result = await _get_features_due_for_revisit(agent_ctx)

        assert "1 feature(s)" in result["summary"]
        assert "Feature Beta" in result["data"]
        assert "Feature Alpha" not in result["data"]

    @pytest.mark.asyncio
    async def test_days_overdue_in_output(self, agent_ctx):
        revisit = (date.today() - timedelta(days=10)).isoformat()
        feature = _make_feature(revisit_at=revisit)
        supabase_mock = self._build_supabase(
            features=[feature],
            metric_rows=[{"feature_id": feature["id"], "current": None}],
        )
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _get_features_due_for_revisit
            result = await _get_features_due_for_revisit(agent_ctx)

        assert "10 day(s) overdue" in result["data"]

    @pytest.mark.asyncio
    async def test_metrics_check_failure_degrades_gracefully(self, agent_ctx):
        """If the metrics query fails, all due features should still be returned
        (treat as pending rather than silently dropping)."""
        feature = _make_feature()

        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .lte.return_value
                 .neq.return_value
                 .order.return_value
                 .execute.return_value) = _table_result([feature])
            elif name == "metrics":
                (m.select.return_value
                 .in_.return_value
                 .eq.return_value
                 .execute.side_effect) = Exception("metrics table unavailable")
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _get_features_due_for_revisit
            result = await _get_features_due_for_revisit(agent_ctx)

        # Should not raise and should still return the feature
        assert "1 feature(s)" in result["summary"]


# ── _record_outcome ──────────────────────────────────────────────────────────

class TestRecordOutcome:

    def _build_supabase(self, feature_row, existing_metric=None, insert_ok=True):
        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .execute.return_value) = _table_result([feature_row] if feature_row else [])
            elif name == "metrics":
                (m.select.return_value
                 .eq.return_value
                 .eq.return_value
                 .execute.return_value) = _table_result(
                     [existing_metric] if existing_metric else []
                 )
                if insert_ok:
                    m.insert.return_value.execute.return_value = _table_result([{"id": "met-new"}])
                    m.update.return_value.eq.return_value.execute.return_value = _table_result([{}])
                else:
                    m.insert.return_value.execute.side_effect = Exception("insert failed")
                    m.update.return_value.eq.return_value.execute.side_effect = Exception("update failed")
            return m

        supabase_mock.table.side_effect = table_side
        return supabase_mock

    @pytest.mark.asyncio
    async def test_updates_existing_metric_row(self, agent_ctx):
        feature = _make_feature()
        metric = {"id": "met-uuid-1"}
        updated_payload = {}

        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                (m.select.return_value.eq.return_value.eq.return_value.execute.return_value) = \
                    _table_result([feature])
            elif name == "metrics":
                (m.select.return_value.eq.return_value.eq.return_value.execute.return_value) = \
                    _table_result([metric])

                def fake_update(payload):
                    updated_payload.update(payload)
                    u = MagicMock()
                    u.eq.return_value.execute.return_value = _table_result([{}])
                    return u

                m.update.side_effect = fake_update
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _record_outcome
            result = await _record_outcome(
                agent_ctx,
                feature_id=feature["id"],
                actual_delta="+12%, short of +15% target",
                current_value=0.42,
                notes="Onboarding redesign helped but B2B users still drop off.",
            )

        assert updated_payload["actual_delta"] == "+12%, short of +15% target"
        assert updated_payload["current"] == 0.42
        assert "measured_at" in updated_payload
        assert "Streamlined Onboarding" in result["summary"]
        assert "+15%" in result["summary"]  # predicted surfaced

    @pytest.mark.asyncio
    async def test_creates_metric_row_when_none_exists(self, agent_ctx):
        feature = _make_feature()
        inserted_payload = {}

        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                (m.select.return_value.eq.return_value.eq.return_value.execute.return_value) = \
                    _table_result([feature])
            elif name == "metrics":
                # No existing row
                (m.select.return_value.eq.return_value.eq.return_value.execute.return_value) = \
                    _table_result([])

                def fake_insert(payload):
                    inserted_payload.update(payload)
                    i = MagicMock()
                    i.execute.return_value = _table_result([{"id": "met-new"}])
                    return i

                m.insert.side_effect = fake_insert
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _record_outcome
            await _record_outcome(
                agent_ctx,
                feature_id=feature["id"],
                actual_delta="no measurable change in 90 days",
            )

        assert inserted_payload["actual_delta"] == "no measurable change in 90 days"
        assert inserted_payload["feature_id"] == feature["id"]
        assert inserted_payload["name"] == feature["predicted_metric"]

    @pytest.mark.asyncio
    async def test_feature_not_found_returns_error(self, agent_ctx):
        supabase_mock = self._build_supabase(feature_row=None)
        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _record_outcome
            result = await _record_outcome(
                agent_ctx,
                feature_id="bad-id",
                actual_delta="+5%",
            )
        assert "not found" in result["summary"].lower()

    @pytest.mark.asyncio
    async def test_current_value_optional(self, agent_ctx):
        """Omitting current_value must not include it in the update payload."""
        feature = _make_feature()
        metric = {"id": "met-uuid-1"}
        updated_payload = {}

        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                (m.select.return_value.eq.return_value.eq.return_value.execute.return_value) = \
                    _table_result([feature])
            elif name == "metrics":
                (m.select.return_value.eq.return_value.eq.return_value.execute.return_value) = \
                    _table_result([metric])

                def fake_update(payload):
                    updated_payload.update(payload)
                    u = MagicMock()
                    u.eq.return_value.execute.return_value = _table_result([{}])
                    return u

                m.update.side_effect = fake_update
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _record_outcome
            await _record_outcome(
                agent_ctx,
                feature_id=feature["id"],
                actual_delta="+8%",
            )

        assert "current" not in updated_payload

    @pytest.mark.asyncio
    async def test_summary_includes_prediction_vs_actual(self, agent_ctx):
        feature = _make_feature(predicted_delta="+15%", predicted_metric="activation rate")
        metric = {"id": "met-uuid-1"}
        supabase_mock = self._build_supabase(feature, metric)

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _record_outcome
            result = await _record_outcome(
                agent_ctx,
                feature_id=feature["id"],
                actual_delta="+12%",
            )

        assert "+15%" in result["summary"]
        assert "+12%" in result["summary"]


# ── _promote_to_feature auto-creates metrics row ─────────────────────────────

class TestPromoteAutoCreatesMetrics:

    @pytest.mark.asyncio
    async def test_metrics_row_created_with_predicted_metric(self, agent_ctx):
        metrics_inserts = []

        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                m.insert.return_value.execute.return_value = \
                    _table_result([{"id": "feat-new", "name": "Onboarding v2"}])
            elif name == "opportunities":
                m.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
                    _table_result([])
            elif name == "metrics":
                def fake_insert(payload):
                    metrics_inserts.append(payload)
                    i = MagicMock()
                    i.execute.return_value = _table_result([{"id": "met-1"}])
                    return i
                m.insert.side_effect = fake_insert
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            await _promote_to_feature(
                agent_ctx,
                name="Onboarding v2",
                opportunity_ids=["opp-1"],
                predicted_metric="30-day activation rate",
                predicted_delta="+15%",
                revisit_at="2026-09-18",
            )

        assert len(metrics_inserts) == 1
        ins = metrics_inserts[0]
        assert ins["name"] == "30-day activation rate"
        assert ins["predicted_delta"] == "+15%"
        assert ins["feature_id"] == "feat-new"

    @pytest.mark.asyncio
    async def test_no_metrics_row_when_no_predicted_metric(self, agent_ctx):
        """If predicted_metric is not provided, no metrics row should be created."""
        metrics_insert_called = []

        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                m.insert.return_value.execute.return_value = \
                    _table_result([{"id": "feat-x", "name": "Quick Fix"}])
            elif name == "opportunities":
                m.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
                    _table_result([])
            elif name == "metrics":
                def fake_insert(payload):
                    metrics_insert_called.append(payload)
                    i = MagicMock()
                    i.execute.return_value = _table_result([])
                    return i
                m.insert.side_effect = fake_insert
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            await _promote_to_feature(
                agent_ctx,
                name="Quick Fix",
                opportunity_ids=["opp-2"],
                # no predicted_metric
            )

        assert len(metrics_insert_called) == 0

    @pytest.mark.asyncio
    async def test_metrics_insert_failure_non_fatal(self, agent_ctx):
        """If the metrics row insert fails, promote_to_feature should still succeed."""
        supabase_mock = MagicMock()

        def table_side(name):
            m = MagicMock()
            if name == "features":
                m.insert.return_value.execute.return_value = \
                    _table_result([{"id": "feat-y", "name": "Resilient Feature"}])
            elif name == "opportunities":
                m.update.return_value.in_.return_value.eq.return_value.execute.return_value = \
                    _table_result([])
            elif name == "metrics":
                m.insert.return_value.execute.side_effect = Exception("metrics table not yet migrated")
            return m

        supabase_mock.table.side_effect = table_side

        with patch("agent.tools.get_supabase", return_value=supabase_mock):
            from agent.tools import _promote_to_feature
            result = await _promote_to_feature(
                agent_ctx,
                name="Resilient Feature",
                opportunity_ids=["opp-3"],
                predicted_metric="activation rate",
                predicted_delta="+10%",
            )

        assert "Resilient Feature" in result["summary"]
        assert result["sources"][0]["kind"] == "feature"


# ── tool schema + registration ────────────────────────────────────────────────

class TestTier3Schema:

    def test_get_features_due_for_revisit_in_schemas(self):
        from agent.tools import TOOL_SCHEMAS
        names = {t["name"] for t in TOOL_SCHEMAS}
        assert "get_features_due_for_revisit" in names

    def test_record_outcome_in_schemas(self):
        from agent.tools import TOOL_SCHEMAS
        names = {t["name"] for t in TOOL_SCHEMAS}
        assert "record_outcome" in names

    def test_record_outcome_requires_permission(self):
        from agent.tools import REQUIRES_PERMISSION
        assert "record_outcome" in REQUIRES_PERMISSION

    def test_record_outcome_required_fields(self):
        from agent.tools import TOOL_SCHEMAS
        schema = next(t for t in TOOL_SCHEMAS if t["name"] == "record_outcome")
        required = schema["parameters"]["required"]
        assert "feature_id" in required
        assert "actual_delta" in required

    def test_record_outcome_optional_fields(self):
        from agent.tools import TOOL_SCHEMAS
        schema = next(t for t in TOOL_SCHEMAS if t["name"] == "record_outcome")
        required = set(schema["parameters"]["required"])
        assert "current_value" not in required
        assert "notes" not in required

    def test_both_tools_registered_in_executors(self):
        from agent.tools import TOOL_EXECUTORS
        assert "get_features_due_for_revisit" in TOOL_EXECUTORS
        assert "record_outcome" in TOOL_EXECUTORS

    def test_both_tools_in_pm_agent(self):
        from agent.agents.pm import TOOL_NAMES
        assert "get_features_due_for_revisit" in TOOL_NAMES
        assert "record_outcome" in TOOL_NAMES
