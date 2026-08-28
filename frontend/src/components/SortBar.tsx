export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'capacity-desc';

type Props = {
  count: number;
  city?: string;
  sort: SortKey;
  onSort: (s: SortKey) => void;
};

export default function SortBar({ count, city, sort, onSort }: Props) {
  return (
    <div className="sort-bar" role="region" aria-label="Results summary">
      <div className="sort-bar__count">
        <strong>{count}</strong> {count === 1 ? 'hall' : 'halls'}
        {city ? <> found in <span style={{ color: 'var(--red-800)' }}>{city}</span></> : ' available'}
      </div>
      <div className="sort-bar__right">
        <label htmlFor="sort-select" className="sort-bar__label">Sort by</label>
        <select
          id="sort-select"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
        >
          <option value="relevance">Recommended</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="capacity-desc">Capacity: Largest first</option>
        </select>
      </div>
    </div>
  );
}
