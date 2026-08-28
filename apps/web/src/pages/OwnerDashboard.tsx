import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { api, type Availability, type Hall, setSessionUser, setToken } from '../api/client';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';

export default function OwnerDashboard() {
  const { t } = useT();
  const nav = useNavigate();
  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [avail, setAvail] = useState<Availability[]>([]);
  const [pending, setPending] = useState<Date[]>([]);
  const [mode, setMode] = useState<'AVAILABLE' | 'BOOKED'>('BOOKED');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  useEffect(() => {
    if (!selectedHallId) return;
    api.getAvailability(selectedHallId).then(setAvail).catch((e) => setError(e.message));
    setPending([]);
  }, [selectedHallId]);

  const selectedHall = useMemo(
    () => halls?.find((h) => h.id === selectedHallId) ?? null,
    [halls, selectedHallId],
  );

  async function applyPending() {
    if (!selectedHallId || pending.length === 0) return;
    const dates = pending.map((d) => format(d, 'yyyy-MM-dd'));
    await api.setAvailability(selectedHallId, dates, mode);
    const fresh = await api.getAvailability(selectedHallId);
    setAvail(fresh);
    setPending([]);
  }

  function toggleDate(d: Date) {
    setPending((prev) => {
      const key = d.toDateString();
      return prev.some((p) => p.toDateString() === key)
        ? prev.filter((p) => p.toDateString() !== key)
        : [...prev, d];
    });
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
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? t('od_cancel') : t('od_add_hall')}
          </button>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        {showCreate && <CreateHallForm onCreated={() => { setShowCreate(false); refresh(); }} />}

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
                  onClick={() => setSelectedHallId(h.id)}
                >
                  {h.name}
                  {!h.isApproved && <span className="halls-strip__pending"> {t('od_pending')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedHall && (
          <section className="panel calendar-section">
            <div className="section__header" style={{ marginBottom: '0.75rem' }}>
              <div>
                <h2 className="section__title">{selectedHall.name}</h2>
                <p className="section__sub">{selectedHall.city} · {selectedHall.address}</p>
              </div>
              {!selectedHall.isApproved && (
                <span className="badge badge--pending">{t('od_pending_admin')}</span>
              )}
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
      </div>
    </div>
  );
}

function CreateHallForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useT();
  const [form, setForm] = useState({
    name: '', city: '', address: '', price: 0, contactNumber: '', description: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api.createHall({ ...form, price: Number(form.price) } as any);
      onCreated();
    } catch (e: any) {
      setErr(e.message);
    } finally { setSaving(false); }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2 style={{ fontSize: '1.15rem' }}>{t('od_new_hall')}</h2>

      <div className="field">
        <label>{t('reg_hall_name')}</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>

      <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="field">
          <label>{t('od_city')}</label>
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        </div>
        <div className="field">
          <label>{t('od_price_day')}</label>
          <input className="input" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
        </div>
      </div>

      <div className="field">
        <label>{t('od_address')}</label>
        <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
      </div>

      <div className="field">
        <label>{t('od_contact_no')}</label>
        <input className="input" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} placeholder="+91 98765 43210" required />
      </div>

      <div className="field">
        <label>{t('od_description')}</label>
        <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="row">
        <button className="btn btn--primary" disabled={saving}>
          {saving ? (<><span className="spin" /> {t('od_saving')}</>) : t('od_create_hall')}
        </button>
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          {t('od_review_hint')}
        </p>
      </div>
    </form>
  );
}
