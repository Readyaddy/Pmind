-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Documents table
create table documents (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  title text not null default 'Untitled',
  content jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Product Brain context chunks (Stage 2: save to DB instead of localStorage)
create table context_chunks (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  title text default '',
  content text not null,
  created_at timestamptz default now()
);

-- Row level security
alter table documents enable row level security;
alter table context_chunks enable row level security;

create policy "users own their documents"
  on documents for all using (user_id = auth.uid()::text);

create policy "users own their context"
  on context_chunks for all using (user_id = auth.uid()::text);

-- Auto-update updated_at on documents
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on documents
  for each row execute function update_updated_at();
