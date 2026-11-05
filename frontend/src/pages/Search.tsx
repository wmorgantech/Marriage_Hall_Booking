import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type AiSearchOptions, type AiSearchResponse, type DateMatch, type Hall, type HallFilters } from '../api/client';
import type { SearchHallsQuery } from '../api/types';
import HallCard from '../components/HallCard';
import HeroScene from '../components/HeroScene';
import SmartResults from '../components/SmartResults';
import Combobox from '../components/Combobox';
import GlobalSearch from '../components/GlobalSearch';
import MultiDatePicker, { MAX_DATES } from '../components/MultiDatePicker';
import { fmtDay, isIsoDay, todayIso } from '../lib/dates';
import { useT } from '../i18n';
import { formatCity } from '../i18n/cityNames';

type CapacityBand = '1-200' | '201-500' | '501-1000' | '1001-1500' | '1500+' | '';
type SortKey = 'popularity' | 'price-asc' | 'capacity-desc';

const CAPACITY_BANDS: Record<Exclude<CapacityBand, ''>, { min?: number; max?: number }> = {
  '1-200': { max: 200 },
  '201-500': { min: 201, max: 500 },
  '501-1000': { min: 501, max: 1000 },
  '1001-1500': { min: 1001, max: 1500 },
  '1500+': { min: 1501 },
};
// Must match the label in AdminEditHall's amenities catalogue.
const VALET_AMENITY = 'Valet Parking';

const PAGE_SIZE = 12;
// Used only until /halls/filters reports the real price range.
const FALLBACK_PRICE_RANGE = { min: 50000, max: 500000 };

// Plain example queries — the same natural-language search as typing them by hand.
const SMART_EXAMPLES = ['Chennai-la 500 guests-ku AC hall venum', 'Madurai-la budget friendly hall', 'Coimbatore-la parking irukkura hall', 'Kovai-la December muhurtham 800 peru'];

/** ?dates=2026-12-12,2026-12-14&match=any -> only real, not-past days (max 10). */
function datesFromUrl(sp: URLSearchParams): { dates: string[]; match: DateMatch } {
  const today = todayIso();
  const dates = [...new Set((sp.get('dates') ?? '').split(',').map((s) => s.trim()).filter((d) => isIsoDay(d) && d >= today))].sort().slice(0, MAX_DATES);
  return { dates, match: sp.get('match') === 'any' ? 'any' : 'all' };
}

