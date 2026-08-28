# CheckNBook — Architecture & Design

> Marriage Hall Availability Checker (MVP). City + date → instantly see which mandapams are free, pricing, contact, and a WhatsApp/call button.

---

## 1. Goals

- **User flow**: pick a city, pick a date, see available halls in seconds. Tap to call or WhatsApp the owner.
- **Owner flow**: register/login, add a hall, mark dates available/booked on a simple calendar.
- **Admin flow** (basic): approve halls so only vetted listings appear in search.
- **Non-goals for MVP**: payments, online booking, reviews, multi-day / multi-slot booking, photos gallery CDN. These are explicitly deferred.

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend (web) | React 18 + TypeScript + Vite | Fast dev server, typed, mobile-first |
| Styling | Plain CSS with mobile-first media queries | No build complexity; works offline |
| Routing | react-router-dom v6 | Standard |
| Date picker | `react-day-picker` | Lightweight, good mobile UX |
| Backend | Node.js 20 + Express + TypeScript | Fast to ship, large ecosystem |
| ORM | Prisma | Type-safe, great migrations, easy onboarding |
| DB | PostgreSQL 15+ | Strong date/constraint support |
| Auth | JWT (access token, 7-day expiry) + bcrypt | Stateless, simple for MVP |
| Validation | `zod` | Shared types between client/server possible later |
| Testing | `vitest` (both FE/BE) | Unified |

## 3. Repo Layout

> `backend` and `frontend` are independent applications, each with its own `package.json` and pnpm lockfile — there is no pnpm workspace at the root (there used to be; it was dissolved once the only cross-app dependency, shared DTOs, turned out to have exactly one consumer — see the note below). The companion Expo mobile app lives in the sibling `App/` folder as its own independent git repository.

```
Marriage Hall Project/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── scripts/
│   │   └── seed-admins.ts
│   ├── src/
│   │   ├── index.ts             # Express bootstrap
│   │   ├── lib/
│   │   │   ├── prisma.ts        # PrismaClient singleton
│   │   │   └── jwt.ts
│   │   ├── middleware/
│   │   │   └── auth.ts          # verifies JWT, attaches req.user; also exports requireRole()
│   │   └── routes/              # handlers, zod validation, and Prisma queries live directly here
│   │       ├── auth.routes.ts
│   │       ├── hall.routes.ts
│   │       ├── availability.routes.ts
│   │       ├── admin.routes.ts
│   │       ├── areas.routes.ts
│   │       └── settings.routes.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   └── types.ts         # shared DTOs — moved here from the old packages/types
│   │   │                          workspace package, since frontend is the only consumer
│   │   ├── pages/
│   │   │   ├── Search.tsx           # city + date picker, results list
│   │   │   ├── HallDetails.tsx      # hall info + call/WhatsApp buttons
│   │   │   ├── OwnerLogin.tsx
│   │   │   ├── OwnerRegister.tsx
│   │   │   ├── OwnerDashboard.tsx   # manage halls + calendar
│   │   │   ├── AdminLogin.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   └── AdminEditHall.tsx
│   │   ├── components/
│   │   ├── i18n/
│   │   ├── data/
│   │   └── styles/
│   │       └── global.css
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
├── infra/                   # docker-compose (Postgres), pm2 config, nginx template, systemd unit
├── docs/
│   ├── ARCHITECTURE.md  (this file)
│   ├── DEPLOYMENT.md
│   └── ROADMAP.md
├── README.md
└── App/                      # Expo mobile app — separate git repo, independent app
```

Note: `backend` has no separate `controllers/`/`services/`/`validators/` layer — route handlers, `zod` schemas, and Prisma queries are written directly in each `routes/*.routes.ts` file. Shared DTOs used to live in a workspace package (`packages/types`, `@checknbook/types`); since `frontend` was the only consumer and `backend` always defined its own inline zod shapes, that package was folded into `frontend/src/api/types.ts` as a plain relative import when the pnpm workspace was dissolved. `backend` and `frontend` each have their own `package.json`, `tsconfig.json`, and pnpm lockfile — no shared root config.

## 4. Data Model

```
User
├── id          String  (cuid)  PK
├── name        String
├── phone       String  UNIQUE
├── email       String? UNIQUE
├── passwordHash String
├── role        Enum(USER, OWNER, ADMIN)  default OWNER
└── createdAt   DateTime

Hall
├── id           String  (cuid)  PK
├── name         String
├── city         String           indexed (lowercased)
├── address      String
├── price        Int              (price per day, in smallest currency unit / ₹)
├── contactNumber String          (E.164 format, e.g. +919876543210)
├── description  String?
├── isApproved   Boolean default false   -- admin gate
├── ownerId      String  FK → User.id
└── createdAt    DateTime

Availability
├── id        String (cuid) PK
├── hallId    String FK → Hall.id  (onDelete: Cascade)
├── date      Date              -- @db.Date, no time component
├── status    Enum(AVAILABLE, BOOKED)  default AVAILABLE
└── UNIQUE (hallId, date)
```

