import { describe, expect, it, vi } from 'vitest';
import { extractCriteria, runAiSearch, todayIST, type Catalogue } from '../src/lib/aiSearch';
import { buildHallWhere } from '../src/lib/hallSearch';

const TODAY = '2026-10-26';
const cat: Catalogue = {
  cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli'],
  areasByCity: {
    Chennai: ['Adyar', 'Anna Nagar', 'T. Nagar'],
    Coimbatore: ['Peelamedu', 'RS Puram'],
    Madurai: ['Anna Nagar'],
    Tiruchirappalli: ['Srirangam'],
  },
};
const ex = (q: string) => extractCriteria(q, cat, TODAY);
const codes = (q: string) => ex(q).issues.map((i) => i.code);
const blocking = (q: string) => ex(q).issues.filter((i) => i.blocking).map((i) => i.code);

describe('extractCriteria — the headline example', () => {
  it('reads Tanglish: city, date, guests, parking preference and budget', () => {
    const r = ex('Coimbatore-la December 12-ku 800 guests, parking, budget ₹2 lakh-kulla');
    expect(r.criteria).toMatchObject({ city: 'Coimbatore', date: '2026-12-12', minCapacity: 800, maxPrice: 200000, preferences: ['Valet Parking'] });
    expect(r.issues.filter((i) => i.blocking)).toEqual([]);
    expect(r.issues.map((i) => i.code)).toContain('year_assumed');
  });
});

describe('extractCriteria — dates', () => {
  it('uses the next occurrence when no year is given', () => {
    expect(ex('Chennai 12 December').criteria.date).toBe('2026-12-12');
    expect(ex('Chennai March 3').criteria.date).toBe('2027-03-03'); // already passed this year
    expect(ex('Chennai october 26').criteria.date).toBe('2026-10-26'); // today counts
  });
  it('understands day-first numeric, ISO, ordinals and Tamil month names', () => {
    expect(ex('Chennai 12/12/2026').criteria.date).toBe('2026-12-12');
    expect(ex('Chennai 2026-12-12').criteria.date).toBe('2026-12-12');
    expect(ex('Chennai 3rd Nov 2026').criteria.date).toBe('2026-11-03');
    expect(ex('Chennai டிசம்பர் 12').criteria.date).toBe('2026-12-12');
  });
  it('rejects impossible and past dates instead of guessing', () => {
    expect(blocking('Chennai February 30 2027')).toEqual(['date_invalid']);
    expect(blocking('Chennai 31 April 2027')).toEqual(['date_invalid']);
    expect(blocking('Chennai 5 Jan 2026')).toEqual(['date_past']);
    expect(blocking('Chennai 12 december 2035')).toEqual(['date_far']);
    expect(blocking('Chennai in december')).toEqual(['date_invalid']);
    expect(ex('Chennai February 30 2027').criteria.date).toBeUndefined();
  });
  it('says availability was not checked when there is no date', () => {
    expect(codes('Chennai 800 guests')).toContain('no_date');
    expect(ex('Chennai 800 guests').criteria.date).toBeUndefined();
  });
});

describe('extractCriteria — budget (maximum per-day price) and guests (minimum capacity)', () => {
  it.each([
    ['budget ₹2,00,000', 200000], ['under 2 lakh', 200000], ['1.5 lakh', 150000], ['budget 150k', 150000],
    ['budget 250000', 250000], ['Rs. 80,000', 80000], ['2 lakhs max', 200000], ['₹2 lakh-kulla', 200000],
  ])('%s -> maxPrice %i', (q, v) => {
    expect(ex(`Chennai ${q}`).criteria.maxPrice).toBe(v);
  });
  it('handles ranges and "above"', () => {
    expect(ex('Chennai 1 to 2 lakh')).toMatchObject({ criteria: { minPrice: 100000, maxPrice: 200000 } });
    const above = ex('Chennai above 2 lakh').criteria;
    expect(above.minPrice).toBe(200000);
    expect(above.maxPrice).toBeUndefined();
  });
  it('refuses a budget too small to be a hall price', () => {
    expect(blocking('Chennai budget rs 500')).toEqual(['budget_invalid']);
  });
  it.each([
    ['800 guests', 800], ['for 500 people', 500], ['1k guests', 1000], ['capacity 600', 600], ['1,200 pax', 1200], ['300+ guests', 300],
  ])('%s -> minCapacity %i', (q, v) => {
    expect(ex(`Chennai ${q}`).criteria.minCapacity).toBe(v);
  });
  it('uses the upper end of a guest range and says so', () => {
    const r = ex('Chennai 500-800 guests');
    expect(r.criteria.minCapacity).toBe(800);
    expect(r.issues.map((i) => i.code)).toContain('range_used');
  });
  it('never guesses what a bare number means', () => {
    const r = ex('Coimbatore 800 december 12');
    expect(r.criteria.minCapacity).toBeUndefined();
    expect(r.criteria.maxPrice).toBeUndefined();
    expect(r.issues.map((i) => i.code)).toContain('number_ambiguous');
  });
  it('does not mistake a date or budget for guests', () => {
    const r = ex('Chennai december 12, ₹2 lakh');
    expect(r.criteria.minCapacity).toBeUndefined();
    expect(r.criteria.maxPrice).toBe(200000);
    expect(r.criteria.date).toBe('2026-12-12');
  });
  it('rejects absurd guest counts', () => {
    expect(blocking('Chennai 50000 guests')).toEqual(['capacity_invalid']);
  });
});

