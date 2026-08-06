# Wohnheim Präsenzbestätigung

Room-based presence confirmation system for a Wohnheim (dormitory). Residents scan
a QR code on their door once a month to confirm they still live there — no login,
no account, no personal data. Everything is keyed by room number and a per-room token.

## Stack

- **Frontend**: static HTML + CSS + vanilla JS → GitHub Pages
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: Supabase (PostgreSQL, EU region)
- **QR codes**: `qrcode` (per-room PNG) + `pdfkit` (printable sheet of all rooms), both via `npm:` specifiers

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

Set the two secrets the functions need. `BASE_URL` should be the public URL of the
**frontend** (your GitHub Pages URL) — it's embedded in generated QR codes.
`SUPABASE_URL` and the service-role key are injected automatically by Supabase and
don't need to be set here.

```
supabase secrets set ADMIN_PASSWORD=your-password BASE_URL=https://your-username.github.io/wohnheim-presence
```

Deploy the functions:

```
supabase functions deploy confirm admin-login rooms qr
```

This publishes them at
`https://YOUR-PROJECT-REF.supabase.co/functions/v1/<function-name>`.

#### Local development

Each function is a plain `Deno.serve(...)` file, so it can be run directly without
Docker (Docker is only required for `supabase functions serve`'s full local stack):

```
export SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...   # from the Supabase dashboard, API settings
export ADMIN_PASSWORD=...
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

- `frontend/confirm.html?token=XXXX` — resident confirmation page (DE/EN/AR/TR)
- `frontend/admin.html` — password-protected admin dashboard

## API

Base URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1`

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/confirm/:token` | none | Look up room by token |
| POST | `/confirm` | none | `{ token, action: "confirm" \| "moved_out" }` |
| GET | `/rooms` | `x-admin-password` header | All rooms with computed status |
| POST | `/rooms` | `x-admin-password` header | `{ room_number }` — creates room + token |
| PUT | `/rooms/:id` | `x-admin-password` header | `{ status: "active" \| "vacant" }` |
| GET | `/qr/:token` | none | PNG QR code for a room's confirm URL |
| GET | `/qr/all/pdf` | `x-admin-password` header | Printable PDF of every room's QR code |
| POST | `/admin-login` | none | `{ password }` — verifies the admin password |

## Business logic

- A room is **Bestätigt** if it has a confirmation for the current month.
- A room is **Ausstehend** if no confirmation exists for the current month and it's still active.
- A room is **Ausgezogen** if manually marked vacant, or the resident tapped "Ich bin ausgezogen".
- A duplicate confirmation for the same room + month is silently ignored (unique constraint on `confirmations(room_id, month)`); the confirm page still shows success.
- The QR code printed on a door never changes — it encodes the room's token, not any resident data.

## DSGVO note

No names, emails, or any personally identifying data are stored. The database only
ever contains room numbers, opaque tokens, and timestamps.