export default function Search() {
  const { t, en, lang } = useT();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<HallFilters | null>(null);
  const [city, setCity] = useState<string>(() => searchParams.get('city') ?? '');
  const [area, setArea] = useState<string>(() => searchParams.get('area') ?? '');
  const [q, setQ] = useState<string>(() => searchParams.get('q') ?? '');
  const [selDates, setSelDates] = useState<string[]>(() => datesFromUrl(searchParams).dates);
  const [dateMatch, setDateMatch] = useState<DateMatch>(() => datesFromUrl(searchParams).match);
  const [maxPrice, setMaxPrice] = useState<number | null>(null); // null = no price cap
  const [capacityBand, setCapacityBand] = useState<CapacityBand>('');
  const [hasAC, setHasAC] = useState<boolean>(false);
  const [hasRooms, setHasRooms] = useState<boolean>(false);
  const [hasDining, setHasDining] = useState<boolean>(false);
  const [valet, setValet] = useState<boolean>(false);

  // `applied` is what is actually filtering the results (changes only on Apply / chip removal / URL change).
  const [applied, setApplied] = useState<SearchHallsQuery>(() => {
    const d = datesFromUrl(searchParams);
    return {
      city: searchParams.get('city') || undefined,
      area: searchParams.get('area') || undefined,
      q: searchParams.get('q') || undefined,
      ...(d.dates.length ? { dates: d.dates, match: d.match } : {}),
    };
  });
  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('popularity');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [authTick, setAuthTick] = useState(0);
  // Smart (natural-language) search
  const [smartText, setSmartText] = useState('');
  const [smart, setSmart] = useState<AiSearchResponse | null>(null);
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartMore, setSmartMore] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  useEffect(() => {
    api.getHallFilters()
      .then(setOptions)
      .catch(() => setOptions({ cities: [], areasByCity: {} }));
  }, []);

  // Contact numbers are only returned to signed-in users — refetch when auth changes.
  useEffect(() => {
    const bump = () => setAuthTick((n) => n + 1);
    window.addEventListener('cnb:auth-changed', bump);
    return () => window.removeEventListener('cnb:auth-changed', bump);
  }, []);

  // Re-sync local state if URL params change (e.g. user clicks a different
  // suggestion in the header autocomplete while already on /).
  useEffect(() => {
    const nextCity = searchParams.get('city') ?? '';
    const nextArea = searchParams.get('area') ?? '';
    const nextQ = searchParams.get('q') ?? '';
    const d = datesFromUrl(searchParams);
    setCity(nextCity);
    setArea(nextArea);
    setQ(nextQ);
    setSelDates(d.dates);
    setDateMatch(d.match);
    setApplied((prev) => {
      const same = prev.city === (nextCity || undefined) && prev.area === (nextArea || undefined) && prev.q === (nextQ || undefined)
        && (prev.dates ?? []).join() === d.dates.join() && (d.dates.length < 2 || prev.match === d.match);
      if (same) return prev;
      const next: SearchHallsQuery = { ...prev, city: nextCity || undefined, area: nextArea || undefined, q: nextQ || undefined };
      delete next.dates; delete next.match;
      return d.dates.length ? { ...next, dates: d.dates, match: d.match } : next;
    });
    setPage(1);
  }, [searchParams]);

  // Fetch the current page from the server whenever the applied filters, sort or page change.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    api.searchHalls({ ...applied, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setHalls(res.halls);
        setTotal(res.total);
        setDrawerOpen(false);
      })
      .catch((err: unknown) => { if (!cancelled) setError((err as Error).message ?? 'Search failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applied, sort, page, authTick]);

  const priceRange = options?.priceRange && options.priceRange.max > 0
    ? {
        min: Math.floor(options.priceRange.min / 10000) * 10000,
        max: Math.ceil(options.priceRange.max / 10000) * 10000,
      }
    : FALLBACK_PRICE_RANGE;

  function buildQuery(): SearchHallsQuery {
    const band = capacityBand ? CAPACITY_BANDS[capacityBand] : undefined;
    return {
      city: city || undefined,
      area: area || undefined,
      q: q || undefined,
      ...(selDates.length ? { dates: selDates, match: dateMatch } : {}),
      hasRooms: hasRooms || undefined,
      hasAC: hasAC || undefined,
      hasDining: hasDining || undefined,
      amenities: valet ? [VALET_AMENITY] : undefined,
      maxPrice: maxPrice ?? undefined,
      minCapacity: band?.min,
      maxCapacity: band?.max,
    };
  }

  function applyFilters() {
    const next = buildQuery();
    setApplied(next);
    setPage(1);
    // Keep the shareable part of the search in the URL (refresh / back / shared links show the same results).
    const sp = new URLSearchParams(searchParams);
    const put = (k: string, v?: string) => { if (v) sp.set(k, v); else sp.delete(k); };
    put('city', next.city); put('area', next.area); put('q', next.q);
    put('dates', next.dates?.join(',')); put('match', next.dates && next.dates.length > 1 ? next.match : undefined);
    if (sp.toString() !== searchParams.toString()) setSearchParams(sp, { replace: true });
  }

  function clearAll() {
    setCity('');
    setArea('');
    setQ('');
    setSelDates([]);
    setDateMatch('all');
    setMaxPrice(null);
    setCapacityBand('');
    setHasAC(false);
    setHasRooms(false);
    setHasDining(false);
    setValet(false);
    setApplied({});
    setPage(1);
    setSearchParams({}, { replace: true });
  }

  const areasForCity = useMemo(() => {
    if (!options || !city) return [];
    return options.areasByCity[city] ?? [];
  }, [options, city]);

  // Shortcut chips: areas of the selected city, else of the first city that has areas (real data only)
  async function runSmartSearch(more = false, override?: string, opts?: AiSearchOptions) {
    const text = (more && smart ? smart.query : override ?? smartText).trim();
    if (!text || smartBusy || smartMore) return;
    if (more) setSmartMore(true); else setSmartBusy(true);
    setSmartError(null);
    try {
      // "More" re-runs the exact criteria of the current result, so the next page always matches the first.
      const res = await api.aiSearchHalls(text, more && smart ? { criteria: smart.criteria, offset: smart.halls.length } : opts);
      setSmart(more && smart ? { ...smart, halls: [...smart.halls, ...res.halls] } : res);
      if (!more) setTimeout(() => document.getElementById('smart-results')?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (e) {
      setSmartError((e as Error).message || en('smart_error'));
    } finally {
      setSmartBusy(false);
      setSmartMore(false);
    }
  }

  function editSmartQuery() {
    const el = document.getElementById('smart-search-input') as HTMLTextAreaElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(el.value.length, el.value.length);
  }

  function tryDifferentCriteria() {
    setSmart(null);
    setSmartError(null);
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('input[role=combobox]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 60);
  }

  const popularAreas = useMemo(() => {
    if (!options) return { city: '', areas: [] as string[] };
    const c = city || options.cities.find((x) => (options.areasByCity[x] ?? []).length > 0) || '';
    return { city: c, areas: (options.areasByCity[c] ?? []).slice(0, 10) };
  }, [options, city]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHalls = halls ?? [];

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    // Remove a non-URL filter: reset its control and drop it from what is applied.
    const drop = (fields: (keyof SearchHallsQuery)[], reset: () => void) => () => {
      reset();
      setApplied((prev) => {
        const next = { ...prev };
        for (const f of fields) delete next[f];
        return next;
      });
      setPage(1);
    };
    const dropParam = (names: string[], reset: () => void) => () => {
      reset();
      const next = new URLSearchParams(searchParams);
      for (const n of names) next.delete(n);
      setSearchParams(next, { replace: true });
    };
    if (applied.q) chips.push({ key: 'q', label: `“${applied.q}”`, onRemove: dropParam(['q'], () => setQ('')) });
    if (applied.city) chips.push({
      key: 'city',
      label: formatCity(applied.city, lang),
      onRemove: dropParam(['city', 'area'], () => { setCity(''); setArea(''); }),
    });
    if (applied.area) chips.push({ key: 'area', label: applied.area, onRemove: dropParam(['area'], () => setArea('')) });
    if (applied.dates?.length) {
      const list = applied.dates.map((d) => fmtDay(d, lang, applied.dates!.length === 1)).join(', ');
      const label = applied.dates.length === 1 ? list : `${list} · ${en(applied.match === 'any' ? 'dates_match_any' : 'dates_match_all')}`;
      chips.push({ key: 'date', label, onRemove: dropParam(['dates', 'match'], () => { setSelDates([]); setDateMatch('all'); }) });
    }
    if (applied.minCapacity != null || applied.maxCapacity != null) {
      const label =
        applied.minCapacity == null ? `Up to ${applied.maxCapacity} guests`
        : applied.maxCapacity == null ? `${applied.minCapacity.toLocaleString('en-IN')}+ guests`
        : `${applied.minCapacity.toLocaleString('en-IN')} – ${applied.maxCapacity.toLocaleString('en-IN')} guests`;
      chips.push({ key: 'cap', label, onRemove: drop(['minCapacity', 'maxCapacity'], () => setCapacityBand('')) });
    }
    if (applied.hasAC) chips.push({ key: 'ac', label: 'Centrally AC', onRemove: drop(['hasAC'], () => setHasAC(false)) });
    if (applied.hasDining) chips.push({ key: 'dining', label: 'Grand Dining', onRemove: drop(['hasDining'], () => setHasDining(false)) });
    if (applied.hasRooms) chips.push({ key: 'rooms', label: 'Guest Rooms', onRemove: drop(['hasRooms'], () => setHasRooms(false)) });
    if (applied.amenities?.includes(VALET_AMENITY)) {
      chips.push({ key: 'valet', label: 'Valet Parking', onRemove: drop(['amenities'], () => setValet(false)) });
    }
    if (applied.maxPrice != null) {
      chips.push({
        key: 'price',
        label: `Up to ₹${(applied.maxPrice / 1000).toFixed(0)}k`,
        onRemove: drop(['maxPrice'], () => setMaxPrice(null)),
      });
    }
    return chips;
  }, [applied, lang, searchParams, setSearchParams]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  function scrollToTop() {
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }

  const popularAreasPanel = popularAreas.areas.length > 0 && (
    <div className="p-5 rounded-2xl bg-surface-container-low ring-1 ring-gold/25">
      <h3 className="flex items-center gap-2 font-serif font-bold text-primary text-lg mb-3">
        <span className="material-symbols-outlined text-gold filled">location_on</span>
        {t('popular_areas')}
      </h3>
      <div className="flex flex-wrap gap-2">
        {popularAreas.areas.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => nav(`/?city=${encodeURIComponent(popularAreas.city)}&area=${encodeURIComponent(a)}`)}
            className={`px-3.5 py-2.5 sm:py-1.5 rounded-full border text-sm transition-colors ${
              applied.area === a && applied.city === popularAreas.city
                ? 'bg-primary text-white border-primary font-bold'
                : 'bg-white border-gold/40 text-on-surface hover:border-primary hover:text-primary'
            }`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );

  const filterBody = (
    <div className="space-y-6">
      {/* City */}
      <Combobox
        label={en('city_with_state')}
        placeholder={en('city_placeholder')}
        value={city}
        onChange={(v) => { setCity(v); setArea(''); }}
        options={options?.cities ?? []}
        emptyLabel={en('all_cities')}
        formatLabel={(c) => formatCity(c, lang)}
      />

      {/* Area */}
      {city && areasForCity.length > 0 && (
        <Combobox
          label={en('area_label')}
          placeholder={en('area_placeholder', { city })}
          value={area}
          onChange={setArea}
          options={areasForCity}
          emptyLabel={en('all_areas')}
        />
      )}

      {/* Price Range */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            {t('max_price')}
          </label>
          <span className="text-xs text-secondary font-bold">
            {maxPrice == null ? 'Any' : `₹${(maxPrice / 1000).toFixed(0)}k`}
          </span>
        </div>
        <input
          type="range"
          min={priceRange.min}
          max={priceRange.max}
          step={10000}
          value={maxPrice ?? priceRange.max}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMaxPrice(v >= priceRange.max ? null : v); // dragged to the end = no cap
          }}
          className="w-full accent-primary h-1 bg-surface-container-high rounded-full appearance-none cursor-pointer"
        />
      </div>

      {/* Capacity */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
          {t('guest_capacity')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['1-200', 'Up to 200'],
            ['201-500', '201 – 500'],
            ['501-1000', '501 – 1k'],
            ['1001-1500', '1k – 1.5k'],
            ['1500+', '1,500+'],
          ] as [CapacityBand, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCapacityBand(capacityBand === key ? '' : key)}
              className={`text-xs py-2 px-3 border rounded-lg transition-colors ${
                capacityBand === key
                  ? 'bg-primary-fixed text-primary border-primary font-bold'
                  : 'border-gold/40 hover:bg-secondary-container/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Elite Facilities */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">
          {t('elite_facilities')}
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 text-sm cursor-pointer group">
            <input
              type="checkbox"
              checked={hasAC}
              onChange={(e) => setHasAC(e.target.checked)}
              className="rounded border-gold/60 text-primary focus:ring-primary"
            />
            <span className="group-hover:text-primary transition-colors">{t('ac_label')}</span>
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer group">
            <input
              type="checkbox"
              checked={hasDining}
              onChange={(e) => setHasDining(e.target.checked)}
              className="rounded border-gold/60 text-primary focus:ring-primary"
            />
            <span className="group-hover:text-primary transition-colors">{t('dining_label')}</span>
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer group">
            <input
              type="checkbox"
              checked={hasRooms}
              onChange={(e) => setHasRooms(e.target.checked)}
              className="rounded border-gold/60 text-primary focus:ring-primary"
            />
            <span className="group-hover:text-primary transition-colors">{t('rooms_label')}</span>
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer group">
            <input
              type="checkbox"
              checked={valet}
              onChange={(e) => setValet(e.target.checked)}
              className="rounded border-gold/60 text-primary focus:ring-primary"
            />
            <span className="group-hover:text-primary transition-colors">{t('valet_label')}</span>
          </label>
        </div>
      </div>

      {/* Muhurtham Date */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
          {t('auspicious_date')}
        </label>
        <MultiDatePicker variant="line" value={selDates} match={dateMatch} onChange={setSelDates} onMatch={setDateMatch} />
      </div>

      <button
        type="button"
        onClick={applyFilters}
        disabled={loading}
        className="w-full bg-primary text-white py-4 rounded-xl font-bold tracking-widest text-xs shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-60"
      >
        {loading ? t('searching') : t('apply_filters')}
      </button>
      <button
        type="button"
        onClick={clearAll}
        className="w-full py-2 rounded-xl font-bold tracking-widest text-[11px] text-on-surface-variant hover:text-primary transition-colors"
      >
        {t('clear_all')}
      </button>
    </div>
  );

  return (
    <>
      {/* Hero — mobile first. Phones: the mandapam photo fills the hero, a deep-green scrim sits behind the white headline
          at the top, and the lower part of the photo stays clear. Desktop (lg+): headline on an ivory fade over the left. */}
      <section className="relative isolate overflow-hidden bg-primary-container pt-[7.5rem] sm:pt-32 lg:pt-36 pb-16 sm:pb-20 lg:pb-36 min-h-[640px] sm:min-h-[620px] lg:min-h-[600px] lg:bg-surface">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <HeroScene className="absolute inset-0 w-full h-full" />
          {/* readability: phones/tablets = green scrim behind the text; desktop = ivory fade over the text side */}
          <div className="absolute inset-0 lg:hidden bg-gradient-to-b from-[#032a1c]/90 from-10% via-[#032a1c]/55 via-45% to-transparent to-75%" />
          <div className="absolute inset-0 hidden lg:block bg-gradient-to-r from-surface from-[30%] via-surface/80 via-[44%] to-transparent to-[68%]" />
          <div className="absolute inset-x-0 bottom-0 h-24 hidden lg:block bg-gradient-to-t from-surface to-transparent" />
        </div>

        <div className="max-w-[1280px] mx-auto px-4 md:px-6">
          <div className="max-w-[34rem]">
            <p className="text-[10.5px] sm:text-xs font-bold uppercase tracking-[0.16em] sm:tracking-[0.2em] text-[#F1DDA8] lg:text-secondary mb-3 sm:mb-5">
              {t('hero_eyebrow')}
            </p>
            <h1 className="text-white lg:text-primary font-serif font-semibold tracking-tight leading-[1.08] text-balance text-[2.1rem] min-[400px]:text-[2.3rem] sm:text-5xl lg:text-[3.35rem] drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] lg:drop-shadow-none [&_.cnb-ta]:block [&_.cnb-ta]:mt-1.5 [&_.cnb-ta]:text-[0.55em] [&_.cnb-ta]:leading-snug">
              {t('hero_title')}
            </h1>
            <p className="font-serif text-[1.15rem] sm:text-xl md:text-[1.6rem] leading-snug text-[#F1DDA8] lg:text-primary-container mt-2 sm:mt-3 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)] lg:drop-shadow-none">{t('hero_tagline')}</p>
            <p className="text-white/90 lg:text-on-surface-variant text-[0.92rem] sm:text-base md:text-[1.05rem] leading-relaxed mt-3 sm:mt-5 max-w-[30rem] drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] lg:drop-shadow-none">
              {t('hero_subtitle')}
            </p>
            <div className="hidden sm:flex items-center gap-3 mt-6 max-w-[17rem]" aria-hidden>
              <span className="h-px flex-1 bg-gold/70" />
              <span className="material-symbols-outlined text-gold text-[22px] filled">spa</span>
              <span className="h-px flex-1 bg-gold/70" />
            </div>
          </div>
        </div>
      </section>

      {/* Search bar — overlaps the hero's bottom edge; every field is a 48px control with an icon label above */}
      <div className="relative z-20 -mt-24 lg:-mt-28 px-3 sm:px-4 md:px-6">
        <div className="max-w-[1280px] mx-auto bg-white rounded-3xl ring-1 ring-gold/40 shadow-soft-lg p-4 sm:p-5 md:p-7">
          <form
            onSubmit={(e) => { e.preventDefault(); void runSmartSearch(false); }}
            aria-label={en('smart_card_title')}
          >
            <div className="flex items-start gap-3 mb-3">
              <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-fixed">
                <span className="material-symbols-outlined text-primary text-[22px] filled">auto_awesome</span>
              </span>
              <div className="min-w-0">
                <label htmlFor="smart-search-input" className="block text-sm font-bold text-primary">{t('smart_card_title')}</label>
                <p className="text-xs text-on-surface-variant">e.g., Coimbatore-la December 12-ku 800 guests, parking, budget ₹2 lakh-kulla hall venum.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <textarea
                  id="smart-search-input"
                  value={smartText}
                  onChange={(e) => setSmartText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void runSmartSearch(false); } }}
                  maxLength={300}
                  rows={2}
                  placeholder={en('smart_placeholder')}
                  className="w-full resize-none rounded-xl border border-gold/50 bg-white pl-4 pr-10 pt-3 pb-7 text-sm font-medium text-on-surface placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                {smartText && (
                  <button
                    type="button"
                    onClick={() => { setSmartText(''); document.getElementById('smart-search-input')?.focus(); }}
                    aria-label={en('smart_clear')}
                    className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-primary"
                  >
                    <span aria-hidden className="material-symbols-outlined text-[20px] filled">cancel</span>
                  </button>
                )}
                <span className="pointer-events-none absolute bottom-1.5 right-3 text-[11px] text-on-surface-variant">{smartText.length}/300</span>
              </div>
              <button
                type="submit"
                disabled={smartBusy || smartText.trim().length < 2}
                className="h-12 sm:h-auto sm:min-w-[190px] px-6 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <span aria-hidden className="material-symbols-outlined text-[20px]">auto_awesome</span>
                {smartBusy ? t('searching') : t('smart_btn')}
              </button>
            </div>
            {smartError && <p role="alert" className="mt-2 text-sm text-error">{smartError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-on-surface-variant mr-1">{t('smart_examples')}</span>
              {SMART_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={smartBusy}
                  onClick={() => { setSmartText(ex); void runSmartSearch(false, ex); }}
                  className="rounded-full border border-gold/40 bg-white px-3.5 py-1.5 text-xs text-on-surface hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </form>

          <div className="flex items-center gap-4 my-5" aria-hidden>
            <span className="h-px flex-1 bg-gold/30" />
            <span className="text-[11px] font-bold tracking-widest text-on-surface-variant">{t('smart_or')}</span>
            <span className="h-px flex-1 bg-gold/30" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.35fr_1fr_auto] gap-4 md:gap-5 lg:gap-0 items-end">
            <div className="lg:pr-6">
              <Combobox
                variant="boxed"
                labelIcon="location_on"
                label={en('city_label')}
                placeholder={en('city_placeholder')}
                value={city}
                onChange={(v) => { setCity(v); setArea(''); }}
                options={options?.cities ?? []}
                emptyLabel={en('all_cities')}
                formatLabel={(c) => formatCity(c, lang)}
              />
            </div>

            <div className="lg:px-6 lg:border-l border-gold/30">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                <span aria-hidden className="material-symbols-outlined text-primary text-[18px] filled">search</span>
                {t('search_by')}
              </label>
              <GlobalSearch variant="inline" placeholder={en('search_placeholder')} />
            </div>

            <div className="lg:px-6 lg:border-l border-gold/30">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                <span aria-hidden className="material-symbols-outlined text-primary text-[18px] filled">calendar_month</span>
                {t('auspicious_date')}
              </label>
              <MultiDatePicker id="search-dates" value={selDates} match={dateMatch} onChange={setSelDates} onMatch={setDateMatch} />
            </div>

            <div className="md:col-span-2 lg:col-span-1 lg:pl-6 lg:border-l border-gold/30">
              <button
                type="button"
                onClick={() => {
                  applyFilters();
                  setTimeout(
                    () => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }),
                    120,
                  );
                }}
                disabled={loading}
                className="w-full lg:w-auto h-12 px-9 rounded-xl bg-primary text-white font-bold tracking-wide text-sm shadow-lg shadow-primary/30 ring-2 ring-gold/70 ring-offset-2 ring-offset-white hover:bg-primary-container active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">search</span>
                {loading ? t('searching') : t('find_halls')}
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>

          <div className="mt-4 sm:mt-5 pt-4 border-t border-gold/20 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mr-1">
                {t('guest_capacity')}
              </span>
              {([
                ['1-200', 'Up to 200'],
                ['201-500', '201 – 500'],
                ['501-1000', '501 – 1k'],
                ['1001-1500', '1k – 1.5k'],
                ['1500+', '1,500+'],
              ] as [CapacityBand, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCapacityBand(capacityBand === key ? '' : key)}
                  className={`text-xs h-10 sm:h-8 px-4 sm:px-3.5 border rounded-full transition-colors ${
                    capacityBand === key
                      ? 'bg-primary text-white border-primary font-bold'
                      : 'border-gold/40 text-on-surface hover:bg-secondary-container/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Suggestions come from the cities that actually have halls */}
            {(options?.cities.length ?? 0) > 0 && (
              <p className="text-on-surface-variant text-xs">
                {t('search_try')}{' '}
                {options!.cities.slice(0, 3).map((c, i) => (
                  <span key={c}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      onClick={() => nav(`/?city=${encodeURIComponent(c)}`)}
                      className="underline hover:text-primary inline-block py-3 -my-3"
                    >
                      {formatCity(c, lang)}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>

      {smart && (
        <SmartResults
          result={smart}
          onClear={() => { setSmart(null); setSmartError(null); }}
          onEdit={editSmartQuery}
          onTryDifferent={tryDifferentCriteria}
          cities={options?.cities ?? []}
          areasByCity={options?.areasByCity ?? {}}
          busy={smartBusy}
          onRun={(opts) => void runSmartSearch(false, opts.query, opts.options)}
          onMore={() => void runSmartSearch(true)}
          loadingMore={smartMore}
        />
      )}

      {/* Why CheckNBook — only things the app really does */}
      <section className="max-w-[1280px] mx-auto px-4 md:px-6 pt-12">
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-7 lg:divide-x divide-gold/30">
          {([
            ['event_available', 'benefit_availability', 'benefit_availability_d'],
            ['verified_user', 'benefit_verified', 'benefit_verified_d'],
            ['auto_awesome', 'benefit_muhurtham', 'benefit_muhurtham_d'],
            ['support_agent', 'benefit_support', 'benefit_support_d'],
          ] as const).map(([icon, title, desc]) => (
            <li key={title} className="flex items-start gap-4 lg:px-7 lg:first:pl-0 lg:last:pr-0">
              <span className="shrink-0 w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[26px]">{icon}</span>
              </span>
              <span>
                <span className="block font-serif font-semibold text-on-surface text-base leading-tight">{t(title)}</span>
                <span className="block text-sm text-on-surface-variant mt-1 leading-snug">{t(desc)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative max-w-[1280px] mx-auto px-4 md:px-6 pt-16">
        {/* decorative corner ornaments, clipped to the viewport width so they can never cause horizontal scroll */}
        <div className="hidden xl:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-screen overflow-hidden pointer-events-none" aria-hidden>
          <LotusOrnament className="absolute -left-24 top-8 w-56 h-56 text-gold opacity-[0.16]" />
          <LotusOrnament className="absolute -right-24 bottom-28 w-56 h-56 text-gold opacity-[0.16]" />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-3 mb-7 scroll-mt-28">
          <div>
            <div className="flex items-center gap-2 text-gold mb-2" aria-hidden>
              <span className="h-px w-8 bg-gold/70" />
              <span className="material-symbols-outlined text-[20px] filled">spa</span>
              <span className="h-px w-8 bg-gold/70" />
            </div>
            <h2 className="font-serif text-3xl md:text-[2.1rem] font-semibold text-primary">{t('popular_halls')}</h2>
            <p className="text-on-surface-variant text-sm md:text-base mt-1">{t('popular_halls_sub')}</p>
          </div>
          <button
            type="button"
            onClick={() => { clearAll(); document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }); }}
            className="inline-flex items-center gap-1.5 py-2.5 -my-2.5 text-sm font-bold text-primary hover:text-primary-container underline-offset-4 hover:underline"
          >
            {t('view_all_halls')}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      <div className="relative flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col gap-5 w-72 shrink-0 self-start sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {popularAreasPanel}
          <div className="p-6 bg-white rounded-2xl ring-1 ring-gold/25 shadow-soft">
            <div className="mb-6">
              <h2 className="text-primary font-serif font-bold text-xl">{t('refine_title')}</h2>
              <p className="text-slate-500 text-sm font-serif italic">{t('refine_subtitle')}</p>
            </div>
            {filterBody}
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-x-clip pb-20 lg:pb-12" id="results">
          {/* Listing Controls */}
          <div className="sticky top-[104px] lg:top-28 z-30 bg-white/95 backdrop-blur-md rounded-xl ring-1 ring-gold/25 shadow-soft">
            <div className="px-4 md:px-5 py-4 flex flex-wrap items-center justify-between gap-4">
              {/* Left: count + active filter chips */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
                <h2 className="flex items-baseline gap-2 shrink-0">
                  <span className="text-2xl md:text-h3 font-serif font-bold text-primary leading-none tabular-nums">
                    {total.toLocaleString('en-IN')}
                  </span>
                  <span className="text-on-surface-variant text-sm font-medium">
                    {city ? t('halls_in_city', { vars: { city: formatCity(city, lang) } }) : t('premium_venues')}
                  </span>
                </h2>

                {activeChips.length > 0 && (
                  <>
                    <span className="hidden md:inline-block w-px h-5 bg-gold/30" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      {activeChips.map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={chip.onRemove}
                          className="group flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-secondary-container/50 hover:bg-secondary-container text-xs font-bold text-on-secondary-container transition-colors"
                        >
                          <span className="truncate max-w-[140px]">{chip.label}</span>
                          <span className="material-symbols-outlined text-[14px] text-on-secondary-container/60 group-hover:text-primary">
                            close
                          </span>
                        </button>
                      ))}
                      {activeChips.length > 1 && (
                        <button
                          type="button"
                          onClick={clearAll}
                          className="text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-primary transition-colors"
                        >
                          {t('clear_all')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Right: filter + sort */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gold/40 text-primary font-bold text-xs uppercase tracking-widest shadow-sm"
                >
                  <span className="material-symbols-outlined text-base">tune</span>
                  {t('filters')}
                </button>

                <label className="flex items-center gap-1.5 min-h-[44px] bg-surface-container/70 hover:bg-surface-container pl-3 pr-2 py-2 rounded-full transition-colors cursor-pointer">
                  <span
                    className="material-symbols-outlined text-base text-slate-500"
                    aria-hidden
                  >
                    sort
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {t('sort')}
                  </span>
                  <select
                    value={sort}
                    onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}
                    aria-label="Sort halls"
                    className="bg-transparent border-none text-sm font-bold text-primary focus:ring-0 cursor-pointer pr-1"
                  >
                    <option value="popularity">Popularity</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="capacity-desc">Guest Capacity</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div className="my-4 px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="lg:hidden mt-6">{popularAreasPanel}</div>

          {/* Grid */}
          <section className="pt-6 pb-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-gutter">
            {loading && pageHalls.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-soft border-t-2 border-gold/30 overflow-hidden animate-pulse">
                  <div className="h-60 bg-surface-container" />
                  <div className="p-6 space-y-3">
                    <div className="h-5 bg-surface-container rounded w-3/4" />
                    <div className="h-4 bg-surface-container rounded w-1/2" />
                    <div className="h-10 bg-surface-container rounded mt-4" />
                  </div>
                </div>
              ))
            ) : pageHalls.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <span className="material-symbols-outlined text-6xl text-gold/60 mb-4">search_off</span>
                <h3 className="font-serif text-h3 text-primary mb-2">{t('no_halls_match')}</h3>
                <p className="text-on-surface-variant">{t('no_halls_help')}</p>
              </div>
            ) : (
              pageHalls.map((h) => (
                <HallCard
                  key={h.id}
                  hall={h}
                  date={applied.dates?.[0]}
                  // The API already excludes halls booked (or held by a booking) on the chosen date, so
                  // "Available" is only a true statement when a date was searched.
                  availability={applied.dates?.length === 1 ? 'available' : null}
                  checkedDates={h.checkedDates}
                  freeDates={h.freeDates}
                />
              ))
            )}
          </section>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="py-10 flex justify-center">
              <nav className="flex items-center gap-2" aria-label="Pagination">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => { setPage((p) => Math.max(1, p - 1)); scrollToTop(); }}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-gold/40 text-secondary-fixed-dim hover:bg-secondary-container/40 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                {pagesToShow(page, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`dots-${i}`} className="px-2 text-slate-400">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setPage(p as number); scrollToTop(); }}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold ${
                        p === page
                          ? 'bg-primary text-white'
                          : 'border border-gold/40 text-secondary-fixed-dim hover:bg-secondary-container/40'
                      }`}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); scrollToTop(); }}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-gold/40 text-secondary-fixed-dim hover:bg-secondary-container/40 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </nav>
            </div>
          )}
        </main>
      </div>
      </section>

      {/* Explore by city — real cities and area counts from /halls/filters */}
      {(options?.cities.length ?? 0) > 0 && (
        <section className="max-w-[1280px] mx-auto px-4 md:px-6 pt-4 pb-6">
          <div className="mb-6">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-primary">{t('explore_cities')}</h2>
            <p className="text-on-surface-variant text-sm md:text-base mt-1">{t('explore_cities_sub')}</p>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {options!.cities.slice(0, 10).map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => { nav(`/?city=${encodeURIComponent(c)}`); document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="group w-full h-full text-left rounded-xl bg-white ring-1 ring-gold/30 hover:ring-primary hover:shadow-soft p-4 transition-all"
                >
                  <span className="flex items-start gap-2 text-primary">
                    <span className="material-symbols-outlined text-[20px] text-gold filled">location_on</span>
                    <span className="min-w-0 break-words font-serif font-semibold text-base text-on-surface group-hover:text-primary">{formatCity(c, lang)}</span>
                  </span>
                  <span className="block text-xs text-on-surface-variant mt-1.5 pl-7 break-words">
                    {t('areas_count', { vars: { n: (options!.areasByCity[c] ?? []).length } })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filters">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85%] bg-white shadow-2xl overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-primary font-serif font-bold text-xl">Refine</h2>
                <p className="text-slate-500 text-xs font-serif italic">Find your sacred space</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="p-2 text-primary rounded-full hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {filterBody}
          </div>
        </div>
      )}
    </>
  );
}

function pagesToShow(current: number, total: number): (number | '…')[] {
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

/** Faint line-art lotus used as a quiet corner ornament (decorative only). */
function LotusOrnament({ className = '' }: { className?: string }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className={className} viewBox="-100 -100 200 200" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden focusable="false">
      {petals.map((a) => <path key={a} transform={`rotate(${a})`} d="M0 -22 C 14 -44 14 -70 0 -92 C -14 -70 -14 -44 0 -22Z" />)}
      {petals.map((a) => <path key={`i${a}`} transform={`rotate(${a + 15})`} d="M0 -14 C 8 -28 8 -44 0 -58 C -8 -44 -8 -28 0 -14Z" />)}
      <circle r="10" /><circle r="98" strokeDasharray="2 6" />
    </svg>
  );
}
