import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { auth, optionalAuth, requireRole } from '../middleware/auth';
import { ensureArea, missingHallFields, withContact } from '../lib/hall';
import { LIMITS } from '../lib/pricing';
import { ACTIVE_BOOKING, buildHallWhere, freeDaysFor, loadFilterOptions, mergeBookingHolds, num } from '../lib/hallSearch';
import { runAiSearch } from '../lib/aiSearch';
import { invalidateHallPaths, resolveHallPath, withPaths } from '../lib/hallUrl';

const router = Router();

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

// ---------- Public: search ----------
// GET /api/halls
//   ?city=Coimbatore
//   &area=Gandhipuram
//   &fromDate=2026-05-10&toDate=2026-05-11
//   &date=2026-05-12                (legacy single-date; equivalent to from=to=date)
//   &dates=2026-11-12,2026-11-20&match=all|any   (several separate dates, max 10; default all)
//   &hasRooms=true&hasAC=true&hasDining=true   (only applied if 'true')
//   &amenities=Valet Parking,Wifi              (hall must have every one)
//   &minPrice=&maxPrice=&minCapacity=&maxCapacity=&q=
//   &sort=popularity|price-asc|capacity-desc   (default popularity)
//   &limit=50&offset=0                         (limit capped at 200)
// The total number of matches is returned in the X-Total-Count header.
// A date is unavailable when the hall has a BOOKED availability row OR a PENDING/CONFIRMED booking on it.
// With `dates`, every hall also carries `freeDates` (which of the requested dates it is free on).
// Every hall carries `path`, its readable URL (/halls/<name-area>/<city>).
// Contact numbers are blanked for anonymous callers (send a bearer token to see them).
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const built = buildHallWhere(req.query as Record<string, unknown>);
    if ('error' in built) return res.status(400).json({ error: built.error });
    const where = built.where;

    // "Popularity" = number of bookings received (ties: newest first). Stable id tiebreak
    // keeps pages consistent while paginating.
    const sort = req.query.sort as string | undefined;
    const orderBy: any[] =
      sort === 'price-asc' ? [{ price: 'asc' }, { id: 'asc' }]
      : sort === 'capacity-desc' ? [{ capacity: 'desc' }, { id: 'asc' }]
      : [{ bookings: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'asc' }];

    const take = Math.min(Math.max(1, Math.floor(num(req.query.limit) ?? 50)), 200);
    const skip = Math.max(0, Math.floor(num(req.query.offset) ?? 0));

    const [total, halls] = await Promise.all([
      prisma.hall.count({ where }),
      prisma.hall.findMany({ where, orderBy, skip, take }),
    ]);
    res.setHeader('X-Total-Count', String(total));
    const free = built.days ? await freeDaysFor(prisma, halls.map((h) => h.id), built.days) : null;
    const out = halls.map((h) => ({
      ...withContact(h, !!req.user),
      ...(free ? { freeDates: free.get(h.id) ?? [], checkedDates: built.days } : {}),
    }));
    res.json(await withPaths(prisma, out));
  } catch (e) { next(e); }
});

// ---------- Public: filter options (cities + areas + price range) ----------
// Areas come from the admin-managed Area table, merged with any non-empty
// hall.area strings still present (so legacy data without an Area row keeps
// showing in dropdowns).
router.get('/filters', async (_req, res, next) => {
  try {
    res.json(await loadFilterOptions(prisma));
  } catch (e) { next(e); }
});

