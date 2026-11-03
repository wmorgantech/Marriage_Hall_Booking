/**
 * Natural-language hall search — rule-based extraction + verified search.
 *
 * Pipeline:  text --extractCriteria()--> criteria + issues  --runAiSearch()--> real halls from the database.
 *
 * The extractor only turns words into search criteria (city, dates, guests, budget, AC / rooms / dining,
 * amenity preferences). It NEVER produces halls, prices or availability: those come exclusively from the
 * database through the same filter builder as GET /api/halls (`buildHallWhere`), plus an explicit availability
 * check of the returned halls against both Availability records and active (PENDING / CONFIRMED) bookings —
 * the same rule the booking endpoint enforces. Anything the data cannot confirm is reported, not assumed.
 *
 * Also supported:
 *  - edited criteria (`opts.criteria`): searched exactly as given after validation;
 *  - follow-ups (`opts.previous`): "only AC", "cheaper", "what about the 14th" refine the previous criteria;
 *  - best-match ranking with factual reasons, and real alternatives (each one a counted search) when nothing
 *    matches exactly.
 *
 * `extractCriteria` / `refineCriteria` / `validateCriteria` are pure so they can be unit-tested without a database.
 * An optional LLM extractor could later be plugged in before the rules — intentionally NOT implemented here.
 */
import type { PrismaClient } from '@prisma/client';
import { buildHallWhere, freeDaysFor, loadFilterOptions, MAX_SEARCH_DATES, parseDay } from './hallSearch';
import { withContact } from './hall';

export { parseDay };

/* ------------------------------------------------------------------ types */

export type DateMatch = 'all' | 'any';

export type Criteria = {
  city?: string;
  area?: string;
  /** Set when exactly one date was asked for (YYYY-MM-DD, today or later, IST). Kept for older clients. */
  date?: string;
  /** Every requested date, sorted (1–10). */
  dates?: string[];
  /** all = the hall must be free on every date; any = on at least one. */
  match?: DateMatch;
  /** "800 guests" => the hall must seat at least this many. */
  minCapacity?: number;
  /** "budget 2 lakh" => per-day price must be at most this. */
  maxPrice?: number;
  minPrice?: number;
  hasAC?: true;
  hasRooms?: true;
  hasDining?: true;
  /** Amenity labels the user would like (e.g. "Valet Parking"). Preferences only — never a hard filter. */
  preferences: string[];
  /** "budget friendly" / "kammi" => lowest price first. A sort order, never a filter. */
  cheapFirst?: true;
};

export type Issue = {
  code:
    | 'not_understood' | 'date_invalid' | 'date_past' | 'date_far' | 'multiple_cities' | 'area_ambiguous'
    | 'unknown_place' | 'number_ambiguous' | 'capacity_invalid' | 'budget_invalid' | 'unsupported'
    | 'no_date' | 'no_city' | 'year_assumed' | 'range_used' | 'too_many_dates' | 'dates_any' | 'dates_all'
    | 'muhurtham_used' | 'no_muhurtham' | 'not_muhurtham' | 'tamil_month_approx' | 'relative_date'
    | 'cheap_first' | 'refined' | 'invalid_criteria';
  message: string;
  /** true => the search is NOT run until the user fixes this (we never guess around it). */
  blocking?: boolean;
};

export type Catalogue = { cities: string[]; areasByCity: Record<string, string[]>; muhurtham?: string[] };

export type Extraction = { criteria: Criteria; issues: Issue[]; recognised: string[] };

/* ------------------------------------------------------------------ helpers */

/** "Today" is the Indian calendar day (the product serves Tamil Nadu only) — same rule as the booking API. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
  // English month names written in Tamil script
  'ஜனவரி': 1, 'பிப்ரவரி': 2, 'மார்ச்': 3, 'ஏப்ரல்': 4, 'மே': 5, 'ஜூன்': 6, 'ஜூலை': 7, 'ஆகஸ்ட்': 8,
  'செப்டம்பர்': 9, 'அக்டோபர்': 10, 'நவம்பர்': 11, 'டிசம்பர்': 12,
};
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).map(esc).join('|');

/**
 * Tamil solar months -> approximate Gregorian start (month, day). Boundaries move by about a day between years,
 * so they are only used to pick muhurtham dates (which come from the admin-managed calendar), never as exact days.
 */
const TAMIL_MONTHS: { name: string; words: string[]; start: [number, number] }[] = [
  { name: 'Chithirai', words: ['chithirai', 'chitirai', 'chithrai', 'சித்திரை'], start: [4, 14] },
  { name: 'Vaikasi', words: ['vaikasi', 'vaigasi', 'vaikaasi', 'வைகாசி'], start: [5, 15] },
  { name: 'Aani', words: ['aani', 'aani maasam', 'ஆனி'], start: [6, 15] },
  { name: 'Aadi', words: ['aadi', 'aadi maasam', 'ஆடி'], start: [7, 17] },
  { name: 'Aavani', words: ['aavani', 'avani', 'ஆவணி'], start: [8, 17] },
  { name: 'Purattasi', words: ['purattasi', 'puratasi', 'புரட்டாசி'], start: [9, 17] },
  { name: 'Aippasi', words: ['aippasi', 'ippasi', 'ஐப்பசி'], start: [10, 18] },
  { name: 'Karthigai', words: ['karthigai', 'karthikai', 'kaarthigai', 'கார்த்திகை'], start: [11, 17] },
  { name: 'Margazhi', words: ['margazhi', 'margali', 'maargazhi', 'மார்கழி'], start: [12, 16] },
  { name: 'Thai', words: ['thai', 'thai maasam', 'தை'], start: [1, 14] },
  { name: 'Maasi', words: ['maasi', 'masi', 'மாசி'], start: [2, 13] },
  { name: 'Panguni', words: ['panguni', 'பங்குனி'], start: [3, 15] },
];

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
  nyayiru: 0, gnayiru: 0, nyaayiru: 0, thingal: 1, sevvai: 2, budhan: 3, puthan: 3, vyazhan: 4, viyazhan: 4, velli: 5, sani: 6,
  'ஞாயிறு': 0, 'திங்கள்': 1, 'செவ்வாய்': 2, 'புதன்': 3, 'வியாழன்': 4, 'வெள்ளி': 5, 'சனி': 6,
};
const WEEKDAY_ALT = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).map(esc).join('|');

