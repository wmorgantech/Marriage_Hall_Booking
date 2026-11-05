import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  getSessionUser,
  setSessionUser,
  setToken,
  setRefreshToken,
} from '../api/client';
import { toastError, toastSuccess } from '../components/Toast';
import HallPhoto from '../components/HallPhoto';

/** `value`, but only after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms = 700): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Labels are matched verbatim by search filters (e.g. "Valet Parking" in Search.tsx).
const AMENITIES_CATALOG = [
  'Centrally Air Conditioned',
  'Grand Dining Hall',
  'Luxury Guest Rooms',
  'Valet Parking',
  'Bridal Room',
  'Generator backup',
  'In-house decor',
  'In-house catering',
  'External catering allowed',
  'Vegetarian-only kitchen',
  'Sound system',
  'Stage lighting',
  'CCTV security',
  'Wheelchair accessible',
  'Wifi',
];

type FormState = {
  name: string;
  description: string;
  city: string;
  area: string;
  address: string;
  latitude: string;
  longitude: string;
  capacity: string;
  diningCapacity: string;
  hasAC: boolean;
  hasRooms: boolean;
  amenities: string[];
  price: string;
  perEventPrice: string;
  advancePercent: string;
  contactNumber: string;
  imageUrl: string;
  imageUrls: string[];
  cancellationPolicy: string;
  houseRules: string;
};

const EMPTY: FormState = {
  name: '', description: '',
  city: '', area: '', address: '', latitude: '', longitude: '',
  capacity: '', diningCapacity: '',
  hasAC: false, hasRooms: false, amenities: [],
  price: '', perEventPrice: '', advancePercent: '50',
  contactNumber: '',
  imageUrl: '', imageUrls: [],
  cancellationPolicy: '', houseRules: '',
};

export default function AdminEditHall() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const me = getSessionUser();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [original, setOriginal] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Raw text of the gallery box, kept separately from the parsed list: re-deriving the text from the list
  // on every keystroke swallowed the Enter key, so a second URL line could never be typed.
  const [galleryText, setGalleryText] = useState('');
  // Photo previews wait until typing pauses — otherwise every half-typed URL ("https://images.u…") is fetched.
  const previewCover = useDebounced(form.imageUrl);
  const previewGallery = useDebounced(form.imageUrls);
  // City suggestions come from the cities that already have halls/areas (free text still allowed).
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => { api.getHallFilters().then((f) => setCities(f.cities)).catch(() => undefined); }, []);

  useEffect(() => {
    if (!me) { nav('/admin/login'); return; }
    if (me.role !== 'SUPERADMIN') { nav('/admin'); return; }
  }, [me, nav]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getHall(id)
      .then((h: any) => {
        const next: FormState = {
          name: h.name ?? '',
          description: h.description ?? '',
          city: h.city ?? '',
          area: h.area ?? '',
          address: h.address ?? '',
          latitude: h.latitude != null ? String(h.latitude) : '',
          longitude: h.longitude != null ? String(h.longitude) : '',
          capacity: h.capacity ? String(h.capacity) : '',
          diningCapacity: h.diningCapacity ? String(h.diningCapacity) : '',
          hasAC: !!h.hasAC,
          hasRooms: !!h.hasRooms,
          amenities: Array.isArray(h.amenities) ? h.amenities : [],
          price: h.price ? String(h.price) : '',
          perEventPrice: h.perEventPrice != null ? String(h.perEventPrice) : '',
          advancePercent: h.advancePercent != null ? String(h.advancePercent) : '50',
          contactNumber: h.contactNumber ?? '',
          imageUrl: h.imageUrl ?? '',
          imageUrls: Array.isArray(h.imageUrls) ? h.imageUrls : [],
          cancellationPolicy: h.cancellationPolicy ?? '',
          houseRules: h.houseRules ?? '',
        };
        setForm(next);
        setOriginal(next);
        setGalleryText(next.imageUrls.join('\n'));
        setError(null);
      })
      .catch((e) => {
        const msg = (e as Error).message ?? '';
        if (/401|403|Unauth|Forbid/i.test(msg)) {
          setToken(null); setRefreshToken(null); setSessionUser(null); nav('/admin/login');
          return;
        }
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id, nav]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleAmenity(name: string) {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(name)
        ? f.amenities.filter((a) => a !== name)
        : [...f.amenities, name],
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setSaving(true);

    const lat = form.latitude.trim() === '' ? null : Number(form.latitude);
    const lng = form.longitude.trim() === '' ? null : Number(form.longitude);
    if (form.latitude.trim() && (Number.isNaN(lat!) || lat! < -90 || lat! > 90)) {
      setError('Latitude must be between -90 and 90.'); setSaving(false); return;
    }
    if (form.longitude.trim() && (Number.isNaN(lng!) || lng! < -180 || lng! > 180)) {
      setError('Longitude must be between -180 and 180.'); setSaving(false); return;
    }
    if (form.contactNumber && !/^\+\d{10,15}$/.test(form.contactNumber)) {
      setError('Contact number must be E.164 format (e.g. +918012345678).'); setSaving(false); return;
    }

    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        city: form.city.trim(),
        area: form.area.trim(),
        address: form.address.trim(),
        latitude: lat,
        longitude: lng,
        capacity: Number(form.capacity) || 0,
        diningCapacity: Number(form.diningCapacity) || 0,
        hasAC: form.hasAC,
        hasRooms: form.hasRooms,
        amenities: form.amenities,
        price: Number(form.price) || 0,
        perEventPrice: form.perEventPrice.trim() === '' ? null : Number(form.perEventPrice),
        // blank → the default (50). The old `Number('') || 0` silently saved 0% advance.
        advancePercent: form.advancePercent.trim() === '' ? 50 : Number(form.advancePercent),
        contactNumber: form.contactNumber.trim() || undefined,
        imageUrl: form.imageUrl.trim() || null,
        imageUrls: form.imageUrls.filter((u) => u.trim()),
        cancellationPolicy: form.cancellationPolicy.trim() || null,
        houseRules: form.houseRules.trim() || null,
      };
      const updated = await api.updateHall(id, body as any);
      // Re-sync form to whatever the server returned
      const fresh: FormState = { ...form };
      Object.assign(fresh, {
        latitude: (updated as any).latitude != null ? String((updated as any).latitude) : '',
        longitude: (updated as any).longitude != null ? String((updated as any).longitude) : '',
        amenities: (updated as any).amenities ?? [],
        imageUrls: (updated as any).imageUrls ?? [],
      });
      setOriginal(fresh);
      setForm(fresh);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2200);
      toastSuccess('Hall saved', `${fresh.name || 'Hall'} updated successfully.`);
    } catch (e) {
      const msg = (e as Error).message ?? 'Save failed';
      setError(msg);
      toastError('Could not save hall', msg);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setForm(original);
    setError(null);
  }

  if (!me || me.role !== 'SUPERADMIN') return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface p-6 md:p-10">
        <p className="text-on-surface-variant flex items-center gap-2"><span className="spin" /> Loading hall…</p>
      </div>
    );
  }

  if (error && !form.name) {
    return (
      <div className="min-h-screen bg-surface p-6 md:p-10 max-w-3xl">
        <p className="mb-4">
          <Link to="/admin" className="text-primary font-bold">← Back to console</Link>
        </p>
        <div className="px-4 py-3 bg-error-container text-on-error-container rounded-lg">{error}</div>
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto p-6 md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-secondary mb-1">
              Operator console
            </p>
            <h1 className="font-serif text-3xl font-bold text-primary">Edit hall</h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Editing as <span className="font-bold">{me.name}</span> (Super Admin) — changes apply immediately.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/halls/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-full bg-white border border-gold/30 text-primary text-xs font-bold uppercase tracking-widest hover:bg-surface-container inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">visibility</span>
              View public page
            </Link>
            <Link
              to="/admin"
              className="px-4 py-2 rounded-full bg-white border border-gold/30 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-surface-container"
            >
              ← Back
            </Link>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {error && (
            <div className="px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg flex items-start gap-2">
              <span className="material-symbols-outlined text-base mt-0.5">error</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* SECTION: Basics */}
          <Section title="Basics" icon="info">
            <Field label="Hall name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => patch('name', e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Description" hint="Visible on the public hall page.">
              <textarea
                value={form.description}
                onChange={(e) => patch('description', e.target.value)}
                rows={4}
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </Field>
            <Field label="Office contact number" hint="E.164 format, e.g. +918012345678">
              <input
                type="tel"
                value={form.contactNumber}
                onChange={(e) => patch('contactNumber', e.target.value)}
                placeholder="+91XXXXXXXXXX"
                className={inputCls}
              />
            </Field>
          </Section>

          {/* SECTION: Location */}
          <Section title="Location" icon="location_on">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="City" required>
                <input
                  type="text"
                  list="cities-dl"
                  value={form.city}
                  onChange={(e) => patch('city', e.target.value)}
                  required
                  className={inputCls}
                />
                <datalist id="cities-dl">
                  {cities.map((c) => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <Field label="Area / Locality" hint="Picked from admin-managed areas. Add a new one with +.">
                <AreaPicker
                  city={form.city}
                  value={form.area}
                  onChange={(v) => patch('area', v)}
                />
              </Field>
            </div>
            <Field label="Full address">
              <input
                type="text"
                value={form.address}
                onChange={(e) => patch('address', e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Latitude" hint="Use Google Maps to copy coordinates (right-click on the spot).">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(e) => patch('latitude', e.target.value)}
                  placeholder="11.0168"
                  className={inputCls}
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(e) => patch('longitude', e.target.value)}
                  placeholder="76.9558"
                  className={inputCls}
                />
              </Field>
            </div>
            {form.latitude && form.longitude && (
              <a
                href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-secondary hover:text-primary"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                Preview on Google Maps
              </a>
            )}
          </Section>

          {/* SECTION: Capacity & amenities */}
          <Section title="Capacity & amenities" icon="groups">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Seating capacity">
                <input
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => patch('capacity', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Dining capacity">
                <input
                  type="number"
                  min={0}
                  value={form.diningCapacity}
                  onChange={(e) => patch('diningCapacity', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-3 mt-1">
              <Toggle label="Centrally Air Conditioned" checked={form.hasAC} onChange={(v) => patch('hasAC', v)} />
              <Toggle label="Guest rooms available" checked={form.hasRooms} onChange={(v) => patch('hasRooms', v)} />
            </div>

            <Field label="Amenities">
              <div className="flex flex-wrap gap-2">
                {AMENITIES_CATALOG.map((a) => {
                  const on = form.amenities.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAmenity(a)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        on
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-white border border-gold/30 text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      {on && '✓ '}{a}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-on-surface-variant mt-2">
                {form.amenities.length} selected
              </p>
            </Field>
          </Section>

          {/* SECTION: Pricing */}
          <Section title="Pricing" icon="payments">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Per day rate (₹)" required>
                <input
                  type="number"
                  min={0}
                  max={100000000}
                  step={500}
                  value={form.price}
                  onChange={(e) => patch('price', e.target.value)}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Per event rate (₹)" hint="Informational only for now — bookings are priced from the per-day rate.">
                <input
                  type="number"
                  min={0}
                  max={500000000}
                  step={1000}
                  value={form.perEventPrice}
                  onChange={(e) => patch('perEventPrice', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Advance %" hint="Share of the day rate due as advance (0–100). Leave blank for the default, 50.">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.advancePercent}
                  onChange={(e) => patch('advancePercent', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* SECTION: Photos */}
          <Section title="Photos" icon="image">
            <Field label="Cover image URL" hint="Primary image shown on cards & hero. Use a public CDN URL.">
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => patch('imageUrl', e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
              {previewCover && (
                <HallPhoto
                  src={previewCover}
                  alt=""
                  className="mt-3 w-48 h-32 rounded-lg object-cover border border-gold/20"
                />
              )}
            </Field>

            <Field label="Gallery image URLs" hint="One per line. Up to 20.">
              <textarea
                value={galleryText}
                onChange={(e) => {
                  setGalleryText(e.target.value);
                  patch('imageUrls', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean));
                }}
                rows={4}
                placeholder={'https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg'}
                className={`${inputCls} resize-y font-mono text-xs`}
              />
              {previewGallery.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {previewGallery.slice(0, 8).map((u) => (
                    <HallPhoto key={u} src={u} alt="" iconClass="text-3xl" className="w-20 h-20 rounded-lg object-cover border border-gold/20" />
                  ))}
                  {previewGallery.length > 8 && (
                    <div className="w-20 h-20 rounded-lg border border-gold/20 bg-surface-container flex items-center justify-center text-xs text-on-surface-variant font-bold">
                      +{previewGallery.length - 8}
                    </div>
                  )}
                </div>
              )}
            </Field>
          </Section>

          {/* SECTION: Policies */}
          <Section title="Policies" icon="rule">
            <Field label="Cancellation policy">
              <textarea
                value={form.cancellationPolicy}
                onChange={(e) => patch('cancellationPolicy', e.target.value)}
                rows={3}
                placeholder="e.g. Full refund up to 60 days prior to the event…"
                className={`${inputCls} resize-y leading-relaxed`}
                maxLength={2000}
              />
              <p className="text-[11px] text-on-surface-variant text-right mt-1">
                {form.cancellationPolicy.length}/2000
              </p>
            </Field>

            <Field label="House rules">
              <textarea
                value={form.houseRules}
                onChange={(e) => patch('houseRules', e.target.value)}
                rows={3}
                placeholder="e.g. No outside catering. Smoking permitted only in designated areas."
                className={`${inputCls} resize-y leading-relaxed`}
                maxLength={2000}
              />
              <p className="text-[11px] text-on-surface-variant text-right mt-1">
                {form.houseRules.length}/2000
              </p>
            </Field>
          </Section>

          {/* Sticky save bar */}
          <div className="sticky bottom-0 -mx-6 md:-mx-10 px-6 md:px-10 py-4 bg-white/95 backdrop-blur-md border-t border-gold/20 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] flex items-center justify-between gap-4 z-10">
            <p className="text-xs text-on-surface-variant">
              {savedAt ? (
                <span className="text-green-700 font-bold inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span> Saved
                </span>
              ) : dirty ? (
                <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                  <span className="material-symbols-outlined text-[16px]">edit_note</span>
                  Unsaved changes
                </span>
              ) : (
                <span>All changes saved</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={!dirty || saving}
                className="px-5 py-2.5 rounded-lg border border-gold/30 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={!dirty || saving}
                className="px-6 py-2.5 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-widest shadow-md hover:bg-primary-container active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {saving ? <><span className="spin" /> Saving…</> : <><span className="material-symbols-outlined text-base">save</span> Save changes</>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full border border-gold/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white';

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gold/10 shadow-sm p-6 md:p-7 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        <h2 className="font-serif text-lg text-primary font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
        {label} {required && <span className="text-error">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-on-surface-variant mt-1">{hint}</p>}
    </div>
  );
}

function AreaPicker({ city, value, onChange }: { city: string; value: string; onChange: (v: string) => void }) {
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [creating, setCreating] = useState(false);

  function reload(c: string) {
    if (!c.trim()) { setAreas([]); return; }
    setLoading(true);
    api.getAreas(c.trim())
      .then((rows) => setAreas(rows.map((a) => a.name).sort()))
      .catch(() => setAreas([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(city); }, [city]);

  async function createArea(e: React.FormEvent) {
    e.preventDefault();
    const name = newArea.trim();
    if (!name) return;
    if (!city.trim()) {
      toastError('Pick a city first', 'Set the city before adding an area to it.');
      return;
    }
    setCreating(true);
    try {
      await api.adminCreateArea(city.trim(), name);
      toastSuccess('Area added', `${name} (${city.trim()}) created.`);
      setNewArea('');
      setAdding(false);
      reload(city);
      onChange(name);
    } catch (e) {
      toastError('Could not add area', (e as Error).message);
    } finally { setCreating(false); }
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            list={`areas-dl-${city || 'none'}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={city ? (loading ? 'Loading areas…' : 'Type or pick an area…') : 'Set city first'}
            className={inputCls}
            disabled={!city.trim()}
          />
          <datalist id={`areas-dl-${city || 'none'}`}>
            {areas.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          disabled={!city.trim()}
          title={city ? 'Add new area to this city' : 'Set city first'}
          className="shrink-0 px-3 rounded-lg bg-gold/15 text-primary border border-gold/40 text-sm font-bold hover:bg-gold/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">{adding ? 'close' : 'add'}</span>
          {adding ? 'Cancel' : 'Add area'}
        </button>
      </div>

      {areas.length > 0 && !adding && (
        <p className="text-[11px] text-on-surface-variant mt-1">
          {areas.length} area{areas.length === 1 ? '' : 's'} available in {city}
        </p>
      )}

      {adding && (
        <form onSubmit={createArea} className="mt-2 flex gap-2 items-stretch p-3 rounded-lg bg-surface-container-low border border-gold/20">
          <input
            type="text"
            autoFocus
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            placeholder={`New area in ${city}`}
            className="flex-1 border border-gold/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          />
          <button
            type="submit"
            disabled={creating || !newArea.trim()}
            className="px-4 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-container active:scale-95 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {creating ? <span className="spin" /> : <span className="material-symbols-outlined text-base">check</span>}
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-slate-300'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span className={`absolute top-0.5 ${checked ? 'left-[18px]' : 'left-0.5'} w-4 h-4 bg-white rounded-full shadow transition-all`} />
      </span>
      <span className="text-sm font-medium text-on-surface">{label}</span>
    </label>
  );
}
