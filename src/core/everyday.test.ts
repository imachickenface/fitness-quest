import { describe, expect, it } from 'vitest';
import { EVERYDAY, everydayFor } from './everyday.ts';
import { buildIndex, searchFoods } from './foodSearch.ts';
import { toFood, type FoodsFile } from './foodsData.ts';
import raw from '../../public/foods.json?raw';

const file = JSON.parse(raw) as FoodsFile;
const foods = file.foods.map((r) => toFood(r, '2026-01-01T00:00:00Z'));
const index = buildIndex(foods);
const byId = new Map(foods.map((f) => [f.id, f]));
const top = (q: string) => searchFoods(index, q, { limit: 3 })[0]!.name;

describe('everyday picks', () => {
  it('point at foods that are in the bundled list', () => {
    for (const ids of Object.values(EVERYDAY))
      for (const id of ids) expect(byId.has(id), id).toBe(true);
  });

  it('match singular and plural queries', () => {
    expect(everydayFor('eggs')).toEqual(everydayFor('egg'));
    expect(everydayFor('tomatoes')).toEqual(everydayFor('tomato'));
    expect(everydayFor('grapes')).toEqual(everydayFor('grape'));
    expect(everydayFor('pizza')).toEqual([]);
  });

  it('put the plain food first in a real search', () => {
    expect(top('eggs')).toBe('Egg, whole, raw, fresh');
    expect(top('banana')).toBe('Bananas, raw');
    expect(top('rice')).toBe('Rice, white, long-grain, regular, enriched, cooked');
    expect(top('milk')).toBe('Milk, whole, 3.25% milkfat, with added vitamin D');
    expect(top('potatoes')).toBe('Potatoes, boiled, cooked in skin, flesh, without salt');
    expect(top('oatmeal')).toMatch(/^Cereals, oats, regular and quick/);
    expect(top('chicken breast')).toBe(
      'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
    );
  });

  it('leave longer searches to word matching', () => {
    expect(top('egg whole raw')).toBe('Egg, whole, raw, fresh');
    expect(top('rice crackers')).toBe('Rice crackers');
  });
});
