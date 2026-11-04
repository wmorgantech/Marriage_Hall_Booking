import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { dict, type DictKey } from './translations';

export type Lang = 'en' | 'ta' | 'both';

const KEY = 'cnb_lang';

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

const LangContext = createContext<LangContextValue>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'en' || v === 'ta' || v === 'both') setLangState(v);
    });
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

function sub(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Translate a key. lang='both' renders inline "English / தமிழ்" — the same
 * fix applied to the web app after the stacked-line version caused
 * text overlap/clipping (see apps/web/src/i18n/index.tsx). */
export function useT() {
  const { lang, setLang } = useContext(LangContext);

  function t(key: DictKey, opts?: { vars?: Record<string, string | number> }): ReactNode {
    const entry = dict[key];
    if (!entry) return key;
    const enStr = sub(entry.en, opts?.vars);
    const taStr = sub(entry.ta, opts?.vars);

    if (lang === 'en') return enStr;
    if (lang === 'ta') return taStr;
    return (
      <>
        {enStr}
        <Text className="opacity-70">{` / ${taStr}`}</Text>
      </>
    );
  }

  function en(key: DictKey, vars?: Record<string, string | number>): string {
    const entry = dict[key];
    return entry ? sub(entry.en, vars) : key;
  }

  function ta(key: DictKey, vars?: Record<string, string | number>): string {
    const entry = dict[key];
    return entry ? sub(entry.ta, vars) : key;
  }

  /** Same as t(), but always returns a plain string ("en / ta" when both) —
   * use this for native props that require a real string (TextInput
   * placeholder, accessibility labels, template vars), not JSX children. */
  function tStr(key: DictKey, vars?: Record<string, string | number>): string {
    const entry = dict[key];
    if (!entry) return key;
    const enStr = sub(entry.en, vars);
    const taStr = sub(entry.ta, vars);
    if (lang === 'en') return enStr;
    if (lang === 'ta') return taStr;
    return `${enStr} / ${taStr}`;
  }

  return { lang, setLang, t, tStr, en, ta };
}

export { dict, type DictKey };
