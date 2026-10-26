import { describe, expect, it } from 'vitest';
import {
  Backup,
  Food,
  FoodEntry,
  Profile,
  Program,
  Quest,
  QuestCondition,
  SavedMeal,
  SetEntry,
  WeighIn,
  Workout,
  exerciseKey,
} from './contract.ts';
import * as fx from './test/fixtures.ts';

/** JSON round trip: what goes into a backup file comes back unchanged. */
function roundTrip<T>(schema: { parse: (v: unknown) => T }, value: T): T {
  return schema.parse(JSON.parse(JSON.stringify(value)));
}

describe('fixtures are valid and survive a JSON round trip', () => {
  const cases: [string, { parse: (v: unknown) => unknown }, unknown][] = [
    ['food', Food, fx.food],
    ['barcode food', Food, fx.barcodeFood],
    ['food entry', FoodEntry, fx.foodEntry],
    ['quick-add entry', FoodEntry, fx.quickAdd],
    ['saved meal', SavedMeal, fx.savedMeal],
    ['strength workout', Workout, fx.strengthWorkout],
    ['run workout', Workout, fx.runWorkout],
    ['weigh-in', WeighIn, fx.weighIn],
    ['profile', Profile, fx.profile],
    ['program', Program, fx.program],
    ['daily quest', Quest, fx.dailyQuest],
    ['boss quest', Quest, fx.bossQuest],
    ['backup', Backup, fx.backup],
  ];
  it.each(cases)('%s', (_name, schema, value) => {
    expect(roundTrip(schema, value)).toEqual(value);
  });
});

describe('rejects bad data', () => {
  it('dates must be real YYYY-MM-DD days', () => {
    expect(FoodEntry.safeParse({ ...fx.foodEntry, date: '2026-13-01' }).success).toBe(false);
    expect(FoodEntry.safeParse({ ...fx.foodEntry, date: '26/10/2026' }).success).toBe(false);
  });

  it('timestamps need an offset', () => {
    expect(FoodEntry.safeParse({ ...fx.foodEntry, loggedAt: '2026-10-26T08:30:00' }).success).toBe(
      false,
    );
    expect(FoodEntry.safeParse({ ...fx.foodEntry, loggedAt: '2026-10-26T08:30:00Z' }).success).toBe(
      true,
    );
  });

  it('nutrition cannot be negative or NaN', () => {
    expect(FoodEntry.safeParse({ ...fx.foodEntry, nutrition: { kcal: -1 } }).success).toBe(false);
    expect(FoodEntry.safeParse({ ...fx.foodEntry, nutrition: { kcal: NaN } }).success).toBe(false);
  });

  it('barcodes are 8-14 digits', () => {
    expect(Food.safeParse({ ...fx.barcodeFood, barcode: '12345' }).success).toBe(false);
    expect(Food.safeParse({ ...fx.barcodeFood, barcode: '30176240107OI' }).success).toBe(false);
  });

  it('a set needs at least one measurement', () => {
    expect(SetEntry.safeParse({}).success).toBe(false);
    expect(SetEntry.safeParse({ rpe: 8 }).success).toBe(false);
    expect(SetEntry.safeParse({ reps: 0 }).success).toBe(true);
  });

  it('a workout needs at least one exercise with at least one set', () => {
    expect(Workout.safeParse({ ...fx.strengthWorkout, exercises: [] }).success).toBe(false);
    expect(
      Workout.safeParse({ ...fx.strengthWorkout, exercises: [{ name: 'Squat', sets: [] }] })
        .success,
    ).toBe(false);
  });

  it('a saved meal needs items', () => {
    expect(SavedMeal.safeParse({ ...fx.savedMeal, items: [] }).success).toBe(false);
  });

  it('unknown quest condition types are rejected', () => {
    expect(QuestCondition.safeParse({ type: 'eat_cake', count: 1 }).success).toBe(false);
  });

  it('a quest window cannot end before it starts', () => {
    const bad = { ...fx.dailyQuest, window: { start: '2026-10-27', end: '2026-10-26' } };
    expect(Quest.safeParse(bad).success).toBe(false);
  });

  it('a backup from another app is rejected', () => {
    expect(Backup.safeParse({ ...fx.backup, app: 'something-else' }).success).toBe(false);
  });

  it('a backup with one bad record is rejected as a whole', () => {
    const bad = {
      ...fx.backup,
      tables: { ...fx.backup.tables, weighIns: [{ date: '2026-10-26', kg: 5 }] },
    };
    expect(Backup.safeParse(bad).success).toBe(false);
  });
});

describe('exerciseKey', () => {
  it('matches names regardless of case and spacing', () => {
    expect(exerciseKey('  Bench   Press ')).toBe('bench press');
    expect(exerciseKey('bench press')).toBe(exerciseKey('BENCH PRESS'));
  });
});
