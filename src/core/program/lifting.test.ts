import { describe, expect, it } from 'vitest';
import { PlannedSession } from '../../contract.ts';
import { liftDays, liftPlan } from './lifting.ts';

const template = (day: string) =>
  day === 'chest-back'
    ? [
        'Bench press',
        'Barbell row',
        'Incline dumbbell press',
        'Lat pulldown',
        'Chest fly',
        'Pull ups',
      ]
    : day === 'shoulders-arms'
      ? ['Overhead press', 'Lateral raise', 'Barbell curl', 'Tricep pushdown']
      : ['Squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise'];

describe('liftDays', () => {
  it('spreads training days over the week', () => {
    expect(liftDays(3)).toEqual([1, 3, 5]);
    expect(liftDays(4)).toEqual([1, 2, 4, 5]);
    expect(liftDays(5)).toEqual([1, 2, 3, 5, 6]);
    expect(liftDays(6)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('liftPlan', () => {
  it('runs 12 weeks of the Arnold split, rotating days across weeks', () => {
    const p = liftPlan({
      goal: 'build_muscle',
      style: 'bodybuilding',
      daysPerWeek: 4,
      exercises: template,
    });
    expect(p.weeks).toBe(12);
    expect(p.sessions).toHaveLength(48);
    for (const s of p.sessions) expect(PlannedSession.parse(s)).toEqual(s);
    expect(p.sessions.slice(0, 5).map((s) => [s.id, s.day, s.title])).toEqual([
      ['lift-w1-d1', 1, 'Chest & back'],
      ['lift-w1-d2', 2, 'Shoulders & arms'],
      ['lift-w1-d4', 4, 'Legs'],
      ['lift-w1-d5', 5, 'Chest & back'],
      ['lift-w2-d1', 1, 'Shoulders & arms'],
    ]);
  });

  it('lists up to 5 exercises per day, with sets and reps by style', () => {
    const bb = liftPlan({
      goal: 'build_muscle',
      style: 'bodybuilding',
      daysPerWeek: 3,
      exercises: template,
    });
    expect(bb.sessions[0]!.items).toHaveLength(5);
    expect(bb.sessions[0]!.items[0]).toEqual({
      type: 'lift',
      exercise: 'Bench press',
      sets: 3,
      reps: 10,
      amrapLastSet: false,
    });
    const pl = liftPlan({
      goal: 'build_muscle',
      style: 'powerlifting',
      daysPerWeek: 3,
      exercises: template,
    });
    expect(pl.sessions[0]!.items[0]).toEqual({
      type: 'lift',
      exercise: 'Bench press',
      tier: 't1',
      sets: 5,
      reps: 5,
      amrapLastSet: true,
    });
    expect(pl.sessions[0]!.items[1]).toMatchObject({
      tier: 't2',
      sets: 3,
      reps: 8,
      amrapLastSet: false,
    });
    const cal = liftPlan({
      goal: 'build_muscle',
      style: 'calisthenics',
      daysPerWeek: 3,
      exercises: template,
    });
    expect(cal.sessions[0]!.items[0]).toMatchObject({ sets: 3, reps: 12 });
  });

  it('deload weeks follow the style: fewer sets, marked in the title', () => {
    const pl = liftPlan({
      goal: 'build_muscle',
      style: 'powerlifting',
      daysPerWeek: 3,
      exercises: template,
    });
    const week4 = pl.sessions.filter((s) => s.week === 4);
    expect(week4.every((s) => s.title.endsWith('(deload)'))).toBe(true);
    expect(week4[0]!.items[0]).toMatchObject({ sets: 3, amrapLastSet: false });
    const bb = liftPlan({
      goal: 'build_muscle',
      style: 'bodybuilding',
      daysPerWeek: 3,
      exercises: template,
    });
    expect(bb.sessions.filter((s) => s.title.endsWith('(deload)')).map((s) => s.week)).toEqual([
      6, 6, 6, 12, 12, 12,
    ]);
    expect(bb.sessions.find((s) => s.week === 6)!.items[0]).toMatchObject({ sets: 2 });
  });

  it('weight loss: 3 lifting days and 2 cardio days a week', () => {
    const p = liftPlan({
      goal: 'lose_weight',
      style: 'bodybuilding',
      daysPerWeek: 3,
      exercises: template,
    });
    const week1 = p.sessions.filter((s) => s.week === 1);
    expect(week1.map((s) => [s.day, s.title])).toEqual([
      [1, 'Chest & back'],
      [2, 'Cardio'],
      [3, 'Shoulders & arms'],
      [4, 'Cardio'],
      [5, 'Legs'],
    ]);
    expect(week1[1]!.items).toEqual([
      { type: 'cardio', activity: 'Brisk walk, bike or rower', durationS: 1800 },
    ]);
    expect(week1[1]!.id).toBe('cardio-w1-d2');
  });
});
