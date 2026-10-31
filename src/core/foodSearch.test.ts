import { describe, expect, it } from 'vitest';
import type { Food } from '../contract.ts';
import { buildIndex, normalise, searchFoods } from './foodSearch.ts';

const at = '2026-10-26T08:00:00+00:00';
function food(id: string, name: string, extra: Partial<Food> = {}): Food {
  return {
    id,
    name,
    source: 'usda',
    per100g: { kcal: 100 },
    portions: [],
    favourite: false,
    updatedAt: at,
    ...extra,
  };
}

const foods: Food[] = [
  food('egg-raw', 'Egg, whole, raw, fresh'),
  food('egg-boiled', 'Egg, whole, cooked, hard-boiled'),
  food('eggplant', 'Eggplant, raw'),
  food('eggnog', 'Eggnog'),
  food('bread-white', 'Bread, white, commercially prepared'),
  food('bread-ww', 'Bread, whole-wheat, commercially prepared'),
  food('toast', 'Bread, white, toasted'),
  food('creme', 'Crème fraîche'),
  food('nutella', 'Hazelnut spread', { brand: 'Ferrero Nutella', source: 'off' }),
  food('my-oats', 'Overnight oats', { source: 'custom' }),
  food('oats', 'Oats, rolled'),
];
const index = buildIndex(foods);
const ids = (r: Food[]) => r.map((f) => f.id);

describe('normalise', () => {
  it('lowercases, strips accents and punctuation, collapses spaces', () => {
    expect(normalise('  Crème   Fraîche, ')).toBe('creme fraiche');
    expect(normalise('Whole-Wheat (100%)')).toBe('whole wheat 100');
  });
});

describe('searchFoods', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchFoods(index, '')).toEqual([]);
    expect(searchFoods(index, '   ')).toEqual([]);
  });

  it('every query word must prefix-match some word of the name or brand', () => {
    expect(ids(searchFoods(index, 'egg raw'))).toEqual(['egg-raw', 'eggplant']);
    expect(searchFoods(index, 'egg zzz')).toEqual([]);
  });

  it('matches regardless of case, accents and punctuation', () => {
    expect(ids(searchFoods(index, 'CREME'))).toEqual(['creme']);
    expect(ids(searchFoods(index, 'whole wheat'))).toEqual(['bread-ww']);
  });

  it('matches the brand too', () => {
    expect(ids(searchFoods(index, 'nutella'))).toEqual(['nutella']);
  });

  it('ranks exact word matches above prefix matches', () => {
    // "egg" is a whole word in the egg entries but only a prefix of eggplant / eggnog
    const r = ids(searchFoods(index, 'egg'));
    expect(r.slice(0, 2).sort()).toEqual(['egg-boiled', 'egg-raw']);
    expect(r.slice(2).sort()).toEqual(['eggnog', 'eggplant']);
  });

  it('counts a singular or plural as a whole word, so the plain food comes first', () => {
    const fruit = buildIndex([
      food('powder', 'Bananas, dehydrated, or banana powder'),
      food('melon', 'Melon, banana (Navajo)'),
      food('chips', 'Snacks, banana chips'),
      food('raw', 'Bananas, raw'),
      food('tomato', 'Tomatoes, red, ripe, raw'),
      food('scrambled', 'Eggs, scrambled, frozen mixture'),
      food('egg', 'Egg, whole, raw, fresh'),
    ]);
    expect(searchFoods(fruit, 'banana')[0]!.id).toBe('raw');
    expect(searchFoods(fruit, 'bananas')[0]!.id).toBe('raw');
    expect(searchFoods(fruit, 'bananas').map((f) => f.id)).toContain('melon');
    expect(searchFoods(fruit, 'tomato')[0]!.id).toBe('tomato');
    expect(searchFoods(index, 'eggs').map((f) => f.id)).toEqual(['egg-raw', 'egg-boiled']);
    expect(searchFoods(fruit, 'eggs')[0]!.id).toBe('egg');
  });

  it('breaks ties by fewer words, then name, then id', () => {
    // both egg entries have 4 words after normalising: "egg whole raw fresh" / "egg whole cooked hard boiled" (5)
    expect(ids(searchFoods(index, 'egg')).slice(0, 2)).toEqual(['egg-raw', 'egg-boiled']);
    // eggnog (1 word) before eggplant raw (2 words)
    expect(ids(searchFoods(index, 'egg')).slice(2)).toEqual(['eggnog', 'eggplant']);
  });

  it('boosts favourites above everything else', () => {
    const r = searchFoods(index, 'egg', { favouriteIds: ['eggplant'] });
    expect(r[0]!.id).toBe('eggplant');
  });

  it('boosts recent foods, most recent first, below favourites', () => {
    const r = searchFoods(index, 'egg', {
      recentFoodIds: ['eggnog', 'egg-boiled'],
      favouriteIds: ['eggplant'],
    });
    expect(ids(r)).toEqual(['eggplant', 'eggnog', 'egg-boiled', 'egg-raw']);
  });

  it("prefers the user's own custom foods over database foods", () => {
    expect(ids(searchFoods(index, 'oats'))).toEqual(['my-oats', 'oats']);
  });

  it('respects the limit (default 30)', () => {
    expect(searchFoods(index, 'bread', { limit: 2 })).toHaveLength(2);
    const many = buildIndex(Array.from({ length: 50 }, (_, i) => food(`a${i}`, `Apple ${i}`)));
    expect(searchFoods(many, 'apple')).toHaveLength(30);
  });

  it('returns the original Food objects', () => {
    expect(searchFoods(index, 'eggnog')[0]).toBe(foods[3]);
  });

  it('searches 10,000 foods quickly', () => {
    const words = ['chicken', 'beef', 'rice', 'bread', 'apple', 'milk', 'cheese', 'pasta', 'bean'];
    const big = buildIndex(
      Array.from({ length: 10_000 }, (_, i) =>
        food(`f${i}`, `${words[i % 9]}, ${words[(i * 7) % 9]} style, cooked variant ${i}`),
      ),
    );
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      searchFoods(big, 'chick rice cook');
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[3]).toBeLessThan(50); // median; target on this PC is < 20 ms
  });
});
