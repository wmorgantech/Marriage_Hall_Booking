import type { Prisma, PrismaClient } from '@prisma/client';

/** Parse an optional numeric query param; undefined when absent or not a finite number. */
export function num(v: unknown): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Booking states that hold a date (same rule as the booking API). CANCELLED never blocks. */
export const ACTIVE_BOOKING = ['PENDING', 'CONFIRMED'] as const;
/** Most dates one multi-date search may check. */
export const MAX_SEARCH_DATES = 10;

/** Strict YYYY-MM-DD -> UTC-midnight Date (rejects 2026-02-31 style rollovers); same rule as the booking API. */
export function parseDay(s: string): Date | null {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
}

/**
 * "The hall is free on `date`" — the single availability rule used by every search:
 * no BOOKED availability row (owner/admin blocked it) AND no PENDING/CONFIRMED booking.
 * `date` may be one day, a `{ in: [...] }` list or a `{ gte, lte }` range.
 */
export function freeOn(date: Date | Prisma.DateTimeFilter): Prisma.HallWhereInput {
  return {
    availability: { none: { date, status: 'BOOKED' } },
    bookings: { none: { date, status: { in: [...ACTIVE_BOOKING] } } },
  };
}

export type DateMatch = 'all' | 'any';
export type HallWhereResult =
  | { where: Prisma.HallWhereInput; days?: string[]; match?: DateMatch }
  | { error: string };

/**
 * Builds the Prisma `where` for the public hall search from query-string style params.
 * This is the single source of truth for `GET /api/halls` AND the AI search, so both always
 * filter identically.
 *
 *   city, area, date | fromDate+toDate | dates=YYYY-MM-DD,YYYY-MM-DD&match=all|any,
 *   q, minPrice, maxPrice, minCapacity, maxCapacity,
 *   hasRooms=true, hasAC=true, hasDining=true, amenities="A,B" (hall must have every one)
 *
 * Dates use one rule (see `freeOn`): a date is unavailable when the hall has a BOOKED availability row
 * OR a PENDING/CONFIRMED booking on it. A range needs every day in [from, to] free. `dates` with
 * match=all (default) needs every listed day free; match=any needs at least one of them free.
 */
