import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth, requireRole } from '../middleware/auth';

const router = Router();
const SINGLETON_ID = 'singleton';

async function getOrCreate() {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.settings.create({
    data: { id: SINGLETON_ID, customerCarePhone: '', customerCareEmail: '' },
  });
}

// Public: anyone can read customer-care contact (used by footer / contact links)
router.get('/settings', async (_req, res, next) => {
  try {
    const s = await getOrCreate();
    res.json({
      customerCarePhone: s.customerCarePhone,
      customerCareEmail: s.customerCareEmail,
      updatedAt: s.updatedAt,
    });
  } catch (e) { next(e); }
});

// Admin: update customer-care contact
const patchSchema = z.object({
  customerCarePhone: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\+\d{10,15}|\s*)$/, 'Use E.164 format, e.g. +918012345678')
    .optional(),
  customerCareEmail: z
    .string()
    .trim()
    .max(120)
    .email('Invalid email')
    .or(z.literal(''))
    .optional(),
});

router.patch('/admin/settings', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = patchSchema.parse(req.body);
    await getOrCreate();
    const s = await prisma.settings.update({
      where: { id: SINGLETON_ID },
      data,
    });
    res.json({
      customerCarePhone: s.customerCarePhone,
      customerCareEmail: s.customerCareEmail,
      updatedAt: s.updatedAt,
    });
  } catch (e) { next(e); }
});

export default router;
