import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';

const router = Router();

// ---------- Public: search ----------
// GET /api/halls
//   ?city=Coimbatore
//   &area=Gandhipuram
//   &fromDate=2026-05-10&toDate=2026-05-11
//   &date=2026-05-12                (legacy single-date; equivalent to from=to=date)
//   &hasRooms=true&hasAC=true       (only applied if 'true')
//   &minPrice=&maxPrice=&q=
router.get('/', async (req, res, next) => {
  try {
    const city = (req.query.city as string | undefined)?.trim();
    const area = (req.query.area as string | undefined)?.trim();
    const dateStr = req.query.date as string | undefined;
    const fromStr = req.query.fromDate as string | undefined;
    const toStr = req.query.toDate as string | undefined;
    const hasRooms = req.query.hasRooms === 'true';
    const hasAC = req.query.hasAC === 'true';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where: any = { isApproved: true };
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (area) where.area = { equals: area, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { area: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (hasRooms) where.hasRooms = true;
    if (hasAC) where.hasAC = true;
    if (minPrice != null || maxPrice != null) {
      where.price = {};
      if (minPrice != null) where.price.gte = minPrice;
      if (maxPrice != null) where.price.lte = maxPrice;
    }

    // Date range: exclude halls with a BOOKED row anywhere in [from, to].
    // Accept fromDate+toDate, or a single legacy `date`.
    let from: Date | undefined;
    let to: Date | undefined;
    if (fromStr || toStr) {
      from = fromStr ? new Date(fromStr) : undefined;
      to = toStr ? new Date(toStr) : from;
      if (!from) from = to;
    } else if (dateStr) {
      from = new Date(dateStr);
      to = from;
    }
    if (from && to) {
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ error: 'Invalid date' });
      }
      if (from > to) return res.status(400).json({ error: 'fromDate must be <= toDate' });
      where.availability = {
        none: { date: { gte: from, lte: to }, status: 'BOOKED' },
      };
    }

    const limitRaw = req.query.limit ? Number(req.query.limit) : 200;
    const take = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200), 500);

    const halls = await prisma.hall.findMany({
      where,
      orderBy: { price: 'asc' },
      take,
    });
    res.json(halls);
  } catch (e) { next(e); }
});

// ---------- Public: filter options (cities + areas) ----------
// Areas come from the admin-managed Area table, merged with any non-empty
// hall.area strings still present (so legacy data without an Area row keeps
// showing in dropdowns).
router.get('/filters', async (_req, res, next) => {
  try {
    const [hallRows, areaRows] = await Promise.all([
      prisma.hall.findMany({
        where: { isApproved: true },
        select: { city: true, area: true },
      }),
      prisma.area.findMany({ select: { city: true, name: true } }),
    ]);
    const areasByCity: Record<string, Set<string>> = {};
    function add(city: string, area: string) {
      if (!city) return;
      if (!areasByCity[city]) areasByCity[city] = new Set();
      if (area) areasByCity[city].add(area);
    }
    for (const r of hallRows) add(r.city, r.area);
    for (const a of areaRows) add(a.city, a.name);

    const cities = Object.keys(areasByCity).sort();
    const out: Record<string, string[]> = {};
    for (const c of cities) out[c] = Array.from(areasByCity[c]).sort();
    res.json({ cities, areasByCity: out });
  } catch (e) { next(e); }
});

// ---------- Owner: my halls ----------
router.get('/mine', auth, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const halls = await prisma.hall.findMany({
      where: { ownerId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
    });
    res.json(halls);
  } catch (e) { next(e); }
});

// ---------- Public: single hall ----------
// Public visitors only see approved halls. Owners can see their own draft.
// Admins / Superadmins can preview any hall (used by the operator console).
router.get('/:id', async (req, res, next) => {
  try {
    const hall = await prisma.hall.findUnique({ where: { id: req.params.id } });
    if (!hall) return res.status(404).json({ error: 'Not found' });
    if (!hall.isApproved) {
      const header = req.header('authorization');
      let allowed = false;
      if (header?.startsWith('Bearer ')) {
        try {
          const { verifyToken } = await import('../lib/jwt');
          const payload = verifyToken(header.slice('Bearer '.length).trim());
          if (payload.role === 'ADMIN' || payload.role === 'SUPERADMIN' || payload.sub === hall.ownerId) {
            allowed = true;
          }
        } catch { /* invalid token — treat as anon */ }
      }
      if (!allowed) return res.status(404).json({ error: 'Not found' });
    }
    res.json(hall);
  } catch (e) { next(e); }
});

// ---------- Public: availability range ----------
router.get('/:id/availability', async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date();
    const to = req.query.to
      ? new Date(req.query.to as string)
      : new Date(from.getTime() + 1000 * 60 * 60 * 24 * 60); // +60 days

    const rows = await prisma.availability.findMany({
      where: { hallId: req.params.id, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// ---------- Owner: create hall ----------
const createHallSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  area: z.string().min(1),
  address: z.string().min(2),
  price: z.number().int().positive(),
  capacity: z.number().int().nonnegative().optional(),
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
  price: z.number().int().nonnegative().optional(),
  capacity: z.number().int().nonnegative().optional(),
  hasRooms: z.boolean().optional(),
  hasAC: z.boolean().optional(),
  imageUrl: z.string().url().optional().or(z.literal('').transform(() => null)).nullable(),
  contactNumber: z.string().regex(/^\+\d{10,15}$/).optional(),
  description: z.string().optional().nullable(),
  // ---- Rich fields (added 2026-04) ----
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  diningCapacity: z.number().int().nonnegative().optional(),
  amenities: z.array(z.string().min(1).max(40)).max(40).optional(),
  imageUrls: z.array(z.string().url()).max(20).optional(),
  perEventPrice: z.number().int().nonnegative().optional().nullable(),
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
    const hall = await prisma.hall.update({ where: { id: req.params.id }, data: patch });
    res.json(hall);
  } catch (e) { next(e); }
});

export default router;
