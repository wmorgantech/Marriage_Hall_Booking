# CheckNBook — Marriage Hall Availability Checker

City + date → instantly see which mandapams are free. Tap to call or WhatsApp the owner. No more ringing ten halls in a row.

pnpm-workspace monorepo: **`backend`** (Express + Prisma) + **`frontend`** (React + Vite) + **`packages/types`** (shared TS types) + **`infra/`** (Docker Compose for local Postgres). The companion Expo mobile app lives in the sibling `App/` folder as its own independent git repository.

## Stack

- **frontend**: React 18 + TypeScript + Vite, mobile-first CSS, `react-day-picker`.
- **backend**: Node.js 20 + Express + TypeScript, Prisma ORM, JWT auth, zod validation.
- **Database**: PostgreSQL 15+ (via `infra/docker-compose.yml`).
- **Package manager**: pnpm 9 with workspaces.

See `docs/ARCHITECTURE.md` for the full design, `docs/ROADMAP.md` for the 1-2 week plan, and `docs/DEPLOYMENT.md` for deploying to a Hostinger VPS with HTTPS.

## Repo layout

```
.
├── backend/                 Express + Prisma backend (@checknbook/api)
├── frontend/                React + Vite frontend (@checknbook/web)
├── App/                     Expo mobile app (own independent git repo)
├── packages/
│   └── types/               Shared TS types / DTOs (@checknbook/types)
├── infra/
│   ├── docker-compose.yml   Local Postgres
│   └── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
├── .vscode/                 Shared VS Code settings, tasks, launch configs
├── checknbook.code-workspace
├── package.json             Root — scripts delegate to workspaces via pnpm
├── pnpm-workspace.yaml
├── tsconfig.base.json       Shared base TS config extended by every app/package
├── .env.example
├── .npmrc
└── .gitignore
```

## Open in VS Code

Double-click **`checknbook.code-workspace`**. You'll see `root`, `backend`, `frontend`, `packages/types`, `infra`, `docs`, and `App` as separate roots with shared settings, recommended extensions (ESLint, Prettier, Prisma, Docker, dotenv, GitLens), and debug configs pre-wired.

## Quick start (from the repo root)

```bash
# 1. Install pnpm if you don't have it
npm i -g pnpm

# 2. Env
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Install all workspaces
pnpm install

# 4. Start Postgres (Docker)
pnpm db:up

# 5. Create DB schema + seed sample data
pnpm prisma:migrate -- --name init
pnpm seed

# 6. Run api + web together
pnpm dev
```

- API → `http://localhost:4000` (health: `/health`)
- Web → `http://localhost:5173` (Vite proxies `/api/*` to 4000)

Seeded logins:
- **Owner**: phone `+919876500001`, password `owner123`
- **Admin**: phone `+910000000000`, password `admin123`

## Common scripts (from root)

| Command | What it does |
|---|---|
| `pnpm dev` | api + web concurrently (color-coded) |
| `pnpm dev:api` | only the API |
| `pnpm dev:web` | only the web app |
| `pnpm build` | build all workspaces |
| `pnpm lint` | lint all workspaces |
| `pnpm typecheck` | typecheck all workspaces |
| `pnpm prisma:migrate` | run Prisma migrations on the API |
| `pnpm prisma:studio` | open Prisma Studio |
| `pnpm seed` | reseed the DB |
| `pnpm db:up` / `db:down` / `db:reset` | manage local Postgres container |

## Sharing types across apps

`packages/types` is a workspace member consumed via `"@checknbook/types": "workspace:*"`. In practice only `frontend` currently imports from it (see `frontend/src/api/client.ts`); `backend` declares the dependency but defines its own inline validation shapes.

## What's in the starter

- **Data model** (`backend/prisma/schema.prisma`): `User`, `Hall`, `Availability` with the right indexes and a sparse availability table.
- **API routes**: `/api/auth/*`, `/api/halls*`, `/api/admin/*` — all the endpoints listed in the architecture doc, with zod validation and JWT + role middleware.
- **Seed**: five halls across three cities, with a couple of pre-booked dates so search actually filters.
- **Frontend pages**: Search, Hall Details, Owner Login/Register, Owner Dashboard with a toggle-able calendar.
- **Mobile-first CSS**: 44px touch targets, thumb-reach call/WhatsApp buttons, 1/2/3-column grid at 600/960px breakpoints.
- **WhatsApp click-to-chat**: pure-client `wa.me` link with a pre-filled hall-specific message.

## What's deliberately NOT in the MVP

Online payment / booking locks, SMS OTP signup, photo uploads, admin web UI (use `pnpm prisma:studio`), React Native app. Rationale in `docs/ARCHITECTURE.md` §11.

## Next steps

Follow `docs/ROADMAP.md` — it breaks the 1-2 week MVP into day-sized tasks.
