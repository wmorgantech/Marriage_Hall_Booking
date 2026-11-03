import { describe, expect, it } from 'vitest';
import {
  extractCriteria, refineCriteria, runAiSearch, scoreHall, validateCriteria, type Catalogue, type Criteria,
} from '../src/lib/aiSearch';

const TODAY = '2026-10-26'; // a Monday
const MUH = ['2026-10-29', '2026-11-05', '2026-11-20', '2026-12-10', '2026-12-12', '2026-12-17', '2027-01-20', '2027-05-20'];
const cat: Catalogue = {
  cities: ['Chennai', 'Coimbatore', 'Madurai'],
  areasByCity: { Chennai: ['Adyar', 'Chromepet'], Coimbatore: ['Peelamedu', 'RS Puram'], Madurai: ['Anna Nagar'] },
  muhurtham: MUH,
};
const ex = (q: string) => extractCriteria(q, cat, TODAY);
const codes = (q: string) => ex(q).issues.map((i) => i.code);
const blockingCodes = (issues: { code: string; blocking?: boolean }[]) => issues.filter((i) => i.blocking).map((i) => i.code);

describe('muhurtham dates (from the admin-managed calendar)', () => {
  it('"muhurtham" alone = the next 3 muhurtham days, any of them', () => {
    const r = ex('Coimbatore muhurtham 800 guests');
    expect(r.criteria.dates).toEqual(['2026-10-29', '2026-11-05', '2026-11-20']);
    expect(r.criteria.match).toBe('any');
    expect(codes('Coimbatore muhurtham 800 guests')).toContain('muhurtham_used');
  });
  it('"December muhurtham" = the muhurtham days in December', () => {
    expect(ex('Madurai December muhurtham').criteria.dates).toEqual(['2026-12-10', '2026-12-12', '2026-12-17']);
    expect(ex('Madurai-la december muhurthathukku hall').criteria.dates).toBeUndefined(); // unknown inflection is not guessed…
    expect(blockingCodes(ex('Madurai-la december muhurthathukku hall').issues)).toContain('date_invalid'); // …it asks instead
  });
  it('"next muhurtham" = only the nearest one', () => {
    expect(ex('next muhurtham Chennai').criteria.dates).toEqual(['2026-10-29']);
    expect(ex('next muhurtham Chennai').criteria.date).toBe('2026-10-29');
  });
  it('Tamil script works too', () => {
    expect(ex('சென்னை முகூர்த்தம்').criteria).toMatchObject({ city: 'Chennai', dates: ['2026-10-29', '2026-11-05', '2026-11-20'] });
  });
  it('a muhurtham word with a real date only checks it against the calendar', () => {
    expect(ex('Chennai December 12 muhurtham').criteria.dates).toEqual(['2026-12-12']);
    expect(codes('Chennai December 12 muhurtham')).not.toContain('not_muhurtham');
    expect(codes('Chennai December 13 muhurtham')).toContain('not_muhurtham');
  });
  it('with no muhurtham dates in the calendar the search is blocked, not guessed', () => {
    const r = extractCriteria('Chennai muhurtham', { ...cat, muhurtham: [] }, TODAY);
    expect(blockingCodes(r.issues)).toContain('no_muhurtham');
  });
});

describe('Tamil months (approximate ranges → muhurtham days inside them)', () => {
  it('Margazhi = mid-December to mid-January', () => {
    const r = ex('Chennai margazhi muhurtham');
    expect(r.criteria.dates).toEqual(['2026-12-17']);
    expect(r.issues.find((i) => i.code === 'tamil_month_approx')?.message).toMatch(/2026-12-16 to 2027-01-13/);
  });
  it('Thai / Vaikasi pick next year when this year\'s has passed; Tamil script too', () => {
    expect(ex('Chennai thai maasam hall').criteria.dates).toEqual(['2027-01-20']);
    expect(ex('Chennai vaikasi').criteria.dates).toEqual(['2027-05-20']);
    expect(ex('சென்னை வைகாசி').criteria.dates).toEqual(['2027-05-20']);
  });
  it('a Tamil month with no muhurtham days is reported honestly', () => {
    expect(blockingCodes(ex('Chennai aadi').issues)).toContain('no_muhurtham');
  });
});

