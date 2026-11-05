import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';

/** Shown for any URL that does not match a page. */
export default function NotFound() {
  const { t } = useT();
  useEffect(() => {
    const prev = document.title;
    document.title = 'Page not found — CheckNBook';
    return () => { document.title = prev; };
  }, []);
  return (
    <main className="max-w-xl mx-auto px-6 py-20 text-center">
      <p className="font-serif text-6xl font-bold text-gold/70" aria-hidden>404</p>
      <h1 className="font-serif text-3xl text-primary font-semibold mt-2">{t('nf_title')}</h1>
      <p className="text-on-surface-variant mt-3">{t('nf_body')}</p>
      <Link to="/" className="inline-flex mt-8 h-12 px-8 items-center gap-2 rounded-xl bg-primary text-white font-bold">
        <span className="material-symbols-outlined text-[20px]" aria-hidden>search</span>
        {t('nf_home')}
      </Link>
    </main>
  );
}
