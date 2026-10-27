/**
 * Weekly boss quests, generated from the player's own best lifts.
 *
 * Pure and deterministic: inputs are never mutated, the clock comes in through `now`, and the same
 * ranks plus Monday always give the same quests. Each boss quest asks for one notch above the personal
 * best, where a notch is 2.5 kg unless that would be more than 5% of the weight (light or bodyweight
 * lifts get an extra rep instead).
 */
import type { Quest, QuestCondition } from '../../contract.ts';
import { addDays } from '../dates.ts';
import type { ExerciseRank } from '../ranks.ts';

/** The next target above a best: +2.5 kg at the same reps, or +1 rep when 2.5 kg would be a big jump. */
export function nextBest(weightKg: number, reps: number): { weightKg: number; reps: number } {
  if (weightKg <= 0 || 2.5 > weightKg * 0.05) return { weightKg, reps: reps + 1 };
  return { weightKg: weightKg + 2.5, reps };
}

/** How a boss quest is phrased, depending on whether the best was a barbell load or bodyweight reps. */
function describe(best: ExerciseRank['best'], target: { weightKg: number; reps: number }): string {
  if (best.weightKg <= 0) {
    return `Do ${String(target.reps)} reps (your best: ${String(best.reps)}).`;
  }
  return (
    `Lift ${String(target.weightKg)} kg for ${String(target.reps)} reps ` +
    `(your best: ${String(best.weightKg)} kg x ${String(best.reps)}).`
  );
}

/** The two best-ranked lifts get a weekly boss quest each; anything else is left for another week. */
export function bossQuests(ranks: ExerciseRank[], monday: string, now: string): Quest[] {
  const end = addDays(monday, 6);
  return ranks.slice(0, 2).map((rank) => {
    const { exercise, best } = rank;
    const target = nextBest(best.weightKg, best.reps);
    return {
      id: `boss-${monday}-${exercise.id}`,
      kind: 'boss',
      origin: 'history',
      title: `Beat your ${exercise.name} best`,
      description: describe(best, target),
      condition: {
        type: 'beat_pr',
        exercise: exercise.name,
        weightKg: target.weightKg,
        reps: target.reps,
      } satisfies QuestCondition,
      xp: 150,
      window: { start: monday, end },
      createdAt: now,
    };
  });
}
