/**
 * How fit and how well-fuelled the player is, derived from their recent logs and turned into the hero's
 * `muscle` (0..4) and `build` (-2..+2) in `src/ui/avatar/look.ts`.
 *
 * Pure like the rest of `src/core/`: `today` is passed in, dates are compared as `YYYY-MM-DD` strings, and
 * no input record is mutated.
 */
import { addDays } from './dates.ts';
import type { Records } from './records.ts';

export type BodyInput = {
  records: Records;
  /** the local date each completed quest was completed on */
  questsCompletedOn: string[];
  streakDays: number;
  targetKcal?: number;
  today: string; // YYYY-MM-DD
};

/** Training window: the 28 days ending today, inclusive. */
const MUSCLE_WINDOW = 28;
/** Feeding window: the 14 completed days before today. */
const BUILD_WINDOW = 14;

/**
 * Training effort over the last 28 days: one point per day that has a workout (several workouts on one
 * day still count once), half a point per quest completed inside the window, and a point per whole
 * 7-day streak.
 */
export function musclePoints(input: Omit<BodyInput, 'targetKcal'>): number {
  const from = addDays(input.today, -(MUSCLE_WINDOW - 1));
  const to = input.today;

  const workoutDays = new Set<string>();
  for (const workout of input.records.workouts) {
    if (workout.date >= from && workout.date <= to) workoutDays.add(workout.date);
  }

  let points = workoutDays.size;
  for (const date of input.questsCompletedOn) {
    if (date >= from && date <= to) points += 0.5;
  }
  return points + Math.floor(input.streakDays / 7);
}

/** Muscle tier from training points: 0 below 4, then 4 / 10 / 18 / 28 points. */
export function muscleFrom(points: number): number {
  if (points >= 28) return 4;
  if (points >= 18) return 3;
  if (points >= 10) return 2;
  if (points >= 4) return 1;
  return 0;
}

/**
 * Average signed difference from the daily calorie target over the last 14 completed days.
 *
 * A day only counts when it has at least two entries - one entry is probably an unfinished day of
 * logging - and today never counts, because it is still in progress. Fewer than three counted days is
 * too little data to judge, so the build stays neutral.
 *
 * `r` is the mean of `(dayTotal - target) / target` over the counted days. Summing the raw deviations
 * and dividing once by `count * target` is the same number mathematically, but keeps an exactly-on-threshold
 * average from drifting past it through repeated rounding.
 */
export function buildFrom(records: Records, targetKcal: number | undefined, today: string): number {
  if (targetKcal === undefined || !(targetKcal > 0)) return 0;

  const from = addDays(today, -BUILD_WINDOW);
  const to = addDays(today, -1);

  const byDay = new Map<string, { entries: number; kcal: number }>();
  for (const entry of records.foodEntries) {
    if (entry.date < from || entry.date > to) continue;
    const day = byDay.get(entry.date) ?? { entries: 0, kcal: 0 };
    day.entries += 1;
    day.kcal += entry.nutrition.kcal;
    byDay.set(entry.date, day);
  }

  let days = 0;
  let deviation = 0;
  for (const day of byDay.values()) {
    if (day.entries < 2) continue;
    days += 1;
    deviation += day.kcal - targetKcal;
  }
  if (days < 3) return 0;

  const r = deviation / (days * targetKcal);
  // Strict comparisons: an average exactly on a threshold stays in the lower band.
  if (r > 0.25) return 2;
  if (r > 0.1) return 1;
  if (r < -0.3) return -2;
  if (r < -0.15) return -1;
  return 0;
}

/** The hero's body: muscle from recent training, build from recent calorie balance. */
export function bodyShape(input: BodyInput): { muscle: number; build: number } {
  return {
    muscle: muscleFrom(musclePoints(input)),
    build: buildFrom(input.records, input.targetKcal, input.today),
  };
}
