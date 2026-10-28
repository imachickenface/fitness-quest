import { describe, expect, it } from 'vitest';
import type { Workout } from '../../contract.ts';
import * as fx from '../../test/fixtures.ts';
import type { Records } from '../records.ts';
import {
  CHALLENGE_GOALS,
  CHALLENGE_TARGETS,
  challengeProgress,
  challengeTitle,
  challengeValue,
} from './challenge.ts';

const none: Records = { foodEntries: [], workouts: [], weighIns: [] };
const lift = (id: string, date: string): Workout => ({ ...fx.strengthWorkout, id, date });
const run = (id: string, date: string, distanceM: number): Workout => ({
  ...fx.runWorkout,
  id,
  date,
  exercises: [{ name: 'Run', sets: [{ distanceM, durationS: 1200 }, { durationS: 60 }] }],
});
const S = '2026-10-26';
const E = '2026-11-01';

describe('challengeValue', () => {
  const records: Records = {
    foodEntries: [
      { ...fx.foodEntry, date: '2026-10-27' },
      { ...fx.foodEntry, id: 'x', date: '2026-10-27' },
    ],
    workouts: [
      lift('before', '2026-10-25'),
      lift('a', S),
      run('r1', '2026-10-28', 5250),
      run('r2', '2026-10-30', 4900),
      lift('after', '2026-11-02'),
      lift('future', '2026-10-31'),
    ],
    weighIns: [{ date: '2026-10-29', kg: 80 }],
  };
  const TODAY = '2026-10-30';

  it('counts workouts in the window, up to today', () => {
    expect(challengeValue('workouts', records, S, E, TODAY)).toBe(3);
    expect(challengeValue('workouts', records, S, E, '2026-11-05')).toBe(4); // after the end: ends counts
  });

  it('adds up run distance to 0.1 km', () => {
    expect(challengeValue('run_km', records, S, E, TODAY)).toBe(10.2);
    expect(challengeValue('run_km', none, S, E, TODAY)).toBe(0);
  });

  it('counts each active day once, from any record', () => {
    // 26 workout, 27 food x2, 28 run, 29 weigh-in, 30 run
    expect(challengeValue('active_days', records, S, E, TODAY)).toBe(5);
  });
});

describe('titles and targets', () => {
  it('words every goal', () => {
    expect(challengeTitle('workouts', 3)).toBe('3 workouts each');
    expect(challengeTitle('workouts', 1)).toBe('1 workout each');
    expect(challengeTitle('run_km', 10)).toBe('Run 10 km each');
    expect(challengeTitle('active_days', 7)).toBe('Active 7 days each');
    expect(challengeProgress('run_km', 7.5, 10)).toBe('7.5 / 10 km');
    expect(challengeProgress('workouts', 2, 3)).toBe('2 / 3');
  });

  it('offers targets the server accepts (1-200, and at most 7 active days)', () => {
    for (const g of CHALLENGE_GOALS) {
      for (const t of CHALLENGE_TARGETS[g]) {
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(g === 'active_days' ? 7 : 200);
      }
    }
  });
});
