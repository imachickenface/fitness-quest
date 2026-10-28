/**
 * Shared quests between two friends: the same goal for 7 days, each side counting its own records. Pure:
 * `today` is passed in and records after it never count.
 */
import type { Records } from '../records.ts';

export const CHALLENGE_GOALS = ['workouts', 'run_km', 'active_days'] as const;
export type ChallengeGoal = (typeof CHALLENGE_GOALS)[number];

/** Targets a player can pick, smallest first. */
export const CHALLENGE_TARGETS: Record<ChallengeGoal, number[]> = {
  workouts: [2, 3, 4, 5],
  run_km: [5, 10, 15, 20, 30],
  active_days: [3, 5, 7],
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 workouts each", "Run 10 km each", "Active 5 days each". */
export function challengeTitle(goal: ChallengeGoal, target: number): string {
  switch (goal) {
    case 'workouts':
      return `${plural(target, 'workout', 'workouts')} each`;
    case 'run_km':
      return `Run ${target} km each`;
    case 'active_days':
      return `Active ${plural(target, 'day', 'days')} each`;
  }
}

/** How far one player is: workouts logged, km run (to 0.1) or active days, from `starts` to `ends`. */
export function challengeValue(
  goal: ChallengeGoal,
  records: Records,
  starts: string,
  ends: string,
  today: string,
): number {
  const last = ends < today ? ends : today;
  const inside = (date: string) => date >= starts && date <= last;
  const workouts = records.workouts.filter((w) => inside(w.date));
  switch (goal) {
    case 'workouts':
      return workouts.length;
    case 'run_km': {
      const m = workouts
        .filter((w) => w.kind === 'run')
        .flatMap((w) => w.exercises.flatMap((e) => e.sets))
        .reduce((sum, s) => sum + (s.distanceM ?? 0), 0);
      return Math.round(m / 100) / 10;
    }
    case 'active_days': {
      const days = new Set<string>();
      for (const r of [...records.foodEntries, ...records.workouts, ...records.weighIns]) {
        if (inside(r.date)) days.add(r.date);
      }
      return days.size;
    }
  }
}

/** A value for display: "2 / 3", "7.5 / 10 km". */
export function challengeProgress(goal: ChallengeGoal, value: number, target: number): string {
  return goal === 'run_km' ? `${value} / ${target} km` : `${value} / ${target}`;
}
