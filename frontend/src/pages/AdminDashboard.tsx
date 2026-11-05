import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  getSessionUser,
  setSessionUser,
  setToken,
  setRefreshToken,
  type Availability,
  type Hall,
  type ImportCommit,
  type ImportPreview,
  type ImportRowResult,
} from '../api/client';
import { DayPicker } from 'react-day-picker';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { loadMuhurthamDates, setMuhurthamDates, toLocalDate, useMuhurthamDates } from '../data/muhurthamDates';
import HallPhoto from '../components/HallPhoto';
import RecentBookingsBanner from '../components/RecentBookingsBanner';
import { toastError, toastSuccess } from '../components/Toast';

type Section = 'dashboard' | 'halls' | 'dates' | 'import' | 'admins' | 'areas' | 'owners' | 'users' | 'settings';
type HallTab = 'pending' | 'approved' | 'all';

type AdminHall = Hall & { owner?: { id: string; name: string; phone: string } };
type Owner = {
  id: string; name: string; phone: string; email: string | null;
  createdAt: string; _count: { halls: number };
};
type User = { id: string; name: string; phone: string; email: string | null; createdAt: string };
type Stats = Awaited<ReturnType<typeof api.adminStats>>;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`; // exact, never abbreviated/rounded
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const [me, setMe] = useState(() => getSessionUser());
  const [section, setSection] = useState<Section>('dashboard');
  const [error, setError] = useState<string | null>(null);

  // Gate
  useEffect(() => {
    if (!me) { nav('/admin/login'); return; }
    if (me.role !== 'ADMIN' && me.role !== 'SUPERADMIN') { nav('/'); return; }
  }, [me, nav]);

  function logout() {
    setToken(null);
    setRefreshToken(null);
    setSessionUser(null);
    setMe(null);
    window.dispatchEvent(new Event('cnb:auth-changed'));
    nav('/admin/login');
  }

  function handleApiError(e: unknown) {
    const msg = (e as Error).message ?? '';
    if (/401|403|Unauth|Forbid/i.test(msg)) { logout(); return; }
    setError(msg);
  }

  if (!me) return null;

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-[#06281D] text-slate-100 sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-white font-serif font-bold text-base">
              CB
            </span>
            <span className="text-lg font-bold font-serif tracking-tight text-white">
              check<span className="text-gold">N</span>book
            </span>
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold mt-2">
            Operator Console
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {(([
            ['dashboard', 'space_dashboard', 'Dashboard'],
            ['halls', 'temple_hindu', 'Halls'],
            ['dates', 'event_available', 'Dates'],
            ['import', 'upload_file', 'Bulk import'],
            ['areas', 'place', 'Areas'],
            ['owners', 'storefront', 'Hall owners'],
            ['users', 'group', 'Guest users'],
            ['admins', 'admin_panel_settings', 'Admins'],
            ['settings', 'tune', 'Settings'],
          ] as [Section, string, string][]).filter(([key]) => (key !== 'admins' && key !== 'import') || me.role === 'SUPERADMIN')).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setError(null); setSection(key); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                section === key
                  ? 'bg-white/10 text-white ring-1 ring-gold/40'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-full bg-gold/20 ring-1 ring-gold/40 flex items-center justify-center text-gold font-bold">
              {me.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{me.name}</p>
              <p className={`text-[10px] uppercase tracking-widest font-bold ${
                me.role === 'SUPERADMIN' ? 'text-gold' : 'text-slate-300'
              }`}>
                {me.role === 'SUPERADMIN' ? '★ Super Admin' : 'Admin'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-slate-200"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Top mobile nav */}
        <header className="md:hidden bg-[#06281D] text-white px-4 py-3 sticky top-0 z-20">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-lg font-bold font-serif tracking-tight">
              check<span className="text-gold">N</span>book
            </span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-gold">
              Operator
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-[11px] font-bold uppercase tracking-widest text-slate-300"
            >
              Sign out
            </button>
          </div>
          <select
            value={section}
            onChange={(e) => { setError(null); setSection(e.target.value as Section); }}
            className="w-full bg-white/10 text-white border-none rounded-lg px-3 py-2 text-sm font-semibold"
          >
            <option value="dashboard">Dashboard</option>
            <option value="halls">Halls</option>
            <option value="dates">Dates</option>
            {me.role === 'SUPERADMIN' && <option value="import">Bulk import</option>}
            <option value="areas">Areas</option>
            <option value="owners">Hall owners</option>
            <option value="users">Guest users</option>
            {me.role === 'SUPERADMIN' && <option value="admins">Admins</option>}
            <option value="settings">Settings</option>
          </select>
        </header>

        <div className="p-6 md:p-10 max-w-[1400px]">
          <RecentBookingsBanner />

          {error && (
            <div className="mb-6 px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg flex items-start gap-2">
              <span className="material-symbols-outlined text-base mt-0.5">error</span>
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-on-error-container/70 hover:text-on-error-container">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          )}

          {section === 'dashboard' && <Dashboard onError={handleApiError} onJump={setSection} />}
          {section === 'halls' && <HallsSection onError={handleApiError} role={me.role} />}
          {section === 'dates' && <DatesSection onError={handleApiError} />}
          {section === 'admins' && me.role === 'SUPERADMIN' && <AdminsSection onError={handleApiError} />}
          {section === 'import' && me.role === 'SUPERADMIN' && <ImportSection onError={handleApiError} />}
          {section === 'areas' && <AreasSection onError={handleApiError} role={me.role} />}
          {section === 'owners' && <OwnersSection onError={handleApiError} />}
          {section === 'users' && <UsersSection onError={handleApiError} />}
          {section === 'settings' && <SettingsSection onError={handleApiError} />}
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Dashboard ----------------------- */
function Dashboard({ onError, onJump }: { onError: (e: unknown) => void; onJump: (s: Section) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.adminStats().then(setStats).catch(onError);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const tones: Record<string, { bg: string; text: string }> = {
    amber:  { bg: 'bg-amber-100',  text: 'text-amber-800' },
    green:  { bg: 'bg-green-100',  text: 'text-green-800' },
    blue:   { bg: 'bg-blue-100',   text: 'text-blue-800' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
    slate:  { bg: 'bg-slate-200',  text: 'text-slate-700' },
    rose:   { bg: 'bg-rose-100',   text: 'text-rose-800' },
    gold:   { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  };

  const kpis = !stats ? [] : [
    { key: 'halls', label: 'Total halls', value: stats.totalHalls, icon: 'temple_hindu', tone: 'slate', jump: 'halls' as const },
    { key: 'active', label: 'Active', value: stats.approvedHalls, icon: 'verified', tone: 'green', jump: 'halls' as const },
    { key: 'inactive', label: 'Inactive', value: stats.pendingHalls, icon: 'pending_actions', tone: 'amber', jump: 'halls' as const },
    { key: 'cities', label: 'Cities', value: stats.totalCities, icon: 'location_city', tone: 'blue' },
    { key: 'areas', label: 'Areas', value: stats.totalAreas, icon: 'place', tone: 'gold', jump: 'areas' as const },
    { key: 'owners', label: 'Owners', value: stats.totalOwners, icon: 'storefront', tone: 'purple', jump: 'owners' as const },
    { key: 'users', label: 'Guest users', value: stats.totalUsers, icon: 'group', tone: 'rose', jump: 'users' as const },
    { key: 'bookings', label: 'Bookings', value: stats.totalBookings, icon: 'event_available', tone: 'green' },
    { key: 'pendingBookings', label: 'Awaiting confirmation', value: stats.pendingBookings, icon: 'pending_actions', tone: 'amber' },
    { key: 'blocked', label: 'Blocked dates', value: stats.totalBookedDates, icon: 'event_busy', tone: 'rose' },
  ];

  const activePct = stats && stats.totalHalls > 0 ? Math.round((stats.approvedHalls / stats.totalHalls) * 100) : 0;

  return (
    <section>
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Dashboard</h1>
          <p className="text-on-surface-variant mt-1">
            Snapshot of catalogue health, geography and booking activity.
          </p>
        </div>
        <Link
          to="/"
          className="px-4 py-2 rounded-full bg-white border border-gold/40 text-primary text-xs font-bold uppercase tracking-widest hover:bg-surface-container inline-flex items-center gap-1"
        >
          Open public site
          <span className="material-symbols-outlined text-base">north_east</span>
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        {!stats ? (
          Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white animate-pulse border border-gold/10" />
          ))
        ) : (
          kpis.map((c) => {
            const t = tones[c.tone];
            const Wrapper: any = c.jump ? 'button' : 'div';
            return (
              <Wrapper
                key={c.key}
                {...(c.jump ? { type: 'button', onClick: () => onJump(c.jump!) } : {})}
                className={`text-left rounded-2xl bg-white border border-gold/10 p-4 shadow-sm hover:shadow-md transition-all ${
                  c.jump ? 'hover:-translate-y-0.5 cursor-pointer' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-9 h-9 rounded-xl ${t.bg} flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined ${t.text} text-[20px]`}>{c.icon}</span>
                  </span>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant leading-tight break-words" title={c.label}>
                    {c.label}
                  </p>
                </div>
                <p className="text-2xl font-serif font-bold text-primary tabular-nums">
                  {c.value.toLocaleString('en-IN')}
                </p>
              </Wrapper>
            );
          })
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Active vs Inactive donut */}
        <div className="rounded-2xl bg-white border border-gold/10 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-serif text-lg text-primary font-bold">Listing health</h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Active vs Inactive
            </span>
          </div>
          {!stats ? (
            <div className="h-56 rounded-xl bg-slate-50 animate-pulse" />
          ) : (
            <div className="flex flex-col items-center">
              <DonutChart
                segments={[
                  { value: stats.approvedHalls, color: '#16a34a', label: 'Active' },
                  { value: stats.pendingHalls,  color: '#f59e0b', label: 'Inactive' },
                ]}
                centerLabel={`${activePct}%`}
                centerSubLabel="active"
              />
              <div className="mt-3 grid grid-cols-2 gap-3 w-full">
                <LegendDot color="#16a34a" label="Active" value={stats.approvedHalls} />
                <LegendDot color="#f59e0b" label="Inactive" value={stats.pendingHalls} />
              </div>
            </div>
          )}
        </div>

        {/* Halls per city */}
        <div className="rounded-2xl bg-white border border-gold/10 p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-primary font-bold">Halls by city</h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Top {stats?.hallsByCity.length ?? 10}
            </span>
          </div>
          {!stats ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-5 bg-slate-50 rounded-full animate-pulse" />)}
            </div>
          ) : stats.hallsByCity.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">No approved halls yet.</p>
          ) : (
            <HBar items={stats.hallsByCity.map((r) => ({ label: r.city, value: r.count }))} colorClass="bg-gradient-to-r from-primary to-primary-container" />
          )}
        </div>
      </div>

      {/* Bookings sparkline */}
      <div className="rounded-2xl bg-white border border-gold/10 p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-lg text-primary font-bold">Bookings, last 14 days</h2>
            <p className="text-[11px] text-on-surface-variant">
              {stats ? `${stats.bookingsByDay.reduce((s, b) => s + b.count, 0)} bookings created in this window` : ''}
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Daily activity
          </span>
        </div>
        {!stats ? (
          <div className="h-32 rounded-xl bg-slate-50 animate-pulse" />
        ) : (
          <Sparkline data={stats.bookingsByDay} />
        )}
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl bg-white border border-gold/10 p-6 shadow-sm">
        <h2 className="font-serif text-h3 text-primary mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onJump('halls')}
            className="px-4 py-2 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-container">
            Review pending halls
          </button>
          <button type="button" onClick={() => onJump('areas')}
            className="px-4 py-2 rounded-full bg-white border border-gold/40 text-primary text-xs font-bold uppercase tracking-widest hover:bg-surface-container">
            Manage areas
          </button>
          <button type="button" onClick={() => onJump('owners')}
            className="px-4 py-2 rounded-full bg-white border border-gold/40 text-primary text-xs font-bold uppercase tracking-widest hover:bg-surface-container">
            View owners
          </button>
          <button type="button" onClick={() => onJump('settings')}
            className="px-4 py-2 rounded-full bg-white border border-gold/40 text-primary text-xs font-bold uppercase tracking-widest hover:bg-surface-container">
            Customer-care settings
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Inline chart helpers (no chart library) ---------- */

function DonutChart({
  segments, centerLabel, centerSubLabel,
}: {
  segments: { value: number; color: string; label: string }[];
  centerLabel: string;
  centerSubLabel: string;
}) {
  const size = 180;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-44 h-44">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {segments.map((s, i) => {
        const dash = (s.value / total) * circumference;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += dash;
        return el;
      })}
      <text x="50%" y="50%" textAnchor="middle" dy="-2" fontSize="28" fontFamily="Noto Serif, serif" fontWeight="700" fill="#0B4D38">
        {centerLabel}
      </text>
      <text x="50%" y="50%" textAnchor="middle" dy="22" fontSize="10" fontFamily="Manrope, sans-serif" fill="#4A6258" letterSpacing="2">
        {centerSubLabel.toUpperCase()}
      </text>
    </svg>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs text-on-surface-variant">{label}</span>
      <span className="ml-auto text-sm font-bold tabular-nums text-on-surface">
        {value.toLocaleString('en-IN')}
      </span>
    </div>
  );
}

function HBar({ items, colorClass }: { items: { label: string; value: number }[]; colorClass: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const pct = (it.value / max) * 100;
        return (
          <div key={it.label} className="flex items-center gap-3">
            <span className="w-28 text-xs font-bold text-on-surface truncate" title={it.label}>
              {it.label}
            </span>
            <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full ${colorClass} transition-all`}
                style={{ width: `${pct}%`, minWidth: it.value > 0 ? '3px' : '0' }}
              />
            </div>
            <span className="w-12 text-right text-xs tabular-nums font-bold text-primary">
              {it.value.toLocaleString('en-IN')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const w = 800;
  const h = 120;
  const pad = { top: 10, right: 10, bottom: 24, left: 28 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.count), 1);
  const stepX = data.length > 1 ? cw / (data.length - 1) : cw;

  const points = data.map((d, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + ch - (d.count / max) * ch,
    raw: d,
  }));

  // SVG path for the smooth-ish line
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fillPath =
    `${linePath} L ${(pad.left + cw).toFixed(1)} ${(pad.top + ch).toFixed(1)} L ${pad.left.toFixed(1)} ${(pad.top + ch).toFixed(1)} Z`;

  // Y-axis ticks (0, mid, max)
  const ticks = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
      <defs>
        <linearGradient id="cnb-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0B4D38" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#0B4D38" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* y grid + labels */}
      {ticks.map((t, i) => {
        const y = pad.top + ch - (t / max) * ch;
        return (
          <g key={i}>
            <line x1={pad.left} x2={pad.left + cw} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{t}</text>
          </g>
        );
      })}

      <path d={fillPath} fill="url(#cnb-spark)" />
      <path d={linePath} stroke="#0B4D38" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#0B4D38" strokeWidth="2">
            <title>{`${p.raw.date}: ${p.raw.count} booking${p.raw.count === 1 ? '' : 's'}`}</title>
          </circle>
          {/* x labels: show every other to avoid clutter */}
          {i % 2 === 0 && (
            <text x={p.x} y={h - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {p.raw.date.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ----------------------- Halls ----------------------- */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function HallsSection({ onError, role }: { onError: (e: unknown) => void; role: 'ADMIN' | 'SUPERADMIN' | string }) {
  const canDestructive = role === 'SUPERADMIN';
  const [tab, setTab] = useState<HallTab>('all');
  const [halls, setHalls] = useState<AdminHall[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [city, setCity] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 280);
    return () => clearTimeout(t);
  }, [filter]);

  // Reset to page 1 whenever any filter / tab / page-size changes
  useEffect(() => { setPage(1); }, [tab, pageSize, debouncedFilter, city]);

  // Load city options once (from public approved halls)
  useEffect(() => {
    api.getHallFilters().then((f) => setCities(f.cities)).catch(() => { /* ignore */ });
  }, []);

  // Fetch the current page from the server
  useEffect(() => {
    setLoading(true);
    api
      .adminListHalls({
        approved: tab,
        page,
        limit: pageSize,
        q: debouncedFilter || undefined,
        city: city || undefined,
      })
      .then((res) => {
        setHalls(res.halls);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch(onError)
      .finally(() => setLoading(false));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tab, page, pageSize, debouncedFilter, city]);

  function refresh() {
    api
      .adminListHalls({
        approved: tab,
        page,
        limit: pageSize,
        q: debouncedFilter || undefined,
        city: city || undefined,
      })
      .then((res) => {
        setHalls(res.halls);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch(onError);
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      const h = await api.adminApproveHall(id);
      refresh();
      toastSuccess('Hall approved', `${h.name} is now live on the catalogue.`);
    }
    catch (e) { onError(e); toastError('Could not approve', (e as Error).message); }
    finally { setBusyId(null); }
  }
  async function reject(id: string) {
    setBusyId(id);
    try {
      const h = await api.adminRejectHall(id);
      refresh();
      toastSuccess('Hall unpublished', `${h.name} is no longer visible to visitors.`);
    }
    catch (e) { onError(e); toastError('Could not unpublish', (e as Error).message); }
    finally { setBusyId(null); }
  }
  async function remove(h: AdminHall) {
    if (!window.confirm(`Delete "${h.name}"? This removes the listing and all its availability rows.`)) return;
    setBusyId(h.id);
    try {
      await api.adminDeleteHall(h.id);
      refresh();
      toastSuccess('Hall deleted', `${h.name} and its availability were removed.`);
    }
    catch (e) { onError(e); toastError('Could not delete', (e as Error).message); }
    finally { setBusyId(null); }
  }

  function clearFilters() {
    setFilter('');
    setCity('');
  }
  const hasFilter = !!debouncedFilter || !!city;
  const firstRow = halls && halls.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastRow = halls ? (page - 1) * pageSize + halls.length : 0;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Halls</h1>
          <p className="text-on-surface-variant mt-1">
            {canDestructive
              ? 'Approve, unpublish or remove listings on the catalogue.'
              : 'Approve listings on the catalogue. Unpublish and delete require Super Admin.'}
          </p>
        </div>
      </div>

      {/* Tabs + filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-full ring-1 ring-gold/20">
          {([
            ['pending', 'Pending review'],
            ['approved', 'Approved'],
            ['all', 'All'],
          ] as [HallTab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${
                tab === key ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[220px] md:max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name, city, area, address, owner…"
            className="w-full pl-10 pr-9 py-2 rounded-full bg-white border border-gold/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {filter && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary rounded-full"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
            location_city
          </span>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="pl-10 pr-8 py-2 rounded-full bg-white border border-gold/30 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
          >
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          Show
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-gold/30 rounded-lg px-2 py-1 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          per page
        </div>
      </div>

      {halls === null ? (
        <p className="text-on-surface-variant flex items-center gap-2"><span className="spin" /> Loading…</p>
      ) : halls.length === 0 ? (
        <EmptyCard
          title={hasFilter ? 'No halls match your filters' : tab === 'pending' ? 'Nothing pending review' : tab === 'approved' ? 'No approved halls' : 'No halls'}
          subtitle={
            hasFilter
              ? `Try clearing the filters or searching a different term.`
              : tab === 'pending'
              ? 'New owner submissions will appear here.'
              : 'Approve a pending hall to publish it.'
          }
        />
      ) : (
        <div className={`overflow-x-auto rounded-2xl bg-white border border-gold/10 shadow-sm transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low/80 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <tr>
                <th className="text-left px-4 py-3">Hall</th>
                <th className="text-left px-4 py-3">Location</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {halls.map((h) => (
                <tr key={h.id} className="hover:bg-surface-container-low/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <HallPhoto src={h.imageUrl} alt="" iconClass="text-[20px]" className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
                      <div className="min-w-0">
                        <Link to={`/halls/${h.id}`} className="font-bold text-primary hover:underline truncate block">
                          {h.name}
                        </Link>
                        <span className="text-[11px] text-on-surface-variant">
                          Submitted {formatDate(h.createdAt)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{h.city || <span className="text-slate-400 italic">No city</span>}{h.area ? ` · ${h.area}` : ''}</p>
                    <p className="text-[11px] text-on-surface-variant truncate max-w-[260px]">{h.address || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    {h.owner ? (
                      <>
                        <p className="font-medium">{h.owner.name}</p>
                        <p className="text-[11px] text-on-surface-variant tabular-nums">{h.owner.phone}</p>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-primary tabular-nums whitespace-nowrap">
                    {h.price > 0 ? `${formatINR(h.price)} /day` : <span className="text-slate-400 italic">Not set</span>}
                  </td>
                  <td className="px-4 py-3">
                    {h.isApproved ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[12px]">check_circle</span>
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1.5">
                      {/* View — opens public hall page in a new tab */}
                      <Link
                        to={`/halls/${h.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View hall details"
                        aria-label={`View ${h.name}`}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gold/30 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </Link>

                      {/* Edit — SUPERADMIN only */}
                      {canDestructive && (
                        <Link
                          to={`/admin/halls/${h.id}/edit`}
                          title="Edit hall details"
                          aria-label={`Edit ${h.name}`}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gold/30 text-secondary hover:bg-secondary-container/40 hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </Link>
                      )}

                      {!h.isApproved && (
                        <button
                          type="button"
                          disabled={busyId === h.id}
                          onClick={() => approve(h.id)}
                          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-green-700 disabled:opacity-60"
                        >
                          {busyId === h.id ? <span className="spin" /> : 'Approve'}
                        </button>
                      )}
                      {h.isApproved && canDestructive && (
                        <button
                          type="button"
                          disabled={busyId === h.id}
                          onClick={() => reject(h.id)}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-amber-700 disabled:opacity-60"
                        >
                          Unpublish
                        </button>
                      )}
                      {canDestructive ? (
                        <button
                          type="button"
                          disabled={busyId === h.id}
                          onClick={() => remove(h)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-red-700 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      ) : (
                        <span
                          title="Only Super Admin can delete or unpublish"
                          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-widest cursor-not-allowed inline-flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">lock</span>
                          Super only
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {halls && halls.length > 0 && (
        <Pagination
          firstRow={firstRow}
          lastRow={lastRow}
          total={total}
          page={page}
          totalPages={totalPages}
          onPage={setPage}
        />
      )}
    </section>
  );
}

function Pagination({
  firstRow, lastRow, total, page, totalPages, onPage,
}: {
  firstRow: number; lastRow: number; total: number; page: number;
  totalPages: number; onPage: (p: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-on-surface-variant">
        Showing <span className="font-bold tabular-nums text-on-surface">{firstRow}</span>
        {' '}–{' '}
        <span className="font-bold tabular-nums text-on-surface">{lastRow}</span>
        {' '}of{' '}
        <span className="font-bold tabular-nums text-on-surface">{total.toLocaleString('en-IN')}</span>
        {' '}records
      </p>
      <nav className="flex flex-wrap items-center justify-end gap-1" aria-label="Pagination">
        <PageButton disabled={page === 1} onClick={() => onPage(1)} aria-label="First page">
          <span className="material-symbols-outlined text-base">first_page</span>
        </PageButton>
        <PageButton disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </PageButton>
        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`dots-${i}`} className="px-2 text-slate-400">…</span>
          ) : (
            <PageButton
              key={p}
              active={p === page}
              onClick={() => onPage(p as number)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </PageButton>
          ),
        )}
        <PageButton disabled={page === totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </PageButton>
        <PageButton disabled={page === totalPages} onClick={() => onPage(totalPages)} aria-label="Last page">
          <span className="material-symbols-outlined text-base">last_page</span>
        </PageButton>
      </nav>
    </div>
  );
}

function PageButton({
  active, disabled, onClick, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[34px] h-9 px-2 inline-flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
        active
          ? 'bg-primary text-white shadow-sm'
          : 'bg-white border border-gold/30 text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

/* ----------------------- Owners ----------------------- */
function OwnersSection({ onError }: { onError: (e: unknown) => void }) {
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 280);
    return () => clearTimeout(t);
  }, [filter]);
  useEffect(() => { setPage(1); }, [pageSize, debouncedFilter]);

  useEffect(() => {
    setLoading(true);
    api.adminListOwners({ page, limit: pageSize, q: debouncedFilter || undefined })
      .then((res) => { setOwners(res.owners); setTotal(res.total); setTotalPages(res.totalPages); })
      .catch(onError)
      .finally(() => setLoading(false));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [page, pageSize, debouncedFilter]);

  const firstRow = owners && owners.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastRow = owners ? (page - 1) * pageSize + owners.length : 0;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Hall owners</h1>
          <p className="text-on-surface-variant mt-1">{total} registered owners.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] md:max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">search</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name, phone, email…"
            className="w-full pl-10 pr-9 py-2 rounded-full bg-white border border-gold/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {filter && (
            <button type="button" aria-label="Clear search" onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary rounded-full">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          Show
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-gold/30 rounded-lg px-2 py-1 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          per page
        </div>
      </div>

      {owners === null ? (
        <p className="text-on-surface-variant flex items-center gap-2"><span className="spin" /> Loading…</p>
      ) : owners.length === 0 ? (
        <EmptyCard
          title={debouncedFilter ? 'No owners match' : 'No owners yet'}
          subtitle={debouncedFilter ? 'Try a different search term.' : "As owners register their halls, they'll appear here."}
        />
      ) : (
        <div className={`overflow-x-auto rounded-2xl bg-white border border-gold/10 shadow-sm transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low/80 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <tr>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-right px-4 py-3">Halls</th>
                <th className="text-right px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {owners.map((o) => (
                <tr key={o.id} className="hover:bg-surface-container-low/40">
                  <td className="px-4 py-3 font-bold text-primary">{o.name}</td>
                  <td className="px-4 py-3 tabular-nums">{o.phone}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{o.email || <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{o._count.halls}</td>
                  <td className="px-4 py-3 text-right text-on-surface-variant whitespace-nowrap">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {owners && owners.length > 0 && (
        <Pagination firstRow={firstRow} lastRow={lastRow} total={total} page={page} totalPages={totalPages} onPage={setPage} />
      )}
    </section>
  );
}

/* ----------------------- Guest users ----------------------- */
function UsersSection({ onError }: { onError: (e: unknown) => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 280);
    return () => clearTimeout(t);
  }, [filter]);
  useEffect(() => { setPage(1); }, [pageSize, debouncedFilter]);

  useEffect(() => {
    setLoading(true);
    api.adminListUsers({ page, limit: pageSize, q: debouncedFilter || undefined })
      .then((res) => { setUsers(res.users); setTotal(res.total); setTotalPages(res.totalPages); })
      .catch(onError)
      .finally(() => setLoading(false));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [page, pageSize, debouncedFilter]);

  const firstRow = users && users.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastRow = users ? (page - 1) * pageSize + users.length : 0;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Guest users</h1>
          <p className="text-on-surface-variant mt-1">
            {total} OTP-verified visitor{total === 1 ? '' : 's'} on the platform.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] md:max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">search</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name, phone, email…"
            className="w-full pl-10 pr-9 py-2 rounded-full bg-white border border-gold/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {filter && (
            <button type="button" aria-label="Clear search" onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary rounded-full">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          Show
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-gold/30 rounded-lg px-2 py-1 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          per page
        </div>
      </div>

      {users === null ? (
        <p className="text-on-surface-variant flex items-center gap-2"><span className="spin" /> Loading…</p>
      ) : users.length === 0 ? (
        <EmptyCard
          title={debouncedFilter ? 'No guests match' : 'No guests yet'}
          subtitle={debouncedFilter ? 'Try a different search term.' : 'OTP-verified visitors will appear here as they sign in.'}
        />
      ) : (
        <div className={`overflow-x-auto rounded-2xl bg-white border border-gold/10 shadow-sm transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low/80 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-right px-4 py-3">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-container-low/40">
                  <td className="px-4 py-3 font-bold text-primary">{u.name}</td>
                  <td className="px-4 py-3 tabular-nums">{u.phone}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{u.email || <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-right text-on-surface-variant whitespace-nowrap">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {users && users.length > 0 && (
        <Pagination firstRow={firstRow} lastRow={lastRow} total={total} page={page} totalPages={totalPages} onPage={setPage} />
      )}
    </section>
  );
}

/* ----------------------- Areas ----------------------- */
type AreaRow = { id: string; city: string; name: string; createdAt: string; hallCount: number };

function AreasSection({ onError, role }: { onError: (e: unknown) => void; role: string }) {
  const canDelete = role === 'SUPERADMIN';
  const [rows, setRows] = useState<AreaRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [city, setCity] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add-area form
  const [newCity, setNewCity] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit row
  const [editId, setEditId] = useState<string | null>(null);
  const [editCity, setEditCity] = useState('');
  const [editName, setEditName] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 280);
    return () => clearTimeout(t);
  }, [filter]);
  useEffect(() => { setPage(1); }, [pageSize, debouncedFilter, city]);

  useEffect(() => {
    api.getHallFilters().then((f) => setCities(f.cities)).catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    api.adminListAreas({ page, limit: pageSize, q: debouncedFilter || undefined, city: city || undefined })
      .then((res) => { setRows(res.areas); setTotal(res.total); setTotalPages(res.totalPages); })
      .catch(onError)
      .finally(() => setLoading(false));
  }
  useEffect(load, [page, pageSize, debouncedFilter, city]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newCity.trim() || !newName.trim()) return;
    setAdding(true);
    try {
      const a = await api.adminCreateArea(newCity.trim(), newName.trim());
      toastSuccess('Area added', `${a.name} (${a.city}) created.`);
      setNewName('');
      // keep city to add many in a row
      load();
    } catch (e) {
      toastError('Could not add area', (e as Error).message);
    } finally { setAdding(false); }
  }

  function startEdit(a: AreaRow) {
    setEditId(a.id);
    setEditCity(a.city);
    setEditName(a.name);
  }
  function cancelEdit() {
    setEditId(null);
  }
  async function saveEdit() {
    if (!editId) return;
    if (!editCity.trim() || !editName.trim()) return;
    setBusyId(editId);
    try {
      await api.adminUpdateArea(editId, { city: editCity.trim(), name: editName.trim() });
      toastSuccess('Area updated', `Renamed to ${editName.trim()} (${editCity.trim()}).`);
      setEditId(null);
      load();
    } catch (e) {
      toastError('Could not update area', (e as Error).message);
    } finally { setBusyId(null); }
  }

  async function remove(a: AreaRow) {
    const force = a.hallCount > 0;
    const msg = force
      ? `${a.name} has ${a.hallCount} hall${a.hallCount === 1 ? '' : 's'} attached. Those halls keep the "${a.name}" area, so it will still appear in search filters while they exist. Continue?`
      : `Delete area "${a.name}" (${a.city})?`;
    if (!window.confirm(msg)) return;
    setBusyId(a.id);
    try {
      await api.adminDeleteArea(a.id, force);
      toastSuccess('Area deleted', `${a.name} (${a.city}) removed.`);
      load();
    } catch (e) {
      toastError('Could not delete area', (e as Error).message);
    } finally { setBusyId(null); }
  }

  const firstRow = rows && rows.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastRow = rows ? (page - 1) * pageSize + rows.length : 0;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Areas</h1>
          <p className="text-on-surface-variant mt-1">
            {total} area{total === 1 ? '' : 's'} across {cities.length} cities. Areas appear in the home page filters and in the hall edit form.
          </p>
        </div>
      </div>

      {/* Add-area card */}
      <form onSubmit={add} className="bg-white rounded-2xl border border-gold/10 shadow-sm p-5 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
            City
          </label>
          <input
            type="text"
            list="ar-cities"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="e.g. Coimbatore"
            className="w-full border border-gold/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            required
          />
          <datalist id="ar-cities">
            {cities.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
            Area name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Saibaba Colony"
            className="w-full border border-gold/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            required
          />
        </div>
        <button
          type="submit"
          disabled={adding || !newCity.trim() || !newName.trim()}
          className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-widest shadow-md hover:bg-primary-container active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {adding ? <><span className="spin" /> Adding…</> : <><span className="material-symbols-outlined text-base">add_location</span> Add area</>}
        </button>
      </form>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] md:max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">search</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search area or city…"
            className="w-full pl-10 pr-9 py-2 rounded-full bg-white border border-gold/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {filter && (
            <button type="button" aria-label="Clear search" onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary rounded-full">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">location_city</span>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="pl-10 pr-8 py-2 rounded-full bg-white border border-gold/30 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
          >
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          Show
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-gold/30 rounded-lg px-2 py-1 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          per page
        </div>
      </div>

      {rows === null ? (
        <p className="text-on-surface-variant flex items-center gap-2"><span className="spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyCard title={debouncedFilter || city ? 'No areas match' : 'No areas yet'} subtitle={debouncedFilter || city ? 'Try a different search or city.' : 'Add an area above to get started.'} />
      ) : (
        <div className={`overflow-x-auto rounded-2xl bg-white border border-gold/10 shadow-sm transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low/80 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <tr>
                <th className="text-left px-4 py-3">City</th>
                <th className="text-left px-4 py-3">Area</th>
                <th className="text-right px-4 py-3">Halls</th>
                <th className="text-right px-4 py-3">Created</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {rows.map((a) => {
                const isEditing = editId === a.id;
                return (
                  <tr key={a.id} className="hover:bg-surface-container-low/40">
                    <td className="px-4 py-3 font-bold text-primary">
                      {isEditing ? (
                        <input value={editCity} onChange={(e) => setEditCity(e.target.value)}
                          className="border border-gold/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      ) : a.city}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="border border-gold/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      ) : a.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{a.hallCount}</td>
                    <td className="px-4 py-3 text-right text-on-surface-variant whitespace-nowrap">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button type="button" disabled={busyId === a.id} onClick={saveEdit}
                              className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold uppercase tracking-widest hover:bg-primary-container disabled:opacity-60">
                              {busyId === a.id ? <span className="spin" /> : 'Save'}
                            </button>
                            <button type="button" onClick={cancelEdit}
                              className="px-3 py-1.5 rounded-lg border border-gold/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-widest hover:bg-surface-container">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEdit(a)}
                              title="Rename area"
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gold/30 text-secondary hover:bg-secondary-container/40 hover:text-primary transition-colors">
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            {canDelete ? (
                              <button type="button" disabled={busyId === a.id} onClick={() => remove(a)}
                                title="Delete area"
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            ) : (
                              <span title="Only Super Admin can delete"
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length > 0 && (
        <Pagination firstRow={firstRow} lastRow={lastRow} total={total} page={page} totalPages={totalPages} onPage={setPage} />
      )}
    </section>
  );
}

/* ----------------------- Settings ----------------------- */
function SettingsSection({ onError }: { onError: (e: unknown) => void }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setPhone(s.customerCarePhone);
        setEmail(s.customerCareEmail);
        setUpdatedAt(s.updatedAt);
      })
      .catch(onError)
      .finally(() => setLoading(false));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function save() {
    setSaving(true);
    try {
      const s = await api.updateSettings({
        customerCarePhone: phone.trim(),
        customerCareEmail: email.trim(),
      });
      setUpdatedAt(s.updatedAt);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2200);
      toastSuccess('Settings saved', 'Customer care contact updated.');
    } catch (e) {
      onError(e);
      toastError('Could not save settings', (e as Error).message);
    } finally { setSaving(false); }
  }

  const phoneValid = !phone.trim() || /^\+\d{10,15}$/.test(phone.trim());
  const emailValid = !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim());
  const canSave = phoneValid && emailValid && !saving;

  return (
    <section>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-primary">Platform settings</h1>
        <p className="text-on-surface-variant mt-1">
          Customer-care contact shown to visitors on the site footer and contact areas.
        </p>
      </div>

      {loading ? (
        <p className="text-on-surface-variant flex items-center gap-2"><span className="spin" /> Loading…</p>
      ) : (
        <div className="max-w-2xl rounded-2xl bg-white border border-gold/10 shadow-sm p-6 md:p-8">
          <h2 className="font-serif text-h3 text-primary mb-2">Customer care</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            Visitors will see these as the contact channels for help with the platform itself
            (not for individual halls).
          </p>

          <div className="space-y-5">
            <div>
              <label
                htmlFor="cs-phone"
                className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2"
              >
                Customer care phone
              </label>
              <input
                id="cs-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white ${
                  phoneValid ? 'border-gold/40 focus:border-primary' : 'border-error focus:ring-error/40'
                }`}
              />
              <p className={`text-[11px] mt-1 ${phoneValid ? 'text-on-surface-variant' : 'text-error font-bold'}`}>
                E.164 format with country code, e.g. <span className="font-bold">+918012345678</span>. Leave empty to hide.
              </p>
            </div>

            <div>
              <label
                htmlFor="cs-email"
                className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2"
              >
                Customer care email
              </label>
              <input
                id="cs-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="support@checknbook.com"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white ${
                  emailValid ? 'border-gold/40 focus:border-primary' : 'border-error focus:ring-error/40'
                }`}
              />
              <p className={`text-[11px] mt-1 ${emailValid ? 'text-on-surface-variant' : 'text-error font-bold'}`}>
                Visitors can email this address from the footer.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-on-surface-variant">
                {savedAt ? (
                  <span className="text-green-700 font-bold inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Saved
                  </span>
                ) : updatedAt ? (
                  <>Last updated {new Date(updatedAt).toLocaleString('en-IN')}</>
                ) : null}
              </p>
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className="px-6 py-2.5 rounded-lg bg-primary text-white font-bold uppercase tracking-widest text-xs shadow-md hover:bg-primary-container active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <><span className="spin" /> Saving…</> : <><span className="material-symbols-outlined text-base">save</span> Save changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toggleDay(list: Date[], d: Date): Date[] {
  return list.some((x) => isoDay(x) === isoDay(d)) ? list.filter((x) => isoDay(x) !== isoDay(d)) : [...list, d];
}

function DatesSection({ onError }: { onError: (e: unknown) => void }) {
  const muhurtham = useMuhurthamDates();
  const [pickedMuhurtham, setPickedMuhurtham] = useState<Date[]>([]);
  const [muhurthamBusy, setMuhurthamBusy] = useState(false);

  const [halls, setHalls] = useState<Hall[]>([]);
  const [hallId, setHallId] = useState('');
  const [avail, setAvail] = useState<Availability[]>([]);
  const [pickedBooked, setPickedBooked] = useState<Date[]>([]);
  const [availBusy, setAvailBusy] = useState(false);

  useEffect(() => {
    void loadMuhurthamDates(true);
    api.adminListHalls({ approved: 'all', limit: 100 })
      .then((r) => setHalls(r.halls))
      .catch(onError);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  function loadAvail(id: string) {
    if (!id) { setAvail([]); return; }
    api.getAvailability(id).then(setAvail).catch(onError);
  }
  useEffect(() => {
    setPickedBooked([]);
    loadAvail(hallId);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [hallId]);

  async function changeMuhurtham(action: 'add' | 'remove', dates: string[]) {
    if (dates.length === 0) return;
    setMuhurthamBusy(true);
    try {
      const next = action === 'add'
        ? await api.adminAddMuhurthamDates(dates)
        : await api.adminRemoveMuhurthamDates(dates);
      setMuhurthamDates(next);
      setPickedMuhurtham([]);
      toastSuccess(action === 'add' ? 'Muhurtham dates added' : 'Muhurtham dates removed', `${dates.length} date(s) updated.`);
    } catch (e) { onError(e); toastError('Could not update muhurtham dates', (e as Error).message); }
    finally { setMuhurthamBusy(false); }
  }

  async function setBooked(status: 'BOOKED' | 'AVAILABLE') {
    if (!hallId || pickedBooked.length === 0) return;
    setAvailBusy(true);
    try {
      await api.setAvailability(hallId, pickedBooked.map(isoDay), status);
      toastSuccess('Dates updated', `${pickedBooked.length} date(s) marked ${status === 'BOOKED' ? 'booked' : 'available'}.`);
      setPickedBooked([]);
      loadAvail(hallId);
    } catch (e) { onError(e); toastError('Could not update dates', (e as Error).message); }
    finally { setAvailBusy(false); }
  }

  const today = isoDay(new Date());
  const upcoming = muhurtham.filter((d) => d >= today);
  const known = new Set(muhurtham);
  const newOnes = pickedMuhurtham.map(isoDay).filter((d) => !known.has(d));
  const removable = pickedMuhurtham.map(isoDay).filter((d) => known.has(d));

  return (
    <section className="space-y-10">
      <div>
        <h1 className="font-serif text-3xl font-bold text-primary">Dates</h1>
        <p className="text-on-surface-variant mt-1">
          Manage the muhurtham calendar shown to customers, and mark each hall's dates as booked or available.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-soft-lg border border-gold/10 p-6">
        <h2 className="font-serif text-xl font-bold text-primary mb-1">★ Muhurtham dates</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Click plain dates to add them as muhurtham. Click an existing green date to select it for removal.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex justify-center">
            <DayPicker
              mode="multiple"
              selected={pickedMuhurtham}
              onDayClick={(d) => setPickedMuhurtham((l) => toggleDay(l, d))}
              modifiers={{ muhurtham: muhurtham.map(toLocalDate) }}
              modifiersClassNames={{ muhurtham: 'rdp-day_muhurtham' }}
            />
          </div>
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                disabled={muhurthamBusy || newOnes.length === 0}
                onClick={() => changeMuhurtham('add', newOnes)}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-green-700 disabled:opacity-50"
              >
                Add {newOnes.length || ''} as muhurtham
              </button>
              <button
                type="button"
                disabled={muhurthamBusy || removable.length === 0}
                onClick={() => changeMuhurtham('remove', removable)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 disabled:opacity-50"
              >
                Remove {removable.length || ''}
              </button>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              Upcoming ({upcoming.length})
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
              {upcoming.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-green-100 border border-green-400 text-green-900 text-xs font-bold">
                  {toLocalDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  <button
                    type="button"
                    disabled={muhurthamBusy}
                    aria-label={`Remove ${d}`}
                    onClick={() => changeMuhurtham('remove', [d])}
                    className="w-5 h-5 rounded-full hover:bg-green-200 inline-flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              ))}
              {upcoming.length === 0 && <span className="text-sm text-on-surface-variant">No upcoming muhurtham dates.</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-soft-lg border border-gold/10 p-6">
        <h2 className="font-serif text-xl font-bold text-primary mb-1">Hall booked dates</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Pick a hall, select dates on the calendar, then mark them booked or available. Dates with an active booking must be cancelled from the booking itself.
        </p>
        <select
          value={hallId}
          onChange={(e) => setHallId(e.target.value)}
          className="w-full md:w-96 mb-4 rounded-lg border border-gold/30 px-3 py-2 text-sm"
        >
          <option value="">Select a hall…</option>
          {halls.map((h) => (
            <option key={h.id} value={h.id}>{h.name} — {h.city}</option>
          ))}
        </select>
        {hallId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex justify-center">
              <AvailabilityCalendar
                availability={avail}
                mode="toggle"
                selected={pickedBooked}
                onToggle={(d) => setPickedBooked((l) => toggleDay(l, d))}
              />
            </div>
            <div>
              <p className="text-sm mb-3">
                <span className="font-bold">{pickedBooked.length}</span> date(s) selected
                {pickedBooked.length > 0 && (
                  <button type="button" onClick={() => setPickedBooked([])} className="ml-3 text-xs underline text-on-surface-variant">Clear</button>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={availBusy || pickedBooked.length === 0}
                  onClick={() => setBooked('BOOKED')}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 disabled:opacity-50"
                >
                  Mark booked
                </button>
                <button
                  type="button"
                  disabled={availBusy || pickedBooked.length === 0}
                  onClick={() => setBooked('AVAILABLE')}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-green-700 disabled:opacity-50"
                >
                  Mark available
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminsSection({ onError }: { onError: (e: unknown) => void }) {
  const [admins, setAdmins] = useState<Awaited<ReturnType<typeof api.adminListAdmins>> | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string; email: string | null } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminListAdmins().then(setAdmins).catch(onError);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  function generate() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    setPassword(Array.from(bytes, (b) => chars[b % chars.length]).join(''));
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      await api.adminResetAdminPassword(target.id, password);
      toastSuccess('Password reset', `${target.email ?? target.name} can now sign in with the new password.`);
      setTarget(null);
      setPassword('');
    } catch (e) { onError(e); toastError('Could not reset password', (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <h1 className="font-serif text-3xl font-bold text-primary">Admins</h1>
      <p className="text-on-surface-variant mt-1 mb-4">Reset the sign-in password for an Admin account.</p>
      <div className="bg-white rounded-2xl shadow-soft-lg border border-gold/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-on-surface-variant">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold">{a.name}</td>
                <td className="px-4 py-3">{a.email}</td>
                <td className="px-4 py-3">{a.role === 'SUPERADMIN' ? '★ Super Admin' : 'Admin'}</td>
                <td className="px-4 py-3 text-right">
                  {a.role === 'ADMIN' ? (
                    <button
                      type="button"
                      onClick={() => { setTarget(a); setPassword(''); }}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold uppercase tracking-widest hover:opacity-90"
                    >
                      Reset password
                    </button>
                  ) : (
                    <span className="text-xs text-on-surface-variant">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-soft-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl font-bold text-primary mb-1">Reset password</h2>
            <p className="text-sm text-on-surface-variant mb-4">{target.email ?? target.name}</p>
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-1">
              New password (min 10 characters)
            </label>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className="flex-1 rounded-lg border border-gold/30 px-3 py-2 text-sm font-mono"
              />
              <button type="button" onClick={generate} className="px-3 rounded-lg border border-gold/30 text-xs font-bold">
                Generate
              </button>
            </div>
            <p className="text-xs text-on-surface-variant mb-4">Share it with the admin securely; it is not shown again.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTarget(null)} className="px-4 py-2 text-sm font-semibold">Cancel</button>
              <button
                type="button"
                disabled={busy || password.length < 10}
                onClick={submit}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gold/10 p-12 text-center">
      <span className="material-symbols-outlined text-5xl text-gold/60">search_off</span>
      <h3 className="font-serif text-h3 text-primary mt-3 mb-1">{title}</h3>
      <p className="text-on-surface-variant text-sm">{subtitle}</p>
    </div>
  );
}

/* ----------------------- Bulk import (SuperAdmin) ----------------------- */
function ImportSection({ onError }: { onError: (e: unknown) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<ImportCommit | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [filter, setFilter] = useState<'all' | ImportRowResult['status']>('all');

  function pick(f: File | null) {
    setPreview(null);
    setDone(null);
    setFilter('all');
    if (f && !/\.xlsx$/i.test(f.name)) { toastError('Wrong file type', 'Please choose an .xlsx file.'); setFile(null); return; }
    if (f && f.size > 5 * 1024 * 1024) { toastError('File too large', 'The limit is 5 MB.'); setFile(null); return; }
    setFile(f);
  }

  async function runPreview() {
    if (!file) return;
    setBusy('preview');
    try { setPreview(await api.adminImportPreview(file)); }
    catch (e) {
      const msg = (e as Error).message;
      if (/401|403|Unauth|Forbid/i.test(msg)) onError(e);
      else toastError('Could not read the file', msg);
    }
    finally { setBusy(null); }
  }

  async function runCommit() {
    if (!file) return;
    setBusy('commit');
    try {
      const res = await api.adminImportCommit(file);
      setDone(res);
      setPreview(null);
      toastSuccess('Import complete', `${res.summary.hallsCreated} hall(s) saved as pending approval.`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/401|403|Unauth|Forbid/i.test(msg)) onError(e);
      else toastError('Import failed - nothing was saved', msg);
    } finally { setBusy(null); }
  }

  const view = done ?? preview;
  const rows = (view?.results ?? []).filter((r) => filter === 'all' || r.status === filter);
  const badge = (r: ImportRowResult): [string, string] =>
    r.saved ? ['Imported', 'bg-green-100 text-green-800']
    : r.status === 'valid' ? [done ? 'Not saved' : 'Ready', 'bg-green-100 text-green-800']
    : r.status === 'duplicate' ? ['Duplicate', 'bg-amber-100 text-amber-800']
    : ['Error', 'bg-red-100 text-red-800'];

  return (
    <section>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-primary">Bulk import</h1>
        <p className="text-on-surface-variant mt-1">
          Import cities, areas, marriage halls and their owners from an Excel file. Imported halls stay pending until you approve them.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <ol className="text-sm text-on-surface-variant list-decimal ml-5 space-y-1 mb-5">
          <li>Download the template and fill in one row per hall (owner / manager on the same row).</li>
          <li>Upload the completed .xlsx file and review the preview.</li>
          <li>Confirm to save the valid rows. Rows with errors or duplicates are skipped.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => api.adminImportTemplate().catch((e) => toastError('Download failed', (e as Error).message))}
            className="px-4 py-2 rounded-lg border border-primary text-primary text-sm font-bold hover:bg-primary/5"
          >
            Download Excel template
          </button>
          <label className="px-4 py-2 rounded-lg bg-slate-100 text-sm font-semibold cursor-pointer hover:bg-slate-200">
            {file ? file.name : 'Choose .xlsx file'}
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </label>
          <button
            type="button"
            disabled={!file || busy !== null}
            onClick={runPreview}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
          >
            {busy === 'preview' ? 'Checking...' : 'Preview'}
          </button>
        </div>
      </div>

      {view && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-wrap gap-3 mb-4 text-sm">
            {done ? (
              <>
                <Stat label="Halls imported" value={done.summary.hallsCreated} tone="green" />
                <Stat label="Owners created" value={done.summary.ownersCreated} />
                <Stat label="Areas created" value={done.summary.areasCreated} />
                <Stat label="Skipped (duplicates)" value={done.summary.skipped} tone="amber" />
                <Stat label="Failed" value={done.summary.failed} tone="red" />
              </>
            ) : (
              <>
                <Stat label="Ready to import" value={view.summary.valid} tone="green" />
                <Stat label="Duplicates" value={view.summary.duplicates} tone="amber" />
                <Stat label="Errors" value={view.summary.errors} tone="red" />
                <Stat label="New owners" value={view.summary.newOwners} />
                <Stat label="New areas" value={view.summary.newAreas} />
              </>
            )}
          </div>

          {done && (
            <p className="text-sm text-on-surface-variant mb-4">
              Imported halls are <b>pending</b>. Open <b>Halls - Pending</b> to review and approve them; they appear on the website only after approval.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All rows ({view.results.length})</option>
              <option value="valid">{done ? 'Imported' : 'Ready'}</option>
              <option value="duplicate">Duplicates</option>
              <option value="error">Errors</option>
            </select>
            {(view.summary.errors > 0 || view.summary.duplicates > 0) && (
              <button
                type="button"
                onClick={() => api.adminImportReport(view.results).catch((e) => toastError('Download failed', (e as Error).message))}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Download error report (Excel)
              </button>
            )}
            {preview && (
              <button
                type="button"
                disabled={busy !== null || preview.summary.valid === 0}
                onClick={runCommit}
                className="ml-auto px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
              >
                {busy === 'commit' ? 'Importing...' : `Confirm import (${preview.summary.valid})`}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-on-surface-variant border-b border-slate-200">
                  <th className="py-2 pr-3">Sheet</th>
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Hall / Area</th>
                  <th className="py-2 pr-3">City / Area</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2">Messages</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [text, cls] = badge(r);
                  return (
                    <tr key={`${r.sheet}-${r.row}`} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3">{r.sheet}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.row}</td>
                      <td className="py-2 pr-3 font-semibold">{r.label || '-'}</td>
                      <td className="py-2 pr-3">{r.city}{r.area && r.sheet === 'Halls' ? ` / ${r.area}` : ''}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.ownerPhone}</td>
                      <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{text}</span></td>
                      <td className="py-2 text-on-surface-variant">{r.messages.join('; ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-on-surface';
  return (
    <div className="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-on-surface-variant">{label}</p>
    </div>
  );
}
