import { useEffect, useRef, useState } from 'react';
import { getLang, setLang, type Lang } from '../i18n';

const OPTIONS: { value: Lang; short: string; long: string }[] = [
  { value: 'both', short: 'EN+TA', long: 'English + தமிழ்' },
  { value: 'en',   short: 'EN',    long: 'English' },
  { value: 'ta',   short: 'TA',    long: 'தமிழ்' },
];

export default function LangToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Lang>(() => getLang());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onSync() { setCurrent(getLang()); }
    window.addEventListener('cnb:lang-changed', onSync);
    return () => window.removeEventListener('cnb:lang-changed', onSync);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const cur = OPTIONS.find((o) => o.value === current) ?? OPTIONS[0];
  const isDark = tone === 'dark';

  function pick(v: Lang) {
    setLang(v);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change language"
        className={`relative before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[""] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest transition-colors ${
          isDark
            ? 'bg-white/10 text-white hover:bg-white/15 ring-1 ring-white/15'
            : 'bg-surface-container-low text-primary hover:bg-surface-container ring-1 ring-gold/20'
        }`}
      >
        <span className="material-symbols-outlined text-[14px]">language</span>
        {cur.short}
        <span className="material-symbols-outlined text-[14px] opacity-70">expand_more</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 z-50 w-44 bg-white rounded-xl shadow-soft-lg ring-1 ring-gold/20 overflow-hidden"
          style={{ animation: 'cnb-fade-in 140ms ease-out' }}
        >
          {OPTIONS.map((o) => {
            const sel = o.value === current;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => pick(o.value)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    sel ? 'bg-secondary-container/40 text-primary font-bold' : 'text-on-surface hover:bg-surface-container/60'
                  }`}
                >
                  <span>{o.long}</span>
                  {sel && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
