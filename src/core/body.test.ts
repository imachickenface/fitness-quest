import { describe, expect, it } from 'vitest';
import type { FoodEntry, Workout } from '../contract.ts';
import * as fx from '../test/fixtures.ts';
import { addDays } from './dates.ts';
import { bodyShape, buildFrom, muscleFrom, musclePoints } from './body.ts';
import type { Records } from './records.ts';

const today = '2026-10-26';
const none: Records = { foodEntries: [], workouts: [], weighIns: [] };

const workout = (id: string, date: string): Workout => ({
  ...fx.strengthWorkout,
  id,
  date,
  loggedAt: `${date}T18:00:00Z`,
});
const meal = (id: string, date: string, kcal: number): FoodEntry => ({
  ...fx.foodEntry,
  id,
  date,
  loggedAt: `${date}T12:00:00Z`,
  nutrition: { kcal },
});
/** two entries a day that add up to `total` kcal */
const day = (date: string, total: number) => [
  meal(`${date}-a`, date, total / 2),
  meal(`${date}-b`, date, total / 2),
];

describe('musclePoints', () => {
  it('counts workouts at most once a day, half a point per quest and a point per 7 streak days', () => {
    const records: Records = {
      ...none,
      workouts: [
        workout('a', '2026-10-20'),
        workout('b', '2026-10-20'),
        workout('c', '2026-10-22'),
      ],
    };
    expect(
      musclePoints({
        records,
        questsCompletedOn: ['2026-10-21', '2026-10-25', '2026-10-25'],
        streakDays: 15,
        today,
      }),
    ).toBe(2 + 1.5 + 2);
  });

  it('only looks at the 28 days up to today', () => {
    const records: Records = {
      ...none,
      workouts: [
        workout('old', addDays(today, -28)),
        workout('in', addDays(today, -27)),
        workout('future', addDays(today, 1)),
      ],
    };
    expect(
      musclePoints({
        records,
        questsCompletedOn: [addDays(today, -40), today],
        streakDays: 0,
        today,
      }),
    ).toBe(1 + 0.5);
  });
});

describe('muscleFrom', () => {
  it.each([
    [0, 0],
    [3.5, 0],
    [4, 1],
    [9.5, 1],
    [10, 2],
    [18, 3],
    [27.5, 3],
    [28, 4],
    [100, 4],
  ])('%d points -> muscle %d', (points, muscle) => {
    expect(muscleFrom(points)).toBe(muscle);
  });
});

describe('buildFrom', () => {
  const target = 2000;
  const days = (totals: number[]) => totals.flatMap((t, i) => day(addDays(today, -1 - i), t));

  it('is 0 with fewer than 3 counted days', () => {
    expect(buildFrom({ ...none, foodEntries: days([4000, 4000]) }, target, today)).toBe(0);
  });

  it('steps at +10% / +25% over and -15% / -30% under the average', () => {
    expect(buildFrom({ ...none, foodEntries: days([2000, 2000, 2000]) }, target, today)).toBe(0);
    expect(buildFrom({ ...none, foodEntries: days([2210, 2210, 2210]) }, target, today)).toBe(1);
    expect(buildFrom({ ...none, foodEntries: days([2600, 2700, 2500]) }, target, today)).toBe(2);
    expect(buildFrom({ ...none, foodEntries: days([1680, 1680, 1680]) }, target, today)).toBe(-1);
    expect(buildFrom({ ...none, foodEntries: days([1300, 1350, 1400]) }, target, today)).toBe(-2);
  });

  it('exactly on a threshold does not cross it', () => {
    expect(buildFrom({ ...none, foodEntries: days([2200, 2200, 2200]) }, target, today)).toBe(0);
    expect(buildFrom({ ...none, foodEntries: days([1700, 1700, 1700]) }, target, today)).toBe(0);
  });

  it('ignores today, days with a single entry, and days more than 14 back', () => {
    const entries = [
      ...day(today, 500), // today is not finished
      meal('single', addDays(today, -1), 300), // one entry: probably not a full day of logging
      ...day(addDays(today, -15), 500), // too old
      ...day(addDays(today, -2), 2000),
      ...day(addDays(today, -3), 2000),
      ...day(addDays(today, -14), 2000),
    ];
    expect(buildFrom({ ...none, foodEntries: entries }, target, today)).toBe(0);
  });

  it('is 0 without a calorie target', () => {
    expect(buildFrom({ ...none, foodEntries: days([4000, 4000, 4000]) }, undefined, today)).toBe(0);
  });
});

describe('bodyShape', () => {
  it('combines both', () => {
    const records: Records = {
      ...none,
      workouts: Array.from({ length: 12 }, (_, i) => workout(`w${i}`, addDays(today, -i))),
      foodEntries: [0, 1, 2].flatMap((i) => day(addDays(today, -1 - i), 2600)),
    };
    expect(
      bodyShape({ records, questsCompletedOn: [], streakDays: 0, targetKcal: 2000, today }),
    ).toEqual({ muscle: 2, build: 2 });
  });

  it('does not mutate the records', () => {
    const records: Records = { ...none, foodEntries: day('2026-10-25', 2000) };
    const copy = structuredClone(records);
    bodyShape({ records, questsCompletedOn: [], streakDays: 3, targetKcal: 2000, today });
    expect(records).toEqual(copy);
  });
});