describe('extractCriteria — places', () => {
  it('matches cities case-insensitively, with aliases and Tamil names, only if they exist in the data', () => {
    expect(ex('CHENNAI 800 guests').criteria.city).toBe('Chennai');
    expect(ex('trichy 800 guests').criteria.city).toBe('Tiruchirappalli');
    expect(ex('கோயம்புத்தூர் 800 guests').criteria.city).toBe('Coimbatore');
    expect(ex('Kovai 800 guests').criteria.city).toBe('Coimbatore');
    expect(ex('Salem 800 guests').criteria.city).toBeUndefined(); // not in this catalogue
  });
  it('asks instead of picking when two cities are named', () => {
    expect(blocking('Chennai or Madurai 800 guests')).toEqual(['multiple_cities']);
  });
  it('resolves an area, infers its city when unique, and flags ambiguity', () => {
    expect(ex('Peelamedu 800 guests').criteria).toMatchObject({ city: 'Coimbatore', area: 'Peelamedu' });
    expect(ex('Adyar 800 guests').criteria).toMatchObject({ city: 'Chennai', area: 'Adyar' });
    expect(blocking('Anna Nagar 800 guests')).toEqual(['area_ambiguous']);
    expect(ex('Madurai Anna Nagar 800 guests').criteria).toMatchObject({ city: 'Madurai', area: 'Anna Nagar' });
    expect(ex('Chennai T. Nagar 800 guests').criteria.area).toBe('T. Nagar');
  });
  it('tells the user about a place we do not list', () => {
    const r = ex('wedding hall in Bangalore 800 guests');
    expect(r.issues.map((i) => i.code)).toContain('unknown_place');
    expect(r.issues.find((i) => i.code === 'unknown_place')?.blocking).toBe(true); // never show other cities as if they were Bangalore
    expect(r.criteria.city).toBeUndefined();
  });
});

describe('extractCriteria — requirements and preferences', () => {
  it('does not treat ordinary words after "in" as places', () => {
    expect(codes('Chennai december 12 budget in lakhs 2 lakh')).not.toContain('unknown_place');
    expect(codes('Chennai marriage hall in december')).not.toContain('unknown_place');
  });
  it('maps AC, rooms and dining to real hall fields', () => {
    expect(ex('Chennai AC hall with rooms and dining').criteria).toMatchObject({ hasAC: true, hasRooms: true, hasDining: true });
    expect(ex('Chennai air conditioned').criteria.hasAC).toBe(true);
    expect(ex('Chennai 800 guests').criteria.hasAC).toBeUndefined();
  });
  it('treats parking as a preference, never a requirement', () => {
    const r = ex('Chennai 800 guests with parking');
    expect(r.criteria.preferences).toEqual(['Valet Parking']);
    expect((r.criteria as any).amenities).toBeUndefined();
  });
  it('does not confuse a bridal room with guest rooms', () => {
    const r = ex('Chennai bridal room');
    expect(r.criteria.preferences).toContain('Bridal Room');
    expect(r.criteria.hasRooms).toBeUndefined();
  });
  it('is honest about requirements it cannot check', () => {
    const r = ex('Chennai 800 guests photographer and swimming pool');
    expect(r.issues.find((i) => i.code === 'unsupported')?.message).toMatch(/photographer/);
  });
});

describe('extractCriteria — unintelligible input', () => {
  it.each(['asdf qwerty', 'hello', 'with parking', '   ', 'hall'])('"%s" is not searched', (q) => {
    expect(blocking(q)).toEqual(['not_understood']);
  });
});

describe('todayIST', () => {
  it('is the Indian calendar day', () => {
    expect(todayIST(new Date('2026-10-25T20:00:00Z'))).toBe('2026-10-26'); // 01:30 IST next day
    expect(todayIST(new Date('2026-10-26T10:00:00Z'))).toBe('2026-10-26');
  });
});