describe('several dates', () => {
  it('"or" = any of them', () => {
    const r = ex('Chennai December 12 or 14, 800 guests');
    expect(r.criteria).toMatchObject({ dates: ['2026-12-12', '2026-12-14'], match: 'any', minCapacity: 800 });
    expect(r.criteria.date).toBeUndefined();
  });
  it('"and" = all of them, day-first too', () => {
    expect(ex('Chennai 12 and 13 December').criteria).toMatchObject({ dates: ['2026-12-12', '2026-12-13'], match: 'all' });
    expect(ex('Chennai Dec 12, Dec 14 all dates').criteria.match).toBe('all');
    expect(ex('Chennai Dec 12, 14 and 16').criteria.dates).toEqual(['2026-12-12', '2026-12-14', '2026-12-16']);
  });
  it('rejects an impossible day inside a list', () => {
    expect(blockingCodes(ex('Chennai February 28 or 30 2027').issues)).toContain('date_invalid');
  });
  it('the single-date headline still works exactly as before', () => {
    const r = ex('Coimbatore-la December 12-ku 800 guests, parking, budget ₹2 lakh-kulla');
    expect(r.criteria).toMatchObject({ city: 'Coimbatore', date: '2026-12-12', dates: ['2026-12-12'], minCapacity: 800, maxPrice: 200000 });
    expect(r.criteria.match).toBeUndefined();
  });
});

describe('relative days', () => {
  it('today / tomorrow / day after tomorrow (English, Tanglish, Tamil)', () => {
    expect(ex('Chennai tomorrow').criteria.dates).toEqual(['2026-10-27']);
    expect(ex('Chennai naalaiku hall').criteria.dates).toEqual(['2026-10-27']);
    expect(ex('Chennai நாளை').criteria.dates).toEqual(['2026-10-27']);
    expect(ex('Chennai day after tomorrow').criteria.dates).toEqual(['2026-10-28']);
    expect(ex('Chennai inniku').criteria.dates).toEqual(['2026-10-26']);
  });
  it('weekdays: this / next', () => {
    expect(ex('Chennai this sunday').criteria.dates).toEqual(['2026-11-01']);
    expect(ex('Chennai friday').criteria.dates).toEqual(['2026-10-30']);
    expect(ex('Chennai next monday').criteria.dates).toEqual(['2026-11-02']);
    expect(ex('Chennai monday').criteria.dates).toEqual(['2026-10-26']);
  });
});

describe('more Tanglish', () => {
  it('peru / laksham / venum', () => {
    expect(ex('Madurai-la 500 peru-ku AC hall venum, budget 2 laksham').criteria).toMatchObject({
      city: 'Madurai', minCapacity: 500, hasAC: true, maxPrice: 200000,
    });
  });
  it('"budget friendly" / "kammi" = lowest price first, never a made-up budget', () => {
    const r = ex('Madurai-la budget friendly hall');
    expect(r.criteria).toMatchObject({ city: 'Madurai', cheapFirst: true });
    expect(r.criteria.maxPrice).toBeUndefined();
    expect(blockingCodes(r.issues)).toEqual([]);
    expect(ex('Chennai kammi price hall').criteria.cheapFirst).toBe(true);
  });
  it('city nicknames: Thanjai / Nellai are only used when the city exists', () => {
    expect(ex('Nellai hall').criteria.city).toBeUndefined(); // not in this catalogue
  });
});

