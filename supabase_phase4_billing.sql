-- Phase 4: Billing & Usage Tracking
-- Run in Supabase SQL Editor

-- User subscriptions
create table if not exists user_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'free' check (plan in ('free', 'pro', 'team')),
  status text default 'active',
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_subscriptions enable row level security;
create policy "Users manage own subscription" on user_subscriptions
  using (user_id = auth.uid()::text);

-- Usage logs (AI request tracking for free-tier gating)
create table if not exists usage_logs (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  endpoint text not null,
  created_at timestamptz default now()
);

alter table usage_logs enable row level security;
create policy "Users see own usage" on usage_logs
  using (user_id = auth.uid()::text);

create index if not exists usage_logs_user_date on usage_logs (user_id, created_at);

-- updated_at trigger for user_subscriptions
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_subscriptions_updated_at
  before update on user_subscriptions
  for each row execute function update_updated_at();
