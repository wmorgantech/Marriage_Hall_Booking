import { useEffect, useState } from 'react';
import type { AiCriteria, AiSearchOptions, AiSearchResponse, DateMatch } from '../api/client';
import HallCard from './HallCard';
import MultiDatePicker from './MultiDatePicker';
import { useT, type DictKey } from '../i18n';
import { fmtDay } from '../lib/dates';

type Props = {
  result: AiSearchResponse;
  /** Close the results and keep the normal search. */
  onClear: () => void;
  /** Edit text / Add a date / Edit search: back to the text box with the query kept. */
  onEdit: () => void;
  /** Try with different criteria: close the results and go to the normal filters. */
  onTryDifferent: () => void;
  onMore: () => void;
  loadingMore: boolean;
  /** Re-run with edited criteria, a follow-up, or an alternative. */
  onRun: (req: { query: string; options: AiSearchOptions }) => void;
  busy?: boolean;
  cities: string[];
  areasByCity: Record<string, string[]>;
};

type Understood = AiSearchResponse['understood'][number];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROWS: { key: string; icon: string; label: DictKey }[] = [
  { key: 'city', icon: 'location_on', label: 'smart_r_city' },
  { key: 'area', icon: 'location_city', label: 'smart_r_area' },
  { key: 'date', icon: 'calendar_month', label: 'smart_r_date' },
  { key: 'dates', icon: 'date_range', label: 'dates_label' },
  { key: 'guests', icon: 'groups', label: 'smart_r_guests' },
  { key: 'budget', icon: 'currency_rupee', label: 'smart_r_budget' },
  { key: 'minbudget', icon: 'currency_rupee', label: 'smart_r_price' },
  { key: 'cheap', icon: 'sort', label: 'smart_cheap_first' },
];

/**
 * Results of a natural-language search. Everything shown here comes from the server's verified search:
 * what was understood, anything that could not be understood or confirmed, and only real halls. A hall only
 * gets an availability badge when the server checked the requested date(s) against availability records AND
 * active bookings. Alternatives are real searches the server counted — never invented matches.
 */
