import { describe, expect, it } from 'vitest';
import type { ExerciseLog, Workout } from '../contract.ts';
import { activeKcal, burnedOn, cardioMet, workoutBurn } from './burn.ts';

const sets = (n: number) => Array.from({ length: n }, () => ({ reps: 8, weightKg: 50 }));
const lifts = (rirs: (number | undefined)[], perExercise = 3): ExerciseLog[] =>
  rirs.map((rir, i) => ({
    name: `Lift ${i}`,
    sets: sets(perExercise),
    ...(rir === undefined ? {} : { rir }),
  }));
const w = (over: Partial<Workout> & Pick<Workout, 'kind' | 'exercises'>): Workout => ({
  id: 'w',
  date: '2026-10-29',
  loggedAt: '2026-10-29T10:00:00.000Z',
  source: 'manual',
  ...over,
});

describe('activeKcal', () => {
  it('is (MET - 1) x kg x hours, never below 0', () => {
    expect(activeKcal(3.5, 80, 60)).toBe(200);
    expect(activeKcal(0.5, 80, 60)).toBe(0);
    expect(activeKcal(5, 80, 0)).toBe(0);
  });
});

describe('cardioMet', () => {
  it('knows a few activities and takes the lowest when a name lists several', () => {
    expect(cardioMet('Cycling')).toBe(7.5);
    expect(cardioMet('Bike ride')).toBe(7.5);
    expect(cardioMet('swimming')).toBe(6);
    expect(cardioMet('Elliptical')).toBe(5);
    expect(cardioMet('Walk')).toBe(3.5);
    expect(cardioMet('Brisk walk, bike or rower')).toBe(3.5);
    expect(cardioMet('Zumba')).toBe(5);
  });
});

describe('workoutBurn', () => {
  it('counts lifting at 3.5 MET and 3 minutes a set', () => {
    // 12 sets = 36 min; 2.5 x 80 x 0.6 = 120
    expect(workoutBurn(w({ kind: 'strength', exercises: lifts([2, 3.5, undefined, 2]) }), 80)).toBe(
      120,
    );
  });

  it('uses the logged duration when there is one', () => {
    // 2.5 x 80 x 50/60 = 166.7
    expect(
      workoutBurn(w({ kind: 'strength', exercises: lifts([undefined]), durationMin: 50 }), 80),
    ).toBe(167);
  });

  it('counts heavy lifting at 5 MET when the efforts average RPE 9 or more', () => {
    // 4 x 80 x 0.6 = 192
    expect(workoutBurn(w({ kind: 'strength', exercises: lifts([0, 1, undefined, 0.5]) }), 80)).toBe(
      192,
    );
    expect(workoutBurn(w({ kind: 'strength', exercises: lifts([0, 3.5, 0, 1]) }), 80)).toBe(120);
    const imported: ExerciseLog[] = [
      { name: 'Squat', sets: [{ reps: 3, weightKg: 140, rpe: 9.5 }, { reps: 3, weightKg: 140 }] },
    ];
    // 2 sets = 6 min; 4 x 80 x 0.1 = 32
    expect(workoutBurn(w({ kind: 'strength', exercises: imported }), 80)).toBe(32);
  });

  it('counts "other" workouts like lifting', () => {
    // 2 sets = 6 min; 2.5 x 60 x 0.1 = 15
    expect(workoutBurn(w({ kind: 'other', exercises: lifts([undefined], 2) }), 60)).toBe(15);
  });

  it('counts a run at 1 kcal per kg per km less the resting part', () => {
    const run = (distanceM: number, durationS?: number) =>
      w({
        kind: 'run',
        exercises: [{ name: 'Run', sets: [{ distanceM, ...(durationS ? { durationS } : {}) }] }],
      });
    // 70 x 5 - 70 x 0.5 h
    expect(workoutBurn(run(5000, 1800), 70)).toBe(315);
    // no time: 6 minutes a km, so 1 h for 10 km
    expect(workoutBurn(run(10000), 70)).toBe(630);
  });

  it('counts cardio by its activity and duration', () => {
    const cardio = (name: string, durationS?: number, durationMin?: number) =>
      w({
        kind: 'cardio',
        exercises: [{ name, sets: [durationS ? { durationS } : { reps: 1 }] }],
        ...(durationMin ? { durationMin } : {}),
      });
    expect(workoutBurn(cardio('Brisk walk, bike or rower', 1800), 80)).toBe(100);
    expect(workoutBurn(cardio('Cycling', undefined, 60), 80)).toBe(520);
    expect(workoutBurn(cardio('Cycling'), 80)).toBe(0);
  });
});

describe('burnedOn', () => {
  const list: Workout[] = [
    w({
      id: 'b',
      title: 'Evening run',
      loggedAt: '2026-10-29T18:00:00.000Z',
      kind: 'run',
      exercises: [{ name: 'Run', sets: [{ distanceM: 5000, durationS: 1800 }] }],
    }),
    w({ id: 'a', kind: 'strength', exercises: lifts([undefined, undefined]) }),
    w({ id: 'old', date: '2026-10-28', kind: 'strength', exercises: lifts([undefined]) }),
    w({
      id: 'zero',
      kind: 'cardio',
      exercises: [{ name: 'Cycling', sets: [{ reps: 1 }] }],
    }),
  ];

  it('adds up the day, in the order logged, leaving out other days and zeros', () => {
    // a: 6 sets = 18 min, 2.5 x 70 x 0.3 = 52.5 -> 53; b: 315
    expect(burnedOn(list, '2026-10-29', 70)).toEqual({
      total: 368,
      items: [
        { workoutId: 'a', title: 'Lift 0, Lift 1', kcal: 53 },
        { workoutId: 'b', title: 'Evening run', kcal: 315 },
      ],
    });
  });

  it('is nothing without a body weight', () => {
    expect(burnedOn(list, '2026-10-29', 0)).toEqual({ total: 0, items: [] });
  });
});
