# CheckNBook — Mobile App Assessment Report

> Source system analyzed: `C:\WM Apps\2026 Applications\MHall Availability checker`
> Target: React Native app (public + hall-owner features only — **no admin/superadmin**)
> New mobile source lives at: `C:\WM Apps\2026 Applications\CheckNBook Mobile App` (this folder)

---

## 1. Existing System Snapshot

**Product**: CheckNBook — marriage hall ("mandapam") availability checker for Tamil Nadu. Guests search by city/area/date and see free halls instantly; owners manage their hall listings and availability calendars; admins approve listings (web-only, out of scope for mobile).

**Repo shape**: pnpm workspace monorepo.

```
MHall Availability checker/
├── apps/
│   ├── api/      Express + TypeScript + Prisma (backend)
│   └── web/      React 18 + TypeScript + Vite (web frontend)
├── packages/
│   └── types/    Shared TS types (Hall, User, Availability, DTOs)
├── infra/        pm2 ecosystem, nginx, systemd, docker-compose
└── docs/         ARCHITECTURE.md, ROADMAP.md, DEPLOYMENT.md
```

## 2. Tech Stack (current)

| Layer | Choice |
|---|---|
| Web frontend | React 18.3 + TypeScript 5.5 + Vite 5.4 |
| Routing | react-router-dom v6 |
| Styling | **Tailwind CSS via CDN** (`cdn.tailwindcss.com`), inline theme config in `index.html` — no `tailwind.config.js` file |
| State management | **None** — local `useState`/`useEffect` per component; auth/lang/toast state synced via `localStorage` + custom `window` events (`cnb:auth-changed`, `cnb:lang-changed`, `cnb:toast`) |
| Form handling | **Manual** — no react-hook-form/formik/zod on the frontend; validation is ad-hoc per field, errors deferred mostly to backend |
| HTTP client | Native `fetch` wrapper (`apps/web/src/api/client.ts`) — no axios |
| Calendar | `react-day-picker` v9 |
| Dates | `date-fns` v3 |
| i18n | Custom EN/TA/"both" system, `localStorage` key `cnb_lang`, ~100+ string keys |
| Icons | Material Symbols Outlined (Google Fonts CDN) |
| Fonts | Noto Serif (headings), Manrope (body), Noto Sans Tamil (Tamil) — all Google Fonts CDN |
| Backend | Node 20 + Express 4 + TypeScript |
| ORM / DB | Prisma 5 + PostgreSQL 15+ |
| Auth | JWT (HS256, 7-day expiry) + bcryptjs; OTP flow for guests |
| Validation (backend) | zod, inline per route file (no shared validators folder) |
| Security middleware | helmet, cors, express-rate-limit, morgan |
| Process mgmt | pm2 (Windows), nginx/systemd configs for Linux deploy |

**No global state library, no design-system package, no component library** — everything is bespoke Tailwind utility classes + custom components. This is good news for a from-scratch RN rebuild: there's no Redux store or context tree to port, just data-fetching + local UI state per screen.

## 3. Design System / Branding (carry forward exactly)

**Colors** (Material Design 3–style tokens, defined inline in `apps/web/index.html`):

| Token | Hex | Use |
|---|---|---|
| `primary` | `#610000` | Deep maroon — buttons, links, brand |
| `primary-container` | `#8b0000` | Lighter maroon — hover/containers |
| `secondary` | `#735c00` | Mustard-brown |
| `secondary-container` | `#fed65b` | Golden yellow — badges/buttons |
| `gold` | `#D4AF37` | Accent — borders, decorative dots |
| `surface` / `background` | `#fff8f5` | Warm off-white page background |
| `surface-container` | `#f5ece7` | Default card/container bg |
| `on-surface` | `#1e1b18` | Primary text |
| `on-surface-variant` | `#5a403c` | Secondary text |
| `outline` | `#8e706b` | Borders |
| `error` | `#ba1a1a` | Error red |

**Typography**: `Noto Serif` (headings, brand), `Manrope` (body/UI), `Noto Sans Tamil` (Tamil text). Scale: `h1` 48px/700, `h2` 32px/600, `h3` 24px/600, body-lg 18px, body-md 16px, label-caps 12px/700/uppercase.

**Icons**: Material Symbols Outlined — RN equivalent: `react-native-vector-icons/MaterialSymbolsOutlined` or `@expo/vector-icons` (MaterialIcons is close but not identical; consider bundling the actual Material Symbols font for visual parity).

**Spacing base**: 8px unit. Touch targets ≥44×44px already a stated requirement in the original architecture doc — directly compatible with RN/mobile HIG.

**Bilingual rendering** (just fixed on web): inline `"English / தமிழ்"` format for "both" mode — replicate this pattern rather than the earlier stacked-line version, since stacking caused overlap/clipping bugs.

## 4. Backend API (reused as-is — no backend changes needed for mobile)

