import { describe, expect, it } from 'vitest';
import { PlannedSession } from '../../contract.ts';
import { longRunKm, runDays, runPlan } from './running.ts';

const longest = (plan: Exclude<ReturnType<typeof runPlan>, { error: string }>, week: number) =>
  Math.max(
    ...plan.sessions
      .filter((s) => s.week === week)
      .flatMap((s) => s.items)
      .map((i) => (i.type === 'run' ? (i.distanceM ?? 0) : 0)),
  );

describe('runDays', () => {
  it('spreads runs over the week with the long run last', () => {
    expect(runDays(3)).toEqual([2, 4, 6]);
    expect(runDays(4)).toEqual([2, 3, 5, 7]);
    expect(runDays(5)).toEqual([1, 2, 4, 5, 7]);
  });
});

describe('five_k (couch to 5K style)', () => {
  const plan = runPlan('five_k', { daysPerWeek: 3, longestM: 0 });
  if ('error' in plan) throw new Error('no plan');

  it('is 9 weeks of 3 runs with valid sessions and stable ids', () => {
    expect(plan.weeks).toBe(9);
    expect(plan.sessions).toHaveLength(27);
    for (const s of plan.sessions) expect(PlannedSession.parse(s)).toEqual(s);
    expect(plan.sessions[0]).toMatchObject({
      id: 'run-w1-d2',
      week: 1,
      day: 2,
      title: 'Week 1 · run 1',
    });
  });

  it('starts with walk/run intervals and ends running continuously, then a 5K', () => {
    expect(plan.sessions[0]!.items[0]).toEqual({
      type: 'run',
      runType: 'walk_run',
      intervals: { runS: 60, walkS: 90, repeats: 8 },
    });
    const w7 = plan.sessions.find((s) => s.week === 7)!.items[0]!;
    expect(w7).toEqual({ type: 'run', runType: 'easy', durationS: 1200 });
    const last = plan.sessions.at(-1)!;
    expect(last.title).toBe('Race day: 5K');
    expect(last.items[0]).toEqual({ type: 'run', runType: 'long', distanceM: 5000 });
  });
});

describe('ten_k, half and marathon', () => {
  it('builds the long run to its peak with cut-back weeks and ends on race day', () => {
    const plan = runPlan('half_marathon', { daysPerWeek: 3, longestM: 6000 });
    if ('error' in plan) throw new Error('no plan');
    expect(plan.weeks).toBe(12);
    expect(longest(plan, 1)).toBe(8000);
    expect(longest(plan, 4)).toBeLessThan(longest(plan, 3)); // cut-back
    expect(longest(plan, 10)).toBe(19000); // peak
    expect(longest(plan, 11)).toBe(14500); // taper: 75% of peak, to 500 m
    const race = plan.sessions.filter((s) => s.week === 12).at(-1)!;
    expect(race.title).toBe('Race day: half marathon');
    expect(race.items[0]).toMatchObject({ distanceM: 21097 });
  });

  it('has an easy run, a quality run and the long run each week with 3 days', () => {
    const plan = runPlan('ten_k', { daysPerWeek: 3, longestM: 5000 });
    if ('error' in plan) throw new Error('no plan');
    const week2 = plan.sessions.filter((s) => s.week === 2).map((s) => s.items[0]!);
    expect(week2.map((i) => i.type === 'run' && i.runType)).toEqual(['easy', 'intervals', 'long']);
    const week1 = plan.sessions.filter((s) => s.week === 1).map((s) => s.items[0]!);
    expect(week1[1]).toEqual({ type: 'run', runType: 'tempo', durationS: 1200 });
    // easy runs are half the long run, at least 3 km
    expect(week1[0]).toEqual({ type: 'run', runType: 'easy', distanceM: 3000 });
  });

  it('the marathon needs a base of an 8 km run, and peaks at 32 km before a 3-week taper', () => {
    expect(runPlan('marathon', { daysPerWeek: 4, longestM: 6000 })).toEqual({
      error: 'needs-base',
    });
    const plan = runPlan('marathon', { daysPerWeek: 4, longestM: 12000 });
    if ('error' in plan) throw new Error('no plan');
    expect(plan.weeks).toBe(18);
    expect(plan.sessions.filter((s) => s.week === 1)).toHaveLength(4);
    expect(longest(plan, 15)).toBe(32000);
    expect(longest(plan, 16)).toBe(24000);
    expect(longest(plan, 17)).toBe(16000);
    expect(longest(plan, 18)).toBe(42195);
  });

  it('cardio: 8 weeks of steady runs from 20 to about 37 minutes', () => {
    const plan = runPlan('cardio', { daysPerWeek: 3, longestM: 0 });
    if ('error' in plan) throw new Error('no plan');
    expect(plan.weeks).toBe(8);
    expect(plan.sessions[0]!.items[0]).toEqual({ type: 'run', runType: 'easy', durationS: 1200 });
    expect(plan.sessions.at(-1)!.items[0]).toEqual({
      type: 'run',
      runType: 'easy',
      durationS: 2250,
    });
  });
});

describe('longRunKm', () => {
  it('is linear from start to peak, cut back 30% every 4th week before the peak, rounded to 500 m', () => {
    // half: 8 km in week 1 to 19 km in week 10
    expect(longRunKm(1, 8000, 19000, 10)).toBe(8000);
    expect(longRunKm(2, 8000, 19000, 10)).toBe(9000); // 8000 + 11000/9 = 9222 -> 9000
    expect(longRunKm(4, 8000, 19000, 10)).toBe(8000); // 11667 * 0.7 = 8167 -> 8000
    expect(longRunKm(10, 8000, 19000, 10)).toBe(19000);
  });
});