// ---------- Public: natural-language search ----------
// POST /api/halls/ai-search   { query: "Coimbatore-la December 12-ku 800 guests, parking, budget ₹2 lakh-kulla", limit?, offset? }
// Rule-based extraction -> the same filter builder as GET /api/halls -> explicit availability check against
// Availability records AND active bookings. Returns only real halls; what could not be confirmed is reported.
const aiSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many searches. Please wait a minute and try again.' },
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const criteriaSchema = z.object({
  city: z.string().trim().max(80).optional(),
  area: z.string().trim().max(80).optional(),
  date: day.optional(),
  dates: z.array(day).max(10).optional(),
  match: z.enum(['all', 'any']).optional(),
  minCapacity: z.number().int().min(1).max(10000).optional(),
  maxPrice: z.number().int().min(1000).max(100_000_000).optional(),
  minPrice: z.number().int().min(1000).max(100_000_000).optional(),
  hasAC: z.literal(true).optional(),
  hasRooms: z.literal(true).optional(),
  hasDining: z.literal(true).optional(),
  preferences: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  cheapFirst: z.literal(true).optional(),
});
const aiSearchSchema = z.object({
  query: z.string().trim().min(2, 'Please describe what you are looking for').max(300, 'Please keep the request under 300 characters'),
  limit: z.number().int().min(1).max(60).optional(),
  offset: z.number().int().min(0).max(5000).optional(),
  /** Edited criteria: searched exactly as given (validated), the text is kept only as a label. */
  criteria: criteriaSchema.optional(),
  /** The previous search's criteria: the text is read as a follow-up that refines them. */
  previous: criteriaSchema.optional(),
});
router.post('/ai-search', aiSearchLimiter, optionalAuth, async (req, res, next) => {
  try {
    const body = aiSearchSchema.parse(req.body);
    const result = await runAiSearch(prisma, body.query, {
      limit: body.limit, offset: body.offset, signedIn: !!req.user,
      criteria: body.criteria as any, previous: body.previous as any,
    });
    res.json({ ...result, halls: await withPaths(prisma, result.halls) });
  } catch (e) { next(e); }
});

// ---------- Owner: my halls ----------
router.get('/mine', auth, requireRole('OWNER', 'ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const halls = await prisma.hall.findMany({
      where: { ownerId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
    });
    res.json(await withPaths(prisma, halls));
  } catch (e) { next(e); }
});

// ---------- Public: hall by readable URL ----------
// GET /api/halls/url/kongu-palace-chromepet/chennai  -> same response (and same visibility rules) as GET /api/halls/:id
router.get('/url/:slug/:city', optionalAuth, async (req, res, next) => {
  try {
    const id = await resolveHallPath(prisma, req.params.slug, req.params.city);
    if (!id) return res.status(404).json({ error: 'Not found' });
    req.params.id = id;
    return sendHall(req, res);
  } catch (e) { next(e); }
});

// ---------- Public: single hall ----------
// Public visitors only see approved halls. Owners can see their own draft.
// Admins / Superadmins can preview any hall (used by the operator console).
// The contact number is only included for signed-in callers.
async function sendHall(req: import('express').Request, res: import('express').Response) {
  const hall = await prisma.hall.findUnique({ where: { id: req.params.id } });
  if (!hall) return res.status(404).json({ error: 'Not found' });
  if (!hall.isApproved) {
    const u = req.user;
    const allowed = !!u && (u.role === 'ADMIN' || u.role === 'SUPERADMIN' || u.sub === hall.ownerId);
    if (!allowed) return res.status(404).json({ error: 'Not found' });
  }
  const [withPath] = await withPaths(prisma, [withContact(hall, !!req.user)]);
  return res.json(withPath);
}
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    return await sendHall(req, res);
  } catch (e) { next(e); }
});

// ---------- Public: availability range ----------
// Defaults to the next ~13 months so calendars never show far-future dates as
// free simply because they were outside the fetched window.
// Dates held by a PENDING/CONFIRMED booking are included as BOOKED rows with source 'booking'
// (date only — no customer details), so every calendar shows them as unavailable.
const DEFAULT_AVAILABILITY_DAYS = 400;
router.get('/:id/availability', async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date();
    const to = req.query.to
      ? new Date(req.query.to as string)
      : new Date(from.getTime() + 1000 * 60 * 60 * 24 * DEFAULT_AVAILABILITY_DAYS);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }

    const [rows, held] = await Promise.all([
      prisma.availability.findMany({
        where: { hallId: req.params.id, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      prisma.booking.findMany({
        where: { hallId: req.params.id, date: { gte: from, lte: to }, status: { in: [...ACTIVE_BOOKING] } },
        select: { hallId: true, date: true },
      }),
    ]);
    res.json(mergeBookingHolds(rows, held));
  } catch (e) { next(e); }
});

