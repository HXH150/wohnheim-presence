-- The admins table (username + password_hash) was created without RLS,
-- leaving it fully readable/writable by anyone with the project's public
-- anon key via PostgREST. Only our Edge Functions (service role, which
-- bypasses RLS) should ever touch this table, so no policies are needed.
alter table admins enable row level security;
