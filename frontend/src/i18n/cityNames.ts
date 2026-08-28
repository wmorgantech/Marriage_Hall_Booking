// Tamil display names for the cities served by CheckNBook.
// The DB still stores English city names — this is render-only.
import type { Lang } from './index';

export const CITY_TA: Record<string, string> = {
  Chennai:          'சென்னை',
  Coimbatore:       'கோயம்புத்தூர்',  // Kovai
  Madurai:          'மதுரை',
  Tiruchirappalli:  'திருச்சிராப்பள்ளி', // Trichy
  Salem:            'சேலம்',
  Tirunelveli:      'திருநெல்வேலி',     // Nellai
  Erode:            'ஈரோடு',
  Vellore:          'வேலூர்',
  Thanjavur:        'தஞ்சாவூர்',       // Thanjai
  Dindigul:         'திண்டுக்கல்',
};

/**
 * Render a city name for display.
 *  en   → "Coimbatore"
 *  ta   → "கோயம்புத்தூர்"
 *  both → "Coimbatore (கோயம்புத்தூர்)"
 *
 * If the city is not in the dictionary (e.g. a custom area name that
 * happens to flow through this), it falls back to the original string.
 */
export function formatCity(name: string | undefined | null, lang: Lang): string {
  if (!name) return '';
  const ta = CITY_TA[name];
  if (!ta) return name;
  if (lang === 'en') return name;
  if (lang === 'ta') return ta;
  return `${name} (${ta})`;
}
