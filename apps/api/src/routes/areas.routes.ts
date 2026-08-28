import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';

const router = Router();

// ---- Public ---------------------------------------------------
// GET /api/areas?city=Coimbatore  (omit city to get all)
router.get('/areas', async (req, res, next) => {
  try {
    const city = (req.query.city as string | undefined)?.trim();
    const where = city ? { city: { equals: city, mode: 'insensitive' as const } } : {};
    const rows = await prisma.area.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// ---- Admin ---------------------------------------------------
const adminAreas = Router();
adminAreas.use(auth, requireRole('ADMIN', 'SUPERADMIN'));

const createSchema = z.object({
  city: z.string().min(2).max(80).trim(),
  name: z.string().min(1).max(80).trim(),
});

// GET /api/admin/areas?q=&city=&page=&limit=
adminAreas.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const city = (req.query.city as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));

    const where: any = {};
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, areas] = await Promise.all([
      prisma.area.count({ where }),
      prisma.area.findMany({
        where,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Hall counts per area for admin display
    const counts = await prisma.hall.groupBy({
      by: ['city', 'area'],
      where: { area: { not: '' } },
      _count: { _all: true },
    });
    const countMap = new Map<string, number>();
    for (const c of counts) {
      countMap.set(`${c.city.toLowerCase()}|${c.area.toLowerCase()}`, c._count._all);
    }

    res.json({
      areas: areas.map((a) => ({
        ...a,
        hallCount: countMap.get(`${a.city.toLowerCase()}|${a.name.toLowerCase()}`) ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) { next(e); }
});

adminAreas.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const existing = await prisma.area.findUnique({
      where: { city_name: { city: data.city, name: data.name } },
    });
    if (existing) return res.status(409).json({ error: 'Area already exists in this city' });
    const area = await prisma.area.create({ data });
    res.status(201).json(area);
  } catch (e) { next(e); }
});

const patchSchema = createSchema.partial();
adminAreas.patch('/:id', async (req, res, next) => {
  try {
    const data = patchSchema.parse(req.body);
    if (!data.city && !data.name) return res.status(400).json({ error: 'Nothing to update' });
    const before = await prisma.area.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Area not found' });
    const after = await prisma.area.update({ where: { id: req.params.id }, data });
    // If the rename happened, propagate to existing halls so search filters stay consistent
    const cityChanged = data.city != null && data.city !== before.city;
    const nameChanged = data.name != null && data.name !== before.name;
    if (cityChanged || nameChanged) {
      await prisma.hall.updateMany({
        where: { city: before.city, area: before.name },
        data: {
          city: after.city,
          area: after.name,
        },
      });
    }
    res.json(after);
  } catch (e) { next(e); }
});

adminAreas.delete('/:id', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    const before = await prisma.area.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Area not found' });
    const inUse = await prisma.hall.count({ where: { city: before.city, area: before.name } });
    if (inUse > 0 && req.query.force !== 'true') {
      return res.status(409).json({
        error: `${inUse} hall${inUse === 1 ? '' : 's'} still use this area. Pass ?force=true to delete anyway (existing halls will keep the area string).`,
        hallCount: inUse,
      });
    }
    await prisma.area.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

export { router as default, adminAreas };
