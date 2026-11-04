// Auspicious (muhurtham) wedding dates — STATIC, UNVERIFIED PLACEHOLDER LIST, a copy of
// the website's list. 47 of these 48 dates fall on a Thursday, so it was generated, not
// taken from a panchangam; it also ends 2027-05-20. Replace with data from a real
// panchangam source (ideally served by the API so web + mobile share one copy) before
// relying on the gold markers in production.
// Format: ISO YYYY-MM-DD.

export const MUHURTHAM_DATES_2026: string[] = [
  '2026-01-22',
  '2026-01-29',
  '2026-02-05',
  '2026-02-15',
  '2026-02-19',
  '2026-02-26',
  '2026-03-05',
  '2026-03-12',
  '2026-04-16',
  '2026-04-23',
  '2026-04-30',
  '2026-05-07',
  '2026-05-14',
  '2026-05-21',
  '2026-05-28',
  '2026-06-04',
  '2026-06-11',
  '2026-06-18',
  '2026-06-25',
  '2026-07-02',
  '2026-08-20',
  '2026-08-27',
  '2026-09-03',
  '2026-09-10',
  '2026-09-17',
  '2026-09-24',
  '2026-10-15',
  '2026-10-22',
  '2026-11-05',
  '2026-11-12',
  '2026-11-19',
  '2026-11-26',
  '2026-12-03',
  '2026-12-10',
  '2026-12-17',
];

export const MUHURTHAM_DATES_2027: string[] = [
  '2027-01-21',
  '2027-01-28',
  '2027-02-04',
  '2027-02-11',
  '2027-02-18',
  '2027-02-25',
  '2027-03-04',
  '2027-04-15',
  '2027-04-22',
  '2027-04-29',
  '2027-05-06',
  '2027-05-13',
  '2027-05-20',
];

export const MUHURTHAM_DATES: string[] = [...MUHURTHAM_DATES_2026, ...MUHURTHAM_DATES_2027];

const MUHURTHAM_DATE_SET = new Set(MUHURTHAM_DATES);

export function isMuhurtham(dateIso: string): boolean {
  return MUHURTHAM_DATE_SET.has(dateIso);
}
