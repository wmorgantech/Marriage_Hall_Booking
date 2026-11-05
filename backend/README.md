# CheckNBook Backend

Express + TypeScript + Prisma + PostgreSQL.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local or hosted)

## Setup

```bash
cp .env.example .env      # edit DATABASE_URL + JWT_SECRET (+ SEED_*_PASSWORD, min 12 chars)
npm install
npm run prisma:deploy     # applies every migration in prisma/migrations
npm run seed              # demo halls/owners (idempotent top-up)
npm run seed:admins       # operator console accounts (admin@/superadmin@checknbook.com)
npm run dev
```

Server runs on `http://localhost:4000`. Health check at `/health`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Hot-reload dev server (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run prisma:migrate` | Create a new migration (dev) |
| `npm run prisma:deploy` | Apply pending migrations (servers) |
| `npm run prisma:studio` | Web UI for the DB |
| `npm run seed` | Top up demo users + halls (never deletes; `SEED_RESET=true` wipes halls first) |
| `npm run seed:admins` | Create/refresh operator accounts |
| `npm test` | Run vitest |

## Smoke test

```bash
# Login as a seeded demo owner (password = SEED_OWNER_PASSWORD from .env)
curl -s http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"phone":"+919876500001","password":"<SEED_OWNER_PASSWORD>"}'

# Public search (paged; total in the X-Total-Count header; contact numbers need a bearer token)
curl -i 'http://localhost:4000/api/halls?city=Chennai&sort=price-asc&limit=12&offset=0'
```

See `docs/ARCHITECTURE.md` in the repo root for full design notes.
