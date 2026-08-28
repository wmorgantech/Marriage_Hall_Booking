import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Hall, type HallFilters } from '../api/client';
import HallCard from '../components/HallCard';
import Combobox from '../components/Combobox';
import GlobalSearch from '../components/GlobalSearch';
import { useT } from '../i18n';
import { formatCity } from '../i18n/cityNames';

const TAMIL_NADU_CITIES = [
  'Chennai',
  'Coimbatore',
  'Madurai',
  'Tiruchirappalli',
  'Salem',
  'Tirunelveli',
  'Erode',
  'Vellore',
  'Thanjavur',
  'Dindigul',
];

type CapacityBand = '100-300' | '300-1000' | '1000+' | '';
type SortKey = 'popularity' | 'price-asc' | 'capacity-desc';

const PAGE_SIZE = 12;

const HERO_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCzCGbp6C-tjf98MFUCt_o7hc8Upibuc4mC6PGMmZrvsf_zgKic6LtNjlKcoEQMDvunvJ42fhIzGXOj05R66-uuOJgjF69z46SLQzK9LzH4JGm-CufT9nosjfrUj5Sog3N0p7501EkVgTmFJXqBSW6XBaGxLd3nvoHiqUloxrUIykIl3AwHtN0VZN6fEuWh34btqFjCgy7VIDPRDTja-Zlt2i3hin1psEnkYp97nDt8HCMaRYHefIM9O1GFJKLnSzBywKHwaxADpQ';

