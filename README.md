# Dynamo — Ambulance Crew Rota

A deployable rota system for day/night shift scheduling: password sign-in, a duty
board with rest-period and skill-mix checks, reusable shift patterns,
leave/change requests, shift swaps with manager approval, in-app (and
optional email) notifications, and CSV/print export.

This is a real, independent web app — it does not depend on Claude or
Anthropic in any way once deployed. It's two pieces:

- `backend/` — Node.js + Express API, with a SQLite database (via
  `better-sqlite3`) and password-based auth (bcrypt + JWT).
- `frontend/` — React + Vite single-page app that talks to the backend
  over HTTP.

## Before you deploy: read this

- **Data at 50+ staff scale**: SQLite is genuinely fine for this — it's a
  single ambulance station's rota, not a global SaaS. If you later grow to
  multiple stations or need concurrent writes from many processes, migrate
  `backend/src/db.js` to Postgres; the SQL is simple enough that this is a
  contained piece of work.
- **Open self-registration**: by default, anyone who can reach the app can
  add themselves as staff (the "Add yourself" flow). That's convenient for
  onboarding but means anyone with the URL could add an account. If that's
  not acceptable for your organisation, remove the `/api/auth/register`
  route in `backend/src/routes/auth.js` and add staff only via the Team tab
  (Manager-only).
- **Password auth is a step up from nothing, not enterprise security**: there's
  no account lockout across sessions, no audit log, no 2FA, no password
  complexity rules beyond a minimum length. For a genuinely sensitive
  deployment (real patient-adjacent scheduling data, union/HR requirements),
  plan to swap in a proper identity provider (e.g. an OAuth/SSO login via
  your organisation's Microsoft/Google account) instead — the JWT
  middleware in `backend/src/auth.js` is a reasonable place to make that
  swap since every route already goes through it.
- **Back up the database file.** It lives at `backend/data/rota.db` (or
  wherever `DB_PATH` points). Nothing in this app backs it up for you.

## Local development

Requires Node.js 20+.

```bash
# Backend
cd backend
cp .env.example .env
# edit .env — at minimum, set a real JWT_SECRET
npm install
npm run dev          # http://localhost:4000

# Frontend, in a second terminal
cd frontend
cp .env.example .env # VITE_API_URL=http://localhost:4000 is correct for local dev
npm install
npm run dev           # http://localhost:5173
```

Open http://localhost:5173. The first time, set `SEED_DEMO_DATA=true` in
`backend/.env` to get 8 demo staff and 2 example patterns to try things out
with — then set it back to `false` (or delete the line) so it never
re-seeds after you add real staff.

## Deploying for real

### Option A: Railway or Render (recommended — no Docker knowledge needed)

Both platforms can build directly from a GitHub repo without you touching
Docker.

1. Push this project to a GitHub repo.
2. **Backend**: create a new service pointing at the `backend/` folder.
   Set environment variables from `backend/.env.example` (generate a real
   `JWT_SECRET` — e.g. `openssl rand -hex 32`). Set `SEED_DEMO_DATA=true`
   for the very first deploy only. Attach a persistent volume mounted at
   `/app/data` if the platform supports one (Railway does) so the SQLite
   file survives redeploys — otherwise every redeploy wipes your rota.
3. Note the backend's public URL once deployed (e.g.
   `https://your-backend.up.railway.app`).
4. **Frontend**: create a second service pointing at the `frontend/`
   folder, with build command `npm install && npm run build` and publish
   directory `dist`. Set `VITE_API_URL` to the backend's public URL from
   step 3 — this must be set *before* the build runs, since Vite bakes it
   into the JS.
5. Back on the backend service, set `CORS_ORIGIN` to the frontend's public
   URL, and redeploy the backend so it accepts requests from it.

### Option B: Your own VPS with Docker

```bash
cp backend/.env.example backend/.env
# edit backend/.env: set JWT_SECRET, and CORS_ORIGIN to your real frontend URL

PUBLIC_API_URL=https://your-domain.com:4000 docker compose up -d --build
```

Put this behind a reverse proxy (Caddy or nginx) for HTTPS — shift and password
data going over plain HTTP is not acceptable for a real deployment.

### Option C: Hand it to a developer

Everything above is standard enough (Express + SQLite + Vite + React) that
any Node.js-comfortable developer can pick this up without needing any
context from this conversation.

## Branding

The MES logo lives at `frontend/public/mes-logo.png` and is referenced
directly in `frontend/src/App.jsx` (login screen and top bar). To swap it
for an updated version, just replace that file with another PNG of the
same name — no code changes needed. If you get a version with a
transparent background, you can remove the small white chip wrapper around
the top-bar logo in `TopBar`, since that was added to keep the current
white-background version legible against the dark header.

## First-time setup after deploying

1. Open the app. If you seeded demo data, sign in as **Priya Shah**
   (Manager) and set a password.
2. Go to **Team** and either edit the seeded staff or add your real crew.
   Delete the demo staff you don't want (there's no delete-staff endpoint
   yet by design — add one if you need to remove seeded accounts, or just
   leave them unused).
3. Set your real **coverage target** and **skill-mix rules**.
4. Build your **shift patterns** and assign them to staff with a start
   date, or just assign shifts manually week by week from the duty board.
5. If you want real email alongside the in-app notification bell, fill in
   the `SMTP_*` variables in `backend/.env`. Any standard SMTP provider
   works (e.g. your organisation's Office 365/Google Workspace SMTP, or a
   transactional provider like Postmark or SES). Real SMS would need a
   provider like Twilio wired into `backend/src/notify.js` in the same
   place email is triggered — not included here since it needs your own
   provider account and phone number.

## What's genuinely tested vs. what to verify yourself

Tested end-to-end in development: sign-in flow (password set/login/reset),
admin-only route enforcement, shift assignment, settings updates, and a
production frontend build served against the live backend.

Not tested here (no Docker available in the environment this was built
in): the Dockerfiles and docker-compose setup. They follow standard,
well-established patterns, but run them locally once before trusting them
for a real deployment.

Worth checking against your actual policies before relying on it
operationally: the rest-period logic (currently: no shift immediately
back-to-back with no gap) and the 48-hour weekly flag are both simplified
approximations of UK Working Time Regulations shaped rules, not a
substitute for your actual contracts and any local agreements.
