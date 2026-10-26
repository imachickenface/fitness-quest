import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { Food } from '../contract.ts';
import { buildIndex, type SearchIndex } from '../core/foodSearch.ts';
import { toFood, type FoodsFile } from '../core/foodsData.ts';
import { useDb } from './dbContext.ts';

const BUNDLED_AT = '2026-10-26T00:00:00Z';

export type FoodCatalog = {
  index: SearchIndex | null;
  /** every food by id: the bundled list, overridden by the user's own copies in the database */
  byId: Map<string, Food>;
  error: string | null;
};

/** The bundled USDA list plus the foods in the database (custom, scanned, logged), as one search index. */
export function useFoodCatalog(): FoodCatalog {
  const db = useDb();
  const [bundled, setBundled] = useState<Food[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stored = useLiveQuery(() => db.foods.toArray(), [db]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}foods.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<FoodsFile>;
      })
      .then((file) => {
        if (!cancelled) setBundled(file.foods.map((row) => toFood(row, BUNDLED_AT)));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(`Could not load the food list (${String(e)})`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const byId = new Map<string, Food>();
    for (const f of bundled ?? []) byId.set(f.id, f);
    for (const f of stored ?? []) byId.set(f.id, f);
    const ready = bundled !== null && stored !== undefined;
    return { index: ready ? buildIndex([...byId.values()]) : null, byId, error };
  }, [bundled, stored, error]);
}
