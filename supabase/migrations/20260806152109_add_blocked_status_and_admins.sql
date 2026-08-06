-- Allow a third room status: "blocked" (Gesperrt), for rooms under
-- maintenance or otherwise not available, distinct from "vacant" (moved out).
alter table rooms drop constraint if exists rooms_status_check;
alter table rooms add constraint rooms_status_check
  check (status in ('active', 'vacant', 'blocked'));

-- Multi-admin accounts, replacing the single shared ADMIN_PASSWORD secret.
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