// Common alternative spellings / Tamil names -> canonical city (only used if that city really exists in the data).
const CITY_ALIASES: Record<string, string> = {
  kovai: 'Coimbatore', 'coimbatur': 'Coimbatore', trichy: 'Tiruchirappalli', trichi: 'Tiruchirappalli', tiruchi: 'Tiruchirappalli',
  tiruchirapalli: 'Tiruchirappalli', nellai: 'Tirunelveli', tirunelveli: 'Tirunelveli', madras: 'Chennai', tanjore: 'Thanjavur',
  thanjai: 'Thanjavur', 'chennai city': 'Chennai', madurai: 'Madurai', dindugal: 'Dindigul', dindukal: 'Dindigul',
  'கோயம்புத்தூர்': 'Coimbatore', 'கோவை': 'Coimbatore', 'சென்னை': 'Chennai', 'மதுரை': 'Madurai', 'சேலம்': 'Salem',
  'ஈரோடு': 'Erode', 'வேலூர்': 'Vellore', 'தஞ்சாவூர்': 'Thanjavur', 'தஞ்சை': 'Thanjavur', 'திருச்சிராப்பள்ளி': 'Tiruchirappalli',
  'திருச்சி': 'Tiruchirappalli', 'திருநெல்வேலி': 'Tirunelveli', 'நெல்லை': 'Tirunelveli', 'திண்டுக்கல்': 'Dindigul',
};

// Catalogue amenity labels (same strings the admin screens store) a user may ask for.
const PREFERENCE_PATTERNS: [string, RegExp][] = [
  ['Valet Parking', /\b(parking|valet|car park|park(?:ing)? space|vandi nirutha)\b|பார்க்கிங்|வாகன நிறுத்தம்/],
  ['Bridal Room', /\b(bridal|bride|ponnu)\s*room\b|மணமகள் அறை/],
  ['Generator backup', /\b(generator|power\s*backup|backup\s*power)\b|ஜெனரேட்டர்/],
  ['In-house catering', /\bin[- ]?house\s*catering\b/],
  ['External catering allowed', /\b(outside|external)\s*catering\b/],
  ['In-house decor', /\b(decor|decoration|decorations)\b|அலங்காரம்/],
  ['Sound system', /\bsound\s*system\b/],
  ['Stage lighting', /\bstage\s*light(?:ing|s)?\b/],
  ['CCTV security', /\bcctv\b/],
  ['Wheelchair accessible', /\b(wheel\s*chair|wheelchair|accessible)\b/],
  ['Wifi', /\bwi-?fi\b/],
  ['Vegetarian-only kitchen', /\b(pure\s*veg|vegetarian|veg only|saivam)\b|சைவம்/],
];

// Things people ask for that no hall field can confirm — said out loud instead of being silently ignored.
const UNSUPPORTED_WORDS = [
  'photographer', 'photography', 'videographer', 'swimming', 'pool', 'alcohol', 'bar', 'dj', 'nadaswaram', 'band',
  'makeup', 'mehendi', 'mehandi', 'priest', 'catering', 'food', 'pandit', 'live music',
];

const CAPACITY_WORD = '(?:guests?|people|persons?|pax|members?|attendees|heads|seats?|seating|capacity|peru|pear|aalunga|aalugal|aalukal|aatkal|பேர்|நபர்கள்|நபர்|விருந்தினர்கள்|விருந்தினர்)';
const NOT_PLACES = new Set(['lakh', 'lakhs', 'lacs', 'rupees', 'inr', 'total', 'between', 'indian', 'india', 'tamilnadu', 'wedding', 'marriage', 'hall', 'halls', 'venue', 'mandapam', 'around', 'least', 'most', 'about', 'under', 'below', 'above', 'over', 'within', 'max', 'min', 'maximum', 'minimum', 'the', 'a', 'an', 'my', 'our', 'your', 'this', 'that', 'it', 'me', 'us', 'tamil', 'nadu', 'budget', 'time', 'date', 'dates', 'any', 'all', 'case', 'order', 'advance', 'muhurtham', 'muhurtham', 'december', 'month', 'week', 'weekend']);
const CHEAP_RE = /\b(budget[- ]friendly|low[- ]budget|cheap|cheapest|affordable|economical|kammi|kammiyana|kuraivana|kuraivu|less price|low price|low cost)\b|குறைந்த விலை|மலிவு/;
const MUHURTHAM_RE = /\b(muhurth?am|muhurtam|muhoortham|mugurtham|mukurtham|muhurtha|subha muhurtham|nalla naal)\b|முகூர்த்த(?:ம்)?|நல்ல நாள்/;

function parseAmount(raw: string, unit?: string): number {
  const base = Number(raw.replace(/,/g, ''));
  const u = (unit ?? '').toLowerCase();
  const mult = /^(lakh|lakhs|lac|lacs|lak|l|laksham|latcham|lakshams)$/.test(u) ? 100000
    : /^(k|thousand|aayiram|ayiram)$/.test(u) ? 1000
    : /^(crore|crores|cr)$/.test(u) ? 10000000 : 1;
  return Math.round(base * mult);
}

/** The next Tamil month range [start, end] (inclusive) that has not fully passed. */
function tamilMonthRange(idx: number, today: string): [string, string] {
  const startOf = (i: number, y: number) => isoDay(y, TAMIL_MONTHS[i].start[0], TAMIL_MONTHS[i].start[1]);
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const start = startOf(idx, y);
    const nextIdx = (idx + 1) % 12;
    const nextStart = startOf(nextIdx, TAMIL_MONTHS[nextIdx].start[0] < TAMIL_MONTHS[idx].start[0] ? y + 1 : y);
    const end = addDays(nextStart, -1);
    if (end >= today) return [start, end];
  }
  return [startOf(idx, year + 1), addDays(startOf((idx + 1) % 12, year + 1), -1)];
}

/* ------------------------------------------------------------------ extraction */

