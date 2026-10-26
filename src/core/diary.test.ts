import { describe, expect, it } from 'vitest';
import type { Food, FoodEntry } from '../contract.ts';
import { FoodEntry as FoodEntrySchema } from '../contract.ts';
import * as fx from '../test/fixtures.ts';
import {
  dayTotals,
  defaultMealSlot,
  entryFromFood,
  expandSavedMeal,
  localDate,
  nutritionFor,
  quickAddEntry,
  recentFoods,
  totalsByMeal,
} from './diary.ts';

const ctx = { date: '2026-10-26', meal: 'breakfast' as const, now: '2026-10-26T08:30:00+01:00' };

function entry(id: string, extra: Partial<FoodEntry>): FoodEntry {
  return { ...fx.foodEntry, id, ...extra };
}

describe('nutritionFor', () => {
  it('scales per-100 g values to the portion, rounded to 0.1', () => {
    expect(nutritionFor(fx.food, 40)).toEqual({ kcal: 151.6, proteinG: 5.3, carbsG: 27.1, fatG: 2.6 });
  });
  it('leaves out macros the food does not have', () => {
    const f: Food = { ...fx.food, per100g: { kcal: 52 } };
    expect(nutritionFor(f, 150)).toEqual({ kcal: 78 });
  });
  it('rejects zero, negative and non-finite grams', () => {
    expect(() => nutritionFor(fx.food, 0)).toThrow(RangeError);
    expect(() => nutritionFor(fx.food, -1)).toThrow(RangeError);
    expect(() => nutritionFor(fx.food, Infinity)).toThrow(RangeError);
  });
});

describe('entryFromFood', () => {
  it('builds a valid entry with nutrition copied in', () => {
    const e = entryFromFood(fx.food, 40, { ...ctx, id: 'e1' });
    expect(FoodEntrySchema.parse(e)).toEqual(e);
    expect(e).toEqual({
      id: 'e1',
      date: '2026-10-26',
      loggedAt: '2026-10-26T08:30:00+01:00',
      meal: 'breakfast',
      foodId: fx.food.id,
      label: fx.food.name,
      grams: 40,
      nutrition: { kcal: 151.6, proteinG: 5.3, carbsG: 27.1, fatG: 2.6 },
    });
  });
  it('includes the brand in the label when there is one', () => {
    expect(entryFromFood(fx.barcodeFood, 15, { ...ctx, id: 'e2' }).label).toBe('Nutella (Ferrero)');
  });
});

describe('quickAddEntry', () => {
  it('builds a calorie-only entry with no food', () => {
    const e = quickAddEntry(650, 'Lunch out', { ...ctx, meal: 'lunch', id: 'q1' });
    expect(FoodEntrySchema.parse(e)).toEqual(e);
    expect(e.foodId).toBeNull();
    expect(e.nutrition).toEqual({ kcal: 650 });
    expect(e.grams).toBeUndefined();
  });
  it('uses "Quick add" when the label is blank', () => {
    expect(quickAddEntry(200, '  ', { ...ctx, id: 'q2' }).label).toBe('Quick add');
  });
  it('rejects negative or non-finite kcal', () => {
    expect(() => quickAddEntry(-5, 'x', { ...ctx, id: 'q3' })).toThrow(RangeError);
    expect(() => quickAddEntry(Number.NaN, 'x', { ...ctx, id: 'q3' })).toThrow(RangeError);
  });
});

describe('expandSavedMeal', () => {
  it('turns each item into an entry linked to the meal', () => {
    const foods = new Map([[fx.food.id, fx.food]]);
    let n = 0;
    const entries = expandSavedMeal(fx.savedMeal, foods, { ...ctx, newId: () => `m${++n}` });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'm1',
      foodId: fx.food.id,
      grams: 40,
      savedMealId: fx.savedMeal.id,
      nutrition: { kcal: 151.6 },
    });
  });
  it('throws if a food in the meal is missing', () => {
    expect(() =>
      expandSavedMeal(fx.savedMeal, new Map(), { ...ctx, newId: () => 'x' }),
    ).toThrow(/food-oats/);
  });
});

