import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessionUser, type Hall, type SessionUser } from '../api/client';
import OtpAuthModal from './OtpAuthModal';
import { useT } from '../i18n';
import { formatCity } from '../i18n/cityNames';

type Props = {
  hall: Hall;
  date?: string;
  availability?: 'available' | 'booked' | null;
};

function formatINR(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function HallCard({ hall, date, availability = 'available' }: Props) {
  const { t, lang } = useT();
  const callHref = `tel:${hall.contactNumber}`;
  const waDigits = hall.contactNumber.replace(/^\+/, '').replace(/\D/g, '');
  const waMessage =
    `Hi, I saw "${hall.name}" on CheckNBook.` +
    (date ? ` Is it available on ${date}?` : ' Is it available?');
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}`;

  const isBooked = availability === 'booked';

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
    <article className="group bg-white rounded-xl shadow-soft overflow-hidden border-t-2 border-gold/40 flex flex-col transition-all hover:-translate-y-1 hover:shadow-soft-lg">
      <div className="relative h-60 overflow-hidden">
        <Link to={`/halls/${hall.id}`} aria-label={hall.name}>
          {hall.imageUrl ? (
            <img
              src={hall.imageUrl}
              alt={hall.name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-gold/20 text-primary">
              <span className="material-symbols-outlined text-5xl">temple_hindu</span>
            </div>
          )}
        </Link>

        {/* Availability chip */}
        {availability && (
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
            onClick={(e) => e.preventDefault()}
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-3 mb-2">
          <h3 className="font-serif text-xl font-semibold text-on-surface leading-tight">
            <Link to={`/halls/${hall.id}`} className="hover:text-primary transition-colors">
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
            to={`/halls/${hall.id}`}
            className="py-2.5 text-xs font-bold tracking-widest border border-gold/50 text-primary hover:bg-gold/10 transition-colors rounded-lg text-center"
          >
            {t('view_details')}
          </Link>
          <button
            type="button"
            disabled={isBooked}
            onClick={() => {
              if (!isBooked) window.location.href = `/halls/${hall.id}`;
            }}
            className={`py-2.5 text-xs font-bold tracking-widest rounded-lg transition-all ${
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
