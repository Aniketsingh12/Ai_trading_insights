-- Supabase / Postgres schema for TradeForge.
-- Run in Supabase SQL editor or psql.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  stripe_customer_id text,
  plan text default 'free',
  subscription_status text,
  created_at timestamptz default now()
);

create table if not exists watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  ticker text not null,
  exchange text,
  added_at timestamptz default now(),
  unique(user_id, ticker)
);

create table if not exists portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  ticker text not null,
  exchange text,
  quantity numeric not null,
  avg_price numeric not null,
  added_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, ticker)
);

create table if not exists analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  ticker text not null,
  report_type text check (report_type in ('quick','deep')) not null,
  content jsonb not null,
  pdf_url text,
  created_at timestamptz default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  ticker text not null,
  alert_type text check (alert_type in ('price','pattern','news')) not null,
  condition jsonb not null,
  is_active boolean default true,
  last_triggered timestamptz,
  created_at timestamptz default now()
);

create table if not exists daily_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  digest_date date not null,
  content jsonb not null,
  email_sent boolean default false,
  created_at timestamptz default now()
);

create table if not exists screener_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  created_at timestamptz default now()
);
