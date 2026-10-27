import { describe, expect, it } from 'vitest';
import { Quest as QuestSchema, type FoodEntry, type Workout } from '../../contract.ts';
import * as fx from '../../test/fixtures.ts';
import { addDays } from '../dates.ts';
import { dailyQuests, seedFor, weekStart, weeklyQuest, type QuestInput } from './daily.ts';
import type { Records } from '../records.ts';

const now = '2026-10-26T06:00:00+00:00';
const none: Records = { foodEntries: [], workouts: [], weighIns: [] };
const base: QuestInput = { date: '2026-10-26', records: none, goal: 'maintain', now };

const food = (id: string, date: string): FoodEntry => ({
  ...fx.foodEntry,
  id,
  date,
  loggedAt: `${date}T08:00:00Z`,
});
const run = (id: string, date: string, distanceM: number): Workout => ({
  ...fx.runWorkout,
  id,
  date,
  loggedAt: `${date}T07:00:00Z`,
  exercises: [{ name: 'Run', sets: [{ distanceM }] }],
});
const lift = (id: string, date: string): Workout => ({
  ...fx.strengthWorkout,
  id,
  date,
  loggedAt: `${date}T18:00:00Z`,
});
const byId = <T extends { id: string }>(qs: T[], suffix: string) =>
  qs.find((q) => q.id.endsWith(suffix));

describe('seedFor', () => {
  it('is 32-bit FNV-1a', () => {
    expect(seedFor('')).toBe(2166136261);
    expect(seedFor('a')).toBe(0xe40c292c);
    expect(seedFor('2026-10-26')).toBe(seedFor('2026-10-26'));
  });
});

describe('weekStart', () => {
  it('is the Monday of the week', () => {
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // a Monday
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(weekStart('2026-10-28')).toBe('2026-10-26');
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // across a year
  });
});

