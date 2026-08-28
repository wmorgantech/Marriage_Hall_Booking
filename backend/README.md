# CheckNBook Backend

Express + TypeScript + Prisma + PostgreSQL.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local or hosted)

## Setup

```bash
cp .env.example .env      # edit DATABASE_URL + JWT_SECRET
npm install
npm run prisma:migrate -- --name init
npm run seed
npm run dev
```

Server runs on `http://localhost:4000`. Health check at `/health`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Hot-reload dev server (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run prisma:migrate` | Create/apply migrations |
| `npm run prisma:studio` | Web UI for the DB |
| `npm run seed` | Insert sample users + halls |
| `npm test` | Run vitest |

## Smoke test

```bash
# Login as seeded owner
curl -s http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"phone":"+919876500001","password":"owner123"}'

# Public search
curl 'http://localhost:4000/api/halls?city=Chennai&date=2026-05-12'
```

See `docs/ARCHITECTURE.md` in the repo root for full design notes.
