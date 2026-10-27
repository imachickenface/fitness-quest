import { describe, expect, it } from 'vitest';
import type { FoodEntry, WeighIn } from '../contract.ts';
import * as fx from '../test/fixtures.ts';
import { adaptiveTdee, trend } from './adaptiveTdee.ts';
import { addDays } from './dates.ts';

const today = '2026-10-29';
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(today, -n + i)); // the n days before today

function eat(dates: string[], kcal: number): FoodEntry[] {
  return dates.flatMap((date, i) => [
    { ...fx.foodEntry, id: `${i}a`, date, nutrition: { kcal: kcal / 2 } },
    { ...fx.foodEntry, id: `${i}b`, date, nutrition: { kcal: kcal / 2 } },
  ]);
}
const weigh = (dates: string[], kg: (i: number) => number): WeighIn[] =>
  dates.map((date, i) => ({ date, kg: kg(i) }));

describe('trend', () => {
  it('smooths weigh-ins: each step moves 10% of the way to the new weight', () => {
    const t = trend([
      { date: '2026-10-01', kg: 80 },
      { date: '2026-10-02', kg: 81 },
      { date: '2026-10-03', kg: 79 },
    ]);
    expect(t.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(t[0]!.kg).toBe(80);
    expect(t[1]!.kg).toBeCloseTo(80.1, 6);
    expect(t[2]!.kg).toBeCloseTo(79.99, 6);
  });
  it('sorts by date first and does not mutate', () => {
    const input = [
      { date: '2026-10-02', kg: 81 },
      { date: '2026-10-01', kg: 80 },
    ];
    expect(trend(input)[0]!.date).toBe('2026-10-01');
    expect(input[0]!.date).toBe('2026-10-02');
  });
});

describe('adaptiveTdee', () => {
  const formula = 2500;

  it('steady weight: maintenance is what was eaten', () => {
    const d = days(21);
    const r = adaptiveTdee({
      foodEntries: eat(d, 2400),
      weighIns: weigh(d, () => 80),
      formulaTdee: formula,
      today,
    });
    expect(r).toEqual({ kcal: 2400, days: 21, kgPerWeek: 0 });
  });

  it('losing weight: maintenance is intake plus the deficit the trend shows', () => {
    const d = days(28);
    // eats 2000 and loses 0.5 kg a week, steadily
    const r = adaptiveTdee({
      foodEntries: eat(d, 2000),
      weighIns: weigh(d, (i) => 85 - (0.5 / 7) * i),
      formulaTdee: formula,
      today,
    });
    expect(r).not.toBeNull();
    // the smoothed trend lags, so it sees a bit less than 0.5 kg/week; 7700 kcal per kg
    expect(r!.kgPerWeek).toBeLessThan(0);
    expect(r!.kcal).toBe(Math.round((2000 - (r!.kgPerWeek / 7) * 7700) / 10) * 10);
    expect(r!.kcal).toBeGreaterThan(2300);
    expect(r!.kcal).toBeLessThan(2600);
  });

  it('needs 14 counted days and weigh-ins spanning 14 days', () => {
    const short = days(10);
    expect(
      adaptiveTdee({
        foodEntries: eat(short, 2400),
        weighIns: weigh(short, () => 80),
        formulaTdee: formula,
        today,
      }),
    ).toBeNull();
    const d = days(21);
    expect(
      adaptiveTdee({
        foodEntries: eat(d, 2400),
        weighIns: weigh(d.slice(-5), () => 80),
        formulaTdee: formula,
        today,
      }),
    ).toBeNull();
  });

  it('only counts days with 2 or more entries, and never today', () => {
    const d = days(21);
    const entries = [
      ...eat(d, 2400),
      { ...fx.foodEntry, id: 'snack', date: addDays(today, -30), nutrition: { kcal: 9000 } },
      ...eat([today], 9000),
    ];
    const r = adaptiveTdee({
      foodEntries: entries,
      weighIns: weigh(d, () => 80),
      formulaTdee: formula,
      today,
    });
    expect(r).toEqual({ kcal: 2400, days: 21, kgPerWeek: 0 });
  });

  it('stays within 25% of the formula', () => {
    const d = days(21);
    const r = adaptiveTdee({
      foodEntries: eat(d, 5000),
      weighIns: weigh(d, () => 80),
      formulaTdee: formula,
      today,
    });
    expect(r!.kcal).toBe(3130); // 2500 * 1.25 = 3125, to the nearest 10
  });
});
