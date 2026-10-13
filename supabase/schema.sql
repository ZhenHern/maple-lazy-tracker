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

-- Messages from the feedback form (/feedback). Read them here in the Table
-- Editor; tick "handled" when one is dealt with. The size checks are the
-- backstop against someone filling the table with junk.
create table if not exists feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('rating','bug','idea','other')),
  message     text not null check (char_length(message) between 1 and 2000),
  about       text check (char_length(about) <= 200),    -- the quest it is about, if any
  contact     text check (char_length(contact) <= 120),  -- optional, only to reply
  page        text check (char_length(page) <= 300),     -- where the form was sent from
  user_agent  text check (char_length(user_agent) <= 300),
  handled     boolean not null default false
);
create index if not exists feedback_created_at_idx on feedback (created_at desc);

-- Row Level Security with no policies: the public (anon) key can read and
-- write nothing. Only the server, using the service-role key, gets through.
alter table posts enable row level security;
alter table meta  enable row level security;
alter table feedback enable row level security;
