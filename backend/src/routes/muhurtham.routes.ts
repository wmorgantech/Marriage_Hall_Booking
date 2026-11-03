import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';

const router = Router();

const bodySchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')).min(1).max(366),
});

// Parse + validate dates (reject rollovers such as 2026-02-31)
function parseDates(dates: string[]): Date[] {
  return [...new Set(dates)].map((d) => {
    const dt = new Date(`${d}T00:00:00.000Z`);
    if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d) {
      throw Object.assign(new Error(`Bad date: ${d}`), { status: 400 });
    }
    return dt;
  });
}

async function list() {
  const rows = await prisma.muhurthamDate.findMany({ orderBy: { date: 'asc' } });
  return rows.map((r) => r.date.toISOString().slice(0, 10));
}

// Public: everyone sees the muhurtham calendar
router.get('/muhurtham-dates', async (_req, res, next) => {
  try { res.json(await list()); } catch (e) { next(e); }
});

// Admin: add dates (idempotent)
router.post('/admin/muhurtham-dates', auth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const dates = parseDates(bodySchema.parse(req.body).dates);
    await prisma.muhurthamDate.createMany({ data: dates.map((date) => ({ date })), skipDuplicates: true });
    res.json(await list());
  } catch (e) { next(e); }
});

// Admin: remove dates
router.delete('/admin/muhurtham-dates', auth, requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const dates = parseDates(bodySchema.parse(req.body).dates);
    await prisma.muhurthamDate.deleteMany({ where: { date: { in: dates } } });
    res.json(await list());
  } catch (e) { next(e); }
});

export default router;
