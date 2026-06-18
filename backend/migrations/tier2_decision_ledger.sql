-- Tier 2: Decision ledger — capture the bet when a feature is committed.
-- Run in Supabase SQL Editor AFTER discovery.sql.
--
-- When a PM promotes an opportunity to a feature, we now record:
--   rationale        — why we chose to build this (the reasoning, not just "it ranked highest")
--   predicted_metric — which north-star metric they expect to move
--   predicted_delta  — by how much (e.g. "+15% 30-day activation")
--   revisit_at       — date to come back and compare prediction to reality
--
-- These four fields are the backbone of the decision ledger and feed Tier 3
-- (outcome capture + calibration) once revisit_at passes.

alter table features
    add column if not exists rationale        text,
    add column if not exists predicted_metric text,
    add column if not exists predicted_delta  text,
    add column if not exists revisit_at       date;

-- Index so a cron/agent query for "features due for revisit today" is fast.
create index if not exists idx_features_revisit
    on features(revisit_at)
    where revisit_at is not null;
