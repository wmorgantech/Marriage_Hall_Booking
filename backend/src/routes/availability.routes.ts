import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';

const router = Router();

const bulkSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')).min(1).max(366),
  status: z.enum(['AVAILABLE', 'BOOKED']),
});

// POST /api/halls/:id/availability
// body: { dates: ["2026-05-12", ...], status: "BOOKED" | "AVAILABLE" }
router.post(
  '/halls/:id/availability',
  auth,
  requireRole('OWNER', 'ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      const hall = await prisma.hall.findUnique({ where: { id: req.params.id } });
      if (!hall) return res.status(404).json({ error: 'Hall not found' });
      const isStaff = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
      if (hall.ownerId !== req.user!.sub && !isStaff) {
        return res.status(403).json({ error: 'Not your hall' });
      }
      const { dates, status } = bulkSchema.parse(req.body);

      // Parse + validate dates (reject rollovers such as 2026-02-31)
      const parsed = dates.map((d) => {
        const dt = new Date(`${d}T00:00:00.000Z`);
        if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d) {
          throw Object.assign(new Error(`Bad date: ${d}`), { status: 400 });
        }
        return dt;
      });

      // A date that still has a live booking can't be freed by hand — cancel the booking instead.
      if (status === 'AVAILABLE') {
        const held = await prisma.booking.findMany({
          where: { hallId: hall.id, date: { in: parsed }, status: { in: ['PENDING', 'CONFIRMED'] } },
          select: { date: true },
        });
        if (held.length) {
          const list = held.map((b) => b.date.toISOString().slice(0, 10)).join(', ');
          return res.status(409).json({ error: `These dates have an active booking — cancel the booking first: ${list}` });
        }
      }

      // Upsert each date. For AVAILABLE we could delete the row instead; simpler to upsert.
      const results = await prisma.$transaction(
        parsed.map((date) =>
          prisma.availability.upsert({
            where: { hallId_date: { hallId: hall.id, date } },
            update: { status },
            create: { hallId: hall.id, date, status },
          }),
        ),
      );

      res.json({ updated: results.length });
    } catch (e) { next(e); }
  },
);

export default router;