export function extractCriteria(input: string, cat: Catalogue, today: string = todayIST()): Extraction {
  const issues: Issue[] = [];
  const recognised: string[] = [];
  const criteria: Criteria = { preferences: [] };
  const muhurtham = (cat.muhurtham ?? []).filter((d) => d >= today).sort();

  // Normalise: Tamil digits -> ASCII, rupee sign -> "rs", Tanglish suffixes (-la, -ku, -kulla, -il ...) split off.
  let s = input.normalize('NFKC').replace(/[௦-௯]/g, (d) => String('௦௧௨௩௪௫௬௭௮௯'.indexOf(d)));
  s = s.replace(/₹/g, ' rs ').replace(/\s+/g, ' ');
  s = s.replace(/([\p{L}\p{N}])-(?:la|laa|ula|il|ku|kku|kulla|ukku|ukkul|ulla|le|lerndhu|um|ah|ah\?|ae|kkulla)(?=$|[^\p{L}])/giu, '$1 ');
  let t = ' ' + s.toLowerCase() + ' ';
  const take = (re: RegExp) => { const m = re.exec(t); if (m) t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length); return m; };

  /* ---- budget (per-day price) ---- */
  const unit = '(lakhs?|lacs?|lak|laksham|latcham|crores?|cr|k|thousand|aayiram|ayiram)';
  const num = '(\\d[\\d,]*(?:\\.\\d+)?)';
  let budgetMin = false;
  // "1 to 2 lakh" / "1-2 lakh"
  let m = take(new RegExp(`(?:rs\\.?\\s*)?${num}\\s*(?:-|to)\\s*${num}\\s*${unit}\\b`));
  if (m) {
    const a = parseAmount(m[1], m[3]); const b = parseAmount(m[2], m[3]);
    criteria.minPrice = Math.min(a, b); criteria.maxPrice = Math.max(a, b);
    recognised.push('budget');
  } else {
    const before = (idx: number) => t.slice(Math.max(0, idx - 24), idx);
    m = take(new RegExp(`\\b(?:rs\\.?|inr|rupees?)\\s*${num}\\s*(?:${unit}\\b)?`))
      // "1k guests" is a head-count, not a ₹1,000 budget
      ?? take(new RegExp(`\\b${num}\\s*${unit}\\b(?!\\s*\\+?\\s*${CAPACITY_WORD})`, 'u'))
      ?? take(new RegExp(`budget\\s*(?:of|is|around|about|:)?\\s*${num}\\s*(?:${unit}\\b)?`));
    if (m) {
      // groups differ per pattern: first numeric group + (optional) unit group
      const value = parseAmount(m[1], m[2]);
      const ctx = before(m.index) + ' ' + t.slice(m.index + m[0].length, m.index + m[0].length + 14);
      budgetMin = /\b(above|over|minimum|min|at least|atleast|more than|mela|மேல்)\b/.test(ctx);
      if (value < 1000) issues.push({ code: 'budget_invalid', message: `A budget of ₹${value} is too small to be a per-day hall price. Try "₹2 lakh" or "200000".`, blocking: true });
      else if (budgetMin) { criteria.minPrice = value; recognised.push('budget'); }
      else { criteria.maxPrice = value; recognised.push('budget'); }
    }
  }
  if (take(CHEAP_RE)) {
    criteria.cheapFirst = true; recognised.push('cheap');
    issues.push({ code: 'cheap_first', message: 'Showing the lowest prices first ("budget friendly" is a sort order, not a fixed budget).' });
  }

  /* ---- dates ---- */
  const dates: string[] = [];
  let dateAttempted = false;
  let assumedYear = false;
  /** Validates one day; returns the ISO date or null (and records why). */
  const resolveDay = (y: number | undefined, mo: number, d: number): string | null => {
    dateAttempted = true;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) { issues.push({ code: 'date_invalid', message: `"${d}/${mo}" is not a valid date.`, blocking: true }); return null; }
    let year = y;
    if (year == null) {
      year = Number(today.slice(0, 4));
      if (isoDay(year, mo, d) < today) year += 1; // "next occurrence"
      assumedYear = true;
    } else if (year < 100) year += 2000;
    const iso = isoDay(year, mo, d);
    if (!parseDay(iso)) {
      issues.push({ code: 'date_invalid', message: `${MONTH_NAMES[mo]} ${d}${y != null ? ' ' + year : ''} is not a real calendar date. Please check the day.`, blocking: true });
      return null;
    }
    if (iso < today) { issues.push({ code: 'date_past', message: `${iso} is in the past. Please give a date from today (${today}) onwards.`, blocking: true }); return null; }
    if (Number(iso.slice(0, 4)) > Number(today.slice(0, 4)) + 3) { issues.push({ code: 'date_far', message: `${iso} is too far ahead to check. Please give a nearer date.`, blocking: true }); return null; }
    return iso;
  };
  const push = (iso: string | null) => { if (iso && !dates.includes(iso)) dates.push(iso); };
  let connector: DateMatch | undefined;
  const connectorOf = (s: string): DateMatch => (/\b(and|&|matrum)\b|&/.test(s) && !/\b(or|illana|illa na|alladhu)\b|\//.test(s) ? 'all' : 'any');
  const ORD = '(?:st|nd|rd|th)?';
  const SEP = '\\s*(?:,|\\bor\\b|\\band\\b|&|/|\\billana\\b|\\bmatrum\\b)\\s*';

  // several dates, month first: "December 12, 14 or 16" / "Dec 12 and Dec 13"
  let dm = take(new RegExp(`(?<![\\p{L}])(${MONTH_ALT})\\.?\\s*(\\d{1,2})${ORD}(?!\\d)((?:${SEP}(?:(?:${MONTH_ALT})\\.?\\s*)?\\d{1,2}${ORD}(?!\\d))+)(?:,?\\s*(20\\d{2}))?`, 'u'));
  if (dm) {
    const year = dm[4] ? +dm[4] : undefined;
    let month = MONTHS[dm[1]];
    push(resolveDay(year, month, +dm[2]));
    for (const part of dm[3].matchAll(new RegExp(`(?:(${MONTH_ALT})\\.?\\s*)?(\\d{1,2})`, 'gu'))) {
      if (part[1]) month = MONTHS[part[1]];
      push(resolveDay(year, month, +part[2]));
    }
    connector = connectorOf(dm[3]);
  } else if ((dm = take(new RegExp(`(?<![\\d,.])(\\d{1,2})${ORD}((?:${SEP}\\d{1,2}${ORD})+)\\s*(?:of\\s+)?(${MONTH_ALT})\\.?(?![\\p{L}])(?:,?\\s*(20\\d{2}))?`, 'u')))) {
    // several dates, day first: "12 and 14 December"
    const year = dm[4] ? +dm[4] : undefined;
    const month = MONTHS[dm[3]];
    push(resolveDay(year, month, +dm[1]));
    for (const part of dm[2].matchAll(/(\d{1,2})/g)) push(resolveDay(year, month, +part[1]));
    connector = connectorOf(dm[2]);
  } else if ((dm = take(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) push(resolveDay(+dm[1], +dm[2], +dm[3]));
  else if ((dm = take(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/))) push(resolveDay(+dm[3], +dm[2], +dm[1])); // day-first (India)
  else if ((dm = take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?(?![\\p{L}])`, 'u')))) push(resolveDay(dm[3] ? +dm[3] : undefined, MONTHS[dm[2]], +dm[1]));
  else if ((dm = take(new RegExp(`(?<![\\p{L}])(${MONTH_ALT})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s*(20\\d{2}))?`, 'u')))) push(resolveDay(dm[3] ? +dm[3] : undefined, MONTHS[dm[1]], +dm[2]));

  // relative days: today / tomorrow / day after tomorrow / this|next <weekday>
  if (!dateAttempted) {
    const rel = take(/\b(day after tomorrow|naalanniku|nalanniku|today|tonight|inniku|indru|innaikku|tomorrow|tmrw|naalai|naalaiku|naalaikku|nalaiku)\b|நாளை மறுநாள்|இன்று|நாளை/);
    if (rel) {
      const w = rel[0];
      const offset = /day after|naalanniku|nalanniku|மறுநாள்/.test(w) ? 2 : /today|tonight|inniku|indru|innaikku|இன்று/.test(w) ? 0 : 1;
      const iso = addDays(today, offset);
      dateAttempted = true; push(iso);
      issues.push({ code: 'relative_date', message: `"${w.trim()}" = ${iso}.` });
    } else {
      const wd = take(new RegExp(`(?:\\b(this|next|varra|vara|varum|indha)\\s+)?(?<![\\p{L}])(${WEEKDAY_ALT})(?:\\s*kizhamai)?(?![\\p{L}])`, 'u'));
      if (wd) {
        const target = WEEKDAYS[wd[2]];
        const now = new Date(`${today}T00:00:00Z`).getUTCDay();
        let delta = (target - now + 7) % 7;
        if (wd[1] && /next|varra|vara|varum/.test(wd[1]) && delta === 0) delta = 7;
        const iso = addDays(today, delta);
        dateAttempted = true; push(iso);
        issues.push({ code: 'relative_date', message: `"${wd[0].trim()}" = ${iso}.` });
      }
    }
  }

  // muhurtham days, optionally within an English or Tamil month
  const saidMuhurtham = MUHURTHAM_RE.test(t);
  if (saidMuhurtham) take(MUHURTHAM_RE);
  let tamilIdx = -1;
  for (let i = 0; i < TAMIL_MONTHS.length && tamilIdx < 0; i++) {
    for (const w of TAMIL_MONTHS[i].words) {
      const re = /[^\x00-\x7f]/.test(w) ? new RegExp(`(?<![\\p{L}\\p{M}])${esc(w)}(?![\\p{L}\\p{M}])`, 'u') : new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, 'u');
      if (re.test(t)) { tamilIdx = i; take(re); break; }
    }
  }
  if (!dates.length && (saidMuhurtham || tamilIdx >= 0)) {
    dateAttempted = true;
    const monthOnly = take(new RegExp(`(?<![\\p{L}])(${MONTH_ALT})(?![\\p{L}])`, 'u'));
    let pool = muhurtham;
    let where = '';
    if (tamilIdx >= 0) {
      const [from, to] = tamilMonthRange(tamilIdx, today);
      pool = muhurtham.filter((d) => d >= from && d <= to);
      where = ` in ${TAMIL_MONTHS[tamilIdx].name} (about ${from} to ${to})`;
      issues.push({ code: 'tamil_month_approx', message: `${TAMIL_MONTHS[tamilIdx].name} is taken as ${from} to ${to}; Tamil month boundaries can differ by a day.` });
    } else if (monthOnly) {
      const mo = MONTHS[monthOnly[1]];
      // the next occurrence of that month (the current month counts; past days are already excluded)
      const y = Number(today.slice(0, 4)) + (mo < Number(today.slice(5, 7)) ? 1 : 0);
      pool = muhurtham.filter((d) => d.startsWith(`${y}-${pad(mo)}`));
      where = ` in ${MONTH_NAMES[mo]} ${y}`;
    }
    const next = /\b(next|adutha|aduththa|first|first available|nearest)\b/.test(t);
    const chosen = next ? pool.slice(0, 1) : tamilIdx >= 0 || where ? pool.slice(0, MAX_SEARCH_DATES) : pool.slice(0, 3);
    if (!chosen.length) {
      issues.push({ code: 'no_muhurtham', message: `There are no muhurtham dates${where || ' coming up'} in our calendar. Please give a specific date instead.`, blocking: true });
    } else {
      chosen.forEach((d) => push(d));
      connector = 'any';
      issues.push({ code: 'muhurtham_used', message: `Using ${chosen.length === 1 ? 'the muhurtham date' : `${chosen.length} muhurtham dates`}${where}: ${chosen.join(', ')}.` });
      if (pool.length > chosen.length && !next) issues.push({ code: 'too_many_dates', message: `Only the first ${chosen.length} muhurtham dates are checked; pick dates to see others.` });
    }
  } else if (saidMuhurtham && dates.length) {
    const notMuhurtham = dates.filter((d) => muhurtham.length && !muhurtham.includes(d));
    if (notMuhurtham.length) issues.push({ code: 'not_muhurtham', message: `${notMuhurtham.join(', ')} ${notMuhurtham.length === 1 ? 'is' : 'are'} not in our muhurtham calendar — searching ${notMuhurtham.length === 1 ? 'it' : 'them'} anyway.` });
  } else if (!dateAttempted && new RegExp(`(?<![\\p{L}])(${MONTH_ALT})(?![\\p{L}])`, 'u').test(t)) {
    dateAttempted = true;
    issues.push({ code: 'date_invalid', message: 'I saw a month but no day. Please give the full date, e.g. "December 12" — or say "December muhurtham".', blocking: true });
  }

  if (dates.length) {
    dates.sort();
    if (dates.length > MAX_SEARCH_DATES) {
      issues.push({ code: 'too_many_dates', message: `Only ${MAX_SEARCH_DATES} dates can be checked at once — using the first ${MAX_SEARCH_DATES}.` });
      dates.length = MAX_SEARCH_DATES;
    }
    if (/\b(all|both|every|ellaa|ella|rendu naalum)\b|எல்லா/.test(t)) connector = 'all';
    else if (/\b(any|either|edhavadhu|ethavathu)\b|ஏதாவது/.test(t)) connector = 'any';
    criteria.dates = [...dates];
    if (dates.length === 1) criteria.date = dates[0];
    else {
      criteria.match = connector ?? 'any';
      issues.push(criteria.match === 'all'
        ? { code: 'dates_all', message: `Showing halls free on all ${dates.length} dates.` }
        : { code: 'dates_any', message: `Showing halls free on at least one of the ${dates.length} dates (say "all dates" to need every one).` });
    }
    recognised.push('date');
    if (assumedYear && !issues.some((i) => i.code === 'muhurtham_used')) {
      issues.push({
        code: 'year_assumed',
        message: dates.length === 1
          ? `No year given — using the next ${MONTH_NAMES[+dates[0].slice(5, 7)]} ${+dates[0].slice(8)}: ${dates[0]}.`
          : `No year given — using the next occurrences: ${dates.join(', ')}.`,
      });
    }
  }

  /* ---- guests ---- */
  const capRe = [
    new RegExp(`\\b(\\d[\\d,]*)\\s*(?:-|to)\\s*(\\d[\\d,]*)\\s*\\+?\\s*${CAPACITY_WORD}`, 'u'),
    new RegExp(`${num}\\s*(k)?\\s*\\+?\\s*${CAPACITY_WORD}`, 'u'),
    new RegExp(`${CAPACITY_WORD}\\s*(?:of|for|:|around|about)?\\s*${num}\\s*(k)?\\b`, 'u'),
  ];
  let g: RegExpExecArray | null = null;
  let guests: number | undefined;
  if ((g = take(capRe[0]))) {
    guests = Math.max(Number(g[1].replace(/,/g, '')), Number(g[2].replace(/,/g, '')));
    issues.push({ code: 'range_used', message: `You gave a range of guests — searching for halls that seat at least ${guests}.` });
  } else if ((g = take(capRe[1]))) guests = parseAmount(g[1], g[2]);
  else if ((g = take(capRe[2]))) guests = parseAmount(g[1], g[2]);
  if (guests != null) {
    if (guests < 1 || guests > 10000) issues.push({ code: 'capacity_invalid', message: `${guests} guests is outside the range I can search (1–10,000).`, blocking: true });
    else { criteria.minCapacity = guests; recognised.push('guests'); }
  }

  /* ---- hard requirements backed by real hall fields ---- */
  if (take(/(?<![\p{L}\p{N}])(ac|a\/c|a\.c\.?|air[- ]?con(?:ditioned|ditioning)?)(?![\p{L}\p{N}])|குளிர்சாதன|ஏசி/u)) { criteria.hasAC = true; recognised.push('ac'); }
  if (take(/(?<!bridal )(?<!bride )\b(guest\s*rooms?|rooms?|accommodation|lodging|thangum vasathi)\b|தங்கும்/)) { criteria.hasRooms = true; recognised.push('rooms'); }
  if (take(/\b(dining|dinning|dining hall|food hall|saapattu hall|sapadu hall)\b|உணவு கூடம்/)) { criteria.hasDining = true; recognised.push('dining'); }

  /* ---- preferences (amenity labels; never a hard filter) ---- */
  for (const [label, re] of PREFERENCE_PATTERNS) {
    if (re.test(t)) { criteria.preferences.push(label); }
  }
  if (criteria.preferences.length) recognised.push('preferences');
  const unsupported = UNSUPPORTED_WORDS.filter((w) => new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, 'u').test(t) && !criteria.preferences.some((p) => p.toLowerCase().includes(w)));
  if (unsupported.length) {
    issues.push({ code: 'unsupported', message: `I can't check ${unsupported.join(', ')} — halls don't list that, so it was not used to filter.` });
  }

  /* ---- place: city / area ---- */
  const cityHits = new Set<string>();
  const canon = new Map(cat.cities.map((c) => [c.toLowerCase(), c]));
  for (const c of cat.cities) {
    if (new RegExp(`(?<![\\p{L}])${esc(c.toLowerCase())}(?![\\p{L}])`, 'u').test(t)) cityHits.add(c);
  }
  for (const [alias, target] of Object.entries(CITY_ALIASES)) {
    const real = canon.get(target.toLowerCase());
    if (!real) continue;
    const isTamil = /[^\x00-\x7f]/.test(alias);
    if (isTamil ? t.includes(alias) : new RegExp(`(?<![\\p{L}])${esc(alias)}(?![\\p{L}])`, 'u').test(t)) cityHits.add(real);
  }
  if (cityHits.size > 1) {
    issues.push({ code: 'multiple_cities', message: `You mentioned more than one city (${[...cityHits].join(', ')}). Please search one city at a time.`, blocking: true });
  } else if (cityHits.size === 1) { criteria.city = [...cityHits][0]; recognised.push('city'); }

  const areaHits: { city: string; area: string }[] = [];
  const searchCities = criteria.city ? [criteria.city] : cat.cities;
  for (const c of searchCities) {
    for (const a of cat.areasByCity[c] ?? []) {
      if (new RegExp(`(?<![\\p{L}])${esc(a.toLowerCase())}(?![\\p{L}])`, 'u').test(t)) areaHits.push({ city: c, area: a });
    }
  }
  if (areaHits.length === 1) {
    criteria.area = areaHits[0].area; criteria.city ??= areaHits[0].city; recognised.push('area');
    if (!recognised.includes('city')) recognised.push('city');
  } else if (areaHits.length > 1) {
    const names = [...new Set(areaHits.map((h) => h.area))];
    if (names.length === 1 && !criteria.city) {
      issues.push({ code: 'area_ambiguous', message: `"${names[0]}" exists in more than one city (${areaHits.map((h) => h.city).join(', ')}). Please add the city.`, blocking: true });
    } else if (names.length > 1) {
      // several different areas of the same city: the longest match is the most specific one
      const best = areaHits.sort((x, y) => y.area.length - x.area.length)[0];
      criteria.area = best.area; criteria.city ??= best.city; recognised.push('area');
    }
  }
  if (!criteria.city && !issues.some((i) => i.code === 'multiple_cities' || i.code === 'area_ambiguous')) {
    const unknown = /(?:\bin|\bat|\bnear)\s+([a-z]{3,})/.exec(t);
    if (unknown && !NOT_PLACES.has(unknown[1]) && !MONTHS[unknown[1]] && !(unknown[1] in WEEKDAYS)) {
      issues.push({ code: 'unknown_place', message: `I couldn't find "${unknown[1]}" in our listings. We currently list halls in: ${cat.cities.join(', ')}.`, blocking: true });
    }
  }

  /* ---- a leftover bare number is NEVER guessed ---- */
  const leftover = /(?<![\d,.])(\d{3,5})(?![\d,.])/.exec(t);
  if (leftover && criteria.minCapacity == null && !issues.some((i) => i.code === 'capacity_invalid')) {
    issues.push({ code: 'number_ambiguous', message: `I found the number ${leftover[1]} but can't tell whether it is guests or a budget. Try "${leftover[1]} guests" or "₹${leftover[1]}".` });
  }

  // Amenity wishes alone ("with parking") are not a search: they are preferences on top of real criteria.
  if (!recognised.some((r) => r !== 'preferences') && !issues.some((i) => i.blocking)) {
    issues.push({ code: 'not_understood', message: 'I could not find a city, date, guest count or budget in that. Try something like: "Coimbatore, December 12, 800 guests, budget ₹2 lakh".', blocking: true });
  }
  if (!criteria.dates && !dateAttempted && recognised.length) {
    issues.push({ code: 'no_date', message: 'No date given, so availability was not checked. Add a date (e.g. "December 12") to see only halls free on that day.' });
  }
  if (!criteria.city && recognised.length && !issues.some((i) => ['multiple_cities', 'area_ambiguous', 'unknown_place'].includes(i.code))) {
    issues.push({ code: 'no_city', message: 'No city given, so halls from all cities are shown. Add a city to narrow it down.' });
  }
  return { criteria, issues, recognised: [...new Set(recognised)] };
}

/* ------------------------------------------------------------------ edited criteria + follow-ups */

/**
 * Edited criteria (from the editable rows) are searched exactly as given — after the same checks the text goes
 * through: the city/area must exist, dates must be real, not past and at most MAX_SEARCH_DATES.
 */
export function validateCriteria(input: Partial<Criteria>, cat: Catalogue, today: string = todayIST()): { criteria: Criteria; issues: Issue[] } {
  const issues: Issue[] = [];
  const c: Criteria = { preferences: [...new Set((input.preferences ?? []).map((p) => p.trim()).filter(Boolean))] };
  if (input.city) {
    const city = cat.cities.find((x) => x.toLowerCase() === input.city!.trim().toLowerCase());
    if (!city) issues.push({ code: 'invalid_criteria', message: `We don't list halls in "${input.city}". Cities: ${cat.cities.join(', ')}.`, blocking: true });
    else c.city = city;
  }
  if (input.area) {
    const pool = c.city ? (cat.areasByCity[c.city] ?? []) : Object.values(cat.areasByCity).flat();
    const area = pool.find((a) => a.toLowerCase() === input.area!.trim().toLowerCase());
    if (!area) issues.push({ code: 'invalid_criteria', message: `"${input.area}" is not a listed area${c.city ? ` in ${c.city}` : ''}.`, blocking: true });
    else c.area = area;
  }
  const raw = [...new Set([...(input.dates ?? []), ...(input.date ? [input.date] : [])])].sort();
  if (raw.length > MAX_SEARCH_DATES) issues.push({ code: 'too_many_dates', message: `Choose at most ${MAX_SEARCH_DATES} dates.`, blocking: true });
  for (const d of raw) {
    if (!parseDay(d)) issues.push({ code: 'date_invalid', message: `${d} is not a real calendar date.`, blocking: true });
    else if (d < today) issues.push({ code: 'date_past', message: `${d} is in the past. Please choose a date from today (${today}) onwards.`, blocking: true });
  }
  if (raw.length) {
    c.dates = raw;
    if (raw.length === 1) c.date = raw[0];
    else c.match = input.match === 'all' ? 'all' : 'any';
  }
  if (input.minCapacity != null) c.minCapacity = input.minCapacity;
  if (input.maxPrice != null) c.maxPrice = input.maxPrice;
  if (input.minPrice != null) c.minPrice = input.minPrice;
  if (c.minPrice != null && c.maxPrice != null && c.minPrice > c.maxPrice) issues.push({ code: 'budget_invalid', message: 'The minimum price is above the maximum.', blocking: true });
  if (input.hasAC) c.hasAC = true;
  if (input.hasRooms) c.hasRooms = true;
  if (input.hasDining) c.hasDining = true;
  if (input.cheapFirst) c.cheapFirst = true;
  const any = c.city || c.area || c.dates || c.minCapacity != null || c.maxPrice != null || c.minPrice != null || c.hasAC || c.hasRooms || c.hasDining;
  if (!any && !issues.length) issues.push({ code: 'not_understood', message: 'Add at least a city, date, guest count or budget.', blocking: true });
  if (!c.dates) issues.push({ code: 'no_date', message: 'No date given, so availability was not checked. Add a date to see only halls free on that day.' });
  return { criteria: c, issues };
}

/**
 * A follow-up refines the previous criteria: whatever the new text mentions replaces the old value, the rest is
 * kept. Understood shortcuts: "cheaper" / "kammi", "what about the 14th", "no AC", "without parking",
 * "any area", "any date". Returns blocking `not_understood` when the text changes nothing.
 */
export function refineCriteria(prev: Partial<Criteria>, text: string, cat: Catalogue, today: string = todayIST()): Extraction {
  const base = validateCriteria(prev, cat, today);
  const old = base.criteria;
  const ex = extractCriteria(text, cat, today);
  const t = ' ' + text.toLowerCase() + ' ';
  const changes: string[] = [];
  const next: Criteria = { ...old, preferences: [...old.preferences] };
  const issues: Issue[] = ex.issues.filter((i) => !['not_understood', 'no_date', 'no_city', 'number_ambiguous', 'cheap_first'].includes(i.code));
  let changed = false;

  if (ex.criteria.city && ex.criteria.city !== old.city) { next.city = ex.criteria.city; delete next.area; changes.push(`city ${next.city}`); changed = true; }
  if (ex.criteria.area) { next.area = ex.criteria.area; next.city = ex.criteria.city ?? next.city; changes.push(`area ${next.area}`); changed = true; }
  if (ex.criteria.dates) {
    next.dates = ex.criteria.dates; next.date = ex.criteria.date; next.match = ex.criteria.match;
    if (!next.date) delete next.date;
    if (!next.match) delete next.match;
    changes.push(`date${next.dates.length > 1 ? 's' : ''} ${next.dates.join(', ')}`); changed = true;
  } else {
    // "what about the 14th" / "14th?" — same month as the previous first date
    const dayOnly = /(?:\babout\b|\bon\b|\bthe\b|^|\s)(\d{1,2})(?:st|nd|rd|th)\b|\b(?:what about|how about|enna|appo)\s+(?:the\s+)?(\d{1,2})\b/.exec(t);
    if (dayOnly && old.dates?.length) {
      const d = +(dayOnly[1] ?? dayOnly[2]);
      const [y, mo] = old.dates[0].split('-').map(Number);
      let iso = isoDay(y, mo, d);
      if (iso < today) iso = isoDay(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, d);
      if (!parseDay(iso)) issues.push({ code: 'date_invalid', message: `${MONTH_NAMES[mo]} ${d} is not a real calendar date.`, blocking: true });
      else { next.dates = [iso]; next.date = iso; delete next.match; changes.push(`date ${iso}`); changed = true; }
    }
  }
  if (/\b(any date|no date|without date|any day)\b/.test(t)) { delete next.dates; delete next.date; delete next.match; changes.push('any date'); changed = true; }
  if (ex.criteria.minCapacity != null) { next.minCapacity = ex.criteria.minCapacity; changes.push(`${next.minCapacity}+ guests`); changed = true; }
  if (ex.criteria.maxPrice != null) { next.maxPrice = ex.criteria.maxPrice; changes.push(`budget up to ${inr(next.maxPrice)}`); changed = true; }
  if (ex.criteria.minPrice != null) { next.minPrice = ex.criteria.minPrice; changed = true; }
  if (/\b(cheaper|less|lower|kammi|kuraivaa|kuraivana|konjam kammi)\b/.test(t) && ex.criteria.maxPrice == null) {
    if (old.maxPrice != null) { next.maxPrice = Math.max(1000, roundTo(old.maxPrice * 0.8, 5000)); changes.push(`budget up to ${inr(next.maxPrice)}`); }
    else { next.cheapFirst = true; changes.push('lowest prices first'); }
    changed = true;
  } else if (ex.criteria.cheapFirst) { next.cheapFirst = true; changes.push('lowest prices first'); changed = true; }
  const negated = (word: RegExp) => new RegExp(`\\b(no|without|non|remove|venda|vendam|illama)[- ]+(?:${word.source})`).test(t);
  if (negated(/ac|a\/c|air[- ]?con\w*/)) { delete next.hasAC; changes.push('AC not required'); changed = true; }
  else if (ex.criteria.hasAC) { next.hasAC = true; changes.push('AC'); changed = true; }
  if (negated(/rooms?|guest rooms?/)) { delete next.hasRooms; changes.push('rooms not required'); changed = true; }
  else if (ex.criteria.hasRooms) { next.hasRooms = true; changes.push('guest rooms'); changed = true; }
  if (negated(/dining|dining hall/)) { delete next.hasDining; changes.push('dining not required'); changed = true; }
  else if (ex.criteria.hasDining) { next.hasDining = true; changes.push('dining hall'); changed = true; }
  if (negated(/parking|valet/)) { next.preferences = next.preferences.filter((p) => p !== 'Valet Parking'); changes.push('parking removed'); changed = true; }
  else for (const p of ex.criteria.preferences) if (!next.preferences.includes(p)) { next.preferences.push(p); changes.push(p); changed = true; }
  if (/\b(any area|all areas|other areas|whole city|anywhere in)\b/.test(t) && next.area) { delete next.area; changes.push('any area'); changed = true; }

  if (!changed && !issues.some((i) => i.blocking)) {
    issues.push({ code: 'not_understood', message: 'I could not tell what to change. Try "only AC", "cheaper", "what about the 14th", "1000 guests" or a new date.', blocking: true });
  }
  if (changed) issues.unshift({ code: 'refined', message: `Updated: ${changes.join(', ')}.` });
  if (!next.dates && !issues.some((i) => i.code === 'no_date')) issues.push({ code: 'no_date', message: 'No date given, so availability was not checked.' });
  return { criteria: next, issues, recognised: [] };
}

/* ------------------------------------------------------------------ search + verification */

const PAGE_MAX = 60;
/** Most matches ranked per search (popularity order beyond this). Enough for every city in the catalogue. */
const RANK_MAX = 500;

export type AiAvailability =
  | { verified: true; date: string; dates: string[]; freeDates: string[]; match: DateMatch; checkedAgainst: ['availability', 'bookings'] }
  | { verified: false; reason: string };

export type AiHall = Record<string, any> & {
  id: string;
  ai: {
    availability: AiAvailability;
    preferences: { asked: string[]; confirmed: string[]; notListed: string[] };
    /** 0–1, only meaningful relative to the other results of the same search. */
    score: number;
    /** Factual reasons from the hall's own data ("Seats 1,000 for your 800+ guests"). */
    reasons: string[];
    bestMatch?: true;
  };
};

export type Alternative = { code: 'budget' | 'capacity' | 'area' | 'requirements' | 'dates'; label: string; criteria: Criteria; total: number };

export type AiSearchResult = {
  engine: 'rules';
  query: string;
  criteria: Criteria;
  issues: Issue[];
  /** Short human-readable lines about what was understood. */
  understood: { key: string; label: string; value: string }[];
  searched: boolean;
  total: number;
  halls: AiHall[];
  notes: string[];
  /** Only when nothing matches: real, counted searches with one criterion relaxed. */
  alternatives: Alternative[];
};

function describe(c: Criteria): AiSearchResult['understood'] {
  const out: AiSearchResult['understood'] = [];
  if (c.city) out.push({ key: 'city', label: 'City', value: c.city });
  if (c.area) out.push({ key: 'area', label: 'Area', value: c.area });
  if (c.dates?.length === 1) out.push({ key: 'date', label: 'Date', value: c.dates[0] });
  else if (c.dates?.length) out.push({ key: 'dates', label: 'Dates', value: `${c.match === 'all' ? 'all of' : 'any of'}: ${c.dates.join(', ')}` });
  if (c.minCapacity != null) out.push({ key: 'guests', label: 'Guests', value: `${c.minCapacity.toLocaleString('en-IN')}+ seats` });
  if (c.maxPrice != null) out.push({ key: 'budget', label: 'Budget', value: `up to ${inr(c.maxPrice)} per day` });
  if (c.minPrice != null) out.push({ key: 'minbudget', label: 'Price', value: `from ${inr(c.minPrice)} per day` });
  if (c.cheapFirst) out.push({ key: 'cheap', label: 'Sort', value: 'lowest price first' });
  if (c.hasAC) out.push({ key: 'ac', label: 'Air conditioned', value: 'required' });
  if (c.hasRooms) out.push({ key: 'rooms', label: 'Guest rooms', value: 'required' });
  if (c.hasDining) out.push({ key: 'dining', label: 'Dining hall', value: 'required' });
  for (const p of c.preferences) out.push({ key: 'pref:' + p, label: p, value: 'preferred' });
  return out;
}

function toParams(c: Criteria): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (c.city) p.city = c.city;
  if (c.area) p.area = c.area;
  if (c.minCapacity != null) p.minCapacity = c.minCapacity;
  if (c.maxPrice != null) p.maxPrice = c.maxPrice;
  if (c.minPrice != null) p.minPrice = c.minPrice;
  if (c.hasAC) p.hasAC = 'true';
  if (c.hasRooms) p.hasRooms = 'true';
  if (c.hasDining) p.hasDining = 'true';
  if (c.dates?.length) { p.dates = c.dates.join(','); p.match = c.match ?? 'all'; }
  return p;
}

