-- Wohnheim Präsenzbestätigung — Supabase schema
-- No personal data is stored anywhere (DSGVO): only room numbers, tokens, and timestamps.

create extension if not exists "pgcrypto";

create table if not exists rooms (
  id           uuid primary key default gen_random_uuid(),
  room_number  text unique not null,
  token        text unique not null,
  -- "blocked" (Gesperrt) is for rooms under maintenance or otherwise
  -- unavailable, distinct from "vacant" (resident moved out).
  status       text not null default 'active' check (status in ('active', 'vacant', 'blocked')),
  created_at   timestamptz not null default now()
);

create table if not exists confirmations (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  confirmed_at  timestamptz not null default now(),
  month         text not null, -- format: 'YYYY-MM'
  unique (room_id, month)
);

-- Multi-admin accounts; each Hausverwalter logs in with their own
-- username/password instead of a single shared password.
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_confirmations_room_id on confirmations(room_id);
create index if not exists idx_confirmations_month on confirmations(month);
create index if not exists idx_rooms_token on rooms(token);
