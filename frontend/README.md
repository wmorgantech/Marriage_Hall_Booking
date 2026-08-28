# CheckNBook Frontend

React 18 + TypeScript + Vite. Mobile-first.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Opens on `http://localhost:5173`. Vite proxies `/api/*` to `http://localhost:4000` (your backend).

## Pages

- `/` — Search (city + date → results list)
- `/halls/:id` — Hall details with call/WhatsApp buttons + availability calendar
- `/owner/login` — Owner login
- `/owner/register` — Owner registration
- `/owner/dashboard` — Owner's halls + calendar editor

## Build

```bash
npm run build
npm run preview
```

## Notes

- Tokens live in `localStorage` (`cnb_token`) for MVP. Rotate to HttpOnly cookies if you add CSRF-sensitive actions.
- `react-day-picker` is used for both the public search date picker and the owner's booking calendar.
- Phone numbers are assumed to be stored/entered in E.164 (e.g. `+919876543210`). The WhatsApp button strips the `+` for `wa.me` links.
