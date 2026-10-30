/**
 * The effort chart: Mash Elite Relative Intensity (RIR, RPE and %1RM for 1-10 reps), typed in from the owner's
 * image. Each row is one effort a lifter can pick; `rir` is the value stored in ExerciseLog.rir.
 *
 * Pure: no DOM, no clock. The chart's velocity columns are left out (the app has no bar-speed sensor).
 */
import type { ExerciseLog } from '../contract.ts';

export type EffortLevel = 'Max' | 'Heavy' | 'Moderate+' | 'Moderate' | 'Light+' | 'Light' | 'Too light';

export type EffortRow = {
  /** stored value: reps in reserve, the middle of a range ("3-4" is 3.5); 11 is "too light" */
  rir: number;
  rirLabel: string;
  /** RPE for the maths: the middle of a range ("6-7" is 6.5) */
  rpe: number;
  rpeLabel: string;
  level: EffortLevel;
  /** the chart's words for the effort */
  effort: string;
  /** %1RM for 1 to 10 reps */
  pct: readonly number[];
};

const row = (
  rir: number,
  rirLabel: string,
  rpe: number,
  rpeLabel: string,
  level: EffortLevel,
  effort: string,
  pct: number[],
): EffortRow => ({ rir, rirLabel, rpe, rpeLabel, level, effort, pct });

/** Hardest first, as in the chart. */
export const EFFORT_ROWS: readonly EffortRow[] = [
  row(0, '0', 10, '10', 'Max', 'Absolute max', [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9]),
  row(0.5, '0-1', 9.5, '9.5', 'Heavy', 'Max effort near failure', [97.5, 92.5, 90, 87.5, 85, 82.5, 80, 77.5, 75, 72.5]),
  row(1, '1', 9, '9', 'Heavy', 'Max effort near failure', [95, 90, 87.5, 85, 82.5, 80, 77.5, 75, 72.5, 70]),
  row(1.5, '1-2', 8.5, '8.5', 'Moderate+', 'Hard effort', [92.5, 87.5, 85, 82.5, 80, 77.5, 75, 72.5, 70, 67.5]),
  row(2, '2', 8, '8', 'Moderate+', 'Hard effort', [90, 85, 82.5, 80, 77.5, 75, 72.5, 70, 67.5, 65]),
  row(3.5, '3-4', 6.5, '6-7', 'Moderate+', 'Challenging', [87.5, 82.5, 80, 77.5, 75, 72.5, 70, 67.5, 65, 62.5]),
  row(4.5, '4-5', 5.5, '5-6', 'Moderate+', 'Challenging', [85, 80, 77.5, 75, 72.5, 70, 67.5, 65, 62.5, 60]),
  row(5.5, '5-6', 4.5, '4-5', 'Moderate', 'Moderate', [82.5, 77.5, 75, 72.5, 70, 67.5, 65, 62.5, 60, 57.5]),
  row(6.5, '6-7', 3.5, '3-4', 'Moderate', 'Moderate', [80, 75, 72.5, 70, 67.5, 65, 62.5, 60, 57.5, 55]),
  row(7.5, '7-8', 2.5, '2-3', 'Light+', 'Moderate steady work', [77.5, 72.5, 70, 67.5, 65, 62.5, 60, 57.5, 55, 52.5]),
  row(8.5, '8-9', 1.5, '1-2', 'Light+', 'Moderate steady work', [75, 70, 67.5, 65, 62.5, 60, 57.5, 55, 52.5, 50]),
  row(9.5, '9-10', 0.5, '0-1', 'Light', 'Easy', [72.5, 67.5, 65, 62.5, 60, 57.5, 55, 52.5, 50, 47.5]),
  row(10, '10+', 0.5, '0-1', 'Light', 'Easy', [70, 65, 62.5, 60, 57.5, 55, 52.5, 50, 47.5, 45]),
  row(11, '10+', 0.5, '0-1', 'Too light', 'Too easy', [67.5, 62.5, 60, 57.5, 55, 52.5, 50, 47.5, 45, 42.5]),
];

/** The most reps the chart is stretched to: past 10, each rep is 2.5 points less, as in the chart's columns. */
export const MAX_CHART_REPS = 15;
/** Sets easier than this are too far from a max to estimate one from. */
export const MAX_E1RM_RIR = 5;

/** The chart row stored as `rir`, or undefined for a value that isn't one. */
export function effortRow(rir: number): EffortRow | undefined {
  return EFFORT_ROWS.find((r) => r.rir === rir);
}

/** The row whose RPE is nearest (ties go to the harder row); for imported sets that carry an RPE. */
export function rowForRpe(rpe: number): EffortRow {
  let best = EFFORT_ROWS[0]!;
  for (const r of EFFORT_ROWS) {
    if (Math.abs(r.rpe - rpe) < Math.abs(best.rpe - rpe)) best = r;
  }
  return best;
}

/** "RPE 8 · RIR 2" */
export function effortText(r: EffortRow): string {
  return r.level === 'Too light' ? 'Too light' : `RPE ${r.rpeLabel} · RIR ${r.rirLabel}`;
}

/** %1RM for a rep count at an effort, 1-15 reps; undefined outside the chart. */
export function percentOf1rm(reps: number, rir: number): number | undefined {
  const r = effortRow(rir);
  if (!r || !Number.isInteger(reps) || reps < 1 || reps > MAX_CHART_REPS) return undefined;
  if (reps <= 10) return r.pct[reps - 1];
  return r.pct[9]! - 2.5 * (reps - 10);
}

/** e1RM from a set and its effort; undefined when the effort is too light or the reps are off the chart. */
export function chartE1rm(weightKg: number, reps: number, rir: number): number | undefined {
  if (!(weightKg > 0) || rir > MAX_E1RM_RIR) return undefined;
  const pct = percentOf1rm(reps, rir);
  return pct === undefined ? undefined : (weightKg * 100) / pct;
}

/** The weight the chart gives for a rep count at an effort, unrounded. */
export function chartWeight(e1rmKg: number, reps: number, rir: number): number | undefined {
  const pct = percentOf1rm(reps, rir);
  return pct === undefined ? undefined : (e1rmKg * pct) / 100;
}

/** An exercise's effort: the one picked, or else the nearest row to its hardest set's RPE (imports). */
export function logRir(log: ExerciseLog): number | undefined {
  if (log.rir !== undefined && effortRow(log.rir)) return log.rir;
  const rpes = log.sets.flatMap((s) => (s.rpe === undefined ? [] : [s.rpe]));
  return rpes.length > 0 ? rowForRpe(Math.max(...rpes)).rir : undefined;
}
