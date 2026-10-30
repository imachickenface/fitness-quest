/**
 * Progressive overload: the next target for a lift or a run, plus deload weeks.
 *
 * Pure: no DOM, no clock, no mutation of the inputs. Loads are always snapped to the
 * increment a real gym offers (2.5 kg plates, 1 kg dumbbells, 5 lb adjustable dumbbells).
 */
import type { Goal, Workout } from '../contract.ts';
import { findExercise } from './exercises.ts';
import type { Exercise } from './exercises.ts';
import {
  chartE1rm,
  chartWeight,
  EFFORT_ROWS,
  effortRow,
  effortText,
  logRir,
  MAX_CHART_REPS,
} from './effort.ts';
import type { EffortRow } from './effort.ts';
import { e1rm } from './ranks.ts';

export type Style = 'powerlifting' | 'bodybuilding' | 'calisthenics';
export type Units = 'metric' | 'imperial';
export type Deload = 'week' | 'stall';

export type Target = { weightKg: number; reps: number; deload: boolean; why: string };

export type RunTarget =
  | { type: 'run_distance'; meters: number; deload: boolean; why: string }
  | { type: 'run_time'; meters: number; maxSeconds: number; deload: boolean; why: string };

const LB = 0.45359237;
const r1 = (x: number) => Math.round(x * 10) / 10;
const lift = (weightKg: number, reps: number, deload: boolean, why: string): Target => ({
  weightKg,
  reps,
  deload,
  why,
});

/** The increment this lift moves in: dumbbells 1 kg, plates 2.5 kg, 5 kg (or 5/10 lb) when `big`. */
export function step(ex: Exercise, units: Units, big = false): number {
  if (units === 'metric') return ex.perHand === true ? 1 : big ? 5 : 2.5;
  return r1(LB * (big && ex.perHand !== true ? 10 : 5));
}

/** Snap a load to the nearest increment the equipment offers, never below 0. */
export function roundLoad(kg: number, units: Units, perHand = false): number {
  if (units === 'metric') {
    const grid = perHand ? 1 : 2.5;
    return Math.max(0, Math.round(kg / grid) * grid);
  }
  return Math.max(0, r1(Math.round(kg / LB / 5) * 5 * LB));
}

/** Deload weeks: every 4th (powerlifting), 6th (bodybuilding) or 5th (calisthenics) week. */
export function deloadWeek(style: Style, weekIndex: number): boolean {
  const cycle = style === 'powerlifting' ? 4 : style === 'bodybuilding' ? 6 : 5;
  return weekIndex % cycle === cycle - 1;
}

/** Down to a 5-rep max: the e1RM says what a set of 5 can carry, then one step more. */
function powerlifting(w: number, r: number, s: number, units: Units, perHand: boolean): Target {
  if (r <= 5) {
    const why = 'Linear progression: one more step at the same reps.';
    return lift(roundLoad(w + s, units, perHand), r, false, why);
  }
  const five = floorGrid(e1rm(w, r) / (1 + 5 / 30), s, units);
  const why = 'Over a set of 5: the e1RM maths picks a heavier bar.';
  return lift(roundLoad(five + s, units, perHand), 5, false, why);
}

/** Down to the step grid, never above the e1RM estimate. */
function floorGrid(kg: number, s: number, units: Units): number {
  if (units === 'imperial') return r1(Math.floor(kg / LB / 5) * 5 * LB);
  return Math.floor(kg / s + 1e-9) * s;
}

/** Double progression: reps up inside the range, then more weight back to the bottom. */
function bodybuilding(w: number, r: number, s: number, units: Units, perHand: boolean): Target {
  const bottom = perHand ? 10 : 8;
  const top = perHand ? 15 : 12;
  if (r < top) return lift(w, r + 1, false, 'Double progression: one more rep.');
  const weight = Math.max(roundLoad(w * 1.05, units, perHand), roundLoad(w + s, units, perHand));
  return lift(weight, bottom, false, `Top of the range: more weight, back to ${bottom} reps.`);
}

