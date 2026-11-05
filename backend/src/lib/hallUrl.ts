/**
 * Readable hall URLs:  /halls/<hall-name>-<area>/<city>   e.g. /halls/kongu-palace-chromepet/chennai
 *
 * The path is derived from the hall's own name, area and city — there is no extra database column, so no
 * migration. Uniqueness is guaranteed here: when two halls in the same city would get the same slug, the
 * oldest keeps the plain slug and the others get "-2", "-3" … (ordered by createdAt, then id, so the result is
 * stable). Halls with no usable name or city keep the id URL (/halls/<id>), and ID URLs always keep working.
 *
 * Limitation (no stored slug): renaming a hall changes its URL. The old ID link still works.
 */
import type { PrismaClient } from '@prisma/client';

type UrlHall = { id: string; name: string; area: string | null; city: string | null; createdAt: Date };

/** "Sri Lakshmi Mahal (A/C)" -> "sri-lakshmi-mahal-a-c". Latin letters and digits only. */
export function slugify(s: string): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Hall name + area, without repeating the area when the name already contains it. */
export function baseSlug(name: string, area?: string | null): string {
  const n = slugify(name);
  const a = slugify(area ?? '');
  if (!a || (`-${n}-`).includes(`-${a}-`)) return n;
  return n ? `${n}-${a}` : '';
}

/** Assigns a unique path to every hall. Pure — the input order does not matter. */
export function buildPaths(halls: UrlHall[]): Map<string, string> {
  const paths = new Map<string, string>();
  const sorted = [...halls].sort(
    (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime() || x.id.localeCompare(y.id),
  );
  const taken = new Set<string>();
  for (const h of sorted) {
    const city = slugify(h.city ?? '');
    const base = baseSlug(h.name, h.area);
    if (!city || !base) { paths.set(h.id, `/halls/${encodeURIComponent(h.id)}`); continue; }
    let slug = base;
    for (let n = 2; taken.has(`${city}/${slug}`); n++) slug = `${base}-${n}`;
    taken.add(`${city}/${slug}`);
    paths.set(h.id, `/halls/${slug}/${city}`);
  }
  return paths;
}

/* ---- cached index (all halls, so URLs never change because of approval status) ---- */

const TTL_MS = 30_000;
let cache: { at: number; byId: Map<string, string>; byPath: Map<string, string> } | null = null;

/** Call after a hall is created, renamed, moved or deleted. */
export function invalidateHallPaths() { cache = null; }

async function index(prisma: Pick<PrismaClient, 'hall'>) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const rows = await prisma.hall.findMany({ select: { id: true, name: true, area: true, city: true, createdAt: true } });
  const byId = buildPaths(rows);
  const byPath = new Map<string, string>();
  for (const [id, p] of byId) byPath.set(p, id);
  cache = { at: Date.now(), byId, byPath };
  return cache;
}

/** Adds `path` to each hall (falls back to the id URL for a hall the index has not seen yet). */
export async function withPaths<T extends { id: string }>(prisma: Pick<PrismaClient, 'hall'>, halls: T[]): Promise<(T & { path: string })[]> {
  const { byId } = await index(prisma);
  return halls.map((h) => ({ ...h, path: byId.get(h.id) ?? `/halls/${encodeURIComponent(h.id)}` }));
}

/** "/halls/<slug>/<city>" -> hall id, or null. */
export async function resolveHallPath(prisma: Pick<PrismaClient, 'hall'>, slug: string, city: string): Promise<string | null> {
  const { byPath } = await index(prisma);
  return byPath.get(`/halls/${slugify(slug)}/${slugify(city)}`) ?? null;
}
