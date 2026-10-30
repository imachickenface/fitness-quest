import { describe, expect, it } from 'vitest';
import type { Workout } from '../contract.ts';
import { findExercise, type Exercise } from './exercises.ts';
import { aimRir, effortTarget, lastEffort } from './progression.ts';

const ex = (name: string): Exercise => findExercise(name)!;
const bench = ex('Bench press');
const curl = ex('Dumbbell curl');
const pullUp = ex('Pull-up');

describe('aimRir', () => {
  it('aims for RPE 8 in powerlifting and calisthenics, 8.5 in bodybuilding, 5-6 when deloading', () => {
    expect(aimRir('powerlifting', false)).toBe(2);
    expect(aimRir('calisthenics', false)).toBe(2);
    expect(aimRir('bodybuilding', false)).toBe(1.5);
    expect(aimRir('bodybuilding', true)).toBe(4.5);
    expect(aimRir('powerlifting', true)).toBe(4.5);
  });
});

describe('effortTarget for weighted lifts', () => {
  it('reads the next weight off the chart when there was room left', () => {
    // 100 x 8 at RIR 3-4 (67.5%) -> e1RM 148.1; 8 reps at RIR 1-2 is 72.5% -> 107.4 -> 107.5
    const t = effortTarget('bodybuilding', bench, { weightKg: 100, reps: 8, rir: 3.5 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 107.5, reps: 8, deload: false });
    expect(t!.why).toMatch(/RPE/);
  });

  it('uses the style aim: powerlifting aims for RPE 8', () => {
    // e1RM 148.1 x 70% = 103.7 -> 102.5
    const t = effortTarget('powerlifting', bench, { weightKg: 100, reps: 8, rir: 3.5 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 102.5, reps: 8 });
  });

  it('lowers the weight after a set at absolute max', () => {
    // 100 x 5 at RIR 0 (86.3%) -> 115.9; 5 reps at RIR 1-2 is 80% -> 92.7 -> 92.5
    const t = effortTarget('bodybuilding', bench, { weightKg: 100, reps: 5, rir: 0 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 92.5, reps: 5 });
  });

  it('converts to the planned reps', () => {
    // 100 x 10 at RIR 2 (65%) -> 153.8; 5 reps at RIR 2 is 77.5% -> 119.2 -> 120
    const t = effortTarget('powerlifting', bench, { weightKg: 100, reps: 10, rir: 2 }, 'metric', {
      reps: 5,
    });
    expect(t).toMatchObject({ weightKg: 120, reps: 5 });
  });

  it('moves the e1RM at most 10% from what the set would show at the aimed effort', () => {
    // 100 x 10 at RIR 0 (73.9%) -> 135.3; at RIR 2 it would be 153.8; floor 0.9 x 153.8 = 138.5;
    // 10 reps at 65% -> 90 (87.5 without the cap)
    const t = effortTarget('powerlifting', bench, { weightKg: 100, reps: 10, rir: 0 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 90, reps: 10 });
  });

  it('reads a too-easy set as RIR 4-5, so it never claims more than the chart can say', () => {
    // RIR 9-10 counts as 4.5: 100 x 5 at 72.5% -> 137.9; 5 reps at 77.5% -> 106.9 -> 107.5
    const t = effortTarget('powerlifting', bench, { weightKg: 100, reps: 5, rir: 9.5 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 107.5, reps: 5 });
  });

  it('adds a rep when the weight rounds to the same plate and there was room left', () => {
    // 12 kg dumbbells x 10 at RIR 2 (65%) -> 18.46; 10 reps at 67.5% -> 12.46 -> 12 kg (1 kg steps)
    const t = effortTarget('bodybuilding', curl, { weightKg: 12, reps: 10, rir: 2 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 12, reps: 11 });
  });

  it('keeps the same weight and reps when the effort was what it aimed for', () => {
    const t = effortTarget('powerlifting', bench, { weightKg: 100, reps: 5, rir: 2 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 100, reps: 5 });
  });

  it('snaps to 5 lb plates in imperial', () => {
    // 107.4 kg = 236.8 lb -> 235 lb = 106.6 kg
    const t = effortTarget('bodybuilding', bench, { weightKg: 100, reps: 8, rir: 3.5 }, 'imperial', {});
    expect(t).toMatchObject({ weightKg: 106.6, reps: 8 });
  });

  it('gives up past 15 reps, so the old rules apply', () => {
    expect(
      effortTarget('bodybuilding', bench, { weightKg: 40, reps: 20, rir: 2 }, 'metric', {}),
    ).toBeUndefined();
  });

  it('does not change its input', () => {
    const last = Object.freeze({ weightKg: 100, reps: 8, rir: 3.5 });
    expect(() => effortTarget('bodybuilding', bench, last, 'metric', { reps: 6 })).not.toThrow();
  });
});

