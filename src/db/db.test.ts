import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import * as fx from '../test/fixtures.ts';
import {
  addFoodEntries,
  addFoodEntry,
  deleteFoodEntry,
  deleteSavedMeal,
  getFood,
  getFoodByBarcode,
  getProfile,
  getSettings,
  listEntriesForDate,
  listFavouriteFoods,
  listRecentEntries,
  listSavedMeals,
  listWeighIns,
  openDb,
  saveProfile,
  setFoodFavourite,
  updateSettings,
  upsertFood,
  upsertSavedMeal,
  upsertWeighIn,
  type FitnessDb,
} from './db.ts';

let db: FitnessDb;
let n = 0;

beforeEach(async () => {
  db = openDb(`test-${++n}`);
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('foods', () => {
  it('upserts and reads back by id', async () => {
    await upsertFood(db, fx.food);
    expect(await getFood(db, fx.food.id)).toEqual(fx.food);
    await upsertFood(db, { ...fx.food, name: 'Oats, quick' });
    expect((await getFood(db, fx.food.id))?.name).toBe('Oats, quick');
  });

  it('returns undefined for a missing food', async () => {
    expect(await getFood(db, 'nope')).toBeUndefined();
  });

  it('finds a food by barcode', async () => {
    await upsertFood(db, fx.food);
    await upsertFood(db, fx.barcodeFood);
    expect((await getFoodByBarcode(db, '3017624010701'))?.id).toBe(fx.barcodeFood.id);
    expect(await getFoodByBarcode(db, '0000000000000')).toBeUndefined();
  });

  it('lists favourites sorted by name and toggles them', async () => {
    await upsertFood(db, { ...fx.food, id: 'z', name: 'Zucchini', favourite: true });
    await upsertFood(db, { ...fx.food, id: 'a', name: 'Apple', favourite: true });
    await upsertFood(db, { ...fx.food, id: 'm', name: 'Milk', favourite: false });
    expect((await listFavouriteFoods(db)).map((f) => f.id)).toEqual(['a', 'z']);

    await setFoodFavourite(db, 'm', true, '2026-10-27T10:00:00+00:00');
    await setFoodFavourite(db, 'z', false, '2026-10-27T10:00:00+00:00');
    expect((await listFavouriteFoods(db)).map((f) => f.id)).toEqual(['a', 'm']);
    expect((await getFood(db, 'm'))?.updatedAt).toBe('2026-10-27T10:00:00+00:00');
  });

  it('setFoodFavourite on a missing food throws', async () => {
    await expect(setFoodFavourite(db, 'nope', true, '2026-10-27T10:00:00+00:00')).rejects.toThrow(
      /nope/,
    );
  });

  it('rejects invalid foods without writing them', async () => {
    const bad = { ...fx.food, per100g: { kcal: -1 } };
    await expect(upsertFood(db, bad)).rejects.toBeInstanceOf(ZodError);
    expect(await db.foods.count()).toBe(0);
  });
});

describe('food entries', () => {
  const e = (id: string, date: string, loggedAt: string) => ({ ...fx.foodEntry, id, date, loggedAt });

  it('lists a day in logging order', async () => {
    await addFoodEntry(db, e('2', '2026-10-26', '2026-10-26T12:00:00+00:00'));
    await addFoodEntry(db, e('1', '2026-10-26', '2026-10-26T08:00:00+00:00'));
    await addFoodEntry(db, e('3', '2026-10-25', '2026-10-25T08:00:00+00:00'));
    expect((await listEntriesForDate(db, '2026-10-26')).map((x) => x.id)).toEqual(['1', '2']);
    expect(await listEntriesForDate(db, '2026-10-20')).toEqual([]);
  });

  it('adds several entries at once, all or nothing', async () => {
    await addFoodEntries(db, [
      e('a', '2026-10-26', '2026-10-26T08:00:00+00:00'),
      e('b', '2026-10-26', '2026-10-26T08:00:01+00:00'),
    ]);
    expect(await db.foodEntries.count()).toBe(2);
    await expect(
      addFoodEntries(db, [
        e('c', '2026-10-26', '2026-10-26T09:00:00+00:00'),
        { ...e('d', '2026-10-26', '2026-10-26T09:00:00+00:00'), date: 'bad' },
      ]),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await db.foodEntries.count()).toBe(2);
  });

  it('lists recent entries newest first with a limit', async () => {
    for (let i = 0; i < 5; i++) {
      await addFoodEntry(db, e(`r${i}`, '2026-10-26', `2026-10-26T0${i}:00:00+00:00`));
    }
    expect((await listRecentEntries(db, 3)).map((x) => x.id)).toEqual(['r4', 'r3', 'r2']);
  });

  it('deletes an entry', async () => {
    await addFoodEntry(db, fx.foodEntry);
    await deleteFoodEntry(db, fx.foodEntry.id);
    expect(await db.foodEntries.count()).toBe(0);
  });

  it('rejects an invalid entry', async () => {
    await expect(addFoodEntry(db, { ...fx.foodEntry, meal: 'brunch' as never })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});

describe('saved meals', () => {
  it('upserts, lists by name, deletes', async () => {
    await upsertSavedMeal(db, { ...fx.savedMeal, id: 'm2', name: 'Shake' });
    await upsertSavedMeal(db, fx.savedMeal);
    expect((await listSavedMeals(db)).map((m) => m.name)).toEqual(['Shake', 'Usual breakfast']);
    await deleteSavedMeal(db, 'm2');
    expect((await listSavedMeals(db)).map((m) => m.id)).toEqual([fx.savedMeal.id]);
  });
});

describe('profile and settings', () => {
  it('has no profile until one is saved', async () => {
    expect(await getProfile(db)).toBeUndefined();
    await saveProfile(db, fx.profile);
    expect(await getProfile(db)).toEqual(fx.profile);
  });

  it('settings default to an empty object and merge patches', async () => {
    expect(await getSettings(db)).toEqual({});
    await updateSettings(db, { storagePersisted: true });
    await updateSettings(db, { lastBackupAt: '2026-10-26T20:00:00+00:00' });
    expect(await getSettings(db)).toEqual({
      storagePersisted: true,
      lastBackupAt: '2026-10-26T20:00:00+00:00',
    });
  });

  it('rejects an invalid profile', async () => {
    await expect(saveProfile(db, { ...fx.profile, heightCm: 20 })).rejects.toBeInstanceOf(ZodError);
  });
});

describe('weigh-ins', () => {
  it('keeps one per day and lists a date range in order', async () => {
    await upsertWeighIn(db, { date: '2026-10-26', kg: 80.4 });
    await upsertWeighIn(db, { date: '2026-10-24', kg: 81 });
    await upsertWeighIn(db, { date: '2026-10-26', kg: 80.1 });
    await upsertWeighIn(db, { date: '2026-10-20', kg: 82 });
    expect(await listWeighIns(db)).toEqual([
      { date: '2026-10-20', kg: 82 },
      { date: '2026-10-24', kg: 81 },
      { date: '2026-10-26', kg: 80.1 },
    ]);
    expect((await listWeighIns(db, '2026-10-21', '2026-10-26')).map((w) => w.date)).toEqual([
      '2026-10-24',
      '2026-10-26',
    ]);
  });
});
