import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

type Booking = Awaited<ReturnType<typeof api.adminRecentBookings>>[number];

// A booking still PENDING (not confirmed by the venue) after 48h is "overdue".
const STALE_MS = 2 * 24 * 60 * 60 * 1000; // 48h
const isOverdue = (b: Pick<Booking, 'status' | 'createdAt'>) =>
  b.status === 'PENDING' && Date.now() - new Date(b.createdAt).getTime() > STALE_MS;
const POLL_MS = 30_000;
const ROTATE_MS = 4_000;

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function bookingDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function RecentBookingsBanner() {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const lastSeenRef = useRef<string | null>(null);

  // Initial fetch + polling
  useEffect(() => {
    let cancelled = false;
    function load() {
      api.adminRecentBookings(8).then((rows) => {
        if (cancelled) return;
        setItems(rows);
        // Detect new arrivals to trigger a brighter pulse
        const newest = rows[0]?.id ?? null;
        if (lastSeenRef.current && newest && newest !== lastSeenRef.current) {
          setActive(0); // jump back to the new top entry
        }
        lastSeenRef.current = newest;
      }).catch(() => { /* silent — banner is best-effort */ });
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Auto-rotate the spotlight item
  useEffect(() => {
    if (!items || items.length <= 1 || paused) return;
    const t = setInterval(() => setActive((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [items, paused]);

  if (!items || items.length === 0) return null;
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold uppercase tracking-widest shadow-2xl ring-1 ring-white/10 hover:bg-slate-800"
      >
        <span className="w-2 h-2 bg-green-400 rounded-full cnb-dot-pulse" />
        Live bookings
      </button>
    );
  }

  const current = items[active];
  const isStale = isOverdue(current);
  const staleCount = items.filter(isOverdue).length;
  const statusLabel = isStale
    ? 'Overdue Booking'
    : current.status === 'CONFIRMED' ? 'Confirmed Booking'
    : current.status === 'CANCELLED' ? 'Cancelled Booking'
    : 'New Booking';

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`relative overflow-hidden rounded-2xl shadow-md mb-6 transition-colors ${
        isStale
          ? 'bg-gradient-to-r from-red-700 via-red-600 to-rose-700 text-white cnb-banner-blink-red'
          : 'bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white cnb-banner-blink-green'
      }`}
    >
      <div className="px-4 md:px-6 py-3 md:py-3.5 flex flex-wrap items-center gap-3 md:gap-4">
        {/* Pulsing icon */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isStale ? 'bg-rose-300' : 'bg-emerald-300'
            }`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${
              isStale ? 'bg-white' : 'bg-white'
            }`} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.25em]">
            {statusLabel}
          </span>
        </div>

        {/* Spotlight booking */}
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            to={`/halls/${current.hall.id}`}
            className="text-base md:text-lg font-bold font-serif truncate hover:underline"
            title={current.hall.name}
          >
            {current.hall.name}
          </Link>
          <span className="text-xs md:text-sm text-white/80 truncate">
            {current.hall.area ? `${current.hall.area}, ` : ''}{current.hall.city || '—'}
          </span>
          <span className="text-xs md:text-sm font-semibold tabular-nums">
            · {current.customerName} · for {bookingDateLabel(current.date)}
          </span>
          <span className="text-[11px] uppercase tracking-widest font-bold opacity-90">
            · booked {timeAgo(current.createdAt)}
          </span>
          {!current.hall.isApproved && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-300/90 text-amber-900 px-2 py-0.5 rounded-full">
              Hall pending
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-1 rounded-full ring-1 ring-white/20">
            {items.length} latest
          </span>
          {staleCount > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-white text-red-700 px-2 py-1 rounded-full">
              {staleCount} overdue
            </span>
          )}
        </div>

        {/* Pagination dots */}
        <div className="flex items-center gap-1.5 shrink-0">
          {items.slice(0, 6).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show booking ${i + 1}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Collapse banner"
          onClick={() => setCollapsed(true)}
          className="shrink-0 p-1 rounded-full hover:bg-white/15 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Progress bar to show rotation timing */}
      {!paused && items.length > 1 && (
        <div
          key={active}
          className="absolute left-0 bottom-0 h-0.5 bg-white/70"
          style={{ animation: `cnb-banner-progress ${ROTATE_MS}ms linear` }}
        />
      )}
    </div>
  );
}