describe('dayTotals and totalsByMeal', () => {
  const entries = [
    entry('a', { meal: 'breakfast', nutrition: { kcal: 300, proteinG: 20, carbsG: 30, fatG: 10 } }),
    entry('b', { meal: 'lunch', nutrition: { kcal: 650 } }),
    entry('c', { meal: 'lunch', nutrition: { kcal: 100.25, proteinG: 2.5 } }),
  ];
  it('sums kcal and the macros that are present, rounded to 0.1', () => {
    expect(dayTotals(entries)).toEqual({
      kcal: 1050.3,
      proteinG: 22.5,
      carbsG: 30,
      fatG: 10,
      count: 3,
    });
  });
  it('is all zeros for no entries', () => {
    expect(dayTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, count: 0 });
  });
  it('groups by meal slot, with every slot present', () => {
    const t = totalsByMeal(entries);
    expect(t.breakfast.kcal).toBe(300);
    expect(t.lunch).toEqual({ kcal: 750.3, proteinG: 2.5, carbsG: 0, fatG: 0, count: 2 });
    expect(t.dinner.count).toBe(0);
    expect(t.snack.kcal).toBe(0);
  });
});

describe('recentFoods', () => {
  it('lists distinct foods, most recently logged first, with the last amount used', () => {
    const entries = [
      entry('1', { foodId: 'oats', label: 'Oats', grams: 40, loggedAt: '2026-10-24T08:00:00Z' }),
      entry('2', { foodId: 'egg', label: 'Egg', grams: 50, loggedAt: '2026-10-25T08:00:00Z' }),
      entry('3', { foodId: 'oats', label: 'Oats', grams: 60, loggedAt: '2026-10-26T08:00:00Z' }),
      entry('4', {
        foodId: null,
        label: 'Quick add',
        grams: undefined,
        loggedAt: '2026-10-26T09:00:00Z',
      }),
    ];
    expect(recentFoods(entries)).toEqual([
      { foodId: 'oats', label: 'Oats', grams: 60, meal: 'breakfast' },
      { foodId: 'egg', label: 'Egg', grams: 50, meal: 'breakfast' },
    ]);
  });
  it('compares timestamps as instants, not strings', () => {
    const entries = [
      // 09:00+02:00 is 07:00Z, earlier than 08:00Z
      entry('1', { foodId: 'a', label: 'A', loggedAt: '2026-10-26T09:00:00+02:00' }),
      entry('2', { foodId: 'b', label: 'B', loggedAt: '2026-10-26T08:00:00Z' }),
    ];
    expect(recentFoods(entries).map((r) => r.foodId)).toEqual(['b', 'a']);
  });
  it('respects the limit (default 10)', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry(`e${i}`, {
        foodId: `f${i}`,
        label: `F${i}`,
        loggedAt: `2026-10-26T08:${String(i).padStart(2, '0')}:00Z`,
      }),
    );
    expect(recentFoods(entries)).toHaveLength(10);
    expect(recentFoods(entries, 3).map((r) => r.foodId)).toEqual(['f14', 'f13', 'f12']);
  });
  it('does not reorder the input array', () => {
    const entries = [
      entry('1', { foodId: 'a', loggedAt: '2026-10-24T08:00:00Z' }),
      entry('2', { foodId: 'b', loggedAt: '2026-10-25T08:00:00Z' }),
    ];
    recentFoods(entries);
    expect(entries.map((e) => e.id)).toEqual(['1', '2']);
  });
});

describe('defaultMealSlot', () => {
  it.each([
    [4, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [14, 'lunch'],
    [15, 'snack'],
    [16, 'snack'],
    [17, 'dinner'],
    [21, 'dinner'],
    [22, 'snack'],
    [2, 'snack'],
  ] as const)('hour %i -> %s', (hour, slot) => {
    expect(defaultMealSlot(hour)).toBe(slot);
  });
});

describe('localDate', () => {
  it("formats a Date as the local calendar day", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});