Base URL pattern: `{API_BASE}/api/...`, JSON in/out, `Authorization: Bearer <jwt>` for protected routes. Errors: `{ error: string, details?: unknown }`.

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/halls` | Search halls — `city`, `area`, `date` or `fromDate`/`toDate`, `hasRooms`, `hasAC`, `minPrice`, `maxPrice`, `q`, `limit` |
| GET | `/api/halls/filters` | `{ cities[], areasByCity }` for dropdowns |
| GET | `/api/halls/:id` | Hall detail |
| GET | `/api/halls/:id/availability?from&to` | Calendar range |
| GET | `/api/areas?city=` | Area list |
| GET | `/api/settings` | Customer-care phone/email |

### Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `name, phone, email?, password, hallName` | Creates OWNER + draft hall (unapproved) |
| POST | `/api/auth/login` | `phone, password` | Owner login |
| POST | `/api/auth/otp/request` | `phone` | **No real SMS gateway wired up — returns `{ok:true}` immediately; verify step accepts hardcoded `1234`.** Must fix before any real mobile launch. |
| POST | `/api/auth/otp/verify` | `phone, otp, name?` | Creates/logs in guest USER |
| GET | `/api/auth/me` | — | Current user (auth required) |

### Owner (role OWNER/ADMIN)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/halls/mine` | Owner's halls |
| POST | `/api/halls` | Create hall (starts unapproved) |
| PATCH | `/api/halls/:id` | Update hall (incl. rich fields: lat/lng, amenities[], imageUrls[], advancePercent, cancellationPolicy, houseRules) |
| POST | `/api/halls/:id/availability` | Bulk set dates `{dates[], status}` |

**Admin-only endpoints exist** (`/api/admin/*` — stats, approve/reject halls, manage owners/users/areas/settings) but are explicitly **out of scope for mobile** per your requirement.

**JWT payload**: `{ sub: userId, role }`, HS256, 7-day expiry, no refresh token. Roles: `USER` (guest/searcher), `OWNER`, `ADMIN`, `SUPERADMIN` (latter two = web-only).

## 5. Data Model (Prisma — unchanged for mobile)

```
User          id, name, phone(unique), email?(unique), passwordHash, role, createdAt
Hall          id, name, city, area, address, price(₹/day), capacity, hasRooms, hasAC,
              imageUrl, imageUrls[], contactNumber, description, isApproved,
              latitude?, longitude?, diningCapacity, amenities[], perEventPrice,
              advancePercent, cancellationPolicy, houseRules, ownerId, createdAt, updatedAt
Area          id, city, name
Availability  id, hallId, date(@db.Date), status(AVAILABLE|BOOKED) — UNIQUE(hallId,date)
Settings      singleton — customerCarePhone, customerCareEmail
```

Availability is **sparse**: a hall is assumed available unless a `BOOKED` row exists for that date.

## 6. Frontend Screens → Mobile Screen Mapping

| Web page | Route | Mobile screen (proposed) | In scope? |
|---|---|---|---|
| `Search.tsx` | `/` | **Home / Search** — hero, search bar, filters, results list | ✅ |
| `HallDetails.tsx` | `/halls/:id` | **Hall Detail** — gallery, price, amenities, availability calendar, call/WhatsApp CTA | ✅ |
| `OwnerLogin.tsx` | `/owner/login` | **Owner Login** | ✅ |
| `OwnerRegister.tsx` | `/owner/register` | **Owner Register** | ✅ |
| `OwnerDashboard.tsx` | `/owner/dashboard` | **My Halls** — hall list, availability toggle calendar, create hall | ✅ |
| OTP modal (`OtpAuthModal.tsx`) | (modal, any page) | **OTP Login Sheet** — gates contact-reveal for guests | ✅ |
| `AdminLogin.tsx`, `AdminDashboard.tsx`, `AdminEditHall.tsx` | `/admin*` | — | ❌ excluded per requirement |

### Reusable component inventory (web → RN equivalent)

| Web component | Purpose | RN approach |
|---|---|---|
| `HallCard` | Hall summary card, masked contact until OTP-verified | `<HallCard>` with `Pressable`, `FlatList` item |
| `AvailabilityCalendar` | react-day-picker wrapper, booked(red)/muhurtham(gold★) marks | `react-native-calendars` (Calendar/Agenda) with custom day component |
| `WhatsAppButton` | `wa.me` deep link | `Linking.openURL` |
| `HeroSlider` | Auto-rotating image hero | `react-native-reanimated-carousel` or simple `FlatList` paging |
| `FiltersPanel` | City/area/date/capacity/price filters | Bottom sheet (`@gorhom/bottom-sheet`) |
| `SortBar` | Result count + sort | Simple row + native picker/action sheet |
| `RecentBookingsBanner` | Polling live-bookings ticker | Lower priority for v1 — re-evaluate after core flows ship (uses an admin endpoint) |
| `Toast` | Custom toast system | `react-native-toast-message` or a small custom port (same event-driven pattern) |
| `LangToggle` | EN/TA/both switch | Same localStorage-style pattern via `AsyncStorage` |
| `Combobox` / `GlobalSearch` | Debounced search w/ ARIA | `TextInput` + debounced fetch + `FlatList` dropdown |
| `OtpAuthModal` | Phone → OTP two-step | Modal/bottom-sheet, same two-step flow |

