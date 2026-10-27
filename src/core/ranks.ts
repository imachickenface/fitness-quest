/**
 * Strength ranks: how good each logged lift is, on a 0-1000 scale with nine tiers, like the Liftoff app.
 *
 * A set's e1RM (Epley's estimate of the one-rep max) is compared to the exercise's standard, as a multiple
 * of bodyweight, and the ratio is curved so gains near the top count for more. Everything here is pure: no
 * DOM, no clock, no mutation of the inputs.
 */
import type { Workout } from '../contract.ts';
import type { Exercise } from './exercises.ts';
import { FEMALE_LOWER, FEMALE_UPPER, findExercise } from './exercises.ts';

/** Nine tiers, easiest to hardest. */
export const TIERS = [
  'Wood',
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Champion',
  'Titan',
  'Olympian',
] as const;
export type Tier = (typeof TIERS)[number];

/** The lowest score of each tier, index-aligned with TIERS. */
export const TIER_FLOORS = [0, 100, 200, 325, 450, 575, 700, 825, 950] as const;

export type Sex = 'male' | 'female';

export type ExerciseRank = {
  exercise: Exercise;
  best: { weightKg: number; reps: number; date: string };
  e1rmKg: number;
  score: number;
  tier: Tier;
};

/** Where a score sits: its tier, its position in TIERS, and what the next tier needs. */
export type TierInfo = {
  tier: Tier;
  index: number;
  next?: { tier: Tier; at: number };
};

/** A tier plus the overall score it came from. */
export type OverallRank = { score: number } & TierInfo;

/** Epley's e1RM from a weight and a rep count: 0 without both, the weight itself for a single rep. */
export function e1rm(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 15) / 30);
}

/** The tier a score falls in, plus the next tier up and the score needed for it. */
export function tierFor(score: number): TierInfo {
  let index = 0;
  for (let i = 1; i < TIERS.length; i++) {
    const floor = TIER_FLOORS[i];
    if (floor !== undefined && floor <= score) index = i;
  }
  const tier = TIERS[index] as Tier;
  const nextTier = TIERS[index + 1];
  const nextAt = TIER_FLOORS[index + 1];
  return nextTier === undefined || nextAt === undefined
    ? { tier, index }
    : { tier, index, next: { tier: nextTier, at: nextAt } };
}

/** How much a lift is worth: e1RM per kilo of bodyweight against the exercise's standard, curved to 0-1000. */
export function liftScore(
  exercise: Exercise,
  e1rmKg: number,
  bodyweightKg: number,
  sex: Sex,
): number {
  const top = exercise.top;
  if (top === undefined || !(bodyweightKg > 0)) return 0;
  const factor = sex === 'female' ? (exercise.lower ? FEMALE_LOWER : FEMALE_UPPER) : 1;
  const standard = top * factor;
  if (!(standard > 0)) return 0;
  const ratio = e1rmKg / bodyweightKg;
  return Math.round(1000 * Math.min(1, ratio / standard) ** 0.8);
}

/** The best logged set of every known exercise, best score first. */
export function exerciseRanks(workouts: Workout[], bodyweightKg: number, sex: Sex): ExerciseRank[] {
  const best = new Map<
    string,
    {
      exercise: Exercise;
      weightKg: number;
      reps: number;
      date: string;
      e1rmKg: number;
    }
  >();

  for (const workout of workouts) {
    for (const log of workout.exercises) {
      const exercise = findExercise(log.name);
      if (exercise === undefined || exercise.top === undefined) continue;
      for (const set of log.sets) {
        const reps = set.reps;
        if (reps === undefined || !(reps > 0)) continue;

        let weightKg: number;
        let load: number;
        if (exercise.bodyweight) {
          weightKg = set.weightKg ?? 0;
          load = bodyweightKg + weightKg;
        } else {
          const logged = set.weightKg;
          if (logged === undefined || !(logged > 0)) continue;
          weightKg = logged;
          load = logged;
        }

        const e1rmKg = e1rm(load, reps);
        if (!(e1rmKg > 0)) continue;

        const kept = best.get(exercise.id);
        if (
          kept === undefined ||
          e1rmKg > kept.e1rmKg ||
          (e1rmKg === kept.e1rmKg && workout.date < kept.date)
        ) {
          best.set(exercise.id, { exercise, weightKg, reps, date: workout.date, e1rmKg });
        }
      }
    }
  }

  const ranks: ExerciseRank[] = [];
  for (const kept of best.values()) {
    const score = liftScore(kept.exercise, kept.e1rmKg, bodyweightKg, sex);
    ranks.push({
      exercise: kept.exercise,
      best: { weightKg: kept.weightKg, reps: kept.reps, date: kept.date },
      e1rmKg: kept.e1rmKg,
      score,
      tier: tierFor(score).tier,
    });
  }

  return ranks.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const an = a.exercise.name;
    const bn = b.exercise.name;
    if (an !== bn) return an < bn ? -1 : 1;
    return 0;
  });
}

/** The mean of the six best scores (all of them if fewer), rounded, with its tier. */
export function overallRank(ranks: Pick<ExerciseRank, 'score'>[]): OverallRank {
  const scores = ranks
    .map((r) => r.score)
    .sort((a, b) => b - a)
    .slice(0, 6);
  const total = scores.reduce((sum, s) => sum + s, 0);
  const score = scores.length === 0 ? 0 : Math.round(total / scores.length);
  return { score, ...tierFor(score) };
}
