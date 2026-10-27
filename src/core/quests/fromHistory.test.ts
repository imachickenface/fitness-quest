import { describe, expect, it } from 'vitest';
import { Quest as QuestSchema } from '../../contract.ts';
import { findExercise } from '../exercises.ts';
import type { ExerciseRank } from '../ranks.ts';
import { bossQuests, loadText, type BossInput } from './fromHistory.ts';

const rank = (id: string, weightKg: number, reps: number, score: number): ExerciseRank => ({
  exercise: findExercise(id)!,
  best: { weightKg, reps, date: '2026-10-20' },
  e1rmKg: 0,
  score,
  tier: 'Gold',
});

const base: BossInput = {
  ranks: [rank('bench press', 100, 5, 714), rank('squat', 140, 3, 690), rank('pull up', 0, 8, 600)],
  style: 'powerlifting',
  units: 'metric',
  goal: 'build_muscle',
  weekIndex: 0,
  stalled: [],
  runs: [],
  monday: '2026-10-26',
  now: '2026-10-26T06:00:00+00:00',
};

describe('bossQuests', () => {
  it('muscle goals: two lift bosses with targets from the progression calculator', () => {
    const qs = bossQuests(base);
    for (const q of qs) expect(QuestSchema.parse(q)).toEqual(q);
    expect(qs.map((q) => [q.id, q.title, q.condition])).toEqual([
      [
        'boss-2026-10-26-bench-press',
        'Beat your Bench press best',
        { type: 'beat_pr', exercise: 'Bench press', weightKg: 102.5, reps: 5 },
      ],
      [
        'boss-2026-10-26-squat',
        'Beat your Squat best',
        { type: 'beat_pr', exercise: 'Squat', weightKg: 145, reps: 3 },
      ],
    ]);
    expect(qs[0]).toMatchObject({
      kind: 'boss',
      origin: 'history',
      xp: 150,
      window: { start: '2026-10-26', end: '2026-11-01' },
    });
    expect(qs[0]!.description).toMatch(/^Lift 102.5 kg for 5 reps\. .{10,}/);
  });

  it('a deload week turns them into lighter deload bosses', () => {
    const qs = bossQuests({ ...base, weekIndex: 3 });
    expect(qs[0]).toMatchObject({
      title: 'Deload: Bench press',
      condition: { weightKg: 60, reps: 5 },
      xp: 80,
    });
  });

  it('a stalled lift gets a 10% reset', () => {
    const qs = bossQuests({ ...base, stalled: ['squat'] });
    expect(qs[1]).toMatchObject({ title: 'Deload: Squat', condition: { weightKg: 125, reps: 3 } });
    expect(qs[0]!.title).toBe('Beat your Bench press best');
  });

  it('writes weights in pounds for imperial users', () => {
    expect(loadText(102.1, 'imperial')).toBe('225 lb');
    const qs = bossQuests({
      ...base,
      units: 'imperial',
      ranks: [rank('bench press', 83.9, 5, 700)],
    });
    expect(qs[0]!.description).toMatch(/^Lift 190 lb for 5 reps\./);
  });

  it('running goals: one lift boss plus a run boss', () => {
    const runs = [{ distanceM: 5000, durationS: 1650 }];
    const distance = bossQuests({ ...base, goal: 'ten_k', runs, weekIndex: 0 });
    expect(distance.map((q) => q.id)).toEqual([
      'boss-2026-10-26-bench-press',
      'boss-2026-10-26-run',
    ]);
    expect(distance[1]).toMatchObject({
      title: 'Long run: 5.5 km',
      condition: { type: 'run_distance', meters: 5500, single: true },
    });
    const speed = bossQuests({ ...base, goal: 'five_k', runs, weekIndex: 1 });
    expect(speed[1]).toMatchObject({
      title: 'Run 5 km in 26:55',
      condition: { type: 'run_time', meters: 5000, maxSeconds: 1615 },
    });
    const cutBack = bossQuests({ ...base, goal: 'ten_k', runs, weekIndex: 3 });
    expect(cutBack.at(-1)).toMatchObject({ title: 'Cut-back run: 3.5 km', xp: 80 });
  });

  it('weight goals add a calorie boss', () => {
    const qs = bossQuests({ ...base, goal: 'lose_weight', targetKcal: 2000 });
    expect(qs.map((q) => q.id)).toEqual(['boss-2026-10-26-bench-press', 'boss-2026-10-26-kcal']);
    expect(qs[1]!.condition).toEqual({
      type: 'kcal_in_range',
      days: 5,
      minKcal: 1800,
      maxKcal: 2200,
    });
  });

  it('makes no lift bosses without ranked lifts', () => {
    expect(bossQuests({ ...base, ranks: [] })).toEqual([]);
  });
});
