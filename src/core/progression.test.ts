import { describe, expect, it } from 'vitest';
import { findExercise } from './exercises.ts';
import { deloadWeek, nextTarget, riegel, roundLoad, runTarget, step } from './progression.ts';

const bench = findExercise('bench press')!;
const squat = findExercise('squat')!;
const curl = findExercise('db curl')!;
const pullUp = findExercise('pull up')!;
const lb = (pounds: number) => Math.round(pounds * 0.45359237 * 10) / 10;

describe('step and roundLoad', () => {
  it('uses real plate and dumbbell increments', () => {
    expect(step(bench, 'metric')).toBe(2.5);
    expect(step(squat, 'metric', true)).toBe(5);
    expect(step(curl, 'metric')).toBe(1);
    expect(step(bench, 'imperial')).toBe(lb(5));
    expect(step(squat, 'imperial', true)).toBe(lb(10));
    expect(step(curl, 'imperial')).toBe(lb(5));
  });
  it('rounds to the nearest increment, in pounds for imperial', () => {
    expect(roundLoad(83.4, 'metric')).toBe(82.5);
    expect(roundLoad(83.9, 'metric')).toBe(85);
    expect(roundLoad(13.6, 'metric', true)).toBe(14);
    expect(roundLoad(83.9, 'imperial')).toBe(lb(185));
    expect(roundLoad(85.5, 'imperial')).toBe(lb(190));
  });
});

describe('deloadWeek', () => {
  it('powerlifting every 4th week, bodybuilding every 6th, calisthenics every 5th', () => {
    const weeks = (s: Parameters<typeof deloadWeek>[0]) =>
      Array.from({ length: 12 }, (_, i) => i).filter((i) => deloadWeek(s, i));
    expect(weeks('powerlifting')).toEqual([3, 7, 11]);
    expect(weeks('bodybuilding')).toEqual([5, 11]);
    expect(weeks('calisthenics')).toEqual([4, 9]);
  });
});

describe('nextTarget: powerlifting', () => {
  it('adds one increment at the same reps for sets of 5 or fewer; 5 kg on lower-body lifts', () => {
    expect(nextTarget('powerlifting', bench, { weightKg: 100, reps: 5 }, 'metric')).toMatchObject({
      weightKg: 102.5,
      reps: 5,
      deload: false,
    });
    expect(nextTarget('powerlifting', squat, { weightKg: 140, reps: 3 }, 'metric')).toMatchObject({
      weightKg: 145,
      reps: 3,
    });
    expect(
      nextTarget('powerlifting', bench, { weightKg: lb(185), reps: 5 }, 'imperial'),
    ).toMatchObject({
      weightKg: lb(190),
      reps: 5,
    });
  });
  it('turns a higher-rep best into a heavier set of 5', () => {
    // 80 x 10 -> e1RM 106.67 -> 5RM 91.43 -> down to 90 on the 2.5 grid -> +2.5
    expect(nextTarget('powerlifting', bench, { weightKg: 80, reps: 10 }, 'metric')).toMatchObject({
      weightKg: 92.5,
      reps: 5,
    });
  });
});

describe('nextTarget: bodybuilding (double progression)', () => {
  it('adds a rep inside the range', () => {
    expect(nextTarget('bodybuilding', bench, { weightKg: 80, reps: 9 }, 'metric')).toMatchObject({
      weightKg: 80,
      reps: 10,
    });
  });
  it('at the top of the range adds about 5% (at least one increment) and drops to the bottom', () => {
    expect(nextTarget('bodybuilding', bench, { weightKg: 80, reps: 12 }, 'metric')).toMatchObject({
      weightKg: 85, // 84 rounds to 85
      reps: 8,
    });
    expect(nextTarget('bodybuilding', bench, { weightKg: 20, reps: 12 }, 'metric')).toMatchObject({
      weightKg: 22.5, // 5% would be 1 kg: at least one plate step
      reps: 8,
    });
  });
  it('dumbbell isolation lifts use 10-15 reps', () => {
    expect(nextTarget('bodybuilding', curl, { weightKg: 14, reps: 12 }, 'metric')).toMatchObject({
      weightKg: 14,
      reps: 13,
    });
    expect(nextTarget('bodybuilding', curl, { weightKg: 14, reps: 15 }, 'metric')).toMatchObject({
      weightKg: 15,
      reps: 10,
    });
  });
});

