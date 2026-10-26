import { describe, expect, it } from 'vitest';
import type { FoodEntry, Quest, QuestCondition, WeighIn, Workout } from '../../contract.ts';
import * as fx from '../../test/fixtures.ts';
import type { Records } from '../records.ts';
import { questProgress } from './evaluate.ts';

function quest(condition: QuestCondition, start = '2026-10-26', end = '2026-11-01'): Quest {
  return { ...fx.dailyQuest, id: 'q', condition, window: { start, end } };
}

function food(id: string, date: string, kcal: number, time = '08:00'): FoodEntry {
  return { ...fx.foodEntry, id, date, loggedAt: `${date}T${time}:00Z`, nutrition: { kcal } };
}

function lift(
  id: string,
  date: string,
  name: string,
  sets: Workout['exercises'][0]['sets'],
): Workout {
  return {
    id,
    date,
    loggedAt: `${date}T18:00:00Z`,
    kind: 'strength',
    exercises: [{ name, sets }],
    source: 'manual',
  };
}

function run(id: string, date: string, distanceM: number, durationS?: number): Workout {
  return {
    id,
    date,
    loggedAt: `${date}T07:00:00Z`,
    kind: 'run',
    exercises: [{ name: 'Run', sets: [{ distanceM, ...(durationS ? { durationS } : {}) }] }],
    source: 'manual',
  };
}

const none: Records = { foodEntries: [], workouts: [], weighIns: [] };
const recs = (r: Partial<Records>): Records => ({ ...none, ...r });

