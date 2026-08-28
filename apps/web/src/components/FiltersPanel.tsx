import type { HallFilters } from '../api/client';

export type SearchFilters = {
  city: string;
  area: string;
  fromDate: string;
  toDate: string;
  minPrice: string;
  maxPrice: string;
  capacity: string;     // '', '100', '300', '500', '1000'
  hasRooms: boolean;
  hasAC: boolean;
};

export const defaultFilters: SearchFilters = {
  city: '',
  area: '',
  fromDate: '',
  toDate: '',
  minPrice: '',
  maxPrice: '',
  capacity: '',
  hasRooms: false,
  hasAC: false,
};

type Props = {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onSubmit: () => void;
  onClear: () => void;
  options: HallFilters | null;
  loading?: boolean;
  compact?: boolean;
};

const capacitySteps = [
  { v: '', label: 'Any' },
  { v: '100', label: '100+' },
  { v: '300', label: '300+' },
  { v: '500', label: '500+' },
  { v: '1000', label: '1000+' },
];

export default function FiltersPanel({
  filters, onChange, onSubmit, onClear, options, loading,
}: Props) {
  const areaOptions =
    filters.city && options ? (options.areasByCity[filters.city] ?? []) : [];

  function patch(next: Partial<SearchFilters>) {
    onChange({ ...filters, ...next });
  }

  return (
    <aside className="filters" aria-label="Filter halls">
      <div className="filters__header">
        <h3 className="filters__title">Filters</h3>
        <button type="button" className="filters__clear" onClick={onClear}>
          Clear all
        </button>
      </div>

      <form
        className="filters__body"
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      >
        <div className="filters__group">
          <span className="filters__group-label">Location</span>
          <div className="field">
            <span className="field__label">City</span>
            <select
              className="select"
              value={filters.city}
              onChange={(e) => patch({ city: e.target.value, area: '' })}
              required
            >
              <option value="">Select city</option>
              {options?.cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">Area</span>
            <select
              className="select"
              value={filters.area}
              onChange={(e) => patch({ area: e.target.value })}
              disabled={!filters.city || areaOptions.length === 0}
            >
              <option value="">{filters.city ? 'Any area' : 'Select city first'}</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filters__group">
          <span className="filters__group-label">Dates</span>
          <div className="field">
            <span className="field__label">From</span>
            <input
              className="input"
              type="date"
              value={filters.fromDate}
              onChange={(e) => patch({ fromDate: e.target.value })}
            />
          </div>
          <div className="field">
            <span className="field__label">To</span>
            <input
              className="input"
              type="date"
              value={filters.toDate}
              onChange={(e) => patch({ toDate: e.target.value })}
              min={filters.fromDate || undefined}
            />
          </div>
        </div>

        <div className="filters__group">
          <span className="filters__group-label">Capacity</span>
          <div className="chip-group" role="radiogroup" aria-label="Minimum guest capacity">
            {capacitySteps.map((o) => (
              <button
                type="button"
                key={o.label}
                className={`chip${filters.capacity === o.v ? ' is-active' : ''}`}
                onClick={() => patch({ capacity: o.v })}
                role="radio"
                aria-checked={filters.capacity === o.v}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filters__group">
          <span className="filters__group-label">Price per day (₹)</span>
          <div className="price-range">
            <div className="field">
              <span className="field__label">Min</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={filters.minPrice}
                onChange={(e) => patch({ minPrice: e.target.value })}
                min={0}
              />
            </div>
            <div className="field">
              <span className="field__label">Max</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder="Any"
                value={filters.maxPrice}
                onChange={(e) => patch({ maxPrice: e.target.value })}
                min={0}
              />
            </div>
          </div>
        </div>

        <div className="filters__group">
          <span className="filters__group-label">Amenities</span>
          <label className="feature-check">
            <input
              type="checkbox"
              checked={filters.hasAC}
              onChange={(e) => patch({ hasAC: e.target.checked })}
            />
            Air Conditioning
          </label>
          <label className="feature-check">
            <input
              type="checkbox"
              checked={filters.hasRooms}
              onChange={(e) => patch({ hasRooms: e.target.checked })}
            />
            Guest Rooms Available
          </label>
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--block btn--lg"
          disabled={loading}
        >
          {loading ? <><span className="spin" /> Checking…</> : 'Check Availability'}
        </button>
      </form>
    </aside>
  );
}
