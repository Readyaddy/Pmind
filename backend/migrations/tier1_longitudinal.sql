-- Tier 1: Make evidence stateful — longitudinal tracking
-- Run in Supabase SQL Editor AFTER discovery.sql.
--
-- Adds quarter-based period tracking to insights so we can surface trends:
-- "Onboarding friction — 23 users, up 40% this quarter, 0 shipped features."
--
-- NOTE: Uses a trigger instead of a generated column because to_char(timestamptz)
-- is not immutable in PostgreSQL (depends on session timezone).

alter table insights add column if not exists period text;

create index if not exists idx_insights_period       on insights(period);
create index if not exists idx_insights_theme_period on insights(theme_id, period);

-- Populate period on every insert. extract(year/quarter from timestamptz) uses
-- UTC implicitly when no timezone conversion is applied, which is correct here.
create or replace function _set_insight_period()
returns trigger language plpgsql as $$
begin
    new.period :=
        extract(year from new.created_at)::int::text
        || '-Q' ||
        extract(quarter from new.created_at)::int::text;
    return new;
end $$;

drop trigger if exists trg_insights_period on insights;
create trigger trg_insights_period
    before insert on insights
    for each row execute function _set_insight_period();

-- Backfill any existing rows that predate this migration.
update insights
set period =
    extract(year from created_at)::int::text
    || '-Q' ||
    extract(quarter from created_at)::int::text
where period is null;