describe('nextTarget: calisthenics and bodyweight lifts', () => {
  it('adds a clean rep until 12, then starts adding weight', () => {
    expect(nextTarget('calisthenics', pullUp, { weightKg: 0, reps: 8 }, 'metric')).toMatchObject({
      weightKg: 0,
      reps: 9,
    });
    expect(nextTarget('calisthenics', pullUp, { weightKg: 0, reps: 12 }, 'metric')).toMatchObject({
      weightKg: 2.5,
      reps: 6,
    });
  });
  it('weighted: 5-8 reps, then more weight', () => {
    expect(nextTarget('calisthenics', pullUp, { weightKg: 10, reps: 6 }, 'metric')).toMatchObject({
      weightKg: 10,
      reps: 7,
    });
    expect(nextTarget('calisthenics', pullUp, { weightKg: 10, reps: 8 }, 'metric')).toMatchObject({
      weightKg: 12.5,
      reps: 5,
    });
  });
  it('bodyweight lifts follow these rules in every style; barbell lifts use bodybuilding rules', () => {
    expect(nextTarget('powerlifting', pullUp, { weightKg: 0, reps: 8 }, 'metric').reps).toBe(9);
    expect(nextTarget('calisthenics', bench, { weightKg: 80, reps: 9 }, 'metric')).toMatchObject({
      weightKg: 80,
      reps: 10,
    });
  });
});

describe('nextTarget: deloads', () => {
  it('a deload week is about 60% for the same reps', () => {
    expect(
      nextTarget('powerlifting', bench, { weightKg: 100, reps: 5 }, 'metric', 'week'),
    ).toMatchObject({
      weightKg: 60,
      reps: 5,
      deload: true,
    });
    expect(
      nextTarget('calisthenics', pullUp, { weightKg: 0, reps: 10 }, 'metric', 'week'),
    ).toMatchObject({
      weightKg: 0,
      reps: 6,
      deload: true,
    });
  });
  it('after two missed targets the lift drops 10% to build back', () => {
    expect(
      nextTarget('bodybuilding', bench, { weightKg: 100, reps: 8 }, 'metric', 'stall'),
    ).toMatchObject({
      weightKg: 90,
      reps: 8,
      deload: true,
    });
  });
  it('always says why', () => {
    for (const d of [undefined, 'week', 'stall'] as const) {
      expect(
        nextTarget('bodybuilding', bench, { weightKg: 80, reps: 9 }, 'metric', d).why.length,
      ).toBeGreaterThan(10);
    }
  });
});

describe('riegel', () => {
  it('predicts race times with exponent 1.06', () => {
    expect(riegel(1500, 5000, 10000)).toBeCloseTo(1500 * 2 ** 1.06, 6);
    expect(riegel(1650, 5000, 5000)).toBe(1650);
  });
});

describe('runTarget', () => {
  const runs = [
    { distanceM: 4000, durationS: 1500 },
    { distanceM: 5000, durationS: 1650 },
    { distanceM: 6000 },
  ];
  it('distance weeks: 10% past the longest run, to the nearest 500 m, capped at the race', () => {
    expect(runTarget('ten_k', runs, { deload: false, speed: false })).toMatchObject({
      type: 'run_distance',
      meters: 6500,
    });
    expect(runTarget('five_k', runs, { deload: false, speed: false })).toMatchObject({
      type: 'run_distance',
      meters: 5000,
    });
    const long = [{ distanceM: 31000 }];
    expect(runTarget('marathon', long, { deload: false, speed: false })).toMatchObject({
      meters: 32000,
    });
  });
  it('speed weeks: 2% faster than the best run predicts, at the race distance or the longest run if shorter', () => {
    // best predictor: 5000 in 1650 s; at 5000 m -> 1650 * 0.98 = 1617 -> nearest 5 s: 1615
    expect(runTarget('five_k', runs, { deload: false, speed: true })).toMatchObject({
      type: 'run_time',
      meters: 5000,
      maxSeconds: 1615,
    });
    // ten_k but longest run is 6000: test at 6000 m
    const t = runTarget('ten_k', runs, { deload: false, speed: true });
    expect(t).toMatchObject({ type: 'run_time', meters: 6000 });
    expect(t && t.type === 'run_time' && t.maxSeconds).toBe(
      Math.round((riegel(1650, 5000, 6000) * 0.98) / 5) * 5,
    );
  });
  it('cut-back weeks: 30% shorter than the longest run', () => {
    expect(runTarget('ten_k', runs, { deload: true, speed: true })).toMatchObject({
      type: 'run_distance',
      meters: 4000,
      deload: true,
    });
  });
  it('race goals with no runs start at 2 km; other goals get no run target', () => {
    expect(runTarget('five_k', [], { deload: false, speed: true })).toMatchObject({
      type: 'run_distance',
      meters: 2000,
    });
    expect(runTarget('build_muscle', runs, { deload: false, speed: false })).toBeUndefined();
  });
});
