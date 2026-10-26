/**
 * Offline food search over the bundled USDA list plus the user's own foods. Pure: the caller passes
 * the recents and favourites it knows about, and the same Food objects come back out.
 */
import type { Food } from '../contract.ts';

/** Lowercase, strip accents, turn punctuation into spaces and collapse whitespace. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type IndexedFood = {
  food: Food;
  /** Normalised name words. */
  nameWords: string[];
  /** Name words plus brand words: what a query token may match. */
  words: string[];
  norm: string;
};

export type SearchIndex = { entries: IndexedFood[] };

export function buildIndex(foods: readonly Food[]): SearchIndex {
  return {
    entries: foods.map((food) => {
      const norm = normalise(food.name);
      const nameWords = norm === '' ? [] : norm.split(' ');
      const brand = food.brand === undefined ? '' : normalise(food.brand);
      const words = brand === '' ? nameWords : [...nameWords, ...brand.split(' ')];
      return { food, nameWords, words, norm };
    }),
  };
}

export type SearchOptions = {
  /** Most recent first. */
  recentFoodIds?: readonly string[];
  favouriteIds?: readonly string[];
  limit?: number;
};

type Hit = { e: IndexedFood; fav: boolean; recent: number; score: number };

/**
 * Every query word must be the start of some word in the name or brand. Results are tiered:
 * favourites, then recents (most recent first), then by score, fewer name words, name and id.
 * Score: custom food +100, each query word that is a whole word +20, first query word starting the
 * first name word +10.
 */
export function searchFoods(index: SearchIndex, query: string, opts: SearchOptions = {}): Food[] {
  const q = normalise(query);
  if (q === '') return [];
  const tokens = q.split(' ');
  const first = tokens[0]!;
  const favourites = new Set(opts.favouriteIds ?? []);
  const recentRank = new Map<string, number>();
  (opts.recentFoodIds ?? []).forEach((id, i) => {
    if (!recentRank.has(id)) recentRank.set(id, i);
  });

  const hits: Hit[] = [];
  for (const e of index.entries) {
    let score = 0;
    let matched = true;
    for (const t of tokens) {
      let prefix = false;
      let exact = false;
      for (const w of e.words) {
        if (w.startsWith(t)) {
          prefix = true;
          if (w.length === t.length) {
            exact = true;
            break;
          }
        }
      }
      if (!prefix) {
        matched = false;
        break;
      }
      if (exact) score += 20;
    }
    if (!matched) continue;
    if (e.food.source === 'custom') score += 100;
    if (e.nameWords[0]?.startsWith(first)) score += 10;
    hits.push({
      e,
      fav: e.food.favourite || favourites.has(e.food.id),
      recent: recentRank.get(e.food.id) ?? Infinity,
      score,
    });
  }

  hits.sort(
    (a, b) =>
      Number(b.fav) - Number(a.fav) ||
      (a.recent === b.recent ? 0 : a.recent < b.recent ? -1 : 1) ||
      b.score - a.score ||
      a.e.nameWords.length - b.e.nameWords.length ||
      compare(a.e.norm, b.e.norm) ||
      compare(a.e.food.id, b.e.food.id),
  );
  return hits.slice(0, opts.limit ?? 30).map((h) => h.e.food);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