// ---------- Owner: create hall ----------
const createHallSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  area: z.string().min(1),
  address: z.string().min(2),
  price: z.number().int().positive().max(LIMITS.price),
  capacity: z.number().int().nonnegative().max(LIMITS.headcount).optional(),
  hasRooms: z.boolean().optional(),
  hasAC: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
  contactNumber: z.string().regex(/^\+\d{10,15}$/),
  description: z.string().optional(),
});

// Patch schema is more permissive — accepts the rich fields and allows
// empty strings for draft halls (because owner-created drafts start with
// empty city/area/address/price=0 and may be edited piece by piece).
const patchHallSchema = z.object({
  name: z.string().min(2).optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  address: z.string().optional(),
  price: z.number().int().nonnegative().max(LIMITS.price).optional(),
  capacity: z.number().int().nonnegative().max(LIMITS.headcount).optional(),
  hasRooms: z.boolean().optional(),
  hasAC: z.boolean().optional(),
  imageUrl: z.string().url().optional().or(z.literal('').transform(() => null)).nullable(),
  contactNumber: z.string().regex(/^\+\d{10,15}$/).optional(),
  description: z.string().optional().nullable(),
  // ---- Rich fields (added 2026-04) ----
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  diningCapacity: z.number().int().nonnegative().max(LIMITS.headcount).optional(),
  amenities: z.array(z.string().min(1).max(40)).max(40).optional(),
  imageUrls: z.array(z.string().url()).max(20).optional(),
  perEventPrice: z.number().int().nonnegative().max(LIMITS.perEventPrice).optional().nullable(),
  advancePercent: z.number().int().min(0).max(100).optional(),
  cancellationPolicy: z.string().max(2000).optional().nullable(),
  houseRules: z.string().max(2000).optional().nullable(),
});

router.post('/', auth, requireRole('OWNER', 'ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const data = createHallSchema.parse(req.body);
    const hall = await prisma.hall.create({
      data: { ...data, ownerId: req.user!.sub, isApproved: false },
    });
    await ensureArea(hall.city, hall.area);
    invalidateHallPaths();
    res.status(201).json(hall);
  } catch (e) { next(e); }
});

// ---------- Owner / admin: update hall ----------
router.patch('/:id', auth, requireRole('OWNER', 'ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.hall.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const role = req.user!.role;
    const isOwner = existing.ownerId === req.user!.sub;
    const isStaff = role === 'ADMIN' || role === 'SUPERADMIN';
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'Not your hall' });
    }
    const patch = patchHallSchema.parse(req.body);

    // A live hall must stay complete — drafts may be edited piece by piece.
    if (existing.isApproved) {
      const missing = missingHallFields({ ...existing, ...patch } as typeof existing);
      if (missing.length) {
        throw httpError(400, `A live hall must keep these fields filled in: ${missing.join(', ')}`);
      }
    }

    const hall = await prisma.hall.update({ where: { id: req.params.id }, data: patch });
    await ensureArea(hall.city, hall.area);
    invalidateHallPaths();
    res.json(hall);
  } catch (e) { next(e); }
});

// ---------- Owner / admin: bookings for a hall ----------
// Availability alone only shows a date is blocked; this surfaces who
// actually booked it (name/phone/event details) to the hall's owner.
router.get('/:id/bookings', auth, async (req, res, next) => {
  try {
    const hall = await prisma.hall.findUnique({ where: { id: req.params.id } });
    if (!hall) return res.status(404).json({ error: 'Not found' });
    const role = req.user!.role;
    const isOwner = hall.ownerId === req.user!.sub;
    const isStaff = role === 'ADMIN' || role === 'SUPERADMIN';
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Not your hall' });

    const bookings = await prisma.booking.findMany({
      where: { hallId: hall.id },
      orderBy: { date: 'asc' },
      take: 500,
    });
    res.json(bookings);
  } catch (e) { next(e); }
});

export default router;
