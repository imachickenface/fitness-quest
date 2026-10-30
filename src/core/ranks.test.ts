import { describe, expect, it } from 'vitest';
import type { Workout } from '../contract.ts';
import { findExercise } from './exercises.ts';
import { e1rm, exerciseRanks, liftScore, overallRank, TIERS, tierFor } from './ranks.ts';

const lift = (date: string, name: string, sets: Workout['exercises'][0]['sets']): Workout => ({
  id: `${date}-${name}`,
  date,
  loggedAt: `${date}T18:00:00Z`,
  kind: 'strength',
  exercises: [{ name, sets }],
  source: 'manual',
});

describe('e1rm (Epley)', () => {
  it('is the weight for a single, and grows with reps', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 2);
    expect(e1rm(60, 10)).toBeCloseTo(80, 5);
  });
  it('counts at most 15 reps and is 0 for no reps or no weight', () => {
    expect(e1rm(50, 30)).toBe(e1rm(50, 15));
    expect(e1rm(100, 0)).toBe(0);
    expect(e1rm(0, 10)).toBe(0);
  });
});

describe('tierFor', () => {
  it('has nine tiers from Wood to Olympian', () => {
    expect(TIERS).toEqual([
      'Wood',
      'Bronze',
      'Silver',
      'Gold',
      'Platinum',
      'Diamond',
      'Champion',
      'Titan',
      'Olympian',
    ]);
  });
  it.each([
    [0, 'Wood', 'Bronze', 100],
    [99, 'Wood', 'Bronze', 100],
    [100, 'Bronze', 'Silver', 200],
    [324, 'Silver', 'Gold', 325],
    [449, 'Gold', 'Platinum', 450],
    [575, 'Diamond', 'Champion', 700],
    [824, 'Champion', 'Titan', 825],
    [949, 'Titan', 'Olympian', 950],
  ] as const)('score %i is %s (next %s at %i)', (score, tier, next, at) => {
    expect(tierFor(score)).toEqual({ tier, index: TIERS.indexOf(tier), next: { tier: next, at } });
  });
  it('Olympian has no next tier', () => {
    expect(tierFor(1000)).toEqual({ tier: 'Olympian', index: 8 });
  });
});

describe('liftScore', () => {
  const bench = findExercise('bench press')!;
  it('scores e1RM per kilo of bodyweight against the standard, curved, 0-1000', () => {
    // 80 kg man, e1RM 116.67: ratio 1.458 of 2.0 -> 1000 * 0.729^0.8 = 777
    expect(liftScore(bench, e1rm(100, 5), 80, 'male')).toBe(777);
    // matches Liftoff's reported example: 102 kg x 10 at 75 kg is Titan
    expect(tierFor(liftScore(bench, e1rm(102, 10), 75, 'male')).tier).toBe('Titan');
  });
  it('caps at 1000', () => {
    expect(liftScore(bench, 300, 80, 'male')).toBe(1000);
  });
  it('uses lower standards for women: 0.62 upper body, 0.72 lower body', () => {
    // 60 kg woman, bench e1RM 60: ratio 1.0 of 2.0 x 0.62 = 1.24 -> 1000 * 0.806^0.8 = 842
    expect(liftScore(bench, 60, 60, 'female')).toBe(842);
    const squat = findExercise('squat')!;
    // squat e1RM 90 at 60 kg: ratio 1.5 of 2.6 x 0.72 = 1.872 -> 1000 * 0.801^0.8 = 838
    expect(liftScore(squat, 90, 60, 'female')).toBe(838);
  });
  it('is 0 for an exercise without a standard or bad bodyweight', () => {
    expect(liftScore({ ...bench, top: undefined }, 100, 80, 'male')).toBe(0);
    expect(liftScore(bench, 100, 0, 'male')).toBe(0);
  });
});

describe('exerciseRanks with efforts', () => {
  const rated = (rir: number | undefined, rpe?: number): Workout => ({
    ...lift('2026-10-20', 'Bench', [{ reps: 5, weightKg: 100, ...(rpe ? { rpe } : {}) }]),
    exercises: [
      {
        name: 'Bench',
        sets: [{ reps: 5, weightKg: 100, ...(rpe ? { rpe } : {}) }],
        ...(rir === undefined ? {} : { rir }),
      },
    ],
  });
  const e1 = (w: Workout) => exerciseRanks([w], 80, 'male')[0]!.e1rmKg;

  it('reads a rated set off the effort chart', () => {
    // 5 reps at RIR 2 is 77.5% of a max
    expect(e1(rated(2))).toBeCloseTo(129.03, 2);
    expect(e1(rated(undefined, 8))).toBeCloseTo(129.03, 2);
  });

  it('keeps Epley for unrated sets and for sets too easy to tell', () => {
    expect(e1(rated(undefined))).toBeCloseTo(116.667, 2);
    expect(e1(rated(7.5))).toBeCloseTo(116.667, 2);
  });
});

describe('exerciseRanks', () => {
  const workouts = [
    lift('2026-10-20', 'Bench', [
      { reps: 8, weightKg: 80 },
      { reps: 5, weightKg: 90 },
    ]),
    lift('2026-10-22', 'flat bench press', [{ reps: 3, weightKg: 92.5 }]),
    lift('2026-10-21', 'Pull ups', [{ reps: 8 }, { reps: 5, weightKg: 10 }]),
    lift('2026-10-21', 'Mystery machine', [{ reps: 10, weightKg: 50 }]),
    lift('2026-10-23', 'DB curl', [{ reps: 10, weightKg: 14 }]),
  ];

  it('keeps the best set per known exercise, highest score first', () => {
    const r = exerciseRanks(workouts, 80, 'male');
    expect(r.map((x) => x.exercise.id)).toEqual(['pull-up', 'bench-press', 'dumbbell-curl']);
    const bench = r.find((x) => x.exercise.id === 'bench-press')!;
    // 90 x 5 -> 105, 92.5 x 3 -> 101.75, 80 x 8 -> 101.33
    expect(bench.best).toEqual({ weightKg: 90, reps: 5, date: '2026-10-20' });
    expect(bench.e1rmKg).toBeCloseTo(105, 5);
    expect(bench.tier).toBe(tierFor(bench.score).tier);
  });

  it('adds bodyweight for bodyweight exercises', () => {
    const pull = exerciseRanks(workouts, 80, 'male').find((x) => x.exercise.id === 'pull-up')!;
    // (80 + 10) x 5 -> 105 beats 80 x 8 -> 101.33
    expect(pull.best).toEqual({ weightKg: 10, reps: 5, date: '2026-10-21' });
    expect(pull.e1rmKg).toBeCloseTo(105, 5);
  });

  it('skips sets with no reps, and weighted exercises logged without a weight', () => {
    const r = exerciseRanks(
      [lift('2026-10-20', 'Squat', [{ reps: 5 }, { weightKg: 100 }])],
      80,
      'male',
    );
    expect(r).toEqual([]);
  });

  it('does not reorder its input', () => {
    const copy = structuredClone(workouts);
    exerciseRanks(workouts, 80, 'male');
    expect(workouts).toEqual(copy);
  });
});

describe('overallRank', () => {
  it('is the rounded mean of the best six scores', () => {
    const fake = (score: number) => ({ score }) as Parameters<typeof overallRank>[0][number];
    expect(
      overallRank([fake(900), fake(100), fake(800), fake(700), fake(600), fake(500), fake(400)]),
    ).toEqual({
      score: 650,
      ...tierFor(650),
    });
    expect(overallRank([])).toEqual({ score: 0, ...tierFor(0) });
  });
});
