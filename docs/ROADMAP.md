# CheckNBook — 1-2 Week MVP Roadmap

## Week 1 — Backend + core flows

**Day 1 — Setup**
- `npm init` backend, install Prisma, Express, zod, bcrypt, jsonwebtoken.
- Provision Postgres locally (Docker) or on Railway.
- Run `prisma migrate dev` to create tables from `schema.prisma`.
- Seed 5 sample halls in Chennai/Bengaluru/Hyderabad.

**Day 2 — Auth**
- `/api/auth/register` + `/api/auth/login`.
- `auth` middleware, `requireRole` middleware.
- Manual test with curl/Postman.

**Day 3 — Hall CRUD**
- `POST /api/halls`, `GET /api/halls/mine`, `PATCH /api/halls/:id`.
- Ownership check (owner can only edit their halls).

**Day 4 — Availability + public search**
- `POST /api/halls/:id/availability` (bulk).
- `GET /api/halls?city=&date=` (the NOT EXISTS query).
- `GET /api/halls/:id` + `GET /api/halls/:id/availability`.

**Day 5 — Admin + polish**
- `/api/admin/halls` approve flow.
- Centralized error handler, request logging (pino).
- Postman collection checked into `/docs/postman.json`.

## Week 2 — Frontend + ship

**Day 6 — Frontend scaffold**
- `npm create vite@latest` (react-ts), wire `VITE_API_BASE_URL`.
- Global CSS, mobile-first grid.
- `HallCard`, `WhatsAppButton` components.

**Day 7 — Search flow**
- `Search` page: city input + date picker + submit.
- Render results list, empty state, loading skeleton.

**Day 8 — Hall details**
- `HallDetails` page with big call/WhatsApp buttons.
- `AvailabilityCalendar` (read-only, month view).

**Day 9 — Owner flow**
- `OwnerRegister`, `OwnerLogin`, token stored in memory + `localStorage`.
- `OwnerDashboard`: list halls, add hall form, toggle dates on calendar.

**Day 10 — Polish + deploy**
- Lighthouse pass on mobile (target 90+ perf, 100 a11y).
- Deploy backend to Railway, frontend to Vercel.
- Smoke test end-to-end on a real phone.

## Cut-list (if time runs short)

- Admin UI → use Prisma Studio locally instead for MVP.
- Email notifications → defer entirely.
- Multi-photo upload → single `imageUrl` field later.
