-- Fitler Club Event Concierge prototype — Supabase schema
-- Run once in the Supabase SQL Editor. All access goes through the Cloudflare
-- Worker using the service-role key; RLS is enabled with no public policies.

create table if not exists public.events (
  id            uuid primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'inquiry',
  client_token  text not null unique,
  title         text,
  event_type    text,               -- corporate | social | wedding | mitzvah
  contact       jsonb not null default '{}'::jsonb,
  inquiry_text  text,
  triage        jsonb,
  reply_draft   text,
  intake        jsonb,
  guide         jsonb,
  brief         jsonb,
  beo           jsonb
);

create table if not exists public.requests (
  id          uuid primary key,
  event_id    uuid not null references public.events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null,          -- question | change | email
  source      text not null,          -- client_portal | coordinator
  body        text not null,
  analysis    jsonb,
  status      text not null default 'open'
);

create table if not exists public.activity (
  id          bigserial primary key,
  event_id    uuid references public.events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  actor       text not null,          -- ai | coordinator | client | system
  action      text not null,
  detail      jsonb
);

create index if not exists requests_event_idx on public.requests(event_id, created_at desc);
create index if not exists activity_event_idx on public.activity(event_id, created_at desc);

alter table public.events   enable row level security;
alter table public.requests enable row level security;
alter table public.activity enable row level security;
