/**
 * The Arnold split: chest & back, then shoulders & arms, then legs, repeating.
 *
 * Pure like the rest of `src/core/`: no DOM, no clock, and no input is mutated - `filter` copies before
 * anything is sorted, and the sets a template hands back are fresh copies of the logged ones. Muscle groups
 * come from the exercise catalogue (`findExercise`), so a name nobody knows simply counts nothing.
 */
import type { SetEntry, Workout } from '../contract.ts';
import { findExercise, nameKey } from './exercises.ts';
import type { MuscleGroup } from './exercises.ts';

export type SplitDay = { id: string; title: string; groups: MuscleGroup[] };

/** The three Arnold days, in the order they repeat. */
export const ARNOLD: SplitDay[] = [
  { id: 'chest-back', title: 'Chest & back', groups: ['chest', 'back'] },
  { id: 'shoulders-arms', title: 'Shoulders & arms', groups: ['shoulders', 'arms'] },
  { id: 'legs', title: 'Legs', groups: ['legs'] },
];

/** One logged exercise, grouped by catalogue identity and remembered from its latest appearance. */
type ExerciseGroup = { name: string; count: number; lastDate: string; lastSets: SetEntry[] };

/** Logged sets per muscle group, and their total; exercises outside the catalogue are ignored. */
function countedSets(exercises: Workout['exercises']): {
  total: number;
  byGroup: Map<MuscleGroup, number>;
} {
  const byGroup = new Map<MuscleGroup, number>();
  let total = 0;
  for (const ex of exercises) {
    const group = findExercise(ex.name)?.group;
    if (group === undefined) continue;
    total += ex.sets.length;
    byGroup.set(group, (byGroup.get(group) ?? 0) + ex.sets.length);
  }
  return { total, byGroup };
}

/** Which Arnold day a workout belongs to, or undefined when it belongs to none. */
export function splitDayOf(workout: Workout): string | undefined {
  if (workout.kind !== 'strength') return undefined;

  const { total, byGroup } = countedSets(workout.exercises);
  if (total === 0) return undefined;

  // The day with the most matched sets wins, but only when it covers at least half of them;
  // a tie goes to the earlier day, so the comparison stays strict.
  let bestId: string | undefined;
  let bestMatched = 0;
  for (const day of ARNOLD) {
    let matched = 0;
    for (const group of day.groups) matched += byGroup.get(group) ?? 0;
    if (matched > bestMatched && matched * 2 >= total) {
      bestMatched = matched;
      bestId = day.id;
    }
  }
  return bestId;
}

/** Older first: `YYYY-MM-DD`, then the exact moment it was logged. Both are sortable strings. */
function compareWorkouts(a: Workout, b: Workout): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.loggedAt !== b.loggedAt) return a.loggedAt < b.loggedAt ? -1 : 1;
  return 0;
}

/** Most frequent first; a tie goes to the more recent appearance. */
function compareGroups(a: ExerciseGroup, b: ExerciseGroup): number {
  if (a.count !== b.count) return b.count - a.count;
  if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
  return 0;
}

/** The most recent workout that has a split day, or undefined when there is none. */
function lastSplitWorkout(workouts: Workout[]): Workout | undefined {
  let last: Workout | undefined;
  for (const workout of workouts) {
    if (splitDayOf(workout) === undefined) continue;
    if (last === undefined || compareWorkouts(workout, last) > 0) last = workout;
  }
  return last;
}

/** The Arnold day after the most recent split workout; 'legs' wraps round to 'chest-back'. */
export function nextSplitDay(workouts: Workout[]): string {
  const last = lastSplitWorkout(workouts);
  const id = last === undefined ? undefined : splitDayOf(last);
  const index = ARNOLD.findIndex((day) => day.id === id);
  if (index < 0) return ARNOLD[0]?.id ?? 'chest-back';
  return ARNOLD[(index + 1) % ARNOLD.length]?.id ?? 'chest-back';
}

/** What each Arnold day defaults to when the user has never trained it. */
const DEFAULTS: Record<string, string[]> = {
  'chest-back': [
    'Bench press',
    'Barbell row',
    'Incline dumbbell press',
    'Lat pulldown',
    'Chest fly',
  ],
  'shoulders-arms': [
    'Overhead press',
    'Lateral raise',
    'Barbell curl',
    'Tricep pushdown',
    'Hammer curl',
  ],
  legs: ['Squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise'],
};

/**
 * The exercises a day usually trains, most frequent first, each carrying the sets exactly as logged the
 * last time it appeared. Exercises are grouped by catalogue id, so "flat bench" and "Bench press" are one
 * lift shown under the newest name; unknown names group by `nameKey`.
 */
export function dayTemplate(
  dayId: string,
  workouts: Workout[],
  limit = 6,
): { name: string; sets: SetEntry[] }[] {
  if (!ARNOLD.some((day) => day.id === dayId)) return [];

  // `filter` returns a copy, so the caller's array keeps its own order.
  const history = workouts.filter((workout) => splitDayOf(workout) === dayId).sort(compareWorkouts);

  const groups = new Map<string, ExerciseGroup>();
  for (const workout of history) {
    const seen = new Set<string>();
    for (const ex of workout.exercises) {
      const id = findExercise(ex.name)?.id ?? nameKey(ex.name);
      const group = groups.get(id);
      // History runs oldest first, so the last write is the most recent appearance - its name and sets.
      if (group === undefined) {
        seen.add(id);
        groups.set(id, { name: ex.name, count: 1, lastDate: workout.date, lastSets: ex.sets });
      } else {
        group.name = ex.name;
        group.lastDate = workout.date;
        group.lastSets = ex.sets;
        // Count the workouts a lift appears in, not its appearances: twice in one day still counts once.
        if (!seen.has(id)) {
          seen.add(id);
          group.count += 1;
        }
      }
    }
  }

  if (groups.size === 0) {
    return (DEFAULTS[dayId] ?? []).map((name) => ({ name, sets: [] }));
  }

  return [...groups.values()]
    .sort(compareGroups)
    .slice(0, limit)
    .map((group) => ({ name: group.name, sets: group.lastSets.map((set) => ({ ...set })) }));
}