/** Fit score + factual reasons. Higher is better; ties keep the popularity order. */
export function scoreHall(h: { price: number; capacity: number; amenities?: string[] }, c: Criteria, freeDates?: string[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (c.minCapacity != null && h.capacity > 0) {
    score += 0.35 * Math.min(1, c.minCapacity / h.capacity); // a hall close to the head-count fits better than a huge one
    reasons.push(`Seats ${h.capacity.toLocaleString('en-IN')} for your ${c.minCapacity.toLocaleString('en-IN')}+ guests`);
  }
  if (c.maxPrice != null && h.price > 0) {
    score += 0.25 * (1 - 0.5 * Math.min(1, h.price / c.maxPrice));
    reasons.push(`${inr(h.price)} per day — within your ${inr(c.maxPrice)} budget`);
  }
  if (c.preferences.length) {
    const ok = c.preferences.filter((p) => (h.amenities ?? []).includes(p));
    score += 0.25 * (ok.length / c.preferences.length);
    if (ok.length) reasons.push(`Lists ${ok.join(', ')}`);
  }
  if (c.dates?.length && freeDates) {
    score += 0.15 * (freeDates.length / c.dates.length);
    reasons.push(c.dates.length === 1 ? `Free on ${c.dates[0]}` : freeDates.length === c.dates.length ? `Free on all ${c.dates.length} dates` : `Free on ${freeDates.length} of ${c.dates.length} dates`);
  }
  return { score: Math.round(score * 1000) / 1000, reasons };
}

export async function runAiSearch(
  prisma: PrismaClient,
  query: string,
  opts: { limit?: number; offset?: number; signedIn?: boolean; today?: string; criteria?: Partial<Criteria>; previous?: Partial<Criteria> } = {},
): Promise<AiSearchResult> {
  const today = opts.today ?? todayIST();
  const [filters, muh] = await Promise.all([
    loadFilterOptions(prisma),
    (prisma as any).muhurthamDate?.findMany ? (prisma as any).muhurthamDate.findMany({ select: { date: true } }) : Promise.resolve([]),
  ]);
  const catalogue: Catalogue = { ...filters, muhurtham: (muh as { date: Date }[]).map((r) => new Date(r.date).toISOString().slice(0, 10)) };

  const { criteria, issues } = opts.criteria
    ? validateCriteria(opts.criteria, catalogue, today)
    : opts.previous
      ? refineCriteria(opts.previous, query, catalogue, today)
      : extractCriteria(query, catalogue, today);
  const base: AiSearchResult = {
    engine: 'rules', query, criteria, issues, understood: describe(criteria), searched: false, total: 0, halls: [], notes: [], alternatives: [],
  };
  if (issues.some((i) => i.blocking)) return base; // never search around a problem we cannot resolve

  const built = buildHallWhere(toParams(criteria));
  if ('error' in built) return { ...base, issues: [...issues, { code: 'date_invalid', message: built.error, blocking: true }] };
  const where = built.where;
  const days = criteria.dates ?? [];

  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 24)), PAGE_MAX);
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const [total, rows] = await Promise.all([
    prisma.hall.count({ where }),
    prisma.hall.findMany({
      where,
      orderBy: [{ bookings: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'asc' }],
      take: RANK_MAX,
    }),
  ]);

  // Final, explicit verification against BOTH sources for the requested days (the query already filtered;
  // this re-check guards against anything that changed in between).
  const free = days.length ? await freeDaysFor(prisma, rows.map((h) => h.id), days) : null;
  const match: DateMatch = criteria.match ?? 'all';
  let verified = rows;
  if (free) verified = rows.filter((h) => { const f = free.get(h.id) ?? []; return match === 'all' ? f.length === days.length : f.length > 0; });

  const asked = criteria.preferences;
  const scored = verified.map((h, i) => {
    const freeDates = free?.get(h.id);
    const { score, reasons } = scoreHall(h, criteria, freeDates);
    return { h, i, freeDates, score, reasons };
  });
  scored.sort((a, b) =>
    criteria.cheapFirst ? a.h.price - b.h.price || b.score - a.score || a.i - b.i : b.score - a.score || a.i - b.i);
  const ranked = scored.some((s) => s.score > 0) || criteria.cheapFirst;

  const page = scored.slice(offset, offset + limit);
  const out: AiHall[] = page.map(({ h, freeDates, score, reasons }, idx) => {
    const confirmed = asked.filter((p) => (h.amenities ?? []).includes(p));
    return {
      ...withContact(h, !!opts.signedIn),
      ai: {
        availability: free
          ? { verified: true as const, date: (freeDates ?? days)[0], dates: days, freeDates: freeDates ?? [], match, checkedAgainst: ['availability', 'bookings'] as ['availability', 'bookings'] }
          : { verified: false as const, reason: 'No date was given, so availability was not checked.' },
        preferences: { asked, confirmed, notListed: asked.filter((p) => !confirmed.includes(p)) },
        score,
        reasons,
        ...(ranked && offset === 0 && idx === 0 && scored.length > 1 ? { bestMatch: true as const } : {}),
      },
    };
  });

  const notes: string[] = [];
  if (asked.length) {
    const anyConfirmed = out.some((h) => h.ai.preferences.confirmed.length > 0);
    if (!anyConfirmed) notes.push(`None of these halls list ${asked.join(' / ')} in their details, so it cannot be confirmed — please ask the hall directly.`);
    else notes.push(`${asked.join(' / ')} is shown only where the hall lists it; for the others it is not listed (not the same as unavailable).`);
  }
  const shownTotal = Math.max(total - (rows.length - verified.length), 0);
  let alternatives: Alternative[] = [];
  if (shownTotal === 0) {
    notes.push(noMatchHint(criteria));
    alternatives = await suggestAlternatives(prisma, criteria, catalogue, today);
  }
  return { ...base, searched: true, total: shownTotal, halls: out, notes, alternatives };
}

