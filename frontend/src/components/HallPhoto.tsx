import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { isVenuePhoto } from '../lib/hallPhotos';
import { useT } from '../i18n';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  /** Tailwind size class for the fallback icon, e.g. "text-5xl". */
  iconClass?: string;
  /**
   * Customer-facing use: refuse photos known not to show a marriage hall (see lib/hallPhotos) and show the
   * branded fallback instead. Leave off in admin screens so the stored photo can still be seen and fixed.
   */
  venueOnly?: boolean;
  /** Large placements (cards, hall page): draw the gold arch frame and a "Photos coming soon" caption in the fallback. */
  showcase?: boolean;
};

// Deep-green panel with a faint gold kolam-dot pattern and a thin gold inner frame. The fallback keeps the
// caller's sizing classes, so swapping photo <-> fallback never shifts the layout.
const FALLBACK_STYLE = {
  backgroundImage:
    'radial-gradient(rgba(198,154,69,0.28) 1px, transparent 1px), linear-gradient(135deg, #0B4D38 0%, #064E3B 55%, #03301F 100%)',
  backgroundSize: '18px 18px, auto',
  boxShadow: 'inset 0 0 0 1px rgba(198,154,69,0.35)',
} as const;

/**
 * A hall photo that degrades to the CheckNBook-branded tile when the URL is missing, unsuitable (venueOnly) OR
 * fails to load (a dead/mistyped image URL must never show a broken-image glyph on a listing).
 */
export default function HallPhoto({ src, iconClass = 'text-5xl', className = '', venueOnly = false, showcase = false, ...rest }: Props) {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed || (venueOnly && !isVenuePhoto(src))) {
    return (
      <div
        role="img"
        aria-label="No photo available"
        style={FALLBACK_STYLE}
        className={`${className} flex flex-col items-center justify-center gap-3 text-gold`}
      >
        {showcase ? (
          <>
            <span className="h-[52%] aspect-[3/4] max-h-56 rounded-t-full border border-gold/55 bg-black/10 flex items-center justify-center">
              <span aria-hidden className="material-symbols-outlined filled opacity-90 text-[44px]">temple_hindu</span>
            </span>
            <span className="font-serif text-xs sm:text-sm tracking-[0.18em] uppercase text-gold/85 px-3 text-center">{t('photo_soon')}</span>
          </>
        ) : (
          <span aria-hidden className={`material-symbols-outlined filled opacity-90 ${iconClass}`}>temple_hindu</span>
        )}
      </div>
    );
  }
  return <img src={src} className={className} onError={() => setFailed(true)} {...rest} />;
}