### Availability semantics

Halls default to *available* unless a row exists saying otherwise. The UI only writes rows when the owner explicitly marks a date. For search, we return halls where **no** `Availability` row exists for that date with `status = BOOKED`. This keeps the table sparse.

Alternative considered: write a row for every date. Rejected — wastes rows, makes "far-future" lookups expensive.

## 5. API Contract

All JSON. Auth via `Authorization: Bearer <token>` where required. Errors shape: `{ error: string, details?: any }`.

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/halls?city=Chennai&date=2026-05-12` | List approved halls free on `date` in `city`. Supports `minPrice`, `maxPrice`, `q` (name search). |
| GET | `/api/halls/:id` | Single hall details. |
| GET | `/api/halls/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | Month-range calendar for hall details page. |

### Auth (owners)

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, phone, email?, password }` | Create OWNER account, returns token. |
| POST | `/api/auth/login` | `{ phone, password }` | Returns `{ token, user }`. |
| GET | `/api/auth/me` | — | Current user. |

### Owner (requires OWNER role)

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/halls` | `{ name, city, address, price, contactNumber, description? }` | Create hall (starts unapproved). |
| PATCH | `/api/halls/:id` | partial | Edit owned hall. |
| GET | `/api/halls/mine` | — | Owner's halls. |
| POST | `/api/halls/:id/availability` | `{ dates: ["2026-05-12", ...], status: "BOOKED" \| "AVAILABLE" }` | Bulk mark dates. |

### Admin (requires ADMIN role)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/halls?approved=false` | Pending halls. |
| POST | `/api/admin/halls/:id/approve` | Flip `isApproved = true`. |
| DELETE | `/api/admin/halls/:id` | Remove listing. |

## 6. Auth

- Passwords hashed with `bcrypt` (cost 10).
- JWT signed with `JWT_SECRET` (HS256), 7-day expiry, carries `{ sub, role }`.
- `auth` middleware parses token, loads user, attaches `req.user`.
- `requireRole('OWNER')` and `requireRole('ADMIN')` guard routes.
- No refresh tokens for MVP; re-login after expiry.

## 7. WhatsApp & Call Integration

Pure client-side — no API keys needed.

- Call: `<a href={`tel:${phone}`}>`
- WhatsApp: `https://wa.me/<phone-without-plus>?text=<urlencoded-message>`
  - Prefill message: `"Hi, I saw your hall '<hallName>' on CheckNBook. Is it available on <date>?"`
- Phone numbers stored in E.164 (`+919876543210`). Strip the `+` for the `wa.me` link.

## 8. Search Query (core)

```sql
-- Conceptually; Prisma equivalent in code.
SELECT h.*
FROM "Hall" h
WHERE h."isApproved" = true
  AND LOWER(h.city) = LOWER($1)
  AND NOT EXISTS (
    SELECT 1 FROM "Availability" a
    WHERE a."hallId" = h.id
      AND a.date = $2::date
      AND a.status = 'BOOKED'
  )
ORDER BY h.price ASC
LIMIT 50;
```

Index: `Hall(city, isApproved)`, `Availability(hallId, date)` — the UNIQUE constraint already gives the latter.

## 9. Frontend UX Notes

- **Search page** is the home page. Single input for city (datalist of common cities, free-text allowed), single date picker, prominent "Find Halls" button. Results appear as stacked cards below on mobile, grid on desktop.
- **Hall card**: name, city, price/day, two big thumb-reach buttons — Call and WhatsApp.
- **Hall details**: full info + month calendar showing booked dates in red, available in green.
- **Owner dashboard**: list of halls, each with a calendar. Tap a date to toggle booked/available. Bulk toolbar for marking a range.
- Mobile-first breakpoints: base → 600px → 960px.
- Touch targets ≥ 44×44 px.

## 10. Deployment (suggested, out of scope for starter)

- Backend: Render / Railway / Fly.io (Node + managed Postgres).
- Frontend: Vercel / Netlify.
- Env vars:
  - Backend: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`.
  - Frontend: `VITE_API_BASE_URL`.

## 11. Risks & Trade-offs

- **Sparse availability model** means "is this hall free?" is a NOT EXISTS query — fine at MVP scale, may need caching past ~50k halls.
- **No online payment / booking lock** — two users can both call an owner about the same date. Acceptable for MVP; owners confirm via phone.
- **Phone as username** — great for Indian market, but needs SMS OTP eventually to prevent impersonation. Password for MVP.
- **Admin approval** gates spam but adds friction. MVP sends a simple email; later add an admin web UI.

## 12. 1–2 Week Delivery Roadmap

See `docs/ROADMAP.md`.
