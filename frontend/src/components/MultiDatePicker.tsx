import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateMatch } from '../api/client';
import { toLocalDate, useMuhurthamDates } from '../data/muhurthamDates';
import { fmtDay, toIso, todayIso } from '../lib/dates';
import { useT } from '../i18n';

export const MAX_DATES = 10;

type Props = {
  value: string[];
  match: DateMatch;
  onChange: (dates: string[]) => void;
  onMatch: (m: DateMatch) => void;
  /** 'boxed' = 48px field (search bar); 'line' = underlined field (filter sidebar). */
  variant?: 'boxed' | 'line';
  id?: string;
};

/**
 * Pick several wedding dates (muhurtham days are starred), and whether a hall must be free on ALL of them or on
 * ANY one. Only real calendar days from today on can be chosen; at most MAX_DATES.
 */
export default function MultiDatePicker({ value, match, onChange, onMatch, variant = 'boxed', id }: Props) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [centerPopover, setCenterPopover] = useState(false);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState<number>();
  const [warn, setWarn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const muhurtham = useMuhurthamDates();
  const today = todayIso();
  const upcoming = muhurtham.filter((d) => d >= today).slice(0, 6);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setOpenAbove(false);
      setCenterPopover(false);
      setPopoverMaxHeight(undefined);
      return;
    }

    const positionPopover = () => {
      const trigger = box.current?.getBoundingClientRect();
      const panel = popover.current;
      if (!trigger || !panel) return;

      const gap = 8;
      const spaceBelow = window.innerHeight - trigger.bottom - gap;
      const spaceAbove = trigger.top - gap;
      const canCenter = spaceBelow < panel.scrollHeight
        && spaceAbove < panel.scrollHeight
        && window.innerHeight - gap * 2 >= panel.scrollHeight;
      const placeAbove = !canCenter && spaceBelow < panel.scrollHeight && spaceAbove > spaceBelow;

      setCenterPopover(canCenter);
      setOpenAbove(placeAbove);
      const availableHeight = canCenter ? window.innerHeight - gap * 2 : placeAbove ? spaceAbove : spaceBelow;
      setPopoverMaxHeight(Math.max(0, Math.min(panel.scrollHeight, availableHeight)));
    };

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
  }, [open, upcoming.length, value.length, warn]);

  // Always toggle against the newest selection, so two quick taps never drop one of the dates.
  const latest = useRef(value);
  latest.current = value;
  function toggle(iso: string) {
    const cur = latest.current;
    let next: string[];
    if (cur.includes(iso)) next = cur.filter((d) => d !== iso);
    else if (cur.length >= MAX_DATES) { setWarn(true); return; }
    else next = [...cur, iso].sort();
    setWarn(false);
    latest.current = next;
    onChange(next);
  }

  const label = value.length === 0
    ? t('dates_pick')
    : value.length === 1 ? fmtDay(value[0], lang) : t('dates_selected', { vars: { n: value.length } });

  const trigger = variant === 'boxed'
    ? 'w-full h-12 rounded-xl border border-gold/50 bg-white pl-10 pr-9 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
    : 'w-full border-b border-gold/40 bg-transparent py-2 pl-7 pr-7 text-left text-sm focus:outline-none focus:border-primary';

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${trigger} ${value.length ? 'text-on-surface' : 'text-slate-400'}`}
      >
        <span className={`material-symbols-outlined absolute ${variant === 'boxed' ? 'left-3.5' : 'left-0'} top-1/2 -translate-y-1/2 text-primary text-[18px] pointer-events-none`} aria-hidden>
          event
        </span>
        <span className="block truncate">{label}</span>
        {value.length > 1 && (
          <span className="block truncate text-[11px] text-on-surface-variant -mt-0.5">
            {match === 'all' ? t('dates_match_all') : t('dates_match_any')}
          </span>
        )}
        <span className={`material-symbols-outlined absolute ${variant === 'boxed' ? 'right-3' : 'right-0'} top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none`} aria-hidden>
          expand_more
        </span>
      </button>

      {open && (
        <div
          ref={popover}
          role="dialog"
          aria-label={String(t('dates_label', { inline: true }))}
          style={popoverMaxHeight === undefined ? undefined : { maxHeight: popoverMaxHeight }}
          className={`${centerPopover ? 'fixed top-1/2 -translate-y-1/2' : `absolute ${openAbove ? 'bottom-full mb-2' : 'mt-2'}`} z-50 left-1/2 -translate-x-1/2 w-[min(20rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto scrollbar-hide bg-white rounded-2xl shadow-soft-lg ring-1 ring-gold/40 p-3`}
        >
          <p className="text-xs text-on-surface-variant mb-1.5">{t('dates_hint')}</p>
          <div className="flex justify-center">
            <DayPicker
              mode="multiple"
              selected={value.map(toLocalDate)}
              onDayClick={(d, m) => { if (!m.disabled) toggle(toIso(d)); }}
              disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
              modifiers={{ muhurtham: muhurtham.map(toLocalDate), picked: value.map(toLocalDate) }}
              modifiersClassNames={{ muhurtham: 'rdp-day_muhurtham', picked: 'rdp-day_picked' }}
            />
          </div>

          {upcoming.length > 0 && (
            <div className="mt-1.5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">{t('dates_muhurtham_quick')}</p>
              <div className="flex flex-wrap gap-1">
                {upcoming.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggle(d)}
                    aria-pressed={value.includes(d)}
                    className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                      value.includes(d) ? 'bg-primary text-white border-primary' : 'border-gold/40 hover:border-primary hover:text-primary'
                    }`}
                  >
                    ★ {fmtDay(d, lang, false)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {value.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="Selected dates">
              {value.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-secondary-container/60 text-xs font-bold text-on-secondary-container"
                >
                  {fmtDay(d, lang)}
                  <span className="material-symbols-outlined text-[14px]" aria-hidden>close</span>
                  <span className="sr-only">remove</span>
                </button>
              ))}
            </div>
          )}
          {warn && <p role="alert" className="mt-1.5 text-xs text-error">{t('dates_max')}</p>}

          {value.length > 1 && (
            <div className="mt-2 grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-container" role="radiogroup" aria-label="Date match">
              {(['all', 'any'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={match === m}
                  onClick={() => onMatch(m)}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors ${match === m ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}
                >
                  {m === 'all' ? t('dates_match_all') : t('dates_match_any')}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => { onChange([]); setWarn(false); }}
              disabled={!value.length}
              className="px-3 py-2 text-xs font-bold text-on-surface-variant hover:text-primary disabled:opacity-40"
            >
              {t('dates_clear')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-bold">
              {t('dates_done')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