/** Real alternatives: each is the same search with ONE thing relaxed, counted against the database. */
export async function suggestAlternatives(prisma: PrismaClient, c: Criteria, cat: Catalogue, today: string): Promise<Alternative[]> {
  const candidates: Omit<Alternative, 'total'>[] = [];
  if (c.maxPrice != null) {
    const maxPrice = roundTo(c.maxPrice * 1.25, 5000);
    candidates.push({ code: 'budget', label: `Raise the budget to ${inr(maxPrice)} per day`, criteria: { ...c, maxPrice } });
  }
  if (c.minCapacity != null && c.minCapacity >= 100) {
    const minCapacity = roundTo(c.minCapacity * 0.8, 50);
    candidates.push({ code: 'capacity', label: `Halls seating ${minCapacity.toLocaleString('en-IN')}+ guests`, criteria: { ...c, minCapacity } });
  }
  if (c.area) {
    const { area: _drop, ...rest } = c;
    candidates.push({ code: 'area', label: `Any area in ${c.city}`, criteria: { ...rest, preferences: [...c.preferences] } });
  }
  if (c.hasAC || c.hasRooms || c.hasDining) {
    const { hasAC: _a, hasRooms: _r, hasDining: _d, ...rest } = c;
    candidates.push({ code: 'requirements', label: 'Without the AC / rooms / dining requirement', criteria: { ...rest, preferences: [...c.preferences] } });
  }
  if (c.dates?.length) {
    // nearby muhurtham days (within 3 weeks of the first requested date), else the days right next to it
    const first = c.dates[0];
    const near = (cat.muhurtham ?? [])
      .filter((d) => d >= today && !c.dates!.includes(d) && Math.abs(Date.parse(d) - Date.parse(first)) <= 21 * 86400000)
      .slice(0, 4);
    const dates = near.length ? near : [addDays(first, -1), addDays(first, 1), addDays(first, 2)].filter((d) => d >= today && !c.dates!.includes(d));
    if (dates.length) {
      candidates.push({
        code: 'dates',
        label: near.length ? `Nearby muhurtham dates: ${dates.join(', ')}` : `Nearby dates: ${dates.join(', ')}`,
        criteria: { ...c, dates, date: dates.length === 1 ? dates[0] : undefined, match: 'any' },
      });
    }
  }
  const counted = await Promise.all(candidates.map(async (alt) => {
    const built = buildHallWhere(toParams(alt.criteria));
    if ('error' in built) return null;
    const total = await prisma.hall.count({ where: built.where });
    return total > 0 ? { ...alt, criteria: JSON.parse(JSON.stringify(alt.criteria)) as Criteria, total } : null;
  }));
  return counted.filter((a): a is Alternative => a !== null);
}

function noMatchHint(c: Criteria): string {
  const parts: string[] = [];
  if (c.city) parts.push(`in ${c.city}`);
  if (c.area) parts.push(`in ${c.area}`);
  if (c.minCapacity != null) parts.push(`seating ${c.minCapacity}+`);
  if (c.maxPrice != null) parts.push(`up to ₹${c.maxPrice.toLocaleString('en-IN')} per day`);
  if (c.dates?.length === 1) parts.push(`free on ${c.dates[0]}`);
  else if (c.dates?.length) parts.push(`free on ${c.match === 'all' ? 'all of' : 'any of'} ${c.dates.join(', ')}`);
  if (c.hasAC) parts.push('air conditioned');
  if (c.hasRooms) parts.push('with guest rooms');
  if (c.hasDining) parts.push('with a dining hall');
  return `No listed hall matches all of: ${parts.join(', ')}. Try a different date, a higher budget, or fewer requirements.`;
}
