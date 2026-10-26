import { useMemo, useState } from 'react';
import type { Food } from '../contract.ts';
import { searchFoods } from '../core/foodSearch.ts';
import { Sheet } from './Sheet.tsx';
import { kcal } from './format.ts';
import type { FoodCatalog } from './useFoodCatalog.ts';

type Props = {
  catalog: FoodCatalog;
  recentFoodIds: string[];
  onPick: (food: Food) => void;
  onAddOwn: () => void;
  onClose: () => void;
};

export function SearchSheet({ catalog, recentFoodIds, onPick, onAddOwn, onClose }: Props) {
  const [query, setQuery] = useState('');
  const results = useMemo(
    () => (catalog.index ? searchFoods(catalog.index, query, { recentFoodIds, limit: 40 }) : []),
    [catalog.index, query, recentFoodIds],
  );

  return (
    <Sheet title="Find food" onClose={onClose}>
      <label className="field">
        <span className="visually-hidden">Search foods</span>
        <input
          type="search"
          placeholder="eggs, oats, banana..."
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {catalog.error && <p className="form-error">{catalog.error}</p>}
      {!catalog.index && !catalog.error && <p className="muted">Loading foods...</p>}
      {catalog.index && query.trim() !== '' && results.length === 0 && (
        <p className="muted">No match. Try fewer words, or add it from the label.</p>
      )}
      <ul className="result-list">
        {results.map((f) => (
          <li key={f.id}>
            <button type="button" className="result" onClick={() => onPick(f)}>
              <span className="result-name">
                {f.favourite && <span aria-label="favourite">★ </span>}
                {f.name}
                {f.brand && <span className="muted"> · {f.brand}</span>}
              </span>
              <span className="result-kcal">{kcal(f.per100g.kcal)} kcal/100 g</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="link-btn" onClick={onAddOwn}>
        Not here? Add it from the label
      </button>
      <p className="fine-print">Food data: USDA FoodData Central (public domain).</p>
    </Sheet>
  );
}
