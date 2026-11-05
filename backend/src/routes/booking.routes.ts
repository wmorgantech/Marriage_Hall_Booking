import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { auth } from '../middleware/auth';
import { LIMITS, computeBookingAmounts } from '../lib/pricing';

const router = Router();

const HALL_SELECT = { id: true, name: true, city: true, area: true, imageUrl: true, contactNumber: true } as const;
const ACTIVE = ['PENDING', 'CONFIRMED'] as const;

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

// "Today" for bookings is the Indian calendar day (the product serves Tamil Nadu only).
function todayIST(): Date {
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Parse a strict YYYY-MM-DD string to a UTC-midnight Date (rejects 2026-02-31 style rollovers). */
function parseDay(s: string): Date | null {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
}

const createBookingSchema = z.object({
  hallId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  eventType: z.enum(['wedding', 'engagement', 'reception', 'birthday', 'corporate', 'other']),
  guestCount: z.number().int().positive().max(LIMITS.headcount),
  customerName: z.string().trim().min(2),
  customerPhone: z.string().regex(/^\+\d{10,15}$/, 'Use E.164 format, e.g. +919876543210'),
  specialRequests: z.string().max(1000).optional(),
  paymentMethod: z.enum(['upi', 'card', 'netbanking', 'cash']),
});

// ---------- Customer: create a booking ----------
// Requires the customer to be authenticated (OTP-verified USER, or an
// OWNER/ADMIN booking on someone's behalf) so the booking is tied to a real
// account. Amounts are always computed server-side from the hall's own
// price/advancePercent — never trusted from the request body.
//
// The booking starts PENDING (awaiting the venue's confirmation) and holds the
// date immediately; cancelling it releases the date again. Payment is not
// collected by the platform — `paymentMethod` records the customer's
// preference and the venue collects the advance.
router.post('/', auth, async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    const date = parseDay(body.date);
    if (!date) throw httpError(400, `Bad date: ${body.date}`);
    if (date < todayIST()) throw httpError(400, 'Booking date must be today or later');

    const hall = await prisma.hall.findUnique({ where: { id: body.hallId } });
    if (!hall) throw httpError(404, 'Hall not found');
    if (!hall.isApproved) throw httpError(400, 'This hall is not open for booking yet');
    if (hall.capacity > 0 && body.guestCount > hall.capacity) {
      throw httpError(400, `Guest count exceeds this hall's capacity of ${hall.capacity}`);
    }

    const { totalAmount, advanceAmount } = computeBookingAmounts(hall.price, hall.advancePercent);

    const booking = await prisma.$transaction(async (tx) => {
      // Serialize concurrent bookings for this hall: without the row lock two
      // requests could both pass the "date is free" check below.
      await tx.$queryRaw`SELECT id FROM "Hall" WHERE id = ${hall.id} FOR UPDATE`;

      const [blocked, activeBooking] = await Promise.all([
        tx.availability.findUnique({ where: { hallId_date: { hallId: hall.id, date } } }),
        tx.booking.findFirst({ where: { hallId: hall.id, date, status: { in: [...ACTIVE] } }, select: { id: true } }),
      ]);
      if (blocked?.status === 'BOOKED' || activeBooking) {
        throw httpError(409, 'This date is no longer available for this hall');
      }

      const created = await tx.booking.create({
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
        include: { hall: { select: HALL_SELECT } },
      });
      await tx.availability.upsert({
        where: { hallId_date: { hallId: hall.id, date } },
        update: { status: 'BOOKED' },
        create: { hallId: hall.id, date, status: 'BOOKED' },
      });
      return created;
    });

    res.status(201).json(booking);
  } catch (e) { next(e); }
});

// ---------- Customer: my bookings ----------
router.get('/mine', auth, async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { hall: { select: HALL_SELECT } },
    });
    res.json(bookings);
  } catch (e) { next(e); }
});

// Loads a booking plus who is allowed to manage it.
async function loadBooking(id: string, user: NonNullable<Express.Request['user']>) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { hall: { select: { ownerId: true } } },
  });
  if (!booking) throw httpError(404, 'Booking not found');
  const isStaff = user.role === 'ADMIN' || user.role === 'SUPERADMIN';
  const isHallOwner = booking.hall.ownerId === user.sub;
  const isCustomer = booking.userId === user.sub;
  return { booking, isStaff, isHallOwner, isCustomer };
}

// ---------- Hall owner / staff: confirm a pending booking ----------
router.post('/:id/confirm', auth, async (req, res, next) => {
  try {
    const { booking, isStaff, isHallOwner } = await loadBooking(req.params.id, req.user!);
    if (!isStaff && !isHallOwner) throw httpError(403, 'Only the hall owner can confirm a booking');
    if (booking.status !== 'PENDING') {
      throw httpError(409, `Only pending bookings can be confirmed (this one is ${booking.status.toLowerCase()})`);
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED' },
      include: { hall: { select: HALL_SELECT } },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// ---------- Customer / hall owner / staff: cancel a booking ----------
// Releases the held date so the hall can be booked again.
router.post('/:id/cancel', auth, async (req, res, next) => {
  try {
    const { booking, isStaff, isHallOwner, isCustomer } = await loadBooking(req.params.id, req.user!);
    if (!isStaff && !isHallOwner && !isCustomer) throw httpError(403, 'Not your booking');
    if (booking.status === 'CANCELLED') throw httpError(409, 'This booking is already cancelled');

    const updated = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' },
        include: { hall: { select: HALL_SELECT } },
      });
      const stillHeld = await tx.booking.count({
        where: { hallId: booking.hallId, date: booking.date, status: { in: [...ACTIVE] } },
      });
      if (stillHeld === 0) {
        await tx.availability.updateMany({
          where: { hallId: booking.hallId, date: booking.date, status: 'BOOKED' },
          data: { status: 'AVAILABLE' },
        });
      }
      return cancelled;
    });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