export function buildHallWhere(query: Record<string, unknown>): HallWhereResult {
  const city = (query.city as string | undefined)?.trim();
  const area = (query.area as string | undefined)?.trim();
  const dateStr = query.date as string | undefined;
  const fromStr = query.fromDate as string | undefined;
  const toStr = query.toDate as string | undefined;
  const q = (query.q as string | undefined)?.trim();
  const minPrice = num(query.minPrice);
  const maxPrice = num(query.maxPrice);
  const minCapacity = num(query.minCapacity);
  const maxCapacity = num(query.maxCapacity);
  const amenityList = (query.amenities as string | undefined)
    ?.split(',').map((s) => s.trim()).filter(Boolean);

  const where: any = { isApproved: true };
  if (city) where.city = { equals: city, mode: 'insensitive' };
  if (area) {
    const areas = area.split(',').map((a) => a.trim()).filter(Boolean);
    if (areas.length === 1) where.area = { equals: areas[0], mode: 'insensitive' };
    else if (areas.length > 1) where.area = { in: areas };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { area: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (query.hasRooms === 'true') where.hasRooms = true;
  if (query.hasAC === 'true') where.hasAC = true;
  if (query.hasDining === 'true') where.diningCapacity = { gt: 0 };
  if (amenityList?.length) where.amenities = { hasEvery: amenityList };
  if (minPrice != null || maxPrice != null) {
    where.price = {};
    if (minPrice != null) where.price.gte = minPrice;
    if (maxPrice != null) where.price.lte = maxPrice;
  }
  if (minCapacity != null || maxCapacity != null) {
    where.capacity = {};
    if (minCapacity != null) where.capacity.gte = minCapacity;
    if (maxCapacity != null) where.capacity.lte = maxCapacity;
  }

  // Several separate dates (e.g. the muhurtham days a family is considering).
  const datesRaw = query.dates as string | undefined;
  if (datesRaw != null && String(datesRaw).trim() !== '') {
    const list = [...new Set(String(datesRaw).split(',').map((s) => s.trim()).filter(Boolean))].sort();
    if (list.some((d) => !parseDay(d))) return { error: 'Invalid date' };
    if (list.length > MAX_SEARCH_DATES) return { error: `Choose at most ${MAX_SEARCH_DATES} dates` };
    const match: DateMatch = query.match === 'any' ? 'any' : 'all';
    const days = list.map((d) => parseDay(d)!);
    if (match === 'all' || days.length === 1) Object.assign(where, freeOn({ in: days }));
    else where.AND = [{ OR: days.map((d) => freeOn(d)) }];
    return { where, days: list, match: days.length === 1 ? 'all' : match };
  }

  // Date range: every day in [from, to] must be free (no BOOKED row, no active booking).
  // Accept fromDate+toDate, or a single legacy `date`.
  let from: Date | undefined;
  let to: Date | undefined;
  if (fromStr || toStr) {
    from = fromStr ? new Date(fromStr) : undefined;
    to = toStr ? new Date(toStr) : from;
    if (!from) from = to;
  } else if (dateStr) {
    from = new Date(dateStr);
    to = from;
  }
  if (from && to) {
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return { error: 'Invalid date' };
    if (from > to) return { error: 'fromDate must be <= toDate' };
    Object.assign(where, freeOn({ gte: from, lte: to }));
  }
  return { where };
}

/**
 * For each hall, which of `days` (YYYY-MM-DD) are free — checked against BOTH sources (BOOKED rows and
 * active bookings). Halls not in the result map have every day free.
 */
export async function freeDaysFor(
  prisma: Pick<PrismaClient, 'availability' | 'booking'>,
  hallIds: string[],
  days: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!hallIds.length || !days.length) return out;
  const dates = days.map((d) => parseDay(d)!);
  const [blocked, held] = await Promise.all([
    prisma.availability.findMany({ where: { hallId: { in: hallIds }, date: { in: dates }, status: 'BOOKED' }, select: { hallId: true, date: true } }),
    prisma.booking.findMany({ where: { hallId: { in: hallIds }, date: { in: dates }, status: { in: [...ACTIVE_BOOKING] } }, select: { hallId: true, date: true } }),
  ]);
  const taken = new Map<string, Set<string>>();
  for (const r of [...blocked, ...held]) {
    const set = taken.get(r.hallId) ?? new Set<string>();
    set.add(new Date(r.date).toISOString().slice(0, 10));
    taken.set(r.hallId, set);
  }
  for (const id of hallIds) out.set(id, days.filter((d) => !taken.get(id)?.has(d)));
  return out;
}

type AvailabilityRow = { id: string; hallId: string; date: Date | string; status: string; createdAt?: Date | string; source?: 'owner' | 'booking' };

/**
 * The public calendar of one hall: the owner's availability rows plus every date held by a PENDING/CONFIRMED
 * booking (shown as BOOKED, with source 'booking'). No customer details are exposed — only the date.
 */
export function mergeBookingHolds(
  rows: AvailabilityRow[],
  bookings: { hallId: string; date: Date | string }[],
): AvailabilityRow[] {
  const key = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
  const byDay = new Map<string, AvailabilityRow>();
  for (const r of rows) byDay.set(key(r.date), r);
  for (const b of bookings) {
    const k = key(b.date);
    const existing = byDay.get(k);
    if (existing?.status === 'BOOKED') continue; // already blocked by the owner
    byDay.set(k, { id: `booking-${b.hallId}-${k}`, hallId: b.hallId, date: new Date(`${k}T00:00:00.000Z`), status: 'BOOKED', source: 'booking' });
  }
  return [...byDay.values()].sort((a, b) => key(a.date).localeCompare(key(b.date)));
}

/** Cities, areas per city and the price range of approved halls (backs GET /api/halls/filters and the AI search). */
export async function loadFilterOptions(prisma: Pick<PrismaClient, 'hall' | 'area'>) {
  const [hallRows, areaRows, priceAgg] = await Promise.all([
    prisma.hall.groupBy({ by: ['city', 'area'], where: { isApproved: true } }),
    prisma.area.findMany({ select: { city: true, name: true } }),
    prisma.hall.aggregate({
      where: { isApproved: true, price: { gt: 0 } },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);
  const areasByCity: Record<string, Set<string>> = {};
  function add(city: string, area: string) {
    if (!city) return;
    if (!areasByCity[city]) areasByCity[city] = new Set();
    if (area) areasByCity[city].add(area);
  }
  for (const r of hallRows) add(r.city, r.area);
  for (const a of areaRows) add(a.city, a.name);

  const cities = Object.keys(areasByCity).sort();
  const out: Record<string, string[]> = {};
  for (const c of cities) out[c] = Array.from(areasByCity[c]).sort();
  return {
    cities,
    areasByCity: out,
    priceRange: { min: priceAgg._min.price ?? 0, max: priceAgg._max.price ?? 0 },
  };
}