describe('validateCriteria (edited rows)', () => {
  it('accepts valid edits and normalises case', () => {
    const r = validateCriteria({ city: 'chennai', area: 'adyar', dates: ['2026-12-14', '2026-12-12'], match: 'all', minCapacity: 500 }, cat, TODAY);
    expect(r.criteria).toMatchObject({ city: 'Chennai', area: 'Adyar', dates: ['2026-12-12', '2026-12-14'], match: 'all', minCapacity: 500 });
    expect(blockingCodes(r.issues)).toEqual([]);
  });
  it('rejects unknown places, past/impossible dates and too many dates', () => {
    expect(blockingCodes(validateCriteria({ city: 'Bangalore' }, cat, TODAY).issues)).toEqual(['invalid_criteria']);
    expect(blockingCodes(validateCriteria({ city: 'Chennai', area: 'Peelamedu' }, cat, TODAY).issues)).toEqual(['invalid_criteria']);
    expect(blockingCodes(validateCriteria({ city: 'Chennai', dates: ['2026-01-05'] }, cat, TODAY).issues)).toEqual(['date_past']);
    expect(blockingCodes(validateCriteria({ city: 'Chennai', dates: ['2026-02-30'] }, cat, TODAY).issues)).toEqual(['date_invalid']);
    const many = Array.from({ length: 11 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
    expect(blockingCodes(validateCriteria({ city: 'Chennai', dates: many }, cat, TODAY).issues)).toContain('too_many_dates');
    expect(blockingCodes(validateCriteria({ minPrice: 300000, maxPrice: 100000 }, cat, TODAY).issues)).toContain('budget_invalid');
  });
  it('requires at least one real criterion', () => {
    expect(blockingCodes(validateCriteria({ preferences: ['Valet Parking'] }, cat, TODAY).issues)).toEqual(['not_understood']);
  });
});

describe('refineCriteria (conversational follow-ups)', () => {
  const prev: Partial<Criteria> = { city: 'Coimbatore', area: 'Peelamedu', dates: ['2026-12-12'], date: '2026-12-12', minCapacity: 800, maxPrice: 200000, preferences: ['Valet Parking'] };
  const refine = (t: string) => refineCriteria(prev, t, cat, TODAY);
  it('"cheaper" lowers the budget by 20%', () => {
    expect(refine('cheaper').criteria.maxPrice).toBe(160000);
    expect(refine('konjam kammi').criteria.maxPrice).toBe(160000);
    expect(refine('cheaper').issues[0]).toMatchObject({ code: 'refined' });
  });
  it('"only AC" adds a requirement and keeps everything else', () => {
    const r = refine('only AC').criteria;
    expect(r).toMatchObject({ city: 'Coimbatore', area: 'Peelamedu', minCapacity: 800, maxPrice: 200000, hasAC: true, dates: ['2026-12-12'] });
  });
  it('"what about the 14th" moves the date within the same month', () => {
    expect(refine('what about the 14th').criteria.dates).toEqual(['2026-12-14']);
    expect(refine('14th?').criteria.date).toBe('2026-12-14');
  });
  it('removes things: "no parking", "any area", "any date"; "no AC" undoes AC', () => {
    expect(refine('no parking').criteria.preferences).toEqual([]);
    expect(refine('any area').criteria.area).toBeUndefined();
    expect(refine('any date').criteria.dates).toBeUndefined();
    expect(refineCriteria({ ...prev, hasAC: true }, 'non ac', cat, TODAY).criteria.hasAC).toBeUndefined();
  });
  it('a new city replaces the old city and its area; new numbers replace old ones', () => {
    expect(refine('Madurai').criteria).toMatchObject({ city: 'Madurai' });
    expect(refine('Madurai').criteria.area).toBeUndefined();
    expect(refine('1000 guests').criteria.minCapacity).toBe(1000);
    expect(refine('December 20').criteria.dates).toEqual(['2026-12-20']);
  });
  it('text that changes nothing is reported, not guessed', () => {
    expect(blockingCodes(refine('hello there').issues)).toEqual(['not_understood']);
  });
});

describe('scoreHall (best match, factual reasons)', () => {
  const c: Criteria = { minCapacity: 800, maxPrice: 200000, preferences: ['Valet Parking'], dates: ['2026-12-12', '2026-12-14'], match: 'any' };
  it('a hall close to the head-count beats a much larger one', () => {
    expect(scoreHall({ price: 150000, capacity: 850 }, c, ['2026-12-12']).score)
      .toBeGreaterThan(scoreHall({ price: 150000, capacity: 2500 }, c, ['2026-12-12']).score);
  });
  it('more free dates and confirmed preferences score higher', () => {
    expect(scoreHall({ price: 150000, capacity: 850 }, c, ['2026-12-12', '2026-12-14']).score)
      .toBeGreaterThan(scoreHall({ price: 150000, capacity: 850 }, c, ['2026-12-12']).score);
    expect(scoreHall({ price: 150000, capacity: 850, amenities: ['Valet Parking'] }, c, ['2026-12-12']).score)
      .toBeGreaterThan(scoreHall({ price: 150000, capacity: 850 }, c, ['2026-12-12']).score);
  });
  it('reasons only state facts from the hall and the request', () => {
    expect(scoreHall({ price: 150000, capacity: 850, amenities: ['Valet Parking'] }, c, ['2026-12-12']).reasons).toEqual([
      'Seats 850 for your 800+ guests', '₹1,50,000 per day — within your ₹2,00,000 budget', 'Lists Valet Parking', 'Free on 1 of 2 dates',
    ]);
    expect(scoreHall({ price: 1, capacity: 1 }, { preferences: [] }).reasons).toEqual([]);
  });
});

/* ------------------------------------------------------------ runAiSearch with a stubbed database */

function db(opts: { halls?: any[]; taken?: Record<string, string[]>; countFor?: (where: any) => number } = {}) {
  const halls = opts.halls ?? [];
  const calls: any = { findMany: [] as any[], count: [] as any[] };
  const takenRows = (a: any) => Object.entries(opts.taken ?? {}).flatMap(([hallId, days]) =>
    days.filter((d) => a.where.date.in.some((x: Date) => x.toISOString().slice(0, 10) === d)).map((d) => ({ hallId, date: new Date(`${d}T00:00:00Z`) })));
  const prisma: any = {
    hall: {
      groupBy: async () => [{ city: 'Chennai', area: 'Adyar' }, { city: 'Coimbatore', area: 'Peelamedu' }, { city: 'Madurai', area: 'Anna Nagar' }],
      aggregate: async () => ({ _min: { price: 55000 }, _max: { price: 480000 } }),
      count: async (a: any) => { calls.count.push(a); return opts.countFor ? opts.countFor(a.where) : halls.length; },
      findMany: async (a: any) => { calls.findMany.push(a); return halls; },
    },
    area: { findMany: async () => [] },
    muhurthamDate: { findMany: async () => MUH.map((d) => ({ date: new Date(`${d}T00:00:00Z`) })) },
    availability: { findMany: async (a: any) => takenRows(a) },
    booking: { findMany: async () => [] },
  };
  return { prisma, calls };
}
const hall = (id: string, extra: any = {}) => ({ id, name: `Hall ${id}`, city: 'Chennai', area: 'Adyar', price: 150000, capacity: 900, amenities: [], contactNumber: '+910000000001', ...extra });

describe('runAiSearch — multiple dates, ranking, edits, follow-ups, alternatives', () => {
  it('any-of-dates keeps halls free on at least one date and reports which', async () => {
    const { prisma, calls } = db({ halls: [hall('a'), hall('b'), hall('c')], taken: { a: ['2026-12-12'], b: ['2026-12-12', '2026-12-14'] } });
    const r = await runAiSearch(prisma, 'Chennai December 12 or 14', { today: TODAY });
    expect(calls.findMany[0].where.AND[0].OR).toHaveLength(2);
    expect(r.halls.map((h) => h.id)).toEqual(['c', 'a']); // c is free on both, so it ranks first
    expect(r.halls[0].ai.availability).toMatchObject({ verified: true, freeDates: ['2026-12-12', '2026-12-14'], match: 'any' });
    expect(r.halls[1].ai.availability).toMatchObject({ freeDates: ['2026-12-14'], date: '2026-12-14' });
    expect(r.halls[0].ai.bestMatch).toBe(true);
  });

  it('all-of-dates drops a hall that is taken on any of them', async () => {
    const { prisma } = db({ halls: [hall('a'), hall('c')], taken: { a: ['2026-12-13'] } });
    const r = await runAiSearch(prisma, 'Chennai 12 and 13 December', { today: TODAY });
    expect(r.halls.map((h) => h.id)).toEqual(['c']);
  });

  it('ranks by fit: the hall nearest the head-count first; cheapFirst sorts by price', async () => {
    const halls = [hall('big', { capacity: 2500, price: 120000 }), hall('fit', { capacity: 820, price: 180000 })];
    const r = await runAiSearch(db({ halls }).prisma, 'Chennai 800 guests', { today: TODAY });
    expect(r.halls.map((h) => h.id)).toEqual(['fit', 'big']);
    expect(r.halls[0].ai.reasons[0]).toBe('Seats 820 for your 800+ guests');
    const cheap = await runAiSearch(db({ halls }).prisma, 'Chennai 800 guests budget friendly', { today: TODAY });
    expect(cheap.halls.map((h) => h.id)).toEqual(['big', 'fit']);
  });

  it('edited criteria are searched as given (the text is only a label)', async () => {
    const { prisma, calls } = db({ halls: [hall('a')] });
    const r = await runAiSearch(prisma, 'anything', { today: TODAY, criteria: { city: 'Madurai', minCapacity: 300, dates: ['2026-12-12'] } });
    expect(r.searched).toBe(true);
    expect(calls.findMany[0].where.city).toEqual({ equals: 'Madurai', mode: 'insensitive' });
    expect(calls.findMany[0].where.capacity).toEqual({ gte: 300 });
    const bad = await runAiSearch(db().prisma, 'anything', { today: TODAY, criteria: { city: 'Mysore' } });
    expect(bad.searched).toBe(false);
  });

  it('follow-ups refine the previous criteria', async () => {
    const { prisma, calls } = db({ halls: [hall('a')] });
    const r = await runAiSearch(prisma, 'only AC', { today: TODAY, previous: { city: 'Chennai', minCapacity: 800, preferences: [] } });
    expect(r.criteria).toMatchObject({ city: 'Chennai', minCapacity: 800, hasAC: true });
    expect(calls.findMany[0].where.hasAC).toBe(true);
    expect(r.issues[0].code).toBe('refined');
  });

  it('no exact match: alternatives are real counted searches with one thing relaxed', async () => {
    const countFor = (w: any) => (w.price?.lte > 200000 ? 7 : w.area === undefined && w.city ? 3 : 0);
    const { prisma } = db({ halls: [], countFor });
    const r = await runAiSearch(prisma, 'Coimbatore Peelamedu 800 guests budget 2 lakh', { today: TODAY });
    expect(r.total).toBe(0);
    expect(r.halls).toEqual([]);
    const byCode = Object.fromEntries(r.alternatives.map((a) => [a.code, a]));
    expect(byCode.budget).toMatchObject({ total: 7, criteria: { maxPrice: 250000 } });
    expect(byCode.area).toMatchObject({ total: 3 });
    expect(byCode.area.criteria.area).toBeUndefined();
    expect(byCode.capacity).toBeUndefined(); // its count was 0, so it is not offered
    expect(r.notes.join(' ')).toMatch(/No listed hall matches all of/);
  });

  it('nearby muhurtham dates are offered when a date has no free hall', async () => {
    const countFor = (w: any) => (w.AND ? 2 : 0);
    const r = await runAiSearch(db({ halls: [], countFor }).prisma, 'Chennai December 12', { today: TODAY });
    const dates = r.alternatives.find((a) => a.code === 'dates')!;
    expect(dates.criteria.dates).toEqual(['2026-12-10', '2026-12-17']); // within 3 weeks of Dec 12 (Nov 20 is 22 days away)
    expect(dates.criteria.match).toBe('any');
    expect(dates.label).toMatch(/muhurtham/);
  });
});
