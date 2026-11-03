import { describe, expect, it } from 'vitest';
import { buildHallWhere, freeDaysFor, freeOn, mergeBookingHolds } from '../src/lib/hallSearch';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ACTIVE = { in: ['PENDING', 'CONFIRMED'] };

describe('availability rule: owner-blocked dates AND active bookings', () => {
  it('freeOn needs no BOOKED row and no PENDING/CONFIRMED booking on the date', () => {
    expect(freeOn(D('2026-12-12'))).toEqual({
      availability: { none: { date: D('2026-12-12'), status: 'BOOKED' } },
      bookings: { none: { date: D('2026-12-12'), status: ACTIVE } },
    });
  });

  it('a single date and a range block on bookings too (normal search)', () => {
    const single = buildHallWhere({ date: '2026-11-12' }) as any;
    expect(single.where.bookings.none).toEqual({ date: { gte: D('2026-11-12'), lte: D('2026-11-12') }, status: ACTIVE });
    const range = buildHallWhere({ fromDate: '2026-11-12', toDate: '2026-11-20' }) as any;
    expect(range.where.bookings.none.date).toEqual({ gte: D('2026-11-12'), lte: D('2026-11-20') });
  });

  it('no date => no availability condition at all (unchanged)', () => {
    const r = buildHallWhere({ city: 'Chennai' }) as any;
    expect(r.where.availability).toBeUndefined();
    expect(r.where.bookings).toBeUndefined();
  });
});

describe('multiple dates (dates=…&match=all|any)', () => {
  it('match=all (default): free on every listed date', () => {
    const r = buildHallWhere({ dates: '2026-12-14,2026-12-12' }) as any;
    expect(r.days).toEqual(['2026-12-12', '2026-12-14']);
    expect(r.match).toBe('all');
    expect(r.where.availability.none).toEqual({ date: { in: [D('2026-12-12'), D('2026-12-14')] }, status: 'BOOKED' });
    expect(r.where.bookings.none).toEqual({ date: { in: [D('2026-12-12'), D('2026-12-14')] }, status: ACTIVE });
  });

  it('match=any: free on at least one date (OR of per-date rules), combined with other filters via AND', () => {
    const r = buildHallWhere({ dates: '2026-12-12,2026-12-14', match: 'any', q: 'mahal', city: 'Madurai' }) as any;
    expect(r.match).toBe('any');
    expect(r.where.city).toEqual({ equals: 'Madurai', mode: 'insensitive' });
    expect(r.where.OR).toHaveLength(4); // the text search keeps its own OR
    expect(r.where.AND).toEqual([{ OR: [freeOn(D('2026-12-12')), freeOn(D('2026-12-14'))] }]);
    expect(r.where.availability).toBeUndefined();
  });

  it('one date with match=any behaves like a single date', () => {
    const r = buildHallWhere({ dates: '2026-12-12', match: 'any' }) as any;
    expect(r.match).toBe('all');
    expect(r.where.availability.none.date).toEqual({ in: [D('2026-12-12')] });
  });

  it('dedupes, validates and caps the list', () => {
    expect((buildHallWhere({ dates: '2026-12-12,2026-12-12' }) as any).days).toEqual(['2026-12-12']);
    expect(buildHallWhere({ dates: '2026-12-12,2026-02-30' })).toEqual({ error: 'Invalid date' });
    expect(buildHallWhere({ dates: 'tomorrow' })).toEqual({ error: 'Invalid date' });
    const eleven = Array.from({ length: 11 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`).join(',');
    expect(buildHallWhere({ dates: eleven })).toEqual({ error: 'Choose at most 10 dates' });
  });

  it('an empty dates param is ignored (falls back to date / range / none)', () => {
    expect(buildHallWhere({ dates: '' })).toEqual({ where: { isApproved: true } });
  });
});

describe('freeDaysFor (which requested dates each hall is free on)', () => {
  const prisma: any = {
    availability: { findMany: async () => [{ hallId: 'a', date: D('2026-12-12') }] },
    booking: { findMany: async () => [{ hallId: 'b', date: D('2026-12-14') }, { hallId: 'a', date: D('2026-12-14') }] },
  };
  it('subtracts BOOKED rows and active bookings per hall', async () => {
    const m = await freeDaysFor(prisma, ['a', 'b', 'c'], ['2026-12-12', '2026-12-14']);
    expect(m.get('a')).toEqual([]);
    expect(m.get('b')).toEqual(['2026-12-12']);
    expect(m.get('c')).toEqual(['2026-12-12', '2026-12-14']);
  });
  it('asks the booking table only for PENDING/CONFIRMED', async () => {
    let seen: any;
    const p: any = { availability: { findMany: async () => [] }, booking: { findMany: async (a: any) => { seen = a; return []; } } };
    await freeDaysFor(p, ['a'], ['2026-12-12']);
    expect(seen.where.status).toEqual(ACTIVE);
  });
});

describe('mergeBookingHolds (hall calendar)', () => {
  const row = (date: string, status: string) => ({ id: `r-${date}`, hallId: 'h', date: D(date), status });
  it('adds booking-held dates as BOOKED with source "booking" and keeps date order', () => {
    const out = mergeBookingHolds([row('2026-12-20', 'BOOKED')], [{ hallId: 'h', date: D('2026-12-12') }]);
    expect(out.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.status, r.source])).toEqual([
      ['2026-12-12', 'BOOKED', 'booking'],
      ['2026-12-20', 'BOOKED', undefined],
    ]);
  });
  it('a booking overrides an owner AVAILABLE row; an owner BOOKED row is kept as is', () => {
    const out = mergeBookingHolds([row('2026-12-12', 'AVAILABLE'), row('2026-12-13', 'BOOKED')], [
      { hallId: 'h', date: D('2026-12-12') }, { hallId: 'h', date: D('2026-12-13') },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ status: 'BOOKED', source: 'booking' });
    expect(out[1]).toMatchObject({ id: 'r-2026-12-13', status: 'BOOKED' });
  });
  it('exposes no customer details', () => {
    const [r] = mergeBookingHolds([], [{ hallId: 'h', date: D('2026-12-12'), customerName: 'X', customerPhone: '+91' } as any]);
    expect(Object.keys(r).sort()).toEqual(['date', 'hallId', 'id', 'source', 'status']);
  });
});
