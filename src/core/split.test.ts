import { describe, expect, it } from 'vitest';
import type { Workout } from '../contract.ts';
import { ARNOLD, dayTemplate, nextSplitDay, splitDayOf } from './split.ts';

let n = 0;
const w = (
  date: string,
  exercises: [string, Workout['exercises'][0]['sets']][],
  kind: Workout['kind'] = 'strength',
): Workout => ({
  id: `w${++n}`,
  date,
  loggedAt: `${date}T18:00:00Z`,
  kind,
  exercises: exercises.map(([name, sets]) => ({ name, sets })),
  source: 'manual',
});
const s = (reps: number, weightKg?: number) => ({ reps, ...(weightKg ? { weightKg } : {}) });

const chestBack = (date: string) =>
  w(date, [
    ['Bench', [s(8, 80)]],
    ['Barbell row', [s(8, 70)]],
  ]);
const arms = (date: string) =>
  w(date, [
    ['OHP', [s(6, 50)]],
    ['Curls', [s(10, 30)]],
    ['Pushdown', [s(12, 25)]],
  ]);
const legs = (date: string) =>
  w(date, [
    ['Squat', [s(5, 100)]],
    ['Leg press', [s(12, 150)]],
  ]);

describe('ARNOLD', () => {
  it('rotates chest & back, shoulders & arms, legs', () => {
    expect(ARNOLD.map((d) => [d.id, d.title, d.groups])).toEqual([
      ['chest-back', 'Chest & back', ['chest', 'back']],
      ['shoulders-arms', 'Shoulders & arms', ['shoulders', 'arms']],
      ['legs', 'Legs', ['legs']],
    ]);
  });
});

describe('splitDayOf', () => {
  it('picks the day whose muscle groups have most of the sets', () => {
    expect(splitDayOf(chestBack('2026-10-20'))).toBe('chest-back');
    expect(splitDayOf(arms('2026-10-21'))).toBe('shoulders-arms');
    expect(splitDayOf(legs('2026-10-22'))).toBe('legs');
  });
  it('needs at least half of the known sets to match, and ignores unknown exercises and runs', () => {
    const mixed = w('2026-10-20', [
      ['Bench', [s(8, 80)]],
      ['Squat', [s(5, 100)]],
      ['Curls', [s(10, 30)]],
      ['Lateral raise', [s(15, 8)]],
    ]);
    expect(splitDayOf(mixed)).toBe('shoulders-arms'); // 2 of 4 sets
    const spread = w('2026-10-20', [
      ['Bench', [s(8, 80)]],
      ['Squat', [s(5, 100)]],
      ['Curls', [s(10, 30)]],
    ]);
    expect(splitDayOf(spread)).toBeUndefined(); // 1 of 3 each
    expect(splitDayOf(w('2026-10-20', [['Underwater basket weaving', [s(1)]]]))).toBeUndefined();
    expect(splitDayOf(w('2026-10-20', [['Run', [{ distanceM: 5000 }]]], 'run'))).toBeUndefined();
  });
  it('counts sets, not exercises', () => {
    const w1 = w('2026-10-20', [
      ['Bench', [s(8, 80), s(8, 80), s(8, 80)]],
      ['Curls', [s(10, 30)]],
    ]);
    expect(splitDayOf(w1)).toBe('chest-back');
  });
});

describe('nextSplitDay', () => {
  it('starts with chest & back with no history', () => {
    expect(nextSplitDay([])).toBe('chest-back');
  });
  it('follows the most recent split workout, wrapping round', () => {
    expect(nextSplitDay([chestBack('2026-10-20')])).toBe('shoulders-arms');
    expect(nextSplitDay([arms('2026-10-21'), chestBack('2026-10-20')])).toBe('legs');
    expect(nextSplitDay([chestBack('2026-10-20'), legs('2026-10-22'), arms('2026-10-21')])).toBe(
      'chest-back',
    );
  });
  it('ignores workouts that are not a split day', () => {
    const run = w('2026-10-23', [['Run', [{ distanceM: 5000 }]]], 'run');
    expect(nextSplitDay([run, chestBack('2026-10-20')])).toBe('shoulders-arms');
  });
});

describe('dayTemplate', () => {
  it("lists that day's usual exercises, most frequent first, with the sets from last time", () => {
    const history = [
      w('2026-10-13', [
        ['Bench', [s(8, 75)]],
        ['Barbell row', [s(8, 65)]],
        ['Chest fly', [s(12, 14)]],
      ]),
      w('2026-10-16', [
        ['Bench', [s(8, 77.5)]],
        ['Pull ups', [s(8)]],
      ]),
      w('2026-10-20', [
        ['Bench', [s(8, 80), s(6, 85)]],
        ['Barbell row', [s(8, 70)]],
      ]),
      legs('2026-10-22'),
    ];
    expect(dayTemplate('chest-back', history)).toEqual([
      { name: 'Bench', sets: [s(8, 80), s(6, 85)] },
      { name: 'Barbell row', sets: [s(8, 70)] },
      { name: 'Pull ups', sets: [s(8)] },
      { name: 'Chest fly', sets: [s(12, 14)] },
    ]);
  });
  it('matches the same exercise under different names to the latest name used', () => {
    const history = [
      w('2026-10-13', [['flat bench', [s(8, 75)]]]),
      w('2026-10-20', [['Bench press', [s(8, 80)]]]),
    ];
    expect(dayTemplate('chest-back', history)).toEqual([{ name: 'Bench press', sets: [s(8, 80)] }]);
  });
  it('falls back to sensible defaults with no history for that day', () => {
    expect(dayTemplate('legs', []).map((e) => e.name)).toEqual([
      'Squat',
      'Romanian deadlift',
      'Leg press',
      'Leg curl',
      'Calf raise',
    ]);
    expect(dayTemplate('legs', []).every((e) => e.sets.length === 0)).toBe(true);
  });
  it('counts an exercise once per workout even if it is logged twice that day', () => {
    const history = [
      w('2026-10-13', [
        ['Chest fly', [s(12, 14)]],
        ['Chest fly', [s(12, 14)]],
      ]),
      w('2026-10-16', [['Barbell row', [s(8, 65)]]]),
    ];
    expect(dayTemplate('chest-back', history).map((e) => e.name)).toEqual([
      'Barbell row',
      'Chest fly',
    ]);
  });

  it('lists at most 6 exercises', () => {
    const many = w(
      '2026-10-20',
      [
        'Bench',
        'Incline bench',
        'DB bench',
        'Chest fly',
        'Dips',
        'Barbell row',
        'Pull ups',
        'Lat pulldown',
      ].map((name) => [name, [s(8, 20)]] as [string, Workout['exercises'][0]['sets']]),
    );
    expect(dayTemplate('chest-back', [many])).toHaveLength(6);
  });
});
