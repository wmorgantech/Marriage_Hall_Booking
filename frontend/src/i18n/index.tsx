import { useEffect, useState, type ReactNode } from 'react';
import { dict, type DictKey } from './translations';

export type Lang = 'en' | 'ta' | 'both';

const KEY = 'cnb_lang';
const EVENT = 'cnb:lang-changed';

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'ta' || v === 'both' ? v : 'en';
  } catch { return 'en'; }
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useLang(): Lang {
  const [lang, setLocal] = useState<Lang>(() => getLang());
  useEffect(() => {
    const sync = () => setLocal(getLang());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return lang;
}

/**
 * Translate a key.
 *  - lang='en'   → English string
 *  - lang='ta'   → Tamil string
 *  - lang='both' → JSX block: English line, Tamil line below in muted style
 *
 * Pass `inline: true` for placeholders / aria-labels (returns a flat string
 * `English / Tamil` so there's no JSX in attributes).
 */
export function t(key: DictKey, lang: Lang, opts?: { inline?: boolean; vars?: Record<string, string | number> }): ReactNode {
  const entry = dict[key];
  if (!entry) return key;
  const sub = (s: string) => {
    if (!opts?.vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => String(opts.vars![k] ?? ''));
  };
  const en = sub(entry.en);
  const ta = sub(entry.ta);

  if (opts?.inline) {
    if (lang === 'en') return en;
    if (lang === 'ta') return ta;
    return `${en} / ${ta}`;
  }

  if (lang === 'en') return en;
  if (lang === 'ta') return <span lang="ta" className="cnb-ta">{ta}</span>;
  // both — single inline line "English / தமிழ்" so it flows and wraps like
  // normal text instead of stacking into a taller block that can overlap
  // neighbouring elements or get clipped by fixed headers/containers.
  return (
    <>
      {en}
      <span lang="ta" className="cnb-ta opacity-70 font-normal"> / {ta}</span>
    </>
  );
}

/** Convenience hook: returns t() pre-bound to the current language. */
export function useT() {
  const lang = useLang();
  return {
    lang,
    t: (key: DictKey, opts?: Parameters<typeof t>[2]) => t(key, lang, opts),
    /** Plain English string when you need a flat string regardless of mode (e.g. URL param). */
    en: (key: DictKey, vars?: Record<string, string | number>) => {
      const entry = dict[key];
      if (!entry) return key;
      return vars ? entry.en.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : entry.en;
    },
  };
}

export { dict, type DictKey };