describe('every condition', () => {
  it('reports questId, a fraction in 0..1 and no completedOn while incomplete', () => {
    const conditions: QuestCondition[] = [
      { type: 'log_meals', count: 3 },
      { type: 'kcal_in_range', days: 1, minKcal: 1800, maxKcal: 2200 },
      { type: 'workout_count', count: 2 },
      { type: 'exercise_volume', exercise: 'Squat', kg: 1000 },
      { type: 'beat_pr', exercise: 'Squat', weightKg: 100, reps: 5 },
      { type: 'run_distance', meters: 10000, single: false },
      { type: 'run_time', meters: 5000, maxSeconds: 1800 },
      { type: 'program_session', sessionId: 'p1-w1-d1' },
      { type: 'weigh_in', count: 2 },
    ];
    for (const c of conditions) {
      const p = questProgress(quest(c), none);
      expect(p).toMatchObject({ questId: 'q', fraction: 0, complete: false });
      expect(p).not.toHaveProperty('completedOn');
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('ignores records outside the window', () => {
    const q = quest({ type: 'log_meals', count: 1 }, '2026-10-26', '2026-10-26');
    const p = questProgress(
      q,
      recs({ foodEntries: [food('a', '2026-10-25', 100), food('b', '2026-10-27', 100)] }),
    );
    expect(p.complete).toBe(false);
  });
});

describe('labels', () => {
  it('use the singular for a target of 1', () => {
    expect(questProgress(quest({ type: 'weigh_in', count: 1 }), none).label).toBe('0 / 1 weigh-in');
    expect(
      questProgress(quest({ type: 'kcal_in_range', days: 1, minKcal: 1, maxKcal: 2 }), none).label,
    ).toBe('0 / 1 day on target');
  });
});

describe('log_meals', () => {
  it('counts entries and completes on the day the count is reached', () => {
    const q = quest({ type: 'log_meals', count: 3 });
    const two = recs({ foodEntries: [food('a', '2026-10-26', 1), food('b', '2026-10-27', 1)] });
    expect(questProgress(q, two)).toMatchObject({ fraction: 2 / 3, label: '2 / 3 meals' });
    const four = recs({
      foodEntries: [
        food('d', '2026-10-29', 1),
        food('b', '2026-10-27', 1),
        food('a', '2026-10-26', 1),
        food('c', '2026-10-28', 1),
      ],
    });
    expect(questProgress(q, four)).toEqual({
      questId: 'q',
      fraction: 1,
      label: '3 / 3 meals',
      complete: true,
      completedOn: '2026-10-28',
    });
  });
});

describe('kcal_in_range', () => {
  it('counts days whose total lands inside the range, inclusive', () => {
    const q = quest({ type: 'kcal_in_range', days: 2, minKcal: 1800, maxKcal: 2200 });
    const r = recs({
      foodEntries: [
        food('a', '2026-10-26', 1000),
        food('b', '2026-10-26', 800), // 1800: in
        food('c', '2026-10-27', 2500), // over
        food('d', '2026-10-28', 2200), // in
        food('e', '2026-10-29', 1000), // under
      ],
    });
    expect(questProgress(q, r)).toMatchObject({
      fraction: 1,
      complete: true,
      completedOn: '2026-10-28',
      label: '2 / 2 days on target',
    });
  });
});

describe('workout_count', () => {
  it('counts all workouts, or only the given kind', () => {
    const r = recs({
      workouts: [run('r1', '2026-10-26', 3000), lift('l1', '2026-10-27', 'Squat', [{ reps: 5 }])],
    });
    expect(questProgress(quest({ type: 'workout_count', count: 2 }), r)).toMatchObject({
      complete: true,
      completedOn: '2026-10-27',
      label: '2 / 2 workouts',
    });
    expect(questProgress(quest({ type: 'workout_count', count: 2, kind: 'run' }), r)).toMatchObject(
      { fraction: 0.5, complete: false, label: '1 / 2 workouts' },
    );
  });
});

describe('exercise_volume', () => {
  it('sums reps x kg for the exercise, matching names loosely', () => {
    const q = quest({ type: 'exercise_volume', exercise: 'Bench Press', kg: 1000 });
    const r = recs({
      workouts: [
        lift('w1', '2026-10-26', 'bench  press', [
          { reps: 8, weightKg: 50 },
          { reps: 8 }, // no weight: adds nothing
        ]),
        lift('w2', '2026-10-27', 'Squat', [{ reps: 5, weightKg: 200 }]),
        lift('w3', '2026-10-28', 'BENCH PRESS ', [{ reps: 10, weightKg: 60 }]),
      ],
    });
    expect(questProgress(q, r)).toMatchObject({
      fraction: 1,
      complete: true,
      completedOn: '2026-10-28',
      label: '1000 / 1000 kg',
    });
  });

  it('rounds the label down to whole kg and caps the fraction', () => {
    const q = quest({ type: 'exercise_volume', exercise: 'Row', kg: 1000 });
    const r = recs({ workouts: [lift('w', '2026-10-26', 'Row', [{ reps: 3, weightKg: 52.5 }])] });
    expect(questProgress(q, r)).toMatchObject({ fraction: 0.1575, label: '157 / 1000 kg' });
  });
});

describe('beat_pr', () => {
  const q = quest({ type: 'beat_pr', exercise: 'Bench Press', weightKg: 62.5, reps: 8 });

  it('needs one set with at least the weight and the reps', () => {
    const r = recs({
      workouts: [
        lift('w1', '2026-10-26', 'Bench Press', [
          { reps: 10, weightKg: 60 },
          { reps: 6, weightKg: 65 },
        ]),
      ],
    });
    const p = questProgress(q, r);
    expect(p.complete).toBe(false);
    expect(p.fraction).toBeLessThan(1);
    expect(p.fraction).toBeGreaterThan(0);

    const r2 = recs({
      workouts: [
        ...r.workouts,
        lift('w2', '2026-10-30', 'bench press', [{ reps: 8, weightKg: 62.5 }]),
      ],
    });
    expect(questProgress(q, r2)).toMatchObject({
      fraction: 1,
      complete: true,
      completedOn: '2026-10-30',
    });
  });

  it('partial fraction is the best set of min(1, kg/target) x min(1, reps/target)', () => {
    const r = recs({
      workouts: [lift('w', '2026-10-26', 'Bench Press', [{ reps: 4, weightKg: 62.5 }])],
    });
    expect(questProgress(q, r).fraction).toBe(0.5);
  });
});

describe('run_distance', () => {
  const r = recs({
    workouts: [
      run('a', '2026-10-26', 3000),
      run('b', '2026-10-28', 4000),
      lift('c', '2026-10-28', 'Squat', [{ reps: 5, weightKg: 100 }]),
    ],
  });
  it('adds up runs', () => {
    expect(
      questProgress(quest({ type: 'run_distance', meters: 7000, single: false }), r),
    ).toMatchObject({ complete: true, completedOn: '2026-10-28', label: '7.0 / 7.0 km' });
  });
  it('or takes the longest single run', () => {
    expect(
      questProgress(quest({ type: 'run_distance', meters: 5000, single: true }), r),
    ).toMatchObject({ fraction: 0.8, complete: false, label: '4.0 / 5.0 km' });
  });
});

describe('run_time', () => {
  const q = quest({ type: 'run_time', meters: 5000, maxSeconds: 1800 });
  it('needs one run that is long enough and fast enough', () => {
    const slow = recs({
      workouts: [run('a', '2026-10-26', 5000, 1900), run('b', '2026-10-27', 4000, 1200)],
    });
    expect(questProgress(q, slow)).toMatchObject({ fraction: 0, complete: false });
    const ok = recs({ workouts: [...slow.workouts, run('c', '2026-10-29', 5100, 1790)] });
    expect(questProgress(q, ok)).toMatchObject({
      fraction: 1,
      complete: true,
      completedOn: '2026-10-29',
    });
  });
  it('a run without a time does not count', () => {
    expect(questProgress(q, recs({ workouts: [run('a', '2026-10-26', 6000)] })).complete).toBe(
      false,
    );
  });
});

describe('program_session', () => {
  it('completes when a workout is linked to the session', () => {
    const w: Workout = { ...run('a', '2026-10-27', 3000), programSessionId: 'p1-w1-d1' };
    expect(
      questProgress(
        quest({ type: 'program_session', sessionId: 'p1-w1-d1' }),
        recs({ workouts: [w] }),
      ),
    ).toMatchObject({ complete: true, completedOn: '2026-10-27', fraction: 1 });
  });
});

describe('weigh_in', () => {
  it('counts weigh-in days', () => {
    const w: WeighIn[] = [
      { date: '2026-10-30', kg: 80 },
      { date: '2026-10-27', kg: 81 },
      { date: '2026-10-20', kg: 82 },
    ];
    expect(
      questProgress(quest({ type: 'weigh_in', count: 2 }), recs({ weighIns: w })),
    ).toMatchObject({
      complete: true,
      completedOn: '2026-10-30',
      label: '2 / 2 weigh-ins',
    });
  });
});

it('does not mutate the records', () => {
  const r = recs({
    foodEntries: [food('b', '2026-10-27', 1), food('a', '2026-10-26', 1)],
    workouts: [run('b', '2026-10-28', 4000), run('a', '2026-10-26', 3000)],
  });
  const copy = structuredClone(r);
  questProgress(quest({ type: 'log_meals', count: 1 }), r);
  questProgress(quest({ type: 'run_distance', meters: 1, single: false }), r);
  expect(r).toEqual(copy);
});
