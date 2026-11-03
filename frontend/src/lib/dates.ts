import type { Lang } from '../i18n';

/** "2026-12-12" -> "12 Dec 2026" (or the Tamil month name). Non-ISO input is returned unchanged. */
export function fmtDay(iso: string, lang: Lang = 'en', withYear = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(lang === 'ta' ? 'ta-IN' : 'en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

/** Local calendar day -> "YYYY-MM-DD" (no timezone shift). */
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Accepts only real YYYY-MM-DD days (used for dates coming from the URL). */
export function isIsoDay(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(d) === s;
}
