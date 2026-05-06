-- Chat threads
create table chat_threads (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  project_id uuid references projects(id) on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages
create table chat_messages (
  id uuid default gen_random_uuid() primary key,
  thread_id uuid references chat_threads(id) on delete cascade not null,
  user_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

create policy "users own their chat_threads"
  on chat_threads for all using (user_id = auth.uid()::text);

create policy "users own their chat_messages"
  on chat_messages for all using (user_id = auth.uid()::text);

create trigger chat_threads_updated_at
  before update on chat_threads
  for each row execute function update_updated_at();