export default function SmartResults({ result, onClear, onEdit, onTryDifferent, onMore, loadingMore, onRun, busy, cities, areasByCity }: Props) {
  const { t, lang, en } = useT();
  const [editing, setEditing] = useState(false);
  const [followUp, setFollowUp] = useState('');
  useEffect(() => { setEditing(false); setFollowUp(''); }, [result]);

  const blocking = result.issues.filter((i) => i.blocking);
  const noDate = result.issues.find((i) => i.code === 'no_date');
  const refined = result.issues.find((i) => i.code === 'refined');
  const notices = result.issues.filter((i) => !i.blocking && i.code !== 'no_date' && i.code !== 'refined');
  const hasHalls = result.searched && result.halls.length > 0;
  const c = result.criteria;
  const multi = (c.dates?.length ?? 0) > 1;
  const rows = ROWS.map((r) => ({ ...r, u: result.understood.find((u) => u.key === r.key) })).filter((r) => r.u);
  const prefs = result.understood.filter((u) => u.key.startsWith('pref:'));
  const others = result.understood.filter((u) => ['ac', 'rooms', 'dining'].includes(u.key));

  function rowValue(u: Understood) {
    if (u.key === 'date') return fmtDay(u.value, lang);
    if (u.key === 'dates') {
      return `${(c.dates ?? []).map((d) => fmtDay(d, lang, false)).join(', ')} · ${en(c.match === 'all' ? 'dates_match_all' : 'dates_match_any')}`;
    }
    if (u.key === 'guests') return u.value.replace(/ seats$/, ' guests');
    if (u.key === 'cheap') return '✓';
    return cap(u.value);
  }

  function summary() {
    const parts = [c.city, c.dates?.length === 1 ? fmtDay(c.dates[0], lang) : c.dates?.length ? `${c.dates.length} dates` : undefined,
      c.minCapacity != null ? `${c.minCapacity.toLocaleString('en-IN')}+ guests` : undefined,
      c.maxPrice != null ? `up to ₹${c.maxPrice.toLocaleString('en-IN')}` : undefined];
    return parts.filter(Boolean).join(' · ');
  }

  return (
    <section id="smart-results" className="max-w-[1280px] mx-auto px-4 md:px-6 pt-10 scroll-mt-28" aria-live="polite" aria-busy={busy}>
      <div className="bg-white rounded-3xl ring-1 ring-gold/40 shadow-soft p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-primary">
              <span className="material-symbols-outlined text-gold filled">auto_awesome</span>
              {t('smart_results_title')}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1 break-words">“{result.query}”</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-gold/50 text-sm font-bold text-primary hover:bg-secondary-container/40"
          >
            <span aria-hidden className="material-symbols-outlined text-[18px]">close</span>
            {t('smart_clear')}
          </button>
        </div>

        {refined && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#E3F4E8] text-[#166534] px-4 py-2.5 text-sm">
            <span aria-hidden className="material-symbols-outlined text-[20px]">tune</span>
            <span>{refined.message}</span>
          </p>
        )}

        {result.understood.length > 0 && !editing && (
          <div className="mt-5">
            <div className="flex items-center gap-3 rounded-2xl bg-[#E3F4E8] ring-1 ring-[#B9DDC6] px-4 py-3.5">
              <span className="material-symbols-outlined text-[28px] text-[#15803d] filled">check_circle</span>
              <div>
                <p className="font-bold text-on-surface">{t('smart_understood_h')}</p>
                <p className="text-xs text-on-surface-variant">{t('smart_understood_sub')}</p>
              </div>
            </div>

            <h3 className="font-serif text-lg text-primary mt-5 mb-2">{t('smart_criteria')}</h3>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 rounded-2xl ring-1 ring-gold/30 bg-white px-4">
              {rows.map((r) => (
                <Row key={r.key} icon={r.icon} label={t(r.label)}>
                  <dd className="text-sm font-semibold text-on-surface break-words">{rowValue(r.u!)}</dd>
                </Row>
              ))}
              {prefs.length > 0 && (
                <Row icon="tune" label={t('smart_r_prefs')}>
                  <dd className="flex flex-wrap gap-2">
                    {prefs.map((p) => (
                      <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-[#E3F4E8] text-[#166534] px-2.5 py-1 text-xs font-semibold">
                        <span aria-hidden className="material-symbols-outlined text-[15px]">{/parking/i.test(p.label) ? 'local_parking' : 'check'}</span>
                        {p.label}
                      </span>
                    ))}
                  </dd>
                </Row>
              )}
              {others.length > 0 && (
                <Row icon="more_horiz" label={t('smart_r_other')}>
                  <dd className="text-sm font-semibold text-on-surface">{others.map((o) => `${o.label} (${o.value})`).join(', ')}</dd>
                </Row>
              )}
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90"
              >
                <span aria-hidden className="material-symbols-outlined text-[18px]">tune</span>
                {t('smart_edit_criteria')}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary hover:text-white transition-colors"
              >
                <span aria-hidden className="material-symbols-outlined text-[18px]">edit</span>
                {t('smart_edit_text')}
              </button>
            </div>
          </div>
        )}

        {editing && (
          <CriteriaEditor
            initial={c}
            cities={cities}
            areasByCity={areasByCity}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={(criteria) => onRun({ query: result.query, options: { criteria } })}
          />
        )}

        {blocking.length > 0 && (
          <ul className="mt-5 space-y-2">
            {blocking.map((i) => (
              <li key={i.code} className="flex items-start gap-2 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm">
                <span className="material-symbols-outlined text-[20px] mt-px">error</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}

        {noDate && (
          <div className="mt-5 rounded-2xl bg-[#FFF4D6] ring-1 ring-[#EBD08A] text-[#5C4510] p-4">
            <p className="flex items-center gap-2 font-bold">
              <span aria-hidden className="material-symbols-outlined text-[20px] text-[#8A6A22]">event_busy</span>
              {t('smart_no_date_title')}
            </p>
            <p className="text-sm mt-1.5">{noDate.message}</p>
            <button
              type="button"
              onClick={() => (result.understood.length ? setEditing(true) : onEdit())}
              className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 border-[#8A6A22] text-sm font-bold hover:bg-[#8A6A22] hover:text-white transition-colors"
            >
              <span aria-hidden className="material-symbols-outlined text-[18px]">event</span>
              {t('smart_add_date')}
            </button>
          </div>
        )}

        {notices.length > 0 && (
          <ul className="mt-4 space-y-2">
            {notices.map((i) => (
              <li key={i.code} className="flex items-start gap-2 rounded-xl bg-secondary-container/40 text-on-secondary-container px-4 py-2.5 text-sm">
                <span className="material-symbols-outlined text-[20px] mt-px">info</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}

        {/* The "No listed hall matches all of …" note is shown in the no-match card below, not twice. */}
        {hasHalls && result.notes.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {result.notes.map((n) => (
              <li key={n} className="text-sm text-on-surface-variant flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-gold mt-px">chevron_right</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        {hasHalls && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#E3F4E8] ring-1 ring-[#B9DDC6] px-4 py-3.5">
            <span className="material-symbols-outlined text-[26px] text-[#15803d]">task_alt</span>
            <div className="min-w-0">
              <p className="font-bold text-on-surface">
                {t(result.total === 1 ? 'smart_found_one' : 'smart_found', { vars: { n: result.total.toLocaleString('en-IN') } })}
              </p>
              <p className="text-xs text-on-surface-variant break-words">{summary()}</p>
            </div>
          </div>
        )}

        {(result.searched || result.understood.length > 0) && !editing && (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (followUp.trim().length >= 2) onRun({ query: followUp.trim(), options: { previous: c } });
            }}
          >
            <label htmlFor="smart-followup" className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              {t('smart_followup')}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="smart-followup"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                maxLength={300}
                placeholder={String(t('smart_followup_ph', { inline: true }))}
                className="flex-1 min-w-0 h-11 rounded-xl border border-gold/50 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="submit"
                disabled={busy || followUp.trim().length < 2}
                className="h-11 px-5 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <span aria-hidden className="material-symbols-outlined text-[18px]">forum</span>
                {busy ? t('searching') : t('smart_followup_btn')}
              </button>
            </div>
          </form>
        )}
      </div>

      {hasHalls && (
        <>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {result.halls.map((h) => {
              const av = h.ai.availability;
              return (
                <HallCard
                  key={h.id}
                  hall={h}
                  date={av.verified ? av.date : undefined}
                  availability={av.verified && !multi ? 'available' : null}
                  checkedDates={av.verified && multi ? av.dates : undefined}
                  freeDates={av.verified && multi ? av.freeDates : undefined}
                  reasons={h.ai.reasons}
                  bestMatch={!!h.ai.bestMatch}
                  note={noteFor(h, (k, vars) => String(t(k, { inline: true, vars })))}
                />
              );
            })}
          </div>
          {result.halls.length < result.total && (
            <div className="flex justify-center mt-8">
              <button
                type="button"
                onClick={onMore}
                disabled={loadingMore}
                className="h-12 px-8 rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-colors disabled:opacity-60"
              >
                {loadingMore ? t('searching') : t('smart_load_more')}
              </button>
            </div>
          )}
        </>
      )}

      {!hasHalls && (
        <div className="max-w-2xl mx-auto text-center py-10">
          {result.searched && (
            <>
              <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-surface-container">
                <span aria-hidden className="material-symbols-outlined text-5xl text-primary">search_off</span>
              </span>
              <h3 className="font-serif text-2xl text-primary mt-3">{t('smart_no_match_title')}</h3>
              <p className="text-sm text-on-surface-variant mt-1">{t('smart_no_match_sub')}</p>
              {result.notes.length > 0 && (
                <ul className="mt-5 space-y-2 text-left">
                  {result.notes.map((n) => (
                    <li key={n} className="flex items-start gap-2 rounded-xl bg-error-container ring-1 ring-[#F0B8B2] text-on-error-container px-4 py-3 text-sm">
                      <span aria-hidden className="material-symbols-outlined text-[20px] mt-px">error</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {result.alternatives?.length > 0 && (
                <div className="mt-6 text-left">
                  <p className="text-sm font-bold text-primary mb-2">{t('smart_alternatives')}</p>
                  <ul className="space-y-2">
                    {result.alternatives.map((a) => (
                      <li key={a.code}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRun({ query: result.query, options: { criteria: a.criteria } })}
                          className="w-full flex items-center justify-between gap-3 rounded-xl bg-white ring-1 ring-gold/40 hover:ring-primary px-4 py-3 text-left text-sm transition-shadow disabled:opacity-60"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span aria-hidden className="material-symbols-outlined text-[20px] text-gold">lightbulb</span>
                            <span className="break-words">{a.label}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-primary-fixed text-primary text-xs font-bold px-2.5 py-1">
                            {t('smart_alt_count', { vars: { n: a.total.toLocaleString('en-IN') } })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={onTryDifferent}
              className="h-12 px-6 rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-colors"
            >
              {t('smart_try_diff')}
            </button>
            <button
              type="button"
              onClick={() => (result.understood.length ? setEditing(true) : onEdit())}
              className="h-12 px-6 rounded-xl bg-primary text-white font-bold inline-flex items-center justify-center gap-2 hover:opacity-90"
            >
              <span aria-hidden className="material-symbols-outlined text-[18px]">edit</span>
              {t('smart_edit_search')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The understood criteria as editable fields. Submitting searches exactly these values (validated by the server). */
function CriteriaEditor({ initial, cities, areasByCity, busy, onCancel, onSubmit }: {
  initial: AiCriteria;
  cities: string[];
  areasByCity: Record<string, string[]>;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (c: AiCriteria) => void;
}) {
  const { t } = useT();
  const [city, setCity] = useState(initial.city ?? '');
  const [area, setArea] = useState(initial.area ?? '');
  const [dates, setDates] = useState<string[]>(initial.dates ?? (initial.date ? [initial.date] : []));
  const [match, setMatch] = useState<DateMatch>(initial.match ?? 'any');
  const [guests, setGuests] = useState(initial.minCapacity != null ? String(initial.minCapacity) : '');
  const [budget, setBudget] = useState(initial.maxPrice != null ? String(initial.maxPrice) : '');
  const [ac, setAc] = useState(!!initial.hasAC);
  const [rooms, setRooms] = useState(!!initial.hasRooms);
  const [dining, setDining] = useState(!!initial.hasDining);
  const [cheap, setCheap] = useState(!!initial.cheapFirst);
  const [prefs, setPrefs] = useState<string[]>(initial.preferences ?? []);
  const areas = city ? areasByCity[city] ?? [] : [];
  const field = 'w-full h-11 rounded-xl border border-gold/50 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
  const lbl = 'block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1.5';

  function submit() {
    const g = Number(guests); const b = Number(budget);
    onSubmit({
      ...(city ? { city } : {}),
      ...(area ? { area } : {}),
      ...(dates.length ? { dates, ...(dates.length > 1 ? { match } : {}) } : {}),
      ...(guests && Number.isFinite(g) && g > 0 ? { minCapacity: Math.round(g) } : {}),
      ...(budget && Number.isFinite(b) && b >= 1000 ? { maxPrice: Math.round(b) } : {}),
      ...(initial.minPrice != null ? { minPrice: initial.minPrice } : {}),
      ...(ac ? { hasAC: true as const } : {}),
      ...(rooms ? { hasRooms: true as const } : {}),
      ...(dining ? { hasDining: true as const } : {}),
      ...(cheap ? { cheapFirst: true as const } : {}),
      preferences: prefs,
    });
  }

  return (
    <form
      className="mt-5 rounded-2xl ring-1 ring-gold/40 bg-surface-container-low p-4 md:p-5"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      aria-label={String(t('smart_edit_criteria', { inline: true }))}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ce-city" className={lbl}>{t('smart_r_city')}</label>
          <select id="ce-city" className={field} value={city} onChange={(e) => { setCity(e.target.value); setArea(''); }}>
            <option value="">{t('smart_any_city', { inline: true })}</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ce-area" className={lbl}>{t('smart_r_area')}</label>
          <select id="ce-area" className={field} value={area} onChange={(e) => setArea(e.target.value)} disabled={!areas.length}>
            <option value="">{t('smart_any_area', { inline: true })}</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ce-dates" className={lbl}>{t('dates_label')}</label>
          <MultiDatePicker id="ce-dates" value={dates} match={match} onChange={setDates} onMatch={setMatch} />
        </div>
        <div>
          <label htmlFor="ce-guests" className={lbl}>{t('smart_r_guests')}</label>
          <input id="ce-guests" className={field} type="number" inputMode="numeric" min={1} max={10000} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder={String(t('smart_guests_ph', { inline: true }))} />
        </div>
        <div>
          <label htmlFor="ce-budget" className={lbl}>{t('smart_r_budget')}</label>
          <input id="ce-budget" className={field} type="number" inputMode="numeric" min={1000} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={String(t('smart_budget_ph', { inline: true }))} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {([['ac_label', ac, setAc], ['rooms_label', rooms, setRooms], ['dining_label', dining, setDining], ['smart_cheap_first', cheap, setCheap]] as const).map(([k, v, set]) => (
          <label key={k} className="inline-flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} className="rounded border-gold/60 text-primary focus:ring-primary" />
            {t(k)}
          </label>
        ))}
      </div>
      {prefs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label={String(t('smart_r_prefs', { inline: true }))}>
          {prefs.map((p) => (
            <button key={p} type="button" onClick={() => setPrefs(prefs.filter((x) => x !== p))} className="inline-flex items-center gap-1 rounded-full bg-[#E3F4E8] text-[#166534] pl-2.5 pr-1.5 py-1 text-xs font-semibold">
              {p}
              <span aria-hidden className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="h-11 px-5 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-60 inline-flex items-center gap-2">
          <span aria-hidden className="material-symbols-outlined text-[18px]">search</span>
          {busy ? t('searching') : t('smart_apply_edit')}
        </button>
        <button type="button" onClick={onCancel} className="h-11 px-5 rounded-xl border border-gold/50 text-primary font-bold text-sm">
          {t('smart_cancel_edit')}
        </button>
      </div>
    </form>
  );
}

function Row({ icon, label, children }: { icon: string; label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-gold/20 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
      <span aria-hidden className="material-symbols-outlined text-primary text-[22px] mt-0.5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-on-surface-variant mb-0.5">{label}</dt>
        {children}
      </div>
    </div>
  );
}

function noteFor(h: AiSearchResponse['halls'][number], tr: (k: DictKey, vars?: Record<string, string | number>) => string): string | undefined {
  const lines: string[] = [];
  if (!h.ai.availability.verified) lines.push(tr('smart_not_checked'));
  for (const p of h.ai.preferences.confirmed) lines.push(tr('smart_pref_yes', { pref: p }));
  for (const p of h.ai.preferences.notListed) lines.push(tr('smart_pref_not_listed', { pref: p }));
  return lines.length ? lines.join(' · ') : undefined;
}
