-- Phase 0: Projects + Docs Hierarchy
-- Run in Supabase Dashboard → SQL Editor

-- New projects table
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  name text not null default 'Untitled Project',
  description text default '',
  color text default '#D97706',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table projects enable row level security;
create policy "users own their projects"
  on projects for all using (user_id = auth.uid()::text);

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- Add project_id FK to existing tables (nullable so existing rows don't break)
alter table documents add column project_id uuid references projects(id) on delete cascade;
alter table context_chunks add column project_id uuid references projects(id) on delete cascade;
