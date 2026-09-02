import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth } from '../middleware/auth';

const router = Router();

const createBookingSchema = z.object({
  hallId: z.string().min(1),
  date: z.string().min(1),
  eventType: z.enum(['wedding', 'engagement', 'reception', 'birthday', 'corporate', 'other']),
  guestCount: z.number().int().positive(),
  customerName: z.string().min(2),
  customerPhone: z.string().regex(/^\+\d{10,15}$/, 'Use E.164 format, e.g. +919876543210'),
  specialRequests: z.string().max(1000).optional(),
  paymentMethod: z.enum(['upi', 'card', 'netbanking', 'cash']),
});

// ---------- Customer: create a booking ----------
// Requires the customer to be authenticated (OTP-verified USER, or an
// OWNER/ADMIN booking on someone's behalf) so the booking is tied to a real
// account. Amounts are always computed server-side from the hall's own
// price/advancePercent — never trusted from the request body.
router.post('/', auth, async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    const hall = await prisma.hall.findUnique({ where: { id: body.hallId } });
    if (!hall) return res.status(404).json({ error: 'Hall not found' });
    if (!hall.isApproved) return res.status(400).json({ error: 'This hall is not open for booking yet' });

    const date = new Date(body.date);
    if (isNaN(date.getTime())) return res.status(400).json({ error: `Bad date: ${body.date}` });

    const existingAvailability = await prisma.availability.findUnique({
      where: { hallId_date: { hallId: hall.id, date } },
    });
    if (existingAvailability?.status === 'BOOKED') {
      return res.status(409).json({ error: 'This date is no longer available for this hall' });
    }

    const advanceAmount = Math.round((hall.price * hall.advancePercent) / 100);
    const totalAmount = hall.price;

    const [booking] = await prisma.$transaction([
      prisma.booking.create({
        data: {
          hallId: hall.id,
          userId: req.user!.sub,
          date,
          eventType: body.eventType,
          guestCount: body.guestCount,
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          specialRequests: body.specialRequests,
          paymentMethod: body.paymentMethod,
          advanceAmount,
          totalAmount,
        },
        include: {
          hall: { select: { id: true, name: true, city: true, area: true, imageUrl: true, contactNumber: true } },
        },
      }),
      prisma.availability.upsert({
        where: { hallId_date: { hallId: hall.id, date } },
        update: { status: 'BOOKED' },
        create: { hallId: hall.id, date, status: 'BOOKED' },
      }),
    ]);

    res.status(201).json(booking);
  } catch (e) { next(e); }
});

// ---------- Customer: my bookings ----------
router.get('/mine', auth, async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        hall: { select: { id: true, name: true, city: true, area: true, imageUrl: true, contactNumber: true } },
      },
    });
    res.json(bookings);
  } catch (e) { next(e); }
});

export default router;
