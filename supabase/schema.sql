-- Lazy Tracker database. Run this once in the Supabase SQL editor
-- (Dashboard > SQL Editor > New query > paste > Run).

-- One row per official post, with its classified items as JSON.
create table if not exists posts (
  id             bigint generated always as identity primary key,
  source_id      text not null unique,          -- Nexon's post id
  kind           text not null check (kind in ('patch','event')),
  title          text not null,
  url            text not null,
  published_at   timestamptz not null,
  thumbnail_url  text,
  content_hash   text not null,                 -- sha256 of the cleaned text
  items          jsonb,                         -- StoredItem[]
  model          text,                          -- which model rated it, or 'rules'
  prompt_version int,
  warnings       jsonb not null default '[]',   -- corrections made by the grounding checks
  error          text,                          -- last failed refresh, null when healthy
  classified_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists posts_published_at_idx on posts (published_at desc);

-- Small named JSON values. Holds the Gemini quota ledger ('gemini-quota').
create table if not exists meta (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Row Level Security with no policies: the public (anon) key can read and
-- write nothing. Only the server, using the service-role key, gets through.
alter table posts enable row level security;
alter table meta  enable row level security;
