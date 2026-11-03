import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSessionUser, hallHref, type Hall, type SessionUser } from '../api/client';
import OtpAuthModal from './OtpAuthModal';
import HallPhoto from './HallPhoto';
import { venueCover } from '../lib/hallPhotos';
import { toastError, toastSuccess } from './Toast';
import { useT } from '../i18n';
import { formatCity } from '../i18n/cityNames';
import { fmtDay } from '../lib/dates';

type Props = {
  hall: Hall;
  date?: string;
  availability?: 'available' | 'booked' | null;
  /** Extra line under the location (e.g. whether a requested amenity is listed). */
  note?: string;
  /** Multi-date searches: the dates that were checked and the ones this hall is free on (from the API). */
  checkedDates?: string[];
  freeDates?: string[];
  /** Smart search: factual reasons this hall fits, and whether it ranked first. */
  reasons?: string[];
  bestMatch?: boolean;
};

// Exact amount (₹4,35,000), same as the detail page and the mobile app — an abbreviated "₹4.4L"
// rounds away up to ₹5,000 and made the card disagree with the page it links to.
function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function HallCard({ hall, date, availability = 'available', note, checkedDates, freeDates, reasons, bestMatch }: Props) {
  const { t, lang } = useT();
  const href = hallHref(hall);
  const multi = (checkedDates?.length ?? 0) > 1 ? { checked: checkedDates!, free: freeDates ?? [] } : null;
  const allFree = multi ? multi.free.length === multi.checked.length : false;
  const callHref = `tel:${hall.contactNumber}`;
  const waDigits = hall.contactNumber.replace(/^\+/, '').replace(/\D/g, '');
  const waMessage =
    `Hi, I saw "${hall.name}" on CheckNBook.` +
    (date ? ` Is it available on ${date}?` : ' Is it available?');
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}`;

  const isBooked = availability === 'booked';
  const nav = useNavigate();

  async function shareHall() {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: hall.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toastSuccess('Link copied', url);
      }
    } catch (e) {
      // Closing the native share sheet rejects with AbortError — not an error.
      if ((e as Error).name !== 'AbortError') toastError('Could not share', 'Copy the link from the address bar instead.');
    }
  }

  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const [otpOpen, setOtpOpen] = useState(false);
  useEffect(() => {
    const sync = () => setUser(getSessionUser());
    window.addEventListener('cnb:auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cnb:auth-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const isVerified = !!user;
  function gate(e: React.MouseEvent, then?: () => void) {
    if (isVerified) { then?.(); return; }
    e.preventDefault();
    e.stopPropagation();
    setOtpOpen(true);
  }

  return (
    <article className="group bg-white rounded-2xl shadow-soft overflow-hidden ring-1 ring-gold/25 flex flex-col transition-all hover:-translate-y-1 hover:shadow-soft-lg">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Link to={href} aria-label={hall.name}>
          <HallPhoto
            src={venueCover(hall)}
            venueOnly
            showcase
            alt={hall.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </Link>

        {/* Availability chip — several dates: how many of them this hall is free on */}
        {multi && (
          <div
            className={`absolute top-4 left-4 text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md shadow-lg flex items-center gap-2 ${
              allFree ? 'bg-green-600 ring-2 ring-green-300/60' : 'bg-amber-600'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden>{allFree ? 'event_available' : 'event_upcoming'}</span>
            {allFree
              ? t('free_all_n', { vars: { n: multi.checked.length } })
              : t('free_k_of_n', { vars: { k: multi.free.length, n: multi.checked.length } })}
          </div>
        )}
        {bestMatch && (
          <div className={`absolute ${availability || multi ? 'top-14' : 'top-4'} left-4 bg-gold text-on-surface text-xs font-bold px-3 py-1.5 rounded-md shadow-lg flex items-center gap-1.5`}>
            <span className="material-symbols-outlined text-[16px] filled" aria-hidden>workspace_premium</span>
            {t('smart_best_match')}
          </div>
        )}
        {!multi && availability && (
          <div
            className={`absolute top-4 left-4 text-white text-sm font-bold uppercase tracking-wider px-3 py-1.5 rounded-md shadow-lg flex items-center gap-2 ${
              isBooked
                ? 'bg-red-600'
                : 'bg-green-600 ring-2 ring-green-300/60 cnb-badge-blink'
            }`}
          >
            {isBooked ? (
              <>
                <span className="w-2.5 h-2.5 bg-white rounded-full" /> {t('fully_booked')}
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 bg-white rounded-full cnb-dot-pulse" /> {t('available')}
              </>
            )}
          </div>
        )}

        {/* Hover quick actions */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={isVerified ? `WhatsApp ${hall.name}` : `Verify mobile to WhatsApp ${hall.name}`}
            className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-green-600 shadow-lg hover:scale-110 transition-transform"
            onClick={(e) => gate(e, () => e.stopPropagation())}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isVerified ? 'chat' : 'lock'}
            </span>
          </a>
          <a
            href={callHref}
            aria-label={isVerified ? `Call ${hall.name}` : `Verify mobile to call ${hall.name}`}
            className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-blue-600 shadow-lg hover:scale-110 transition-transform"
            onClick={(e) => gate(e, () => e.stopPropagation())}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isVerified ? 'call' : 'lock'}
            </span>
          </a>
          <button
            type="button"
            aria-label="Share"
            className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-slate-700 shadow-lg hover:scale-110 transition-transform"
            onClick={(e) => { e.preventDefault(); void shareHall(); }}
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-3 mb-2">
          <h3 className="font-serif text-xl font-semibold text-on-surface leading-tight">
            <Link to={href} className="hover:text-primary transition-colors">
              {hall.name}
            </Link>
          </h3>
          <span className="text-primary font-bold text-lg whitespace-nowrap">
            {formatINR(hall.price)} <span className="text-xs text-slate-400 font-normal">{t('per_day')}</span>
          </span>
        </div>

        <div className="flex items-center gap-1 text-slate-500 text-sm mb-4">
          <span className="material-symbols-outlined text-sm">location_on</span>
          {hall.area ? `${hall.area}, ${formatCity(hall.city, lang)}` : formatCity(hall.city, lang)}
        </div>
        {note && <p className="text-xs text-on-surface-variant -mt-2 mb-4">{note}</p>}
        {multi && (
          <div className="-mt-2 mb-4 text-xs space-y-0.5">
            {multi.free.length > 0 && (
              <p className="text-green-700 font-semibold">
                {t('free_dates_list', { vars: { list: multi.free.map((d) => fmtDay(d, lang, false)).join(', ') } })}
              </p>
            )}
            {multi.free.length < multi.checked.length && (
              <p className="text-red-700">
                {t('booked_dates_list', { vars: { list: multi.checked.filter((d) => !multi.free.includes(d)).map((d) => fmtDay(d, lang, false)).join(', ') } })}
              </p>
            )}
          </div>
        )}
        {reasons && reasons.length > 0 && (
          <ul className="-mt-2 mb-4 space-y-1" aria-label={String(t('smart_why', { inline: true }))}>
            {reasons.map((r) => (
              <li key={r} className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-[15px] text-green-700 mt-px" aria-hidden>check</span>
                {r}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-4 mb-6">
          {hall.capacity > 0 && (
            <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
              <span className="material-symbols-outlined text-lg text-secondary-fixed-dim">groups</span>
              {t('seats', { vars: { n: hall.capacity.toLocaleString('en-IN') } })}
            </div>
          )}
          {hall.hasAC && (
            <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
              <span className="material-symbols-outlined text-lg text-secondary-fixed-dim">ac_unit</span>
              {t('full_ac')}
            </div>
          )}
          {hall.hasRooms && (
            <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
              <span className="material-symbols-outlined text-lg text-secondary-fixed-dim">bed</span>
              {t('rooms_short')}
            </div>
          )}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3">
          <Link
            to={href}
            className="py-3 sm:py-2.5 text-xs font-bold tracking-widest border border-gold/50 text-primary hover:bg-gold/10 transition-colors rounded-lg text-center"
          >
            {t('view_details')}
          </Link>
          <button
            type="button"
            disabled={isBooked}
            onClick={() => {
              if (!isBooked) nav(href);
            }}
            className={`py-3 sm:py-2.5 text-xs font-bold tracking-widest rounded-lg transition-all ${
              isBooked
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-primary text-white shadow-md active:scale-95 hover:bg-primary-container'
            }`}
          >
            {t('check_dates')}
          </button>
        </div>
      </div>

      <OtpAuthModal
        open={otpOpen}
        onClose={() => setOtpOpen(false)}
        hallName={hall.name}
      />
    </article>
  );
}
