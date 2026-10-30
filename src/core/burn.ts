/**
 * Calories burned by a logged workout.
 *
 * Active calories are `(MET - 1) x kg x hours`: the part on top of the resting burn everyone gets anyway. The
 * METs for lifting come from the 2024 Adult Compendium of Physical Activities (code 02054, 3.5 MET for general
 * weight training; code 02052, 5.0 MET for squats and deadlifts with slow or explosive effort). Runs work out at about 1 kcal per
 * kg per km, less that resting part. All of these are rough estimates, shown as a guide and never added to the food target.
 *
 * Pure: no DOM, no clock, no mutation of the inputs.
 */
import type { ExerciseLog, SetEntry, Workout } from '../contract.ts';
import { logRir } from './effort.ts';

/** A set with its rest, when no duration was logged: 3 minutes. */
export const SET_MINUTES = 3;
/** Compendium 02054: general weight training. */
export const LIFT_MET = 3.5;
/** Compendium 02052: heavy squats and deadlifts; used when the efforts average RPE 9 or more. */
export const HEAVY_LIFT_MET = 5;
/** An activity this module doesn't know: a middling MET. */
export const CARDIO_MET = 5;

/** How many sets a workout has, for its time when no duration was logged. */
function countSets(exercises: ExerciseLog[]): number {
  return exercises.reduce((n, e) => n + e.sets.length, 0);
}

/** Sum of a numeric field over every set of every exercise; missing values count as 0. */
function sumSets(exercises: ExerciseLog[], get: (s: SetEntry) => number | undefined): number {
  return exercises.reduce((total, e) => e.sets.reduce((n, s) => n + (get(s) ?? 0), total), 0);
}

/**
 * The MET a lifting workout is worth: heavy (5) when the efforts average RPE 9 or more, that is an average
 * stored RIR of 1 or less; otherwise the general 3.5. Exercises with no effort at all are ignored, and a
 * workout with no effort anywhere is 3.5.
 */
function liftMet(exercises: ExerciseLog[]): number {
  let total = 0;
  let n = 0;
  for (const e of exercises) {
    const rir = logRir(e);
    if (rir === undefined) continue;
    total += rir;
    n += 1;
  }
  return n > 0 && total / n <= 1 ? HEAVY_LIFT_MET : LIFT_MET;
}

/** Calories above the resting burn for `minutes` at a given MET and body weight; not rounded. */
export function activeKcal(met: number, kg: number, minutes: number): number {
  return Math.max(0, met - 1) * kg * (minutes / 60);
}

/**
 * The MET of a cardio activity, from words in its name (lower-cased, so "swimming" matches "swim"). A name
 * listing several activities gets the easiest one; an unknown activity gets CARDIO_MET.
 */
export function cardioMet(activity: string): number {
  const name = activity.toLowerCase();
  const known: [words: string[], met: number][] = [
    [['walk'], 3.5],
    [['bike', 'cycl'], 7.5],
    [['swim'], 6],
    [['elliptical'], 5],
  ];
  let best = Infinity;
  for (const [words, met] of known) {
    if (words.some((word) => name.includes(word))) best = Math.min(best, met);
  }
  return Number.isFinite(best) ? best : CARDIO_MET;
}

/** A run: about 1 kcal per kg per km, less the resting burn for the time it took. */
function runBurn(w: Workout, kg: number): number {
  const km = sumSets(w.exercises, (s) => s.distanceM) / 1000;
  const durationS = sumSets(w.exercises, (s) => s.durationS);
  const hours = durationS > 0 ? durationS / 3600 : km * 0.1; // no time logged: 6 minutes a km
  return Math.max(0, kg * km - kg * hours);
}

/** Calories burned by one workout, rounded to a whole kcal. */
export function workoutBurn(w: Workout, kg: number): number {
  switch (w.kind) {
    case 'run':
      return Math.round(runBurn(w, kg));
    case 'cardio': {
      const minutes = w.durationMin ?? sumSets(w.exercises, (s) => s.durationS) / 60;
      const first = w.exercises[0];
      return Math.round(activeKcal(cardioMet(first === undefined ? '' : first.name), kg, minutes));
    }
    default: {
      // strength and other: sets at 3 minutes a set, or the logged duration.
      const minutes = w.durationMin ?? SET_MINUTES * countSets(w.exercises);
      return Math.round(activeKcal(liftMet(w.exercises), kg, minutes));
    }
  }
}

/** What the player burned on one day: the day's workouts in the order they were logged. */
export function burnedOn(
  workouts: Workout[],
  date: string,
  kg: number,
): {
  total: number;
  items: { workoutId: string; title: string; kcal: number }[];
} {
  if (!(kg > 0)) return { total: 0, items: [] };

  const day = workouts
    .filter((x) => x.date === date)
    .sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0));

  const items = day
    .map((x) => ({
      workoutId: x.id,
      title: x.title ?? x.exercises.map((e) => e.name).join(', '),
      kcal: workoutBurn(x, kg),
    }))
    .filter((item) => item.kcal !== 0);

  return { total: items.reduce((n, item) => n + item.kcal, 0), items };
}