export default function Search() {
  const { t, en, lang } = useT();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<HallFilters | null>(null);
  const [city, setCity] = useState<string>(() => searchParams.get('city') ?? '');
  const [area, setArea] = useState<string>(() => searchParams.get('area') ?? '');
  const [q, setQ] = useState<string>(() => searchParams.get('q') ?? '');
  const [muhurthamDate, setMuhurthamDate] = useState<string>('');
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(500000);
  const [capacityBand, setCapacityBand] = useState<CapacityBand>('');
  const [hasAC, setHasAC] = useState<boolean>(true);
  const [hasRooms, setHasRooms] = useState<boolean>(false);
  const [hasDining, setHasDining] = useState<boolean>(false);
  const [valet, setValet] = useState<boolean>(true);

  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('popularity');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.getHallFilters()
      .then(setOptions)
      .catch(() => setOptions({ cities: [], areasByCity: {} }));
  }, []);

  // Re-sync local state if URL params change (e.g. user clicks a different
  // suggestion in the header autocomplete while already on /).
  useEffect(() => {
    const nextCity = searchParams.get('city') ?? '';
    const nextArea = searchParams.get('area') ?? '';
    const nextQ = searchParams.get('q') ?? '';
    setCity(nextCity);
    setArea(nextArea);
    setQ(nextQ);
    runSearch({ city: nextCity, area: nextArea, q: nextQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function runSearch(override?: { city?: string; area?: string; q?: string }) {
    setError(null);
    setLoading(true);
    const cityV = override?.city ?? city;
    const areaV = override?.area ?? area;
    const qV = override?.q ?? q;
    try {
      const result = await api.searchHalls({
        city: cityV || undefined,
        area: areaV || undefined,
        q: qV || undefined,
        fromDate: muhurthamDate || undefined,
        toDate: muhurthamDate || undefined,
        hasRooms: hasRooms || undefined,
        hasAC: hasAC || undefined,
        minPrice: minPrice > 0 ? minPrice : undefined,
        maxPrice: maxPrice < 500000 ? maxPrice : undefined,
      });
      setHalls(result);
      setPage(1);
      setDrawerOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setCity('');
    setArea('');
    setMuhurthamDate('');
    setMinPrice(0);
    setMaxPrice(500000);
    setCapacityBand('');
    setHasAC(false);
    setHasRooms(false);
    setHasDining(false);
    setValet(false);
  }

  const areasForCity = useMemo(() => {
    if (!options || !city) return [];
    return options.areasByCity[city] ?? [];
  }, [options, city]);

  const filteredHalls = useMemo(() => {
    if (!halls) return [];
    let rows = halls.slice();
    if (capacityBand === '100-300') rows = rows.filter((h) => h.capacity >= 100 && h.capacity < 300);
    else if (capacityBand === '300-1000') rows = rows.filter((h) => h.capacity >= 300 && h.capacity < 1000);
    else if (capacityBand === '1000+') rows = rows.filter((h) => h.capacity >= 1000);

    switch (sort) {
      case 'price-asc':
        rows.sort((a, b) => a.price - b.price);
        break;
      case 'capacity-desc':
        rows.sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
        break;
      default:
        // Keep API order (most recent / popularity)
        break;
    }
    return rows;
  }, [halls, capacityBand, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredHalls.length / PAGE_SIZE));
  const pageHalls = filteredHalls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (q) chips.push({
      key: 'q',
      label: `“${q}”`,
      onRemove: () => {
        setQ('');
        const next = new URLSearchParams(searchParams);
        next.delete('q');
        setSearchParams(next, { replace: true });
      },
    });
    if (city) chips.push({
      key: 'city',
      label: formatCity(city, lang),
      onRemove: () => {
        setCity(''); setArea('');
        const next = new URLSearchParams(searchParams);
        next.delete('city'); next.delete('area');
        setSearchParams(next, { replace: true });
      },
    });
    if (area) chips.push({
      key: 'area',
      label: area,
      onRemove: () => {
        setArea('');
        const next = new URLSearchParams(searchParams);
        next.delete('area');
        setSearchParams(next, { replace: true });
      },
    });
    if (muhurthamDate) {
      const d = new Date(muhurthamDate);
      const label = isNaN(d.getTime())
        ? muhurthamDate
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      chips.push({ key: 'date', label, onRemove: () => setMuhurthamDate('') });
    }
    if (capacityBand) {
      const labels: Record<Exclude<CapacityBand, ''>, string> = {
        '100-300': '100 – 300 guests',
        '300-1000': '300 – 1000 guests',
        '1000+': '1000+ guests',
      };
      chips.push({ key: 'cap', label: labels[capacityBand], onRemove: () => setCapacityBand('') });
    }
    if (hasAC) chips.push({ key: 'ac', label: 'Centrally AC', onRemove: () => setHasAC(false) });
    if (hasDining) chips.push({ key: 'dining', label: 'Grand Dining', onRemove: () => setHasDining(false) });
    if (hasRooms) chips.push({ key: 'rooms', label: 'Guest Rooms', onRemove: () => setHasRooms(false) });
    if (valet) chips.push({ key: 'valet', label: 'Valet Parking', onRemove: () => setValet(false) });
    if (maxPrice < 500000) {
      chips.push({
        key: 'price',
        label: `Up to ₹${(maxPrice / 1000).toFixed(0)}k`,
        onRemove: () => setMaxPrice(500000),
      });
    }
    return chips;
  }, [city, area, muhurthamDate, capacityBand, hasAC, hasDining, hasRooms, valet, maxPrice, lang, q, searchParams, setSearchParams]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  function scrollToTop() {
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }

  const filterBody = (
    <div className="space-y-6">
      {/* City */}
      <Combobox
        label={en('city_with_state')}
        placeholder={en('city_placeholder')}
        value={city}
        onChange={(v) => { setCity(v); setArea(''); }}
        options={TAMIL_NADU_CITIES}
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
            ₹{(maxPrice / 1000).toFixed(0)}k
          </span>
        </div>
        <input
          type="range"
          min={50000}
          max={500000}
          step={10000}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
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
            ['100-300', 'cap_100_300'],
            ['300-1000', 'cap_300_1000'],
          ] as [CapacityBand, 'cap_100_300' | 'cap_300_1000'][]).map(([key, k]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCapacityBand(capacityBand === key ? '' : key)}
              className={`text-xs py-2 px-3 border rounded-lg transition-colors ${
                capacityBand === key
                  ? 'bg-red-50 text-primary border-primary-container font-bold'
                  : 'border-gold/40 hover:bg-secondary-container/40'
              }`}
            >
              {t(k)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCapacityBand(capacityBand === '1000+' ? '' : '1000+')}
            className={`text-xs py-2 px-3 border rounded-lg transition-colors col-span-2 ${
              capacityBand === '1000+'
                ? 'bg-red-50 text-primary border-primary-container font-bold'
                : 'border-gold/40 hover:bg-secondary-container/40'
            }`}
          >
            {t('cap_1000_guests')}
          </button>
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
        <div className="relative">
          <input
            type="date"
            value={muhurthamDate}
            onChange={(e) => setMuhurthamDate(e.target.value)}
            className="w-full border-b border-gold/40 bg-transparent py-2 pr-8 focus:ring-0 focus:border-primary text-sm"
          />
          <span className="material-symbols-outlined absolute right-0 top-2 text-secondary-fixed-dim pointer-events-none">
            event_available
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => runSearch()}
        disabled={loading}
        className="w-full bg-primary text-white py-4 rounded-xl font-bold tracking-widest text-xs shadow-lg shadow-red-900/20 active:scale-95 transition-all disabled:opacity-60"
      >
        {loading ? t('searching') : t('apply_filters')}
      </button>
      <button
        type="button"
        onClick={() => { clearAll(); setTimeout(runSearch, 0); }}
        className="w-full py-2 rounded-xl font-bold tracking-widest text-[11px] text-on-surface-variant hover:text-primary transition-colors"
      >
        {t('clear_all')}
      </button>
    </div>
  );

  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[clamp(560px,70vh,680px)] w-full overflow-hidden -mt-20">
        <img
          alt="Grand South Indian Wedding Hall"
          className="absolute inset-0 w-full h-full object-cover"
          src={HERO_IMG}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
        <div className="relative z-10 h-full flex items-start">
          <div className="w-full max-w-[1440px] mx-auto px-4 md:px-6 pt-[14rem] pb-10 md:pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end lg:items-center">
              <div className="lg:col-span-7 max-w-3xl">
                <h1 className="text-white font-serif text-3xl md:text-h1 md:leading-[1.15] font-bold mb-4 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                  {t('hero_title')}
                </h1>
                <p className="text-white/90 text-body-md md:text-body-lg font-sans mb-6 max-w-xl">
                  {t('hero_subtitle')}
                </p>

                {/* Big prominent unified search */}
                <div className="relative z-20 max-w-2xl mb-5">
                  <GlobalSearch
                    variant="inline"
                    placeholder={en('search_placeholder')}
                  />
                  <p className="text-white/80 text-xs mt-2 ml-4 drop-shadow">
                    {t('search_try')}{' '}
                    <button
                      type="button"
                      onClick={() => nav('/?q=Saraswathi')}
                      className="underline hover:text-white"
                    >
                      Saraswathi
                    </button>
                    ,{' '}
                    <button
                      type="button"
                      onClick={() => nav('/?city=Coimbatore')}
                      className="underline hover:text-white"
                    >
                      Coimbatore
                    </button>{' '}
                    /{' '}
                    <button
                      type="button"
                      onClick={() => nav('/?q=RS+Puram')}
                      className="underline hover:text-white"
                    >
                      RS Puram
                    </button>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-secondary-container text-on-secondary-container px-8 py-4 rounded-full font-bold tracking-wider text-sm hover:bg-secondary-fixed-dim transition-all"
                >
                  {t('hero_cta')}
                </button>
              </div>

              {/* Quick Search panel */}
              <div className="hidden lg:block lg:col-span-5">
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-soft-lg ring-1 ring-yellow-600/40 p-6 xl:p-7">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="material-symbols-outlined text-primary">manage_search</span>
                    <h2 className="font-serif font-bold text-primary text-lg">{t('quick_search')}</h2>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('mandapams')}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <Combobox
                      label={en('city_label')}
                      placeholder={en('city_placeholder')}
                      value={city}
                      onChange={(v) => { setCity(v); setArea(''); }}
                      options={TAMIL_NADU_CITIES}
                      emptyLabel={en('all_cities')}
                      formatLabel={(c) => formatCity(c, lang)}
                    />

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                        {t('auspicious_date')}
                      </label>
                      <div className="relative">
                        <span
                          className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none"
                          aria-hidden
                        >
                          event
                        </span>
                        <input
                          type="date"
                          value={muhurthamDate}
                          onChange={(e) => setMuhurthamDate(e.target.value)}
                          className="w-full border-b border-gold/40 bg-transparent pl-7 py-2 focus:outline-none focus:ring-0 focus:border-primary text-sm font-medium text-on-surface"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                        {t('guest_capacity')}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ['100-300', 'cap_up_to_300'],
                          ['300-1000', 'cap_300_1k'],
                          ['1000+', 'cap_1000_plus'],
                        ] as [CapacityBand, 'cap_up_to_300' | 'cap_300_1k' | 'cap_1000_plus'][]).map(([key, k]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCapacityBand(capacityBand === key ? '' : key)}
                            className={`text-xs py-2 px-2 border rounded-lg transition-colors ${
                              capacityBand === key
                                ? 'bg-red-50 text-primary border-primary-container font-bold'
                                : 'border-gold/40 text-on-surface hover:bg-secondary-container/40'
                            }`}
                          >
                            {t(k)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        runSearch();
                        setTimeout(
                          () => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }),
                          120,
                        );
                      }}
                      disabled={loading}
                      className="w-full bg-primary text-white py-3.5 rounded-xl font-bold tracking-widest text-xs shadow-lg shadow-red-900/30 hover:bg-primary-container active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">search</span>
                      {loading ? t('searching') : t('find_halls')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col py-8 px-6 h-[calc(100vh-5rem)] w-80 sticky top-20 bg-white border-r border-yellow-600/20 shadow-[10px_0_30px_rgba(0,0,0,0.02)] overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-primary font-serif font-bold text-xl">{t('refine_title')}</h2>
            <p className="text-slate-500 text-sm font-serif italic">{t('refine_subtitle')}</p>
          </div>
          {filterBody}
        </aside>

        <main className="flex-1 overflow-x-hidden pb-20 lg:pb-12" id="results">
          {/* Listing Controls */}
          <div className="sticky top-[72px] lg:top-20 z-30 bg-white/95 backdrop-blur-md border-b border-yellow-600/20 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="px-6 md:px-card-padding py-5 lg:py-6 flex flex-wrap items-center justify-between gap-4">
              {/* Left: count + active filter chips */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
                <h2 className="flex items-baseline gap-2 shrink-0">
                  <span className="text-2xl md:text-h3 font-serif font-bold text-primary leading-none tabular-nums">
                    {filteredHalls.length}
                  </span>
                  <span className="text-on-surface-variant text-sm font-medium">
                    {city ? t('halls_in_city', { vars: { city: formatCity(city, lang) } }) : t('premium_venues')}
                  </span>
                </h2>

                {activeChips.length > 0 && (
                  <>
                    <span className="hidden md:inline-block w-px h-5 bg-yellow-600/30" aria-hidden />
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
                          onClick={() => { clearAll(); setTimeout(runSearch, 0); }}
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

                <label className="flex items-center gap-1.5 bg-surface-container/70 hover:bg-surface-container pl-3 pr-2 py-2 rounded-full transition-colors cursor-pointer">
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
                    onChange={(e) => setSort(e.target.value as SortKey)}
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
            <div className="mx-6 md:mx-card-padding my-4 px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Grid */}
          <section className="px-6 md:px-card-padding pt-6 pb-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-gutter">
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
                  date={muhurthamDate || undefined}
                  availability="available"
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
