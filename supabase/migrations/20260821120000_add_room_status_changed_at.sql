-- Track when a room's status (active/vacant/blocked) last changed, so the
-- admin dashboard and reports can show when a room was marked "Ausgezogen"
-- even if it has no confirmations at all.
alter table rooms add column if not exists status_changed_at timestamptz;

-- Backfill existing rooms so vacant/blocked rooms aren't left blank.
update rooms set status_changed_at = created_at where status_changed_at is null;
