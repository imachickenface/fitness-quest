import { describe, expect, it } from 'vitest';
import {
  Backup,
  Food,
  FoodEntry,
  CHARACTER_IDS,
  Profile,
  PublicProfile,
  PublicProfileRead,
  Settings,
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

describe('Profile.scene and Settings.parallax', () => {
  it('keeps a picked scene id, and absent means follow my level', () => {
    expect(Profile.parse({ ...fx.profile, scene: 'station' }).scene).toBe('station');
    expect(Profile.parse(fx.profile).scene).toBeUndefined();
    expect(Profile.safeParse({ ...fx.profile, scene: 'Station!' }).success).toBe(false);
  });
  it('lets parallax be turned off on this device', () => {
    expect(Settings.parse({ parallax: false }).parallax).toBe(false);
    expect(Settings.parse({}).parallax).toBeUndefined();
    expect(Settings.safeParse({ parallax: 'off' }).success).toBe(false);
  });
});

describe('Profile.character', () => {
  it('accepts one of the pixel characters and stays optional', () => {
    expect(Profile.parse({ ...fx.profile, character: 'hoodie' }).character).toBe('hoodie');
    expect(Profile.parse(fx.profile).character).toBeUndefined();
    expect(CHARACTER_IDS).toEqual(['jacket', 'hoodie', 'tee']);
  });
  it('rejects an unknown character, and reads an old 3D hero choice by dropping it', () => {
    expect(Profile.safeParse({ ...fx.profile, character: 'wizard' }).success).toBe(false);
    const old = Profile.parse({
      ...fx.profile,
      hero: 'male-c',
      heroLook: { head: 'male-a', colours: { '3': 12 } },
      character: 'tee',
    });
    expect(old.character).toBe('tee');
    expect('hero' in old).toBe(false);
    expect('heroLook' in old).toBe(false);
  });
});

describe('PublicProfile, and reading a copy written by a friend', () => {
  const card = {
    v: 1,
    bio: '',
    titles: [],
    showcaseTitles: [],
    level: 3,
    xp: 180,
    week: '2026-11-02',
    weekXp: 40,
    streakDays: 2,
    workouts: 4,
    questsDone: 1,
    lifts: [],
    updatedAt: '2026-11-07T10:00:00.000Z',
  };

  it('publishes the pixel character, and nothing outside the allow-list', () => {
    expect(PublicProfile.parse({ ...card, character: 'hoodie' }).character).toBe('hoodie');
    expect(PublicProfile.parse(card).character).toBeUndefined();
    expect(PublicProfile.safeParse({ ...card, hero: 'male-a' }).success).toBe(false);
    expect(PublicProfile.safeParse({ ...card, weightKg: 80 }).success).toBe(false);
  });

  it('reads a summary from an older app version, dropping the 3D hero', () => {
    const old = PublicProfileRead.parse({
      ...card,
      hero: 'female-c',
      heroLook: { head: 'male-a', colours: { '3': 12 } },
    });
    expect(old.level).toBe(3);
    expect('hero' in old).toBe(false);
    expect('heroLook' in old).toBe(false);
  });

  it('reads a summary from a newer app version: unknown keys dropped, an unknown character left out', () => {
    const newer = PublicProfileRead.parse({ ...card, character: 'knight', pet: 'cat' });
    expect(newer.character).toBeUndefined();
    expect('pet' in newer).toBe(false);
    expect(PublicProfileRead.parse({ ...card, character: 'tee' }).character).toBe('tee');
  });

  it('still rejects a summary whose known fields are wrong', () => {
    expect(PublicProfileRead.safeParse({ ...card, level: 'ten' }).success).toBe(false);
    expect(PublicProfileRead.safeParse({ ...card, v: 2 }).success).toBe(false);
  });
});
