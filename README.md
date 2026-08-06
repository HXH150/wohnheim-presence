# Wohnheim Präsenzbestätigung

Room-based presence confirmation system for a Wohnheim (dormitory). Residents scan
a QR code on their door once a month to confirm they still live there — no login,
no account, no personal data. Everything is keyed by room number and a per-room token.

## Stack

- **Frontend**: static HTML + CSS + vanilla JS → GitHub Pages
- **Backend**: Node.js + Express → deployed separately (Render, Fly.io, etc.)
- **Database**: Supabase (PostgreSQL, EU region)
- **QR codes**: `qrcode` (per-room PNG) + `pdfkit` (printable sheet of all rooms)

## Setup

### 1. Supabase

Open the SQL editor in your Supabase project and run [`sql/schema.sql`](sql/schema.sql).
This creates the `rooms` and `confirmations` tables.

### 2. Backend

```
cd backend
npm install
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_PASSWORD, BASE_URL
npm start
```

The API listens on `PORT` (default `3001`). `BASE_URL` should be the public URL of
the **frontend** (your GitHub Pages URL) — it's embedded in generated QR codes.

> The Supabase key used server-side should be a key permitted to read/write the
> `rooms` and `confirmations` tables only — treat it as a secret and never commit
> `.env`.

### 3. Frontend

The frontend is static and can be opened directly or served with any static file
server. It talks to the backend via `window.WOHNHEIM_API_BASE`, which defaults to
`http://localhost:3001`. For production, set this before the page scripts run, e.g.
add to `confirm.html` / `admin.html`:

```html
<script>window.WOHNHEIM_API_BASE = 'https://your-backend-url';</script>
```

Deploy the `frontend/` folder to GitHub Pages (or any static host).

## Pages

- `frontend/confirm.html?token=XXXX` — resident confirmation page (DE/EN/AR/TR)
- `frontend/admin.html` — password-protected admin dashboard

## API

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/confirm/:token` | none | Look up room by token |
| POST | `/api/confirm` | none | `{ token, action: "confirm" \| "moved_out" }` |
| GET | `/api/rooms` | `x-admin-password` header | All rooms with computed status |
| POST | `/api/rooms` | `x-admin-password` header | `{ room_number }` — creates room + token |
| PUT | `/api/rooms/:id` | `x-admin-password` header | `{ status: "active" \| "vacant" }` |
| GET | `/api/qr/:token` | none | PNG QR code for a room's confirm URL |
| GET | `/api/qr/all/pdf` | `x-admin-password` header | Printable PDF of every room's QR code |
| POST | `/api/admin/login` | none | `{ password }` — verifies the admin password |

## Business logic

- A room is **Bestätigt** if it has a confirmation for the current month.
- A room is **Ausstehend** if no confirmation exists for the current month and it's still active.
- A room is **Ausgezogen** if manually marked vacant, or the resident tapped "Ich bin ausgezogen".
- A duplicate confirmation for the same room + month is silently ignored (unique constraint on `confirmations(room_id, month)`); the confirm page still shows success.
- The QR code printed on a door never changes — it encodes the room's token, not any resident data.

## DSGVO note

No names, emails, or any personally identifying data are stored. The database only
ever contains room numbers, opaque tokens, and timestamps.
