import { describe, expect, it } from 'vitest';
import {
  chartE1rm,
  chartWeight,
  EFFORT_ROWS,
  effortRow,
  effortText,
  logRir,
  percentOf1rm,
  rowForRpe,
} from './effort.ts';

describe('the effort chart', () => {
  it('has the 14 rows of the owner chart, hardest first', () => {
    expect(EFFORT_ROWS.map((r) => [r.rirLabel, r.rpeLabel])).toEqual([
      ['0', '10'],
      ['0-1', '9.5'],
      ['1', '9'],
      ['1-2', '8.5'],
      ['2', '8'],
      ['3-4', '6-7'],
      ['4-5', '5-6'],
      ['5-6', '4-5'],
      ['6-7', '3-4'],
      ['7-8', '2-3'],
      ['8-9', '1-2'],
      ['9-10', '0-1'],
      ['10+', '0-1'],
      ['10+', '0-1'],
    ]);
    const rirs = EFFORT_ROWS.map((r) => r.rir);
    expect(new Set(rirs).size).toBe(14);
    expect([...rirs].sort((a, b) => a - b)).toEqual(rirs);
  });

  it('keeps the Max row as printed', () => {
    expect(EFFORT_ROWS[0]!.pct).toEqual([
      100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9,
    ]);
  });

  it('follows the chart pattern below Max: 5 points from 1 to 2 reps, then 2.5 a rep, 2.5 a row', () => {
    for (const [i, r] of EFFORT_ROWS.slice(1).entries()) {
      expect(r.pct).toHaveLength(10);
      expect(r.pct[0]).toBe(97.5 - 2.5 * i);
      expect(r.pct[1]).toBe(r.pct[0]! - 5);
      for (let reps = 3; reps <= 10; reps++) expect(r.pct[reps - 1]).toBe(r.pct[reps - 2]! - 2.5);
    }
  });

  it('reads RPE as 10 minus RIR, as the chart does', () => {
    for (const r of EFFORT_ROWS.slice(0, 12)) expect(r.rpe + r.rir).toBe(10);
  });
});

describe('lookups', () => {
  it('finds a row by its stored RIR only', () => {
    expect(effortRow(2)?.rpe).toBe(8);
    expect(effortRow(3)).toBeUndefined();
  });

  it('picks the nearest row for an RPE, the harder one on a tie', () => {
    expect(rowForRpe(8).rir).toBe(2);
    expect(rowForRpe(7).rir).toBe(3.5);
    expect(rowForRpe(7.25).rir).toBe(2); // 0.75 from 8, 0.75 from 6.5
    expect(rowForRpe(10).rir).toBe(0);
    expect(rowForRpe(1).rir).toBe(8.5);
  });

  it('labels a row', () => {
    expect(effortText(effortRow(2)!)).toBe('RPE 8 · RIR 2');
    expect(effortText(effortRow(3.5)!)).toBe('RPE 6-7 · RIR 3-4');
    expect(effortText(effortRow(11)!)).toBe('Too light');
  });

  it('gives %1RM from the chart, and 2.5 points less per rep past 10 up to 15', () => {
    expect(percentOf1rm(5, 2)).toBe(77.5);
    expect(percentOf1rm(1, 0)).toBe(100);
    expect(percentOf1rm(12, 2)).toBe(60);
    expect(percentOf1rm(15, 0)).toBeCloseTo(61.4);
    expect(percentOf1rm(16, 0)).toBeUndefined();
    expect(percentOf1rm(0, 0)).toBeUndefined();
    expect(percentOf1rm(2.5, 0)).toBeUndefined();
    expect(percentOf1rm(5, 3)).toBeUndefined();
  });

  it('estimates an e1RM from a set and its effort', () => {
    expect(chartE1rm(100, 5, 2)).toBeCloseTo(129.03);
    expect(chartE1rm(100, 1, 0)).toBe(100);
    expect(chartE1rm(100, 5, 5.5)).toBeUndefined(); // too light to say
    expect(chartE1rm(0, 5, 2)).toBeUndefined();
    expect(chartE1rm(100, 20, 2)).toBeUndefined();
  });

  it('gives the weight for reps at an effort', () => {
    expect(chartWeight(200, 3, 1)).toBe(175);
    expect(chartWeight(200, 30, 1)).toBeUndefined();
  });

  it('reads an exercise effort from the pick, else the hardest set RPE', () => {
    expect(logRir({ name: 'Bench', sets: [{ reps: 5 }], rir: 1.5 })).toBe(1.5);
    expect(
      logRir({
        name: 'Bench',
        sets: [
          { reps: 5, rpe: 7 },
          { reps: 5, rpe: 8 },
        ],
      }),
    ).toBe(2);
    expect(logRir({ name: 'Bench', sets: [{ reps: 5 }] })).toBeUndefined();
  });
});
