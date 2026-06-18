-- Tier 3: Outcome capture + calibration
-- Run in Supabase SQL Editor AFTER tier2_decision_ledger.sql.
--
-- Adds two text columns to metrics so the PM's predicted and actual
-- outcomes can be stored as free-form strings alongside the numeric
-- baseline/target/current columns:
--
--   predicted_delta — copied from features.predicted_delta at promotion time
--                     (e.g. "+15% 30-day activation") so the metrics row is
--                     self-contained and the comparison doesn't require a join
--   actual_delta    — PM's free-text description of what actually happened
--                     (e.g. "+12%, short of target but activation improved")
--
-- The metrics row is created automatically by the app layer (_promote_to_feature)
-- when a feature is promoted with a predicted_metric. No trigger needed.

alter table metrics
    add column if not exists predicted_delta text,
    add column if not exists actual_delta    text;
