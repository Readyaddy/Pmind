-- Phase 1: VS Code-style file tree
-- Run this in the Supabase SQL Editor

-- Folders table: self-referential for N-level nesting
create table if not exists folders (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  parent_folder_id uuid references folders(id) on delete cascade,
  user_id text not null,
  name text not null default 'New Folder',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table folders enable row level security;

drop policy if exists "users own their folders" on folders;
create policy "users own their folders"
  on folders for all using (user_id = auth.uid()::text);

-- Add folder_id to documents (null = root of project)
alter table documents add column if not exists folder_id uuid references folders(id) on delete set null;

-- Indexes for tree queries
create index if not exists folders_project_id_idx on folders(project_id);
create index if not exists folders_parent_id_idx on folders(parent_folder_id);
create index if not exists documents_folder_id_idx on documents(folder_id);

-- updated_at trigger for folders
create trigger folders_updated_at
  before update on folders
  for each row execute function update_updated_at();
