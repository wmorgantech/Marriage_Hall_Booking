import type { Hall } from '../api/client';

/**
 * Customer-facing hall photo curation.
 *
 * The demo catalogue reuses a handful of stock photos and several of them are not marriage-hall photos at
 * all (handshake, toast, couple portraits, ring close-ups, wedding signage), plus at least one dead link.
 * Hall records are NOT changed — the customer UI simply refuses to present those images as a hall cover and
 * shows the CheckNBook-branded fallback instead. Admin screens still show the stored photo so it can be fixed.
 *
 * Photos are identified by file id (the URL without its query string). Reviewed by eye on 2026-10-24.
 * None of the "venue" photos is South Indian wedding photography; they are generic banquet/reception spaces.
 */
export const UNSUITABLE_PHOTOS = [
  'photo-1521791136064-7986c2920216', // handshake
  'photo-1519671482749-fd09be7ccebf', // drinks / toast
  'photo-1519741497674-611481863552', // couple portrait (dark)
  'photo-1465495976277-4387d4b0b4c6', // hands / rings close-up
  'photo-1509610973147-232dfea52a97', // couple with a van
  'photo-1520854221256-17451cc331bf', // hands in a field
  'photo-1507504031003-b417219a0fde', // "Mr & Mrs" signage
  'photo-1503002032858-29dc0155f38f', // dead link (HTTP 404)
] as const;

/** Best venue/reception photos in the current catalogue — used first when the hero needs photos. */
export const PREFERRED_VENUE_PHOTOS = [
  'photo-1519167758481-83f550bb49b3', // chandeliered banquet ballroom
  'photo-1464366400600-7168b8af9bc3', // decorated banquet hall
  'photo-1530023367847-a683933f4172', // long reception table
  'photo-1519225421980-715cb0215aed', // flower-dressed banquet tables
  'photo-1511795409834-ef04bbd61622', // reception table setting
] as const;

export const photoKey = (url?: string | null) => (url ?? '').split('?')[0].split('/').pop() ?? '';

export const isVenuePhoto = (url?: string | null): url is string =>
  !!url && !(UNSUITABLE_PHOTOS as readonly string[]).includes(photoKey(url));

/**
 * The hall's own best customer-facing photo: its cover, else the first suitable gallery photo.
 * Returns null when the hall has no suitable photo (the UI then shows the branded fallback).
 */
export function venueCover(hall: Pick<Hall, 'imageUrl' | 'imageUrls'>): string | null {
  return [hall.imageUrl, ...(hall.imageUrls ?? [])].find(isVenuePhoto) ?? null;
}

/** Suitable photos only, cover first. */
export function venueGallery(hall: Pick<Hall, 'imageUrl' | 'imageUrls'>): string[] {
  const all = hall.imageUrls?.length ? hall.imageUrls : hall.imageUrl ? [hall.imageUrl] : [];
  return all.filter(isVenuePhoto);
}

/** Resolves true only if the image really loads (so the hero never shows a broken-image glyph). */
export function imageLoads(url: string, timeoutMs = 7000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(true); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = url;
  });
}
