import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import {
  api,
  normalizePhone,
  setSessionUser,
  setToken,
  type Availability,
  type Booking,
  type Hall,
  type HallFilters,
} from '../api/client';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { toastError, toastSuccess } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';

const STATUS_STYLE: Record<Booking['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

function dayLabel(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OwnerDashboard() {
  const { t } = useT();
  const nav = useNavigate();
  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [avail, setAvail] = useState<Availability[]>([]);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [pending, setPending] = useState<Date[]>([]);
  const [mode, setMode] = useState<'AVAILABLE' | 'BOOKED'>('BOOKED');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<'create' | 'edit' | null>(null);
  const [filters, setFilters] = useState<HallFilters | null>(null);
  const [busyBooking, setBusyBooking] = useState<string | null>(null);

  async function refresh() {
    try {
      const mine = await api.myHalls();
      setHalls(mine);
      if (!selectedHallId && mine[0]) setSelectedHallId(mine[0].id);
    } catch (e: any) {
      if (/401|Unauth/i.test(e.message)) {
        setToken(null);
        setSessionUser(null);
        nav('/owner/login');
      } else {
        setError(e.message);
      }
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { api.getHallFilters().then(setFilters).catch(() => undefined); }, []);

  function loadHallData(hallId: string) {
    api.getAvailability(hallId).then(setAvail).catch((e) => setError(e.message));
    api.hallBookings(hallId).then(setBookings).catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!selectedHallId) return;
    setBookings(null);
    loadHallData(selectedHallId);
    setPending([]);
  }, [selectedHallId]);

  const selectedHall = useMemo(
    () => halls?.find((h) => h.id === selectedHallId) ?? null,
    [halls, selectedHallId],
  );

  const orderedBookings = useMemo(() => {
    if (!bookings) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    const upcoming = bookings.filter((b) => b.date.slice(0, 10) >= today);
    const past = bookings.filter((b) => b.date.slice(0, 10) < today).reverse();
    return [...upcoming, ...past];
  }, [bookings]);

  async function applyPending() {
    if (!selectedHallId || pending.length === 0) return;
    setError(null);
    try {
      const dates = pending.map((d) => format(d, 'yyyy-MM-dd'));
      await api.setAvailability(selectedHallId, dates, mode);
      setAvail(await api.getAvailability(selectedHallId));
      setPending([]);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function toggleDate(d: Date) {
    setPending((prev) => {
      const key = d.toDateString();
      return prev.some((p) => p.toDateString() === key)
        ? prev.filter((p) => p.toDateString() !== key)
        : [...prev, d];
    });
  }

  async function bookingAction(b: Booking, action: 'confirm' | 'cancel') {
    if (action === 'cancel' && !window.confirm(`Cancel ${b.customerName}'s booking for ${dayLabel(b.date)}? The date will become available again.`)) return;
    setBusyBooking(b.id);
    try {
      if (action === 'confirm') await api.confirmBooking(b.id);
      else await api.cancelBooking(b.id);
      toastSuccess(action === 'confirm' ? 'Booking confirmed' : 'Booking cancelled');
      if (selectedHallId) loadHallData(selectedHallId);
    } catch (e: any) {
      toastError(`Could not ${action} booking`, e.message);
    } finally {
      setBusyBooking(null);
    }
  }

  return (
    <div className="container">
      <div className="dashboard">
        <div className="dashboard__header">
          <div>
            <h1>{t('od_my_halls')}</h1>
            <p>{t('od_subtitle')}</p>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => setForm(form === 'create' ? null : 'create')}
          >
            {form === 'create' ? t('od_cancel') : t('od_add_hall')}
          </button>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        {form === 'create' && (
          <HallForm
            filters={filters}
            onSaved={(h) => { setForm(null); setSelectedHallId(h.id); refresh(); }}
            onCancel={() => setForm(null)}
          />
        )}

        {!halls ? (
          <p className="text-muted"><span className="spin" /> {t('od_loading_halls')}</p>
        ) : halls.length === 0 ? (
          <div className="empty">
            <div className="empty__title">{t('od_no_halls')}</div>
            <p>{t('od_no_halls_help')}</p>
          </div>
        ) : (
          <ul className="halls-strip">
            {halls.map((h) => (
              <li key={h.id}>
                <button
                  className={selectedHallId === h.id ? 'is-active' : ''}
                  onClick={() => { setSelectedHallId(h.id); setForm(null); }}
                >
                  {h.name}
                  {!h.isApproved && <span className="halls-strip__pending"> {t('od_pending')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedHall && form === 'edit' && (
          <HallForm
            hall={selectedHall}
            filters={filters}
            onSaved={() => { setForm(null); refresh(); }}
            onCancel={() => setForm(null)}
          />
        )}

        {selectedHall && (
          <section className="panel calendar-section">
            <div className="section__header" style={{ marginBottom: '0.75rem' }}>
              <div>
                <h2 className="section__title">{selectedHall.name}</h2>
                <p className="section__sub">
                  {[selectedHall.area, selectedHall.city].filter(Boolean).join(', ') || 'Listing details not filled in yet'}
                  {selectedHall.address ? ` · ${selectedHall.address}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {!selectedHall.isApproved && (
                  <span className="badge badge--pending">{t('od_pending_admin')}</span>
                )}
                <button className="btn btn--sm" onClick={() => setForm(form === 'edit' ? null : 'edit')}>
                  {form === 'edit' ? t('od_cancel') : 'Edit details'}
                </button>
              </div>
            </div>

            <div className="calendar-toolbar">
              <label>
                {t('od_mark_as')}
                <select value={mode} onChange={(e) => setMode(e.target.value as 'BOOKED' | 'AVAILABLE')}>
                  <option value="BOOKED">{t('od_booked')}</option>
                  <option value="AVAILABLE">{t('available')}</option>
                </select>
              </label>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn--primary btn--sm"
                onClick={applyPending}
                disabled={pending.length === 0}
              >
                {t('od_apply_to', { vars: { n: pending.length || 0, plural: pending.length === 1 ? 'date' : 'dates' } })}
              </button>
            </div>

            <div className="legend">
              <span><span className="legend-chip legend-chip--available" /> {t('legend_available')}</span>
              <span><span className="legend-chip legend-chip--booked" /> {t('legend_booked')}</span>
              <span><span className="legend-chip legend-chip--selected" /> {t('od_legend_selected')}</span>
            </div>

            <AvailabilityCalendar
              availability={avail}
              mode="toggle"
              selected={pending}
              onToggle={toggleDate}
            />
          </section>
        )}

        {selectedHall && (
          <section className="panel" style={{ marginTop: '1rem' }}>
            <h2 className="section__title" style={{ marginBottom: '0.75rem' }}>Bookings</h2>
            {!orderedBookings ? (
              <p className="text-muted"><span className="spin" /> Loading bookings…</p>
            ) : orderedBookings.length === 0 ? (
              <p className="text-muted">No bookings yet. Customer bookings for this hall appear here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3 text-right">Advance</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orderedBookings.map((b) => (
                      <tr key={b.id} className={b.status === 'CANCELLED' ? 'opacity-60' : ''}>
                        <td className="py-2 pr-3 whitespace-nowrap font-bold">{dayLabel(b.date)}</td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{b.customerName}</div>
                          <a href={`tel:${b.customerPhone}`} className="text-xs text-slate-500 tabular-nums">{b.customerPhone}</a>
                        </td>
                        <td className="py-2 pr-3 capitalize">{b.eventType} · {b.guestCount} guests</td>
                        <td className="py-2 pr-3 text-right tabular-nums">₹{b.advanceAmount.toLocaleString('en-IN')}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_STYLE[b.status]}`}>
                            {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {b.status === 'PENDING' && (
                            <button
                              className="btn btn--primary btn--sm"
                              disabled={busyBooking === b.id}
                              onClick={() => bookingAction(b, 'confirm')}
                            >
                              Confirm
                            </button>
                          )}{' '}
                          {b.status !== 'CANCELLED' && (
                            <button
                              className="btn btn--sm"
                              disabled={busyBooking === b.id}
                              onClick={() => bookingAction(b, 'cancel')}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Create a hall, or edit an existing one (an owner-registered hall starts as an empty draft). */
function HallForm({
  hall,
  filters,
  onSaved,
  onCancel,
}: {
  hall?: Hall;
  filters: HallFilters | null;
  onSaved: (h: Hall) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [f, setF] = useState({
    name: hall?.name ?? '',
    city: hall?.city ?? '',
    area: hall?.area ?? '',
    address: hall?.address ?? '',
    price: hall && hall.price > 0 ? String(hall.price) : '',
    capacity: hall && hall.capacity > 0 ? String(hall.capacity) : '',
    hasAC: hall?.hasAC ?? false,
    hasRooms: hall?.hasRooms ?? false,
    contactNumber: hall?.contactNumber ?? '',
    description: hall?.description ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const areaSuggestions = filters?.areasByCity[f.city] ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const phone = normalizePhone(f.contactNumber);
    if (!phone) return setErr('Enter a valid contact number, e.g. +91 XXXXX XXXXX.');
    const price = Number(f.price);
    const capacity = Number(f.capacity);
    if (!(price > 0)) return setErr('Enter the price per day.');
    if (!(capacity > 0)) return setErr('Enter the seating capacity.');
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        city: f.city.trim(),
        area: f.area.trim(),
        address: f.address.trim(),
        price,
        capacity,
        hasAC: f.hasAC,
        hasRooms: f.hasRooms,
        contactNumber: phone,
        description: f.description.trim() || undefined,
      };
      const saved = hall ? await api.updateHall(hall.id, body) : await api.createHall(body);
      onSaved(saved);
    } catch (e: any) {
      setErr(e.message);
    } finally { setSaving(false); }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2 style={{ fontSize: '1.15rem' }}>{hall ? 'Edit hall details' : t('od_new_hall')}</h2>

      <div className="field">
        <label>{t('reg_hall_name')}</label>
        <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required minLength={2} />
      </div>

      <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="field">
          <label>{t('od_city')}</label>
          <input className="input" list="od-cities" value={f.city} onChange={(e) => set('city', e.target.value)} required minLength={2} />
          <datalist id="od-cities">{(filters?.cities ?? []).map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field">
          <label>Area / locality</label>
          <input className="input" list="od-areas" value={f.area} onChange={(e) => set('area', e.target.value)} required />
          <datalist id="od-areas">{areaSuggestions.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
      </div>

      <div className="field">
        <label>{t('od_address')}</label>
        <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} required minLength={2} />
      </div>

      <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="field">
          <label>{t('od_price_day')}</label>
          <input className="input" type="number" min={1} value={f.price} onChange={(e) => set('price', e.target.value)} required />
        </div>
        <div className="field">
          <label>Seating capacity</label>
          <input className="input" type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} required />
        </div>
      </div>

      <div className="row" style={{ display: 'flex', gap: '1.25rem' }}>
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={f.hasAC} onChange={(e) => set('hasAC', e.target.checked)} /> Air-conditioned
        </label>
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={f.hasRooms} onChange={(e) => set('hasRooms', e.target.checked)} /> Guest rooms
        </label>
      </div>

      <div className="field">
        <label>{t('od_contact_no')}</label>
        <input className="input" value={f.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} placeholder="+91 XXXXX XXXXX" required />
      </div>

      <div className="field">
        <label>{t('od_description')}</label>
        <textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} />
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="row">
        <button className="btn btn--primary" disabled={saving}>
          {saving ? (<><span className="spin" /> {t('od_saving')}</>) : hall ? 'Save changes' : t('od_create_hall')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>{t('od_cancel')}</button>
        {!hall && (
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {t('od_review_hint')}
          </p>
        )}
      </div>
    </form>
  );
}