describe('effortTarget for bodyweight moves', () => {
  it('turns reps left in the tank into reps', () => {
    // 8 reps at RIR 3-4: about 11 possible; aim RIR 2 -> 9
    const t = effortTarget('calisthenics', pullUp, { weightKg: 0, reps: 8, rir: 3.5 }, 'metric', {});
    expect(t).toMatchObject({ weightKg: 0, reps: 9 });
  });

  it('holds at the aimed effort and adds one rep when there was a little room', () => {
    expect(
      effortTarget('calisthenics', pullUp, { weightKg: 0, reps: 8, rir: 2 }, 'metric', {}),
    ).toMatchObject({ weightKg: 0, reps: 8 });
    expect(
      effortTarget('bodybuilding', pullUp, { weightKg: 0, reps: 8, rir: 2 }, 'metric', {}),
    ).toMatchObject({ weightKg: 0, reps: 9 });
  });

  it('never asks for fewer than 1 rep', () => {
    const t = effortTarget('calisthenics', pullUp, { weightKg: 0, reps: 1, rir: 0 }, 'metric', {});
    expect(t!.reps).toBeGreaterThanOrEqual(1);
  });
});

const workout = (
  date: string,
  loggedAt: string,
  exercises: Workout['exercises'],
  id = `${date}-${loggedAt}`,
): Workout => ({ id, date, loggedAt, kind: 'strength', exercises, source: 'manual' });

describe('lastEffort', () => {
  it('takes the newest workout with an effort for the lift, and its heaviest set', () => {
    const list = [
      workout('2026-10-01', '2026-10-01T10:00:00Z', [
        { name: 'Bench press', sets: [{ reps: 5, weightKg: 90 }], rir: 1 },
      ]),
      workout('2026-10-08', '2026-10-08T10:00:00Z', [
        {
          name: 'bench',
          sets: [
            { reps: 8, weightKg: 80 },
            { reps: 6, weightKg: 85 },
          ],
          rir: 2,
        },
      ]),
      workout('2026-10-10', '2026-10-10T10:00:00Z', [
        { name: 'Bench press', sets: [{ reps: 5, weightKg: 100 }] },
      ]),
    ];
    expect(lastEffort(list, 'bench-press')).toEqual({ weightKg: 85, reps: 6, rir: 2 });
  });

  it('breaks a same-day tie by the time it was logged, in any order', () => {
    const early = workout('2026-10-08', '2026-10-08T08:00:00Z', [
      { name: 'Bench press', sets: [{ reps: 5, weightKg: 90 }], rir: 1 },
    ]);
    const late = workout('2026-10-08', '2026-10-08T18:00:00Z', [
      { name: 'Bench press', sets: [{ reps: 5, weightKg: 95 }], rir: 3.5 },
    ]);
    expect(lastEffort([late, early], 'bench-press')).toEqual({ weightKg: 95, reps: 5, rir: 3.5 });
    expect(lastEffort([early, late], 'bench-press')).toEqual({ weightKg: 95, reps: 5, rir: 3.5 });
  });

  it('reads an effort from imported RPE, and the most reps for a bodyweight move', () => {
    const list = [
      workout('2026-10-08', '2026-10-08T10:00:00Z', [
        { name: 'Bench press', sets: [{ reps: 5, weightKg: 100, rpe: 8 }] },
        {
          name: 'Pull-up',
          sets: [{ reps: 6 }, { reps: 9 }, { toFailure: true }],
          rir: 0,
        },
      ]),
    ];
    expect(lastEffort(list, 'bench-press')).toEqual({ weightKg: 100, reps: 5, rir: 2 });
    expect(lastEffort(list, 'pull-up')).toEqual({ weightKg: 0, reps: 9, rir: 0 });
  });

  it('skips logs with no counted reps and returns undefined with nothing to go on', () => {
    const list = [
      workout('2026-10-01', '2026-10-01T10:00:00Z', [
        { name: 'Bench press', sets: [{ reps: 5, weightKg: 90 }], rir: 1 },
      ]),
      workout('2026-10-08', '2026-10-08T10:00:00Z', [
        { name: 'Bench press', sets: [{ toFailure: true, weightKg: 60 }], rir: 0 },
      ]),
    ];
    expect(lastEffort(list, 'bench-press')).toEqual({ weightKg: 90, reps: 5, rir: 1 });
    expect(lastEffort(list, 'squat')).toBeUndefined();
    expect(lastEffort([], 'bench-press')).toBeUndefined();
  });
});
