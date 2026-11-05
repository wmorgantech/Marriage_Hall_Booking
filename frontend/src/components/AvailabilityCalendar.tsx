import { DayPicker } from 'react-day-picker';
import type { Availability } from '../api/client';
import { toLocalDate, useMuhurthamDates } from '../data/muhurthamDates';

type Props = {
  availability: Availability[];
  mode?: 'view' | 'toggle';
  selected?: Date[];
  onToggle?: (date: Date) => void;
  /** Make already-booked dates unselectable (customer view). Owners leave this off so they can free a date. */
  blockBooked?: boolean;
};

// API dates are UTC-midnight ISO strings; build the *calendar* day in local time so
// the right cell is marked in every timezone.
function toLocalDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function AvailabilityCalendar({ availability, mode = 'view', selected, onToggle, blockBooked }: Props) {
  const bookedDates = availability
    .filter((a) => a.status === 'BOOKED')
    .map((a) => toLocalDay(a.date));

  const muhurthamDates = useMuhurthamDates().map(toLocalDate);

  const modifiers = { booked: bookedDates, muhurtham: muhurthamDates };
  const modifiersClassNames = {
    booked: 'rdp-day_booked',
    muhurtham: 'rdp-day_muhurtham',
  };
  const disabled = blockBooked ? [{ before: new Date() }, ...bookedDates] : { before: new Date() };

  if (mode === 'view') {
    return (
      <DayPicker
        mode="single"
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        disabled={disabled}
      />
    );
  }

  return (
    <DayPicker
      mode="multiple"
      selected={selected ?? []}
      onDayClick={(d, m) => { if (!m.disabled) onToggle?.(d); }}
      modifiers={modifiers}
      modifiersClassNames={modifiersClassNames}
      disabled={disabled}
    />
  );
}