/* ------------------------------------------------------------ runAiSearch with a stubbed database */

function fakePrisma(opts: { halls?: any[]; total?: number; blocked?: string[]; held?: string[] } = {}) {
  const halls = opts.halls ?? [];
  const calls: any = { findMany: [] as any[], count: [] as any[] };
  const prisma: any = {
    hall: {
      groupBy: async () => [
        { city: 'Chennai', area: 'Adyar' }, { city: 'Coimbatore', area: 'Peelamedu' }, { city: 'Coimbatore', area: 'RS Puram' },
      ],
      aggregate: async () => ({ _min: { price: 55000 }, _max: { price: 480000 } }),
      count: async (a: any) => { calls.count.push(a); return opts.total ?? halls.length; },
      findMany: async (a: any) => { calls.findMany.push(a); return halls; },
    },
    area: { findMany: async () => [] },
    // blocked / held on the date being searched (the stub returns them for whatever date is asked)
    availability: { findMany: vi.fn(async (a: any) => (opts.blocked ?? []).map((hallId) => ({ hallId, date: a.where.date.in[0] }))) },
    booking: { findMany: vi.fn(async (a: any) => (opts.held ?? []).map((hallId) => ({ hallId, date: a.where.date.in[0] }))) },
  };
  return { prisma, calls };
}
const hall = (id: string, extra: any = {}) => ({ id, name: `Hall ${id}`, city: 'Coimbatore', area: 'Peelamedu', price: 150000, capacity: 900, amenities: [], contactNumber: '+910000000001', ...extra });

describe('runAiSearch', () => {
  const Q = 'Coimbatore December 12 800 guests budget 2 lakh parking';

  it('searches with the same filters as the normal search plus an active-booking exclusion', async () => {
    const { prisma, calls } = fakePrisma({ halls: [hall('a')] });
    const r = await runAiSearch(prisma, Q, { today: TODAY });
    const where = calls.findMany[0].where;
    expect(where.isApproved).toBe(true);
    expect(where.city).toEqual({ equals: 'Coimbatore', mode: 'insensitive' });
    expect(where.capacity).toEqual({ gte: 800 });
    expect(where.price).toEqual({ lte: 200000 });
    expect(where.availability.none.status).toBe('BOOKED');            // Availability records
    expect(where.bookings.none.status).toEqual({ in: ['PENDING', 'CONFIRMED'] }); // active bookings
    expect(where.amenities).toBeUndefined();                          // parking is NOT a hard filter
    expect(r.halls).toHaveLength(1);
    expect(r.halls[0].ai.availability).toMatchObject({ verified: true, date: '2026-12-12' });
  });

  it('drops any returned hall that turns out to be blocked or held on that date (second check)', async () => {
    const { prisma } = fakePrisma({ halls: [hall('a'), hall('b'), hall('c')], blocked: ['b'], held: ['c'] });
    const r = await runAiSearch(prisma, Q, { today: TODAY });
    expect(r.halls.map((h) => h.id)).toEqual(['a']);
  });

  it('never claims parking: only halls that list it are marked, and the rest are disclosed as "not listed"', async () => {
    const { prisma } = fakePrisma({ halls: [hall('a'), hall('b', { amenities: ['Valet Parking'] })] });
    const r = await runAiSearch(prisma, Q, { today: TODAY });
    expect(r.halls[0].id).toBe('b');
    expect(r.halls[0].ai.preferences.confirmed).toEqual(['Valet Parking']);
    expect(r.halls[1].ai.preferences).toMatchObject({ confirmed: [], notListed: ['Valet Parking'] });
    expect(r.notes.join(' ')).toMatch(/not listed/);
  });

  it('says parking cannot be confirmed when no hall lists any amenity', async () => {
    const { prisma } = fakePrisma({ halls: [hall('a'), hall('b')] });
    const r = await runAiSearch(prisma, Q, { today: TODAY });
    expect(r.notes.join(' ')).toMatch(/None of these halls list Valet Parking/);
  });

  it('does not search at all when the date is invalid or past', async () => {
    for (const q of ['Coimbatore February 30 2027 800 guests', 'Coimbatore 5 Jan 2026 800 guests']) {
      const { prisma, calls } = fakePrisma({ halls: [hall('a')] });
      const r = await runAiSearch(prisma, q, { today: TODAY });
      expect(r.searched).toBe(false);
      expect(r.halls).toEqual([]);
      expect(calls.findMany).toHaveLength(0);
      expect(r.issues.some((i) => i.blocking)).toBe(true);
    }
  });

  it('without a date it searches but marks availability as NOT verified', async () => {
    const { prisma, calls } = fakePrisma({ halls: [hall('a')] });
    const r = await runAiSearch(prisma, 'Coimbatore 800 guests', { today: TODAY });
    expect(calls.findMany[0].where.bookings).toBeUndefined();
    expect(calls.findMany[0].where.availability).toBeUndefined();
    expect(r.halls[0].ai.availability).toMatchObject({ verified: false });
    expect(r.issues.map((i) => i.code)).toContain('no_date');
  });

  it('reports a clear no-match result without inventing halls', async () => {
    const { prisma } = fakePrisma({ halls: [], total: 0 });
    const r = await runAiSearch(prisma, Q, { today: TODAY });
    expect(r.searched).toBe(true);
    expect(r.halls).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.notes.join(' ')).toMatch(/No listed hall matches all of/);
  });

  it('hides contact numbers from anonymous callers and shows them to signed-in users', async () => {
    const anon = await runAiSearch(fakePrisma({ halls: [hall('a')] }).prisma, Q, { today: TODAY });
    expect(anon.halls[0].contactNumber).toBe('');
    const user = await runAiSearch(fakePrisma({ halls: [hall('a')] }).prisma, Q, { today: TODAY, signedIn: true });
    expect(user.halls[0].contactNumber).toBe('+910000000001');
  });

  it('caps page size and offsets (ranking reads the matches, then pages them)', async () => {
    const many = Array.from({ length: 80 }, (_, i) => hall(`h${i}`));
    const { prisma, calls } = fakePrisma({ halls: many });
    const r = await runAiSearch(prisma, Q, { today: TODAY, limit: 9999, offset: -4 });
    expect(r.halls).toHaveLength(60);
    expect(calls.findMany[0].take).toBe(500);
    const second = await runAiSearch(fakePrisma({ halls: many }).prisma, Q, { today: TODAY, limit: 30, offset: 60 });
    expect(second.halls).toHaveLength(20);
  });
});