describe('dailyQuests', () => {
  it('makes valid daily quests for that one day, with stable ids', () => {
    const qs = dailyQuests({ ...base, target: { kcal: 2000 } });
    expect(qs.map((q) => q.id)).toEqual([
      'daily-2026-10-26-meals',
      'daily-2026-10-26-kcal',
      'daily-2026-10-26-move',
    ]);
    for (const q of qs) {
      expect(QuestSchema.parse(q)).toEqual(q);
      expect(q).toMatchObject({
        kind: 'daily',
        origin: 'daily',
        window: { start: '2026-10-26', end: '2026-10-26' },
        createdAt: now,
      });
    }
  });

  it('is deterministic', () => {
    expect(dailyQuests(base)).toEqual(dailyQuests(base));
  });

  it('meals: 2 with no history, else the median meals per logged day, kept within 2..4', () => {
    expect(byId(dailyQuests(base), 'meals')?.condition).toEqual({ type: 'log_meals', count: 2 });

    const three = Array.from({ length: 5 }, (_, d) =>
      Array.from({ length: 3 }, (_, i) => food(`f${d}-${i}`, addDays('2026-10-26', -1 - d))),
    ).flat();
    expect(
      byId(dailyQuests({ ...base, records: { ...none, foodEntries: three } }), 'meals')?.condition,
    ).toEqual({ type: 'log_meals', count: 3 });

    const eight = Array.from({ length: 8 }, (_, i) => food(`e${i}`, '2026-10-25'));
    expect(
      byId(dailyQuests({ ...base, records: { ...none, foodEntries: eight } }), 'meals')?.condition,
    ).toEqual({ type: 'log_meals', count: 4 });
  });

  it('only looks at the 14 days before the date', () => {
    const old = Array.from({ length: 4 }, (_, i) => food(`o${i}`, '2026-10-11')); // 15 days back
    const today = Array.from({ length: 4 }, (_, i) => food(`t${i}`, '2026-10-26'));
    const qs = dailyQuests({ ...base, records: { ...none, foodEntries: [...old, ...today] } });
    expect(byId(qs, 'meals')?.condition).toEqual({ type: 'log_meals', count: 2 });
  });

  it('calories: +-10% of the target rounded to 10 kcal, and left out with no target', () => {
    expect(byId(dailyQuests({ ...base, target: { kcal: 2155 } }), 'kcal')?.condition).toEqual({
      type: 'kcal_in_range',
      days: 1,
      minKcal: 1940,
      maxKcal: 2370,
    });
    expect(byId(dailyQuests(base), 'kcal')).toBeUndefined();
  });

  it('move: weigh-in only, for someone with no workouts and a non-running goal', () => {
    for (let i = 0; i < 20; i++) {
      const q = byId(dailyQuests({ ...base, date: addDays('2026-10-26', i) }), 'move');
      expect(q?.condition).toEqual({ type: 'weigh_in', count: 1 });
    }
  });

  it('move: rotates through workout, run and weigh-in for a runner who lifts', () => {
    const records: Records = {
      ...none,
      workouts: [
        run('r1', '2026-10-20', 5200),
        run('r2', '2026-10-22', 4100),
        run('r3', '2026-10-24', 6000),
        lift('l1', '2026-10-23'),
      ],
    };
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const date = addDays('2026-10-25', i);
      const q = byId(dailyQuests({ ...base, date, records }), 'move');
      const c = q?.condition;
      if (!c) throw new Error('no move quest');
      seen.add(c.type);
      if (c.type === 'run_distance')
        expect(c).toEqual({ type: 'run_distance', meters: 5000, single: true });
      if (c.type === 'workout_count') expect(c).toEqual({ type: 'workout_count', count: 1 });
    }
    // over a month every option comes up
    for (let i = 0; i < 30; i++) {
      const c = byId(
        dailyQuests({ ...base, date: addDays('2026-10-26', i), records }),
        'move',
      )?.condition;
      if (c) seen.add(c.type);
    }
    expect([...seen].sort()).toEqual(['run_distance', 'weigh_in', 'workout_count']);
  });

  it('move: a running goal with no runs yet suggests 2 km', () => {
    const qs = Array.from({ length: 30 }, (_, i) =>
      byId(dailyQuests({ ...base, goal: 'five_k', date: addDays('2026-10-26', i) }), 'move'),
    );
    const runQ = qs.find((q) => q?.condition.type === 'run_distance');
    expect(runQ?.condition).toEqual({ type: 'run_distance', meters: 2000, single: true });
  });

  it('the goal tilts the move quest: muscle goals train, running goals run', () => {
    const count = (goal: QuestInput['goal'], type: string) =>
      Array.from({ length: 90 }, (_, i) =>
        byId(dailyQuests({ ...base, goal, date: addDays('2026-10-26', i) }), 'move'),
      ).filter((q) => q?.condition.type === type).length;
    // no history: a muscle goal still gets workout quests, about two days in three
    expect(count('build_muscle', 'workout_count')).toBeGreaterThan(45);
    expect(count('maintain', 'workout_count')).toBe(0);
    // a running goal with no runs yet: run quests about two days in three
    expect(count('ten_k', 'run_distance')).toBeGreaterThan(45);
  });

  it('does not mutate the records', () => {
    const records: Records = {
      ...none,
      foodEntries: [food('b', '2026-10-25'), food('a', '2026-10-24')],
    };
    const copy = structuredClone(records);
    dailyQuests({ ...base, records });
    expect(records).toEqual(copy);
  });
});

describe('weeklyQuest', () => {
  it('asks for 2 workouts with no history, over Monday to Sunday', () => {
    const q = weeklyQuest({ ...base, date: '2026-10-29' });
    expect(QuestSchema.parse(q)).toEqual(q);
    expect(q).toMatchObject({
      id: 'weekly-2026-10-26',
      kind: 'weekly',
      window: { start: '2026-10-26', end: '2026-11-01' },
      condition: { type: 'workout_count', count: 2 },
      xp: 100,
    });
  });

  it("matches the user's average over the 4 weeks before, within 1..6", () => {
    // 3 workouts a week for 4 weeks before 2026-10-26
    const workouts = Array.from({ length: 12 }, (_, i) =>
      lift(`w${i}`, addDays('2026-10-25', -Math.floor(i * 2.3))),
    );
    expect(weeklyQuest({ ...base, records: { ...none, workouts } }).condition).toEqual({
      type: 'workout_count',
      count: 3,
    });
    const lots = Array.from({ length: 60 }, (_, i) =>
      lift(`x${i}`, addDays('2026-10-25', -(i % 28))),
    );
    expect(weeklyQuest({ ...base, records: { ...none, workouts: lots } }).condition).toEqual({
      type: 'workout_count',
      count: 6,
    });
  });
});