/** Clean reps first, weight only once the reps are plenty. */
function calisthenics(w: number, r: number, s: number, units: Units): Target {
  const more = 'One more clean rep inside the range.';
  if (w <= 0) {
    if (r < 12) return lift(0, r + 1, false, more);
    return lift(roundLoad(s, units), 6, false, '12 clean reps: time to add weight.');
  }
  if (r < 8) return lift(w, r + 1, false, more);
  return lift(roundLoad(w + s, units), 5, false, '8 clean reps: time to add weight.');
}

/** The next target for a lift, given the best set so far and an optional deload. */
export function nextTarget(
  style: Style,
  ex: Exercise,
  best: { weightKg: number; reps: number },
  units: Units,
  deload?: Deload,
): Target {
  const w = best.weightKg;
  const r = best.reps;
  const perHand = ex.perHand === true;
  const s = step(ex, units, style === 'powerlifting' && ex.lower === true);

  if (deload === 'week') {
    const weight = w > 0 ? roundLoad(w * 0.6, units, perHand) : 0;
    return lift(
      weight,
      w > 0 ? r : Math.ceil(r * 0.6),
      true,
      'Deload week: about 60% so you recover.',
    );
  }
  if (deload === 'stall') {
    return lift(
      roundLoad(w * 0.9, units, perHand),
      r,
      true,
      'Two misses in a row: drop 10% and build back.',
    );
  }

  if (ex.bodyweight === true) return calisthenics(w, r, s, units);
  if (style === 'powerlifting') return powerlifting(w, r, s, units, perHand);
  return bodybuilding(w, r, s, units, perHand);
}

/** Riegel pacing: the time a distance predicts, exponent 1.06. */
export function riegel(seconds: number, fromM: number, toM: number): number {
  return seconds * (toM / fromM) ** 1.06;
}

const RACE: Partial<Record<Goal, number>> = {
  cardio: 10000,
  five_k: 5000,
  ten_k: 10000,
  half_marathon: 21097,
  marathon: 32000,
};

/** The next run target for a race goal: further, faster, or cut back. */
export function runTarget(
  goal: Goal,
  runs: { distanceM: number; durationS?: number }[],
  opts: { deload: boolean; speed: boolean },
): RunTarget | undefined {
  const race = RACE[goal];
  if (race === undefined) return undefined;
  if (runs.length === 0) {
    return {
      type: 'run_distance',
      meters: 2000,
      deload: false,
      why: 'No runs logged yet: start at 2 km.',
    };
  }

  const longest = Math.max(...runs.map((x) => x.distanceM));
  const round500 = (m: number) => Math.round(m / 500) * 500;

  if (opts.deload) {
    return {
      type: 'run_distance',
      meters: Math.max(1000, round500(longest * 0.7)),
      deload: true,
      why: 'Deload week: about 70% of your longest run.',
    };
  }

  const timed = runs.filter(
    (x): x is { distanceM: number; durationS: number } => x.durationS !== undefined,
  );
  if (opts.speed && timed.length > 0) {
    const d = longest >= race ? race : Math.max(1000, Math.floor(longest / 500) * 500);
    const best = Math.min(...timed.map((x) => riegel(x.durationS, x.distanceM, d)));
    return {
      type: 'run_time',
      meters: d,
      maxSeconds: Math.round((best * 0.98) / 5) * 5,
      deload: false,
      why: 'Speed week: 2% faster than your best run predicts at this distance.',
    };
  }

  return {
    type: 'run_distance',
    meters: Math.min(race, Math.max(1000, round500(longest * 1.1))),
    deload: false,
    why: 'Distance week: 10% further than your longest run.',
  };
}

/** The effort a style aims for, as the stored RIR: deload 4-5, bodybuilding 1-2, else 2. */
export function aimRir(style: Style, deload: boolean): number {
  if (deload) return 4.5;
  return style === 'bodybuilding' ? 1.5 : 2;
}

