import { DayPicker } from 'react-day-picker';
import type { Availability } from '../api/client';
import { muhurthamDateObjects } from '../data/muhurthamDates';

type Props = {
  availability: Availability[];
  mode?: 'view' | 'toggle';
  selected?: Date[];
  onToggle?: (date: Date) => void;
};

export default function AvailabilityCalendar({ availability, mode = 'view', selected, onToggle }: Props) {
  const bookedDates = availability
    .filter((a) => a.status === 'BOOKED')
    .map((a) => new Date(a.date));

  const muhurthamDates = muhurthamDateObjects();

  const modifiers = { booked: bookedDates, muhurtham: muhurthamDates };
  const modifiersClassNames = {
    booked: 'rdp-day_booked',
    muhurtham: 'rdp-day_muhurtham',
  };

  if (mode === 'view') {
    return (
      <DayPicker
        mode="single"
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        disabled={{ before: new Date() }}
      />
    );
  }

  return (
    <DayPicker
      mode="multiple"
      selected={selected ?? []}
      onDayClick={(d) => onToggle?.(d)}
      modifiers={modifiers}
      modifiersClassNames={modifiersClassNames}
      disabled={{ before: new Date() }}
    />
  );
}
