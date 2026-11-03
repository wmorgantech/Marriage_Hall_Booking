import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { missingHallFields } from '../lib/hall';
import { invalidateHallPaths } from '../lib/hallUrl';

const router = Router();

// All routes here require ADMIN or SUPERADMIN. Destructive ones add an
// extra requireRole('SUPERADMIN') guard inline below.
router.use(auth, requireRole('ADMIN', 'SUPERADMIN'));

// GET /api/admin/stats — high-level dashboard counters + chart data
// "Bookings" figures come from the Booking table (real customer bookings).
// `totalBookedDates` is the number of calendar dates blocked on halls — it
// includes dates owners blocked by hand, so it is not a booking count.
router.get('/stats', async (_req, res, next) => {
  try {
    const [
      totalHalls,
      pendingHalls,
      approvedHalls,
      totalOwners,
      totalUsers,
      totalBookedDates,
      cityRows,
      totalAreas,
      hallsPerCity,
      bookingsByStatus,
    ] = await Promise.all([
      prisma.hall.count(),
      prisma.hall.count({ where: { isApproved: false } }),
      prisma.hall.count({ where: { isApproved: true } }),
      prisma.user.count({ where: { role: 'OWNER' } }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.availability.count({ where: { status: 'BOOKED' } }),
      prisma.hall.findMany({ where: { isApproved: true }, select: { city: true }, distinct: ['city'] }),
      prisma.area.count(),
      prisma.hall.groupBy({
        by: ['city'],
        where: { isApproved: true, NOT: { city: '' } },
        _count: { _all: true },
      }),
      prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    // Top 10 cities by hall count, sorted desc
    const hallsByCity = hallsPerCity
      .map((r) => ({ city: r.city, count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const countOf = (s: 'PENDING' | 'CONFIRMED' | 'CANCELLED') =>
      bookingsByStatus.find((r) => r.status === s)?._count._all ?? 0;
    const pendingBookings = countOf('PENDING');
    const confirmedBookings = countOf('CONFIRMED');
    const cancelledBookings = countOf('CANCELLED');

    // Bookings created per day for the last 14 days (UTC days, oldest first)
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13));
    const recentBookings = await prisma.booking.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const bookingsByDay: { date: string; count: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      bookingsByDay.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    for (const r of recentBookings) {
      const slot = bookingsByDay.find((b) => b.date === r.createdAt.toISOString().slice(0, 10));
      if (slot) slot.count++;
    }

    res.json({
      totalHalls,
      pendingHalls,
      approvedHalls,
      totalOwners,
      totalUsers,
      totalBookedDates,
      totalBookings: pendingBookings + confirmedBookings + cancelledBookings,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      totalCities: cityRows.length,
      totalAreas,
      hallsByCity,
      bookingsByDay,
    });
  } catch (e) { next(e); }
});

// GET /api/admin/recent-bookings?limit=8 — latest customer bookings with hall info
router.get('/recent-bookings', async (req, res, next) => {
  try {
    const lim = Math.min(Math.max(1, Number(req.query.limit) || 8), 50);
    const rows = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: lim,
      include: {
        hall: { select: { id: true, name: true, city: true, area: true, isApproved: true } },
      },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        date: r.date,
        createdAt: r.createdAt,
        status: r.status,
        customerName: r.customerName,
        hall: r.hall,
      })),
    );
  } catch (e) { next(e); }
});

// GET /api/admin/halls?approved=false|true|all&page=1&limit=10&q=&city=
router.get('/halls', async (req, res, next) => {
  try {
    const approved = req.query.approved;
    const q = (req.query.q as string | undefined)?.trim();
    const city = (req.query.city as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

    const where: any =
      approved === 'false' ? { isApproved: false } :
      approved === 'true'  ? { isApproved: true  } :
      {};
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { area: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { owner: { name: { contains: q, mode: 'insensitive' } } },
        { owner: { phone: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, halls] = await Promise.all([
      prisma.hall.count({ where }),
      prisma.hall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    res.json({
      halls,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) { next(e); }
});

// GET /api/admin/owners?page=1&limit=10&q=
router.get('/owners', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

    const where: any = { role: 'OWNER' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, owners] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, name: true, phone: true, email: true, createdAt: true,
          _count: { select: { halls: true } },
        },
      }),
    ]);

    res.json({
      owners,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) { next(e); }
});

// GET /api/admin/users?page=1&limit=10&q=
router.get('/users', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

    const where: any = { role: 'USER' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, name: true, phone: true, email: true, createdAt: true },
      }),
    ]);

    res.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) { next(e); }
});

// A hall can only go live once its listing is complete.
router.post('/halls/:id/approve', async (req, res, next) => {
  try {
    const existing = await prisma.hall.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Hall not found' });
    const missing = missingHallFields(existing);
    if (missing.length) {
      return res.status(400).json({ error: `Cannot approve — incomplete listing. Missing: ${missing.join(', ')}` });
    }
    const hall = await prisma.hall.update({
      where: { id: req.params.id },
      data: { isApproved: true },
    });
    res.json(hall);
  } catch (e) { next(e); }
});

router.post('/halls/:id/reject', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    const hall = await prisma.hall.update({
      where: { id: req.params.id },
      data: { isApproved: false },
    });
    res.json(hall);
  } catch (e) { next(e); }
});

router.delete('/halls/:id', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    await prisma.hall.delete({ where: { id: req.params.id } });
    invalidateHallPaths();
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/admin/admins — operator accounts (SUPERADMIN only)
router.get('/admins', requireRole('SUPERADMIN'), async (_req, res, next) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
    res.json(admins);
  } catch (e) { next(e); }
});

// POST /api/admin/admins/:id/reset-password — SUPERADMIN sets a new password for an ADMIN
const resetSchema = z.object({ password: z.string().min(10, 'Password must be at least 10 characters').max(128) });
router.post('/admins/:id/reset-password', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    const { password } = resetSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Admin not found' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
