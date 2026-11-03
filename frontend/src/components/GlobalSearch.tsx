import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Hall } from '../api/client';
import HallPhoto from './HallPhoto';
import { useT } from '../i18n';
import { formatCity } from '../i18n/cityNames';

type SuggestionKind = 'hall' | 'area' | 'city';
type Suggestion =
  | { kind: 'hall'; id: string; path?: string; label: string; sub: string; imageUrl?: string | null }
  | { kind: 'area'; label: string; sub: string; city: string; area: string }
  | { kind: 'city'; label: string; sub: string; city: string };

const RECENT_KEY = 'cnb_recent_searches';
const RECENT_MAX = 5;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

function saveRecent(q: string) {
  if (!q.trim()) return;
  const prev = loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
  const next = [q, ...prev].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function highlight(text: string, query: string) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-secondary-container/70 text-primary rounded px-0.5">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

type Props = {
  variant?: 'header' | 'inline';
  placeholder?: string;
  className?: string;
};

export default function GlobalSearch({
  variant = 'header',
  placeholder = 'Search hall, area or city…',
  className = '',
}: Props) {
  const { lang } = useT();
  const id = useId();
  const listboxId = `${id}-listbox`;
  const nav = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hallSugs, setHallSugs] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight_, setHighlight] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());

  // Debounced fetch
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHallSugs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .suggestHalls(q, 8)
        .then((rows) => setHallSugs(rows))
        .catch(() => setHallSugs([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // Build grouped suggestions
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const halls: Suggestion[] = hallSugs.map((h) => ({
      kind: 'hall',
      id: h.id,
      path: h.path,
      label: h.name,
      sub: h.area ? `${h.area}, ${formatCity(h.city, lang)}` : formatCity(h.city, lang),
      imageUrl: h.imageUrl,
    }));

    // Derive unique area + city suggestions from the fetched halls
    const areaSet = new Map<string, { city: string; area: string }>();
    const citySet = new Map<string, true>();
    for (const h of hallSugs) {
      const cityHaystack = `${h.city.toLowerCase()} ${formatCity(h.city, lang).toLowerCase()}`;
      if (cityHaystack.includes(q)) citySet.set(h.city, true);
      if (h.area && (h.area.toLowerCase().includes(q) || cityHaystack.includes(q))) {
        areaSet.set(`${h.area}|${h.city}`, { city: h.city, area: h.area });
      }
    }

    const cities: Suggestion[] = Array.from(citySet.keys()).slice(0, 3).map((c) => ({
      kind: 'city',
      label: formatCity(c, lang),
      sub: 'City',
      city: c,
    }));
    const areas: Suggestion[] = Array.from(areaSet.values()).slice(0, 3).map(({ city, area }) => ({
      kind: 'area',
      label: area,
      sub: `Area in ${formatCity(city, lang)}`,
      city,
      area,
    }));

    return [...halls, ...areas, ...cities];
  }, [hallSugs, query, lang]);

  // Reset highlight when results change
  useEffect(() => { setHighlight(0); }, [suggestions.length]);

  // Click outside closes the dropdown
  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, []);

  function commit(s: Suggestion) {
    saveRecent(query);
    setRecent(loadRecent());
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();

    if (s.kind === 'hall') {
      nav(s.path ?? `/halls/${encodeURIComponent(s.id)}`);
    } else if (s.kind === 'area') {
      nav(`/?city=${encodeURIComponent(s.city)}&area=${encodeURIComponent(s.area)}`);
    } else {
      nav(`/?city=${encodeURIComponent(s.city)}`);
    }
  }

  function commitFreeText() {
    const q = query.trim();
    if (!q) return;
    saveRecent(q);
    setRecent(loadRecent());
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    nav(`/?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlight_]) commit(suggestions[highlight_]);
      else commitFreeText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const isHeader = variant === 'header';
  const inputClass = isHeader
    ? 'w-full pl-10 pr-10 py-2 bg-surface-container-low border-none rounded-full text-sm focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all'
    : 'w-full h-12 pl-10 pr-10 bg-white border border-gold/50 rounded-xl text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <span
        className={`material-symbols-outlined absolute ${
          isHeader ? 'left-3 text-slate-400' : 'left-3.5 text-primary'
        } top-1/2 -translate-y-1/2 pointer-events-none`}
        aria-hidden
      >
        search
      </span>
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && suggestions[highlight_] ? `${id}-opt-${highlight_}` : undefined
        }
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        className={inputClass}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { setQuery(''); inputRef.current?.focus(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary rounded-full"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className={`absolute z-50 mt-2 ${
            isHeader ? 'right-0 w-[24rem] max-w-[80vw]' : 'left-0 right-0'
          } bg-white rounded-2xl shadow-soft-lg ring-1 ring-gold/20 overflow-hidden`}
          style={{ animation: 'cnb-fade-in 140ms ease-out' }}
        >
          {/* Empty state — show recent searches */}
          {!query.trim() && (
            <div className="p-3">
              {recent.length === 0 ? (
                <p className="px-3 py-4 text-sm text-on-surface-variant text-center">
                  Type a hall, area or city to search
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Recent
                    </span>
                    <button
                      type="button"
                      onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]); }}
                      className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary"
                    >
                      Clear
                    </button>
                  </div>
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuery(r);
                      }}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-container/60"
                    >
                      <span className="material-symbols-outlined text-base text-slate-400">history</span>
                      <span className="text-sm text-on-surface">{r}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Live suggestions */}
          {query.trim() && (
            <div className="max-h-[26rem] overflow-y-auto">
              {loading && suggestions.length === 0 && (
                <p className="px-4 py-6 text-sm text-on-surface-variant text-center flex items-center justify-center gap-2">
                  <span className="spin" /> Searching…
                </p>
              )}
              {!loading && suggestions.length === 0 && query.trim().length >= 2 && (
                <div className="px-4 py-6 text-sm text-on-surface-variant text-center">
                  <span className="material-symbols-outlined text-2xl text-slate-300">search_off</span>
                  <p className="mt-2">No matches for “{query.trim()}”</p>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); commitFreeText(); }}
                    className="mt-3 text-xs font-bold uppercase tracking-widest text-primary hover:underline"
                  >
                    Search anyway →
                  </button>
                </div>
              )}

              {suggestions.length > 0 && (
                <Sections
                  suggestions={suggestions}
                  highlight={highlight_}
                  onHover={setHighlight}
                  onPick={commit}
                  query={query}
                  idPrefix={id}
                />
              )}
            </div>
          )}

          <div className="px-4 py-2 border-t border-gold/10 bg-surface-container-low/40 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gold/20">↵</kbd>
              to open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gold/20">Esc</kbd>
              to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Sections({
  suggestions,
  highlight,
  onHover,
  onPick,
  query,
  idPrefix,
}: {
  suggestions: Suggestion[];
  highlight: number;
  onHover: (i: number) => void;
  onPick: (s: Suggestion) => void;
  query: string;
  idPrefix: string;
}) {
  const groups: Record<SuggestionKind, { idx: number; s: Suggestion }[]> = {
    hall: [],
    area: [],
    city: [],
  };
  suggestions.forEach((s, idx) => groups[s.kind].push({ idx, s }));

  const groupOrder: SuggestionKind[] = ['hall', 'area', 'city'];
  const labels: Record<SuggestionKind, string> = {
    hall: 'Halls',
    area: 'Areas',
    city: 'Cities',
  };

  return (
    <>
      {groupOrder.map((g) =>
        groups[g].length === 0 ? null : (
          <div key={g} className="py-1">
            <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-low/60">
              {labels[g]}
            </div>
            {groups[g].map(({ idx, s }) => {
              const isOn = idx === highlight;
              return (
                <button
                  key={`${s.kind}-${idx}`}
                  id={`${idPrefix}-opt-${idx}`}
                  role="option"
                  aria-selected={isOn}
                  data-idx={idx}
                  type="button"
                  onMouseEnter={() => onHover(idx)}
                  onMouseDown={(e) => { e.preventDefault(); onPick(s); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isOn ? 'bg-secondary-container/40' : 'hover:bg-surface-container/60'
                  }`}
                >
                  {s.kind === 'hall' ? (
                    <HallPhoto
                      src={s.imageUrl}
                      venueOnly
                      alt=""
                      loading="lazy"
                      iconClass="text-[20px]"
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-gold text-[20px]">
                        {s.kind === 'city' ? 'location_city' : 'place'}
                      </span>
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-on-surface truncate">
                      {highlight_text(s.label, query)}
                    </span>
                    <span className="block text-xs text-on-surface-variant truncate">
                      {s.sub}
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-base text-slate-300 shrink-0">
                    {s.kind === 'hall' ? 'arrow_forward' : 'filter_list'}
                  </span>
                </button>
              );
            })}
          </div>
        ),
      )}
    </>
  );
}

function highlight_text(text: string, query: string) {
  return highlight(text, query);
}
