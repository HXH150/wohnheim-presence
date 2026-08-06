# Wohnheim Präsenzbestätigung

Room-based presence confirmation system for a Wohnheim (dormitory). Residents scan
a QR code on their door once a month to confirm they still live there — no login,
no account, no personal data. Everything is keyed by room number and a per-room token.

## Stack

- **Frontend**: static HTML + CSS + vanilla JS → GitHub Pages
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: Supabase (PostgreSQL, EU region)
- **QR codes**: `qrcode` (SVG with room label) + `pdfkit` (printable, one QR per page), both via `npm:` specifiers
- **Reports**: `xlsx` (SheetJS) for Excel export, `pdfkit` for PDF export
- **Auth**: `bcryptjs` for per-admin password hashing, both via `npm:` specifiers

## Setup

### 1. Supabase

Open the SQL editor in your Supabase project and run [`sql/schema.sql`](sql/schema.sql).
This creates the `rooms` and `confirmations` tables.

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then link this
repo to your project:

```
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

### 2. Backend (Edge Functions)

Set the one secret the functions need. `BASE_URL` should be the public URL of the
**frontend** (your GitHub Pages URL) — it's embedded in generated QR codes.
`SUPABASE_URL` and the service-role key are injected automatically by Supabase and
don't need to be set here. There's no shared admin password secret — see
[Admin accounts](#admin-accounts) below.

```
supabase secrets set BASE_URL=https://your-username.github.io/wohnheim-presence
```

Deploy the functions:

```
supabase functions deploy confirm admin-login admins rooms qr reports
```

This publishes them at
`https://YOUR-PROJECT-REF.supabase.co/functions/v1/<function-name>`.

#### Local development

Each function is a plain `Deno.serve(...)` file, so it can be run directly without
Docker (Docker is only required for `supabase functions serve`'s full local stack):

```
export SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...   # from the Supabase dashboard, API settings
export BASE_URL=http://localhost:5500
deno run -A --node-modules-dir=none supabase/functions/rooms/index.ts
```

### 3. Frontend

The frontend is static and can be opened directly or served with any static file
server. It talks to the Edge Functions via `window.WOHNHEIM_FUNCTIONS_BASE`, which
defaults to `http://localhost:54321/functions/v1` (the local Supabase CLI URL). For
production, set this before the page scripts run, e.g. add to `confirm.html` /
`admin.html`:

```html
<script>window.WOHNHEIM_FUNCTIONS_BASE = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1';</script>
```

Deploy the `frontend/` folder to GitHub Pages (or any static host).

## Pages

- `frontend/confirm.html?token=XXXX` — resident confirmation page (DE/EN/AR/TR/UA)
- `frontend/admin.html` — admin dashboard (per-admin login)

## Admin accounts

There's no shared admin password — each Hausverwalter has their own account in the
`admins` table (username + bcrypt password hash), managed from the "Admin-Konten
verwalten" section of the dashboard. The credentials are re-sent as
`x-admin-username` / `x-admin-password` headers on every request and verified
against the table each time — there's no session/token layer.

A fresh database has no admins, which would lock everyone out, so create the first
one directly:

```sql
insert into admins (username, password_hash)
values ('admin', crypt('your-password', gen_salt('bf')));
```

(run in the Supabase SQL editor — requires the `pgcrypto` extension, already enabled
by `sql/schema.sql`). After that, create further accounts from the dashboard; the
last remaining admin can't be deleted, so you can't lock yourself out from the UI.

## API

Base URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1`

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/confirm/:token` | none | Look up room by token |
| POST | `/confirm` | none | `{ token, action: "confirm" \| "moved_out" }` |
| GET | `/rooms` | admin | All rooms with computed status |
| POST | `/rooms` | admin | `{ room_number }` — creates room + token |
| PUT | `/rooms/:id` | admin | `{ status: "active" \| "vacant" \| "blocked" }` |
| GET | `/qr/:token` | none | SVG QR code (with room label) for a room's confirm URL |
| GET | `/qr/all/pdf` | admin | Printable PDF, one QR code per page |
| POST | `/admin-login` | none | `{ username, password }` — verifies admin credentials |
| GET | `/admins` | admin | List admin accounts (never returns password hashes) |
| POST | `/admins` | admin | `{ username, password }` — creates an admin (password min. 8 chars) |
| DELETE | `/admins/:id` | admin | Deletes an admin (refused if it's the last one) |
| GET | `/reports/xlsx?month=YYYY-MM` | admin | Excel export of that month's room statuses |
| GET | `/reports/pdf?month=YYYY-MM` | admin | PDF export of that month's room statuses |

"admin" auth = `x-admin-username` + `x-admin-password` headers, checked against the
`admins` table.

## Business logic

- A room is **Bestätigt** if it has a confirmation for the current month.
- A room is **Ausstehend** if no confirmation exists for the current month and it's still active.
- A room is **Ausgezogen** if manually marked vacant, or the resident tapped "Ich bin ausgezogen".
- A room is **Gesperrt** if manually marked blocked (e.g. under maintenance) from the dashboard.
- A duplicate confirmation for the same room + month is silently ignored (unique constraint on `confirmations(room_id, month)`); the confirm page still shows success.
- The QR code printed on a door never changes — it encodes the room's token, not any resident data.
- Monthly reports for a past month compute "last confirmed" / "days since" as of the
  end of that month rather than today, so retroactive exports stay meaningful. The
  room's active/vacant/blocked state itself isn't tracked historically (only
  confirmations are), so a report run long after the fact reflects the room's
  *current* state, not necessarily its state during that month.

## DSGVO note

No names, emails, or any personally identifying data are stored. The database only
ever contains room numbers, opaque tokens, and timestamps.
