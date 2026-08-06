-- Wohnheim Präsenzbestätigung — Supabase schema
-- No personal data is stored anywhere (DSGVO): only room numbers, tokens, and timestamps.

create extension if not exists "pgcrypto";

create table if not exists rooms (
  id           uuid primary key default gen_random_uuid(),
  room_number  text unique not null,
  token        text unique not null,
  status       text not null default 'active' check (status in ('active', 'vacant')),
  created_at   timestamptz not null default now()
);

create table if not exists confirmations (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  confirmed_at  timestamptz not null default now(),
  month         text not null, -- format: 'YYYY-MM'
  unique (room_id, month)
);

create index if not exists idx_confirmations_room_id on confirmations(room_id);
create index if not exists idx_confirmations_month on confirmations(month);
create index if not exists idx_rooms_token on rooms(token);
