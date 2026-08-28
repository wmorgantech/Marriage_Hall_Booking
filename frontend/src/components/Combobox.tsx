import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

type ComboboxProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  emptyLabel?: string;
  /** Optional display formatter — value stays English; label can be bilingual. */
  formatLabel?: (value: string) => string;
};

export default function Combobox({
  label,
  placeholder = 'Search…',
  value,
  onChange,
  options,
  emptyLabel = 'All',
  formatLabel,
}: ComboboxProps) {
  const fmt = formatLabel ?? ((s: string) => s);
  const id = useId();
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? options.filter((o) => o.toLowerCase().includes(q) || fmt(o).toLowerCase().includes(q))
      : options;
    return [{ value: '', label: emptyLabel }, ...matched.map((o) => ({ value: o, label: fmt(o) }))];
  }, [options, query, emptyLabel, fmt]);

  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, []);

  useEffect(() => {
    if (open) setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function commit(v: string) {
    onChange(v);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[highlight];
      if (item) commit(item.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlight(items.length - 1);
    }
  }

  const display = open ? query : fmt(value);
  const showClear = !open && value;

  return (
    <div ref={wrapRef} className="relative">
      <label
        htmlFor={`${id}-input`}
        className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2"
      >
        {label}
      </label>
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none"
          aria-hidden
        >
          search
        </span>
        <input
          id={`${id}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[highlight] ? `${id}-opt-${highlight}` : undefined}
          value={display}
          placeholder={value ? '' : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          className="w-full border-b border-gold/40 bg-transparent pl-7 pr-8 py-2 focus:outline-none focus:ring-0 focus:border-primary text-sm font-medium text-on-surface placeholder:text-slate-400 transition-colors"
        />
        {showClear ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => { e.preventDefault(); commit(''); }}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary rounded-full hover:bg-surface-container/70 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        ) : (
          <span
            className="material-symbols-outlined absolute right-0 top-1/2 text-slate-400 text-[18px] pointer-events-none transition-transform"
            style={{ transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)` }}
            aria-hidden
          >
            expand_more
          </span>
        )}
      </div>

      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="absolute z-40 mt-2 w-full max-h-64 overflow-auto rounded-xl bg-white shadow-soft-lg ring-1 ring-yellow-600/20 py-1 animate-[fadeIn_120ms_ease-out]"
          style={{ animationName: 'cnb-fade-in' }}
        >
          {items.length === 1 && query.trim() ? (
            <li className="px-3 py-3 text-sm text-slate-400 italic flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">search_off</span>
              No matches for “{query.trim()}”
            </li>
          ) : (
            items.map((item, i) => {
              const isHighlight = i === highlight;
              const isSelected = item.value === value;
              return (
                <li
                  key={`${item.value}-${i}`}
                  id={`${id}-opt-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); commit(item.value); }}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                    isHighlight
                      ? 'bg-secondary-container/40 text-primary'
                      : 'text-on-surface hover:bg-surface-container/60'
                  } ${isSelected ? 'font-bold' : 'font-medium'}`}
                >
                  <span className="truncate">
                    {query.trim() && item.value
                      ? highlightMatch(item.label, query.trim())
                      : item.label}
                  </span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-base text-primary shrink-0">check</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-secondary-container/70 text-primary rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
