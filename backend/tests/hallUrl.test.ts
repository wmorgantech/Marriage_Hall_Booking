import { describe, expect, it } from 'vitest';
import { baseSlug, buildPaths, resolveHallPath, slugify, withPaths, invalidateHallPaths } from '../src/lib/hallUrl';

const h = (id: string, name: string, area: string, city: string, created = '2026-01-01') =>
  ({ id, name, area, city, createdAt: new Date(created) });

describe('slugify / baseSlug', () => {
  it('makes lowercase, hyphenated Latin slugs', () => {
    expect(slugify('Kongu Palace')).toBe('kongu-palace');
    expect(slugify('  Sri Lakshmi Mahal (A/C) ')).toBe('sri-lakshmi-mahal-a-c');
    expect(slugify('R & S Hall')).toBe('r-and-s-hall');
    expect(slugify('Café Mahal')).toBe('cafe-mahal');
    expect(slugify('மண்டபம்')).toBe('');
  });
  it('appends the area unless the name already contains it', () => {
    expect(baseSlug('Kongu Palace', 'Chromepet')).toBe('kongu-palace-chromepet');
    expect(baseSlug('Adyar Grand Hall', 'Adyar')).toBe('adyar-grand-hall');
    expect(baseSlug('Kongu Palace', '')).toBe('kongu-palace');
  });
});

describe('buildPaths', () => {
  it('produces /halls/<name-area>/<city>', () => {
    expect(buildPaths([h('chennai-001', 'Kongu Palace', 'Chromepet', 'Chennai')]).get('chennai-001')).toBe('/halls/kongu-palace-chromepet/chennai');
  });
  it('keeps every path unique: the oldest hall keeps the plain slug, later ones get -2, -3', () => {
    const p = buildPaths([
      h('b', 'Kongu Palace', 'Chromepet', 'Chennai', '2026-03-01'),
      h('a', 'Kongu Palace', 'Chromepet', 'Chennai', '2026-01-01'),
      h('c', 'Kongu  Palace', 'chromepet', 'chennai', '2026-05-01'),
    ]);
    expect(p.get('a')).toBe('/halls/kongu-palace-chromepet/chennai');
    expect(p.get('b')).toBe('/halls/kongu-palace-chromepet-2/chennai');
    expect(p.get('c')).toBe('/halls/kongu-palace-chromepet-3/chennai');
  });
  it('a suffixed slug never collides with a hall whose real name ends in a number', () => {
    const p = buildPaths([
      h('a', 'Star Hall', 'Adyar', 'Chennai', '2026-01-01'),
      h('b', 'Star Hall Adyar 2', '', 'Chennai', '2026-01-02'),
      h('c', 'Star Hall', 'Adyar', 'Chennai', '2026-01-03'),
    ]);
    expect(new Set(p.values()).size).toBe(3);
    expect(p.get('c')).toBe('/halls/star-hall-adyar-3/chennai');
  });
  it('the same name in different cities does not need a suffix', () => {
    const p = buildPaths([h('a', 'Kongu Palace', 'Chromepet', 'Chennai'), h('b', 'Kongu Palace', 'Chromepet', 'Madurai')]);
    expect(p.get('b')).toBe('/halls/kongu-palace-chromepet/madurai');
  });
  it('falls back to the id URL when there is no usable name or city', () => {
    const p = buildPaths([h('x1', 'Murgan mahal', '', ''), h('x2', 'மண்டபம்', '', 'Chennai')]);
    expect(p.get('x1')).toBe('/halls/x1');
    expect(p.get('x2')).toBe('/halls/x2');
  });
  it('is independent of input order', () => {
    const rows = [h('a', 'A', 'X', 'C', '2026-01-01'), h('b', 'A', 'X', 'C', '2026-01-02'), h('c', 'A', 'X', 'C', '2026-01-02')];
    expect([...buildPaths(rows)].sort()).toEqual([...buildPaths([...rows].reverse())].sort());
  });
});

describe('withPaths / resolveHallPath (cached index)', () => {
  const prisma: any = { hall: { findMany: async () => [h('chennai-001', 'Kongu Palace', 'Chromepet', 'Chennai'), h('m1', 'Kongu Palace', 'Chromepet', 'Chennai', '2026-02-01')] } };
  it('adds path to halls and resolves both ways', async () => {
    invalidateHallPaths();
    const [a, b, unknown] = await withPaths(prisma, [{ id: 'chennai-001' }, { id: 'm1' }, { id: 'new-hall' }]);
    expect(a.path).toBe('/halls/kongu-palace-chromepet/chennai');
    expect(b.path).toBe('/halls/kongu-palace-chromepet-2/chennai');
    expect(unknown.path).toBe('/halls/new-hall');
    expect(await resolveHallPath(prisma, 'kongu-palace-chromepet', 'chennai')).toBe('chennai-001');
    expect(await resolveHallPath(prisma, 'Kongu-Palace-Chromepet', 'Chennai')).toBe('chennai-001');
    expect(await resolveHallPath(prisma, 'kongu-palace-chromepet-2', 'chennai')).toBe('m1');
    expect(await resolveHallPath(prisma, 'kongu-palace-chromepet', 'madurai')).toBeNull();
  });
});
