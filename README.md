# CheckNBook — Marriage Hall Availability Checker

City + date → instantly see which mandapams are free. Tap to call or WhatsApp the owner. No more ringing ten halls in a row.

Three independent applications, each with its own `package.json` and dependencies — no shared workspace: **`backend`** (Express + Prisma) + **`frontend`** (React + Vite) + **`App`** (Expo mobile, its own independent git repo). **`infra/`** holds deployment configuration (Docker Compose for local Postgres, pm2/nginx/systemd for production) shared across the whole product.

## Stack

- **frontend**: React 18 + TypeScript + Vite, mobile-first CSS, `react-day-picker`.
- **backend**: Node.js 20 + Express + TypeScript, Prisma ORM, JWT auth, zod validation.
- **Database**: PostgreSQL 15+ (via `infra/docker-compose.yml`).
- **Package manager**: pnpm, used independently per app (no workspace) — each of `backend/` and `frontend/` has its own lockfile.

See `docs/ARCHITECTURE.md` for the full design, `docs/ROADMAP.md` for the 1-2 week plan, and `docs/DEPLOYMENT.md` for deploying to a Hostinger VPS with HTTPS.

## Repo layout

```
.
├── backend/                 Express + Prisma backend — standalone app
├── frontend/                React + Vite frontend — standalone app
│                            (shared DTOs live at frontend/src/api/types.ts —
│                             frontend is the only consumer, so they're colocated
│                             rather than a separate shared package)
├── App/                     Expo mobile app — own independent git repo
├── infra/
│   ├── docker-compose.yml   Local Postgres
│   ├── pm2.ecosystem.config.js, nginx/, systemd/   production deploy configs
│   └── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── ROADMAP.md
├── .gitignore
└── README.md
```

Each app is opened and run independently — there's no root `package.json` or workspace tying them together.

## Quick start

```bash
# Backend
cd backend
cp .env.example .env      # edit DATABASE_URL + JWT_SECRET
pnpm install
pnpm db:up                # from infra/, or: docker compose -f ../infra/docker-compose.yml up -d
pnpm prisma:migrate -- --name init
pnpm seed
pnpm dev                  # http://localhost:4000, health at /health

# Frontend (separate terminal)
cd frontend
cp .env.example .env
pnpm install
pnpm dev                  # http://localhost:5173, proxies /api/* to :4000
```

Logins (no default passwords — set them in `backend/.env`, see `backend/.env.example`):
- **Demo owners** (`pnpm seed`): phones `+919876500001`–`05`, password = `SEED_OWNER_PASSWORD`
- **Operator console** (`pnpm seed:admins`): `admin@checknbook.com` / `superadmin@checknbook.com`, passwords = `SEED_ADMIN_PASSWORD` / `SEED_SUPERADMIN_PASSWORD`
- **Guests** sign in with a phone OTP. There is no SMS gateway yet: in development the code is printed in the API console (`[DEV OTP] ...`).

## Common scripts (run inside each app's folder)

| Command | Where | What it does |
|---|---|---|
| `pnpm dev` | `backend/`, `frontend/` | hot-reload dev server |
| `pnpm build` | `backend/`, `frontend/` | production build |
| `pnpm prisma:migrate` | `backend/` | create/apply migrations (dev — may prompt/reset) |
| `pnpm prisma:deploy` | `backend/` | apply pending migrations only (use this on servers) |
| `pnpm prisma:studio` | `backend/` | open Prisma Studio |
| `pnpm seed` | `backend/` | demo data top-up (idempotent, never deletes; `SEED_RESET=true` wipes halls first) |
| `pnpm seed:admins` | `backend/` | create/refresh the operator console accounts |
| `pnpm test` | `backend/` | unit tests (vitest) |

Local Postgres: `docker compose -f infra/docker-compose.yml up -d` (see `infra/README.md`).

## What's in the starter

- **Data model** (`backend/prisma/schema.prisma`): `User`, `Hall`, `Area`, `Availability` (sparse), `Booking` (PENDING → CONFIRMED / CANCELLED), `Settings`.
- **API routes**: `/api/auth/*`, `/api/halls*`, `/api/admin/*` — all the endpoints listed in the architecture doc, with zod validation and JWT + role middleware.
- **Seed**: 1,000 demo halls across 10 Tamil Nadu cities (unroutable demo phone numbers), areas, and upcoming booked dates so search actually filters.
- **Frontend pages**: Search, Hall Details, Owner Login/Register, Owner Dashboard with a toggle-able calendar.
- **Mobile-first CSS**: 44px touch targets, thumb-reach call/WhatsApp buttons, 1/2/3-column grid at 600/960px breakpoints.
- **WhatsApp click-to-chat**: pure-client `wa.me` link with a pre-filled hall-specific message.

## What's deliberately NOT in the MVP

Online payment collection (bookings are requests the venue confirms; the venue collects the advance), a real SMS gateway (OTP codes are generated but only logged in dev; production refuses to send), photo uploads. Rationale in `docs/ARCHITECTURE.md` §11.

## Next steps

Follow `docs/ROADMAP.md` — it breaks the 1-2 week MVP into day-sized tasks.