/* ------------------------------------------------------------ the shared filter helper must behave exactly like the old route code */

describe('buildHallWhere (moved out of GET /api/halls — behaviour unchanged)', () => {
  it('returns only the approved-halls filter for an empty query', () => {
    expect(buildHallWhere({})).toEqual({ where: { isApproved: true } });
  });
  it('builds every supported filter', () => {
    const r = buildHallWhere({
      city: ' Chennai ', area: 'Adyar', q: 'divine', hasRooms: 'true', hasAC: 'true', hasDining: 'true',
      amenities: 'Valet Parking, Wifi', minPrice: '1000', maxPrice: '5000', minCapacity: '100', maxCapacity: '900',
    });
    expect(r).toEqual({
      where: {
        isApproved: true,
        city: { equals: 'Chennai', mode: 'insensitive' },
        area: { equals: 'Adyar', mode: 'insensitive' },
        OR: [
          { name: { contains: 'divine', mode: 'insensitive' } },
          { city: { contains: 'divine', mode: 'insensitive' } },
          { area: { contains: 'divine', mode: 'insensitive' } },
          { address: { contains: 'divine', mode: 'insensitive' } },
        ],
        hasRooms: true, hasAC: true, diningCapacity: { gt: 0 },
        amenities: { hasEvery: ['Valet Parking', 'Wifi'] },
        price: { gte: 1000, lte: 5000 },
        capacity: { gte: 100, lte: 900 },
      },
    });
  });
  it('ignores boolean flags that are not exactly "true" and non-numeric numbers', () => {
    expect(buildHallWhere({ hasAC: 'yes', minPrice: 'abc', maxCapacity: '' })).toEqual({ where: { isApproved: true } });
  });
  it('turns a single date or a range into a "no BOOKED row" condition', () => {
    const single = buildHallWhere({ date: '2026-11-12' }) as any;
    expect(single.where.availability.none).toEqual({ date: { gte: new Date('2026-11-12'), lte: new Date('2026-11-12') }, status: 'BOOKED' });
    const range = buildHallWhere({ fromDate: '2026-11-12', toDate: '2026-11-20' }) as any;
    expect(range.where.availability.none.date).toEqual({ gte: new Date('2026-11-12'), lte: new Date('2026-11-20') });
  });
  it('keeps the exact error messages', () => {
    expect(buildHallWhere({ date: 'notadate' })).toEqual({ error: 'Invalid date' });
    expect(buildHallWhere({ fromDate: '2026-11-20', toDate: '2026-11-12' })).toEqual({ error: 'fromDate must be <= toDate' });
  });
});