## 7. Auth Strategy for Mobile

- Store JWT in **`expo-secure-store`** (not `AsyncStorage`) — current web uses plain `localStorage`, which is the mobile equivalent of *not* encrypting the token; don't carry that weakness over.
- Mirror `api/client.ts`'s fetch-wrapper pattern: a single `apiFetch()` helper that injects `Authorization: Bearer <token>`, parses `{error}` JSON on failure.
- Auth state via a small RN context (`AuthProvider`) instead of `window` custom events (no `window` in RN) — equivalent role, React Context replaces the DOM event bus.
- **OTP is currently fake** (hardcoded `1234`, no SMS sent). This must be flagged to the backend owner — either wire a real SMS provider (e.g., MSG91, Twilio Verify) before mobile launch, or mobile OTP screens will need backend changes in lockstep.

## 8. Gaps / Risks Carried Into Mobile Scope

1. **OTP is a stub** — no real SMS gateway. Needs backend work before production mobile release; not a frontend-only fix.
2. **No refresh tokens** — 7-day JWT, user must re-login after expiry; fine for MVP, same behavior on mobile.
3. **No image upload endpoint** — `imageUrl`/`imageUrls[]` are plain string fields; owners currently paste URLs. If mobile should let owners upload photos from their camera/gallery, this needs a new backend endpoint (e.g., S3/Cloudinary signed upload) — out of current API surface.
4. **CORS_ORIGIN is currently a single web origin** (the production web app's address) — a native app calling the API isn't subject to CORS (CORS is a browser concept), so this is fine as-is for RN, but confirm the API's rate limiting (600 req/15min general, 20/15min on auth) is generous enough for mobile usage patterns. Note: ports in production are redeployed from time to time — check `infra/pm2.ecosystem.config.js` in the main repo for the current live API port rather than assuming a fixed value.
5. **Maps**: web embeds a Google Maps `<iframe>` for hall location — mobile should use `react-native-maps` with the existing `latitude`/`longitude` fields (already in the schema, optional).
6. **No design tokens file** — colors/fonts live inline in `index.html`'s Tailwind CDN config, not in a shareable JSON/TS file. Recommend extracting them once into a `theme.ts` in this new mobile repo (done as a starting point in section 3 above) rather than re-deriving from screenshots each time.

## 9. Recommended Mobile Tech Stack

| Concern | Recommendation | Why |
|---|---|---|
| Framework | **Expo (React Native, TypeScript)** | Fast iteration, OTA updates, easy camera/maps/secure-store access, matches team's existing TS comfort |
| Navigation | `@react-navigation/native` (native-stack + bottom-tabs) | De facto standard, matches the web's tab-like bottom nav (`MobileBottomNav`) already designed for mobile |
| State/data fetching | `@tanstack/react-query` for server state + small `Context`/`zustand` for auth/lang | Web has no caching layer today (plain fetch); React Query gives you caching/retry "for free" without inventing a new architecture |
| Forms | `react-hook-form` (+ optionally `zod` resolver, reusing backend's zod schemas as a model) | Web's manual validation was a known gap; worth doing properly on mobile since native keyboards/UX punish bad form handling more |
| Calendar | `react-native-calendars` | Closest match to react-day-picker's marking API (booked/muhurtham dots) |
| Storage | `expo-secure-store` (token), `@react-native-async-storage/async-storage` (lang pref, recent searches) | Match sensitivity of data to storage security |
| Styling | `nativewind` (Tailwind-for-RN) | Lets you reuse the exact color/spacing tokens and most className intuition from the web app with minimal translation |
| Icons | `@expo/vector-icons` (MaterialIcons) as a stand-in, or bundle the actual Material Symbols variable font for pixel parity | Visual consistency with web |
| i18n | Port the existing custom `t()`/`translations.ts` dictionary directly — it's framework-agnostic data | No need for `i18next` unless the team wants it; current system is simple and works |

## 10. Suggested Build Order

1. **Scaffold + theme** — Expo app, NativeWind config with the exact color tokens above, font loading (Noto Serif/Manrope/Noto Sans Tamil), shared `apiFetch` client pointing at the same backend (`.env`-driven via `EXPO_PUBLIC_API_BASE_URL`, currently `http://192.168.1.100:4000`).
2. **Search/Home** — hero, search bar, filters bottom-sheet, results list (`GET /api/halls`, `/api/halls/filters`).
3. **Hall Detail** — gallery, calendar, contact CTAs, OTP-gated reveal.
4. **Owner auth + dashboard** — login/register, my-halls list, availability calendar toggle, create-hall form.
5. **OTP flow** — phone → OTP bottom sheet (flag the stub-OTP backend issue to product owner before this ships to real users).
6. **Polish** — i18n toggle, recent-bookings banner (optional/low priority), maps for hall location, deep linking (`tel:`/WhatsApp), error boundaries, offline/empty states.

---

*This report is a planning artifact only — no mobile code has been written yet. Source code for the React Native app will live in this folder (`CheckNBook Mobile App`), kept separate from the existing web/api repo.*
