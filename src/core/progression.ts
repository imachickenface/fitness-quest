/**
 * Progressive overload: the next target for a lift or a run, plus deload weeks.
 *
 * Pure: no DOM, no clock, no mutation of the inputs. Loads are always snapped to the
 * increment a real gym offers (2.5 kg plates, 1 kg dumbbells, 5 lb adjustable dumbbells).
 */
import type { Goal } from '../contract.ts';
import type { Exercise } from './exercises.ts';
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
