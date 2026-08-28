import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';

const router = Router();

const bulkSchema = z.object({
  dates: z.array(z.string()).min(1),
  status: z.enum(['AVAILABLE', 'BOOKED']),
});

// POST /api/halls/:id/availability
// body: { dates: ["2026-05-12", ...], status: "BOOKED" | "AVAILABLE" }
router.post(
  '/halls/:id/availability',
  auth,
  requireRole('OWNER', 'ADMIN'),
  async (req, res, next) => {
    try {
      const hall = await prisma.hall.findUnique({ where: { id: req.params.id } });
      if (!hall) return res.status(404).json({ error: 'Hall not found' });
      if (hall.ownerId !== req.user!.sub && req.user!.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not your hall' });
      }
      const { dates, status } = bulkSchema.parse(req.body);

      // Parse + validate dates
      const parsed = dates.map((d) => {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) throw Object.assign(new Error(`Bad date: ${d}`), { status: 400 });
        return dt;
      });

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
