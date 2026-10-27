import type { Goal, PlannedItem } from '../contract.ts';

export const GOAL_NAMES: Record<Goal, string> = {
  lose_weight: 'Lose weight',
  maintain: 'Stay where I am',
  gain_weight: 'Gain weight',
  build_muscle: 'Build muscle',
  cardio: 'Better cardio',
  five_k: 'Run a 5K',
  ten_k: 'Run a 10K',
  half_marathon: 'Run a half marathon',
  marathon: 'Run a marathon',
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const km = (m: number) => `${Math.round(m / 100) / 10} km`;

/** One planned item in a few words: "Bench press 3×10", "8 × run 1:00 / walk 1:30", "6 km long run". */
export function describeItem(item: PlannedItem): string {
  if (item.type === 'lift')
    return `${item.exercise} ${item.sets}×${item.reps}${item.amrapLastSet ? '+' : ''}`;
  if (item.type === 'cardio')
    return `${Math.round(item.durationS / 60)} min ${item.activity.toLowerCase()}`;
  if (item.intervals) {
    const { runS, walkS, repeats } = item.intervals;
    return `${repeats} × run ${mmss(runS)} / walk ${mmss(walkS)}`;
  }
  const kind = {
    walk_run: 'walk/run',
    easy: 'easy run',
    long: 'long run',
    tempo: 'tempo run',
    intervals: 'intervals',
  }[item.runType];
  if (item.distanceM) return `${km(item.distanceM)} ${kind}`;
  if (item.durationS) return `${Math.round(item.durationS / 60)} min ${kind}`;
  return kind;
}
