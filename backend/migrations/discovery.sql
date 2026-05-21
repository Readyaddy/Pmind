-- Migration: discovery loop tables (Phase 1)
-- Run this in the Supabase SQL Editor AFTER document_chunks.sql.
--
-- Models the insight → theme → opportunity → feature → metric flow that
-- turns scattered customer evidence into ranked, build-ready proposals.

-- ── insights ─────────────────────────────────────────────────────────────────
-- A discrete quote / signal extracted from a KB document chunk (interview,
-- support ticket, survey). One source chunk yields 0..N insights.
create table if not exists insights (
    id                       uuid        primary key default gen_random_uuid(),
    project_id               uuid        not null,
    user_id                  text        not null,
    knowledge_document_id    uuid        references knowledge_documents(id) on delete cascade,
    knowledge_chunk_id       uuid        references knowledge_chunks(id) on delete set null,
    quote                    text        not null,
    paraphrase               text,
    sentiment                text        check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
    themes                   text[]      not null default '{}',
    theme_id                 uuid,
    persona                  text,
    severity                 int         check (severity between 1 and 5),
    created_at               timestamptz not null default now()
);

create index if not exists idx_insights_project_user on insights(project_id, user_id);
create index if not exists idx_insights_theme_id     on insights(theme_id);
create index if not exists idx_insights_themes_gin   on insights using gin (themes);
create index if not exists idx_insights_kb_doc       on insights(knowledge_document_id);

alter table insights enable row level security;
create policy "Users access own insights" on insights for all
    using (user_id = auth.uid()::text);


-- ── themes ───────────────────────────────────────────────────────────────────
-- A cluster of related insights. Auto-created during extraction (by name)
-- and de-duplicated case-insensitively per project.
create table if not exists themes (
    id            uuid        primary key default gen_random_uuid(),
    project_id    uuid        not null,
    user_id       text        not null,
    name          text        not null,
    description   text,
    insight_count int         not null default 0,
    summary       text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (project_id, name)
);

create index if not exists idx_themes_project_user on themes(project_id, user_id);

alter table themes enable row level security;
create policy "Users access own themes" on themes for all
    using (user_id = auth.uid()::text);


-- ── opportunities ────────────────────────────────────────────────────────────
-- A proposed problem worth solving, anchored to evidence (insight_ids).
-- Scored via RICE (reach × impact × confidence / effort). Status tracks the
-- discovery → delivery transition.
create table if not exists opportunities (
    id                  uuid        primary key default gen_random_uuid(),
    project_id          uuid        not null,
    user_id             text        not null,
    title               text        not null,
    problem             text        not null,
    proposed_solution   text,
    evidence_insight_ids uuid[]     not null default '{}',
    theme_ids           uuid[]      not null default '{}',
    reach               int         check (reach between 1 and 10),
    impact              int         check (impact between 1 and 10),
    confidence          int         check (confidence between 1 and 10),
    effort              int         check (effort between 1 and 10),
    rice_score          numeric     generated always as (
        case when effort is null or effort = 0 then null
             else (coalesce(reach, 5)::numeric
                 * coalesce(impact, 5)::numeric
                 * coalesce(confidence, 5)::numeric)
                 / effort::numeric
        end
    ) stored,
    risks               text,
    status              text        not null default 'proposed'
        check (status in ('proposed', 'shortlisted', 'discarded', 'committed')),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_opportunities_project_user on opportunities(project_id, user_id);
create index if not exists idx_opportunities_status       on opportunities(status);
create index if not exists idx_opportunities_rice         on opportunities(rice_score desc nulls last);

alter table opportunities enable row level security;
create policy "Users access own opportunities" on opportunities for all
    using (user_id = auth.uid()::text);


-- ── features ─────────────────────────────────────────────────────────────────
-- A committed initiative promoted from one or more opportunities. Links to
-- the PRD document and (later) UI proposal / tickets bundle.
create table if not exists features (
    id                  uuid        primary key default gen_random_uuid(),
    project_id          uuid        not null,
    user_id             text        not null,
    name                text        not null,
    summary             text,
    opportunity_ids     uuid[]      not null default '{}',
    prd_document_id     uuid        references documents(id) on delete set null,
    ui_proposal         jsonb,
    tickets_export_ref  text,
    status              text        not null default 'planned'
        check (status in ('planned', 'in_progress', 'shipped', 'archived')),
    shipped_at          timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_features_project_user on features(project_id, user_id);
create index if not exists idx_features_status       on features(status);

alter table features enable row level security;
create policy "Users access own features" on features for all
    using (user_id = auth.uid()::text);


-- ── metrics ──────────────────────────────────────────────────────────────────
-- Predicted vs observed metrics tied to a feature. Closes the discovery loop:
-- did shipping this feature actually move what we predicted it would?
create table if not exists metrics (
    id            uuid        primary key default gen_random_uuid(),
    feature_id    uuid        not null references features(id) on delete cascade,
    user_id       text        not null,
    name          text        not null,
    baseline      numeric,
    target        numeric,
    current       numeric,
    source        text,
    measured_at   timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists idx_metrics_feature on metrics(feature_id);

alter table metrics enable row level security;
create policy "Users access own metrics" on metrics for all
    using (user_id = auth.uid()::text);


-- ── updated_at triggers ──────────────────────────────────────────────────────
create or replace function _touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists trg_themes_touch on themes;
create trigger trg_themes_touch before update on themes
    for each row execute function _touch_updated_at();

drop trigger if exists trg_opportunities_touch on opportunities;
create trigger trg_opportunities_touch before update on opportunities
    for each row execute function _touch_updated_at();

drop trigger if exists trg_features_touch on features;
create trigger trg_features_touch before update on features
    for each row execute function _touch_updated_at();


-- ── insight_count maintenance ────────────────────────────────────────────────
-- Keep themes.insight_count consistent without forcing app code to manage it.
create or replace function _bump_theme_count()
returns trigger language plpgsql as $$
begin
    if tg_op = 'INSERT' and new.theme_id is not null then
        update themes set insight_count = insight_count + 1 where id = new.theme_id;
    elsif tg_op = 'DELETE' and old.theme_id is not null then
        update themes set insight_count = greatest(insight_count - 1, 0) where id = old.theme_id;
    elsif tg_op = 'UPDATE' and old.theme_id is distinct from new.theme_id then
        if old.theme_id is not null then
            update themes set insight_count = greatest(insight_count - 1, 0) where id = old.theme_id;
        end if;
        if new.theme_id is not null then
            update themes set insight_count = insight_count + 1 where id = new.theme_id;
        end if;
    end if;
    return coalesce(new, old);
end $$;

drop trigger if exists trg_insights_count on insights;
create trigger trg_insights_count
    after insert or delete or update of theme_id on insights
    for each row execute function _bump_theme_count();