/** One set as the effort chart reads it: the load, the counted reps and the effort it was at. */
export type Effort = { weightKg: number; reps: number; rir: number };

/** The newest logged set with an effort for this lift: its load, reps and effort. */
export function lastEffort(workouts: Workout[], exerciseId: string): Effort | undefined {
  const newestFirst = [...workouts].sort(
    (a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt),
  );
  for (const w of newestFirst) {
    for (const log of w.exercises) {
      const ex = findExercise(log.name);
      if (ex?.id !== exerciseId) continue;
      const rir = logRir(log);
      if (rir === undefined) continue;
      const counted = log.sets.filter((s) => (s.reps ?? 0) > 0);
      if (counted.length === 0) continue;
      const bodyweight = ex.bodyweight === true;
      const best = counted.reduce((a, b) => {
        const wA = a.weightKg ?? 0;
        const wB = b.weightKg ?? 0;
        if (bodyweight) {
          const rA = a.reps ?? 0;
          const rB = b.reps ?? 0;
          if (rB !== rA) return rB > rA ? b : a;
          return wB > wA ? b : a;
        }
        if (wB !== wA) return wB > wA ? b : a;
        return (b.reps ?? 0) > (a.reps ?? 0) ? b : a;
      });
      return { weightKg: best.weightKg ?? 0, reps: best.reps ?? 0, rir };
    }
  }
  return undefined;
}

/** A row for an effort the chart doesn't list: the nearest stored row at or below it. */
function rowAtOrBelow(rir: number): EffortRow | undefined {
  let best: EffortRow | undefined;
  for (const r of EFFORT_ROWS) {
    if (r.rir <= rir && (best === undefined || r.rir > best.rir)) best = r;
  }
  return best;
}

/** "Last time was RPE 6-7 · RIR 3-4: aiming for RPE 8.5." */
function effortWhy(last: Effort, aim: number): string {
  const done = effortRow(last.rir);
  const was = done ? effortText(done) : `RIR ${last.rir}`;
  const aimRow = effortRow(aim)!;
  return `Last time was ${was}: aiming for RPE ${aimRow.rpeLabel}.`;
}

/** The next target read off the effort chart: same load, more reps (bodyweight) or a new load. */
export function effortTarget(
  style: Style,
  ex: Exercise,
  last: Effort,
  units: Units,
  opts: { reps?: number },
): Target | undefined {
  const aim = aimRir(style, false);

  if (ex.bodyweight === true) {
    const possible = last.reps + Math.floor(Math.min(last.rir, 10));
    let reps = Math.max(1, possible - Math.ceil(aim));
    if (reps === last.reps && last.rir > aim) reps = last.reps + 1;
    return lift(last.weightKg, reps, false, effortWhy(last, aim));
  }

  if (!(last.weightKg > 0) || last.reps > MAX_CHART_REPS) return undefined;
  const reps = Math.min(MAX_CHART_REPS, Math.max(1, Math.round(opts.reps ?? last.reps)));
  // A set easier than RIR 4-5 is read as RIR 4-5: the chart can't say more than that.
  const usedRow = effortRow(Math.min(last.rir, 4.5)) ?? rowAtOrBelow(Math.min(last.rir, 4.5));
  if (!usedRow) return undefined;
  const e1 = chartE1rm(last.weightKg, last.reps, usedRow.rir);
  const e1Aim = chartE1rm(last.weightKg, last.reps, aim);
  if (e1 === undefined || e1Aim === undefined) return undefined;
  const capped = Math.min(Math.max(e1, 0.9 * e1Aim), 1.1 * e1Aim);
  const raw = chartWeight(capped, reps, aim);
  if (raw === undefined) return undefined;
  const weightKg = roundLoad(raw, units, ex.perHand === true);
  let nextReps = reps;
  if (weightKg === last.weightKg && reps === last.reps && last.rir > aim) {
    nextReps = Math.min(MAX_CHART_REPS, reps + 1);
  }
  return lift(weightKg, nextReps, false, effortWhy(last, aim));
}
