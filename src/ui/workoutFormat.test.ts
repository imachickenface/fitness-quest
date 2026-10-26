import { describe, expect, it } from 'vitest';
import * as fx from '../test/fixtures.ts';
import { formatPace, parseDuration, recentExercises } from './workoutFormat.ts';

describe('parseDuration', () => {
  it('reads mm:ss, h:mm:ss and plain minutes', () => {
    expect(parseDuration('27:30')).toBe(1650);
    expect(parseDuration('1:05:00')).toBe(3900);
    expect(parseDuration('27')).toBe(1620);
    expect(parseDuration(' 0:45 ')).toBe(45);
  });
  it('rejects nonsense', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('27:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:2:3:4')).toBeNull();
  });
});

describe('formatPace', () => {
  it('is minutes and seconds per km', () => {
    expect(formatPace(5000, 1650)).toBe('5:30 /km');
    expect(formatPace(1000, 299.7)).toBe('5:00 /km');
  });
});

describe('recentExercises', () => {
  it('lists each lift once, newest first, skipping runs', () => {
    const older = {
      ...fx.strengthWorkout,
      id: 'old',
      exercises: [{ name: 'bench press', sets: [{ reps: 5, weightKg: 50 }] }],
    };
    const r = recentExercises([fx.runWorkout, fx.strengthWorkout, older]);
    expect(r).toEqual([{ name: 'Bench Press', sets: fx.strengthWorkout.exercises[0]!.sets }]);
  });
});
