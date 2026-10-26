/**
 * How far a quest has gotten, worked out from the user's records.
 *
 * Pure: no clock, and nothing the caller passed in is mutated or reordered (arrays are copied
 * before they are sorted). Only records whose `date` falls inside `quest.window` (inclusive, plain
 * string compare on `YYYY-MM-DD`) count.
 *
 * "Order" means chronological by `Date.parse(loggedAt)` with ties broken by `id`; weigh-ins and
 * day totals are instead ordered by `date` ascending.
 */
import type {
  ExerciseLog,
  FoodEntry,
  Quest,
  QuestCondition,
  QuestProgress,
  SetEntry,
  WeighIn,
  Workout,
} from '../../contract.ts';
import { exerciseKey } from '../../contract.ts';
import type { Records } from '../records.ts';

type Window = Quest['window'];
/** Everything a condition evaluation works out, before the quest's own id is attached. */
type Outcome = Omit<QuestProgress, 'questId'>;

/** Inclusive window check on local date strings. */
function inWindow(date: string, window: Window): boolean {
  return date >= window.start && date <= window.end;
}

/** Ascending by id. */
function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Chronological by loggedAt, ties by id. Copies first so the caller's array keeps its order. */
function byLoggedAt<T extends { id: string; loggedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt) || byId(a.id, b.id),
  );
}

/** Ascending unique dates. */
function sortedDates(dates: string[]): string[] {
  return [...new Set(dates)].sort();
}

/**
 * The shape every branch returns: a fraction, a label, whether the target is reached, and the date
 * it was reached on. Reaching the target forces `fraction` to 1, and `completedOn` is only ever
 * present then.
 */
function result(fraction: number, label: string, complete: boolean, completedOn?: string): Outcome {
  return {
    fraction: complete ? 1 : Math.max(0, Math.min(1, fraction)),
    label,
    complete,
    ...(complete && completedOn !== undefined ? { completedOn } : {}),
  };
}

/** "N of M" label and the fraction it implies; the caller adds `completedOn`. */
/** `unit` is plural; a target of 1 reads "0 / 1 meal", "1 / 1 day on target". */
function counted(n: number, target: number, unit: string): Outcome {
  const fraction = target > 0 ? n / target : 0;
  const shown = target === 1 ? (SINGULAR[unit] ?? unit) : unit;
  return result(fraction, `${Math.min(n, target)} / ${target} ${shown}`, n >= target);
}

/** Attach the outcome to the quest it belongs to. */
const SINGULAR: Record<string, string> = {
  meals: 'meal',
  'days on target': 'day on target',
  workouts: 'workout',
  'weigh-ins': 'weigh-in',
};

function withId(questId: string, outcome: Outcome): QuestProgress {
  return { questId, ...outcome };
}

/** Total metres on a workout: every set of every exercise. */
function totalDistance(workout: Workout): number {
  let total = 0;
  for (const ex of workout.exercises) {
    for (const set of ex.sets) total += set.distanceM ?? 0;
  }
  return total;
}

/** Total seconds on a workout, or undefined when no set recorded a duration. */
function totalDurationS(workout: Workout): number | undefined {
  let total = 0;
  let seen = false;
  for (const ex of workout.exercises) {
    for (const set of ex.sets) {
      if (set.durationS === undefined) continue;
      total += set.durationS;
      seen = true;
    }
  }
  return seen ? total : undefined;
}

/** Sets of the named exercise in one workout, names matched with exerciseKey. */
function setsOf(exercise: ExerciseLog, key: string): SetEntry[] {
  return exerciseKey(exercise.name) === key ? exercise.sets : [];
}

/** Workouts inside the window, in order. */
function workoutsIn(workouts: Workout[], window: Window): Workout[] {
  return byLoggedAt(workouts.filter((w) => inWindow(w.date, window)));
}

/** Food entries inside the window. */
function entriesIn(entries: FoodEntry[], window: Window): FoodEntry[] {
  return entries.filter((e) => inWindow(e.date, window));
}

function logMeals(
  c: Extract<QuestCondition, { type: 'log_meals' }>,
  window: Window,
  entries: FoodEntry[],
): Outcome {
  const inside = byLoggedAt(entriesIn(entries, window));
  const reached = inside.length >= c.count ? inside[c.count - 1]?.date : undefined;
  const progress = counted(inside.length, c.count, 'meals');
  return { ...progress, ...(reached !== undefined ? { completedOn: reached } : {}) };
}

function kcalInRange(
  c: Extract<QuestCondition, { type: 'kcal_in_range' }>,
  window: Window,
  entries: FoodEntry[],
): Outcome {
  const totals = new Map<string, number>();
  for (const e of entriesIn(entries, window)) {
    totals.set(e.date, (totals.get(e.date) ?? 0) + e.nutrition.kcal);
  }
  const onTarget = sortedDates(
    [...totals.entries()]
      .filter(([, total]) => total >= c.minKcal && total <= c.maxKcal)
      .map(([date]) => date),
  );
  const reached = onTarget.length >= c.days ? onTarget[c.days - 1] : undefined;
  const progress = counted(onTarget.length, c.days, 'days on target');
  return { ...progress, ...(reached !== undefined ? { completedOn: reached } : {}) };
}

function workoutCount(
  c: Extract<QuestCondition, { type: 'workout_count' }>,
  window: Window,
  workouts: Workout[],
): Outcome {
  const inside = workoutsIn(workouts, window).filter(
    (w) => c.kind === undefined || w.kind === c.kind,
  );
  const reached = inside.length >= c.count ? inside[c.count - 1]?.date : undefined;
  const progress = counted(inside.length, c.count, 'workouts');
  return { ...progress, ...(reached !== undefined ? { completedOn: reached } : {}) };
}

function exerciseVolume(
  c: Extract<QuestCondition, { type: 'exercise_volume' }>,
  window: Window,
  workouts: Workout[],
): Outcome {
  const key = exerciseKey(c.exercise);
  let total = 0;
  let completedOn: string | undefined;
  for (const w of workoutsIn(workouts, window)) {
    for (const ex of w.exercises) {
      for (const set of setsOf(ex, key)) {
        // A set missing reps or weight contributes nothing.
        total += (set.reps ?? 0) * (set.weightKg ?? 0);
      }
    }
    if (completedOn === undefined && total >= c.kg) completedOn = w.date;
  }
  const complete = completedOn !== undefined;
  const label = `${Math.floor(Math.min(total, c.kg))} / ${c.kg} kg`;
  return result(total / c.kg, label, complete, completedOn);
}

function beatPr(
  c: Extract<QuestCondition, { type: 'beat_pr' }>,
  window: Window,
  workouts: Workout[],
): Outcome {
  const key = exerciseKey(c.exercise);
  let best: { weightKg: number; reps: number } | undefined;
  let bestScore = 0;

  for (const w of workoutsIn(workouts, window)) {
    for (const ex of w.exercises) {
      for (const set of setsOf(ex, key)) {
        if (set.weightKg === undefined || set.reps === undefined) continue;
        if (set.weightKg >= c.weightKg && set.reps >= c.reps) {
          return result(1, `Beaten: ${set.weightKg} kg x ${set.reps}`, true, w.date);
        }
        const weight = c.weightKg === 0 ? 1 : Math.min(1, set.weightKg / c.weightKg);
        const score = weight * Math.min(1, set.reps / c.reps);
        if (score > bestScore) {
          bestScore = score;
          best = { weightKg: set.weightKg, reps: set.reps };
        }
      }
    }
  }

  if (best === undefined) return result(0, 'Not tried yet', false);
  return result(bestScore, `Best: ${best.weightKg} kg x ${best.reps}`, false);
}

function runDistance(
  c: Extract<QuestCondition, { type: 'run_distance' }>,
  window: Window,
  workouts: Workout[],
): Outcome {
  const runs = workoutsIn(workouts, window).filter((w) => w.kind === 'run');

  let metres = 0;
  let completedOn: string | undefined;
  if (c.single) {
    // The longest run is the measure; completion is the first run that reaches the distance.
    for (const w of runs) {
      const d = totalDistance(w);
      if (d > metres) metres = d;
      if (completedOn === undefined && d >= c.meters) completedOn = w.date;
    }
  } else {
    for (const w of runs) {
      metres += totalDistance(w);
      if (completedOn === undefined && metres >= c.meters) completedOn = w.date;
    }
  }

  const complete = completedOn !== undefined;
  const km = (m: number) => (Math.min(m, c.meters) / 1000).toFixed(1);
  const label = `${km(metres)} / ${km(c.meters)} km`;
  const progress = result(metres / c.meters, label, complete);
  return { ...progress, ...(complete && completedOn !== undefined ? { completedOn } : {}) };
}

function runTime(
  c: Extract<QuestCondition, { type: 'run_time' }>,
  window: Window,
  workouts: Workout[],
): Outcome {
  for (const w of workoutsIn(workouts, window)) {
    if (w.kind !== 'run') continue;
    const durationS = totalDurationS(w);
    // A run with no duration on any set has no time, so it can never count.
    if (durationS !== undefined && totalDistance(w) >= c.meters && durationS <= c.maxSeconds) {
      return result(1, 'Done', true, w.date);
    }
  }
  return result(0, 'Not yet', false);
}

function programSession(
  c: Extract<QuestCondition, { type: 'program_session' }>,
  window: Window,
  workouts: Workout[],
): Outcome {
  const linked = workoutsIn(workouts, window).filter((w) => w.programSessionId === c.sessionId);
  const first = linked[0];
  return first === undefined ? result(0, 'Not yet', false) : result(1, 'Done', true, first.date);
}

function weighIn(
  c: Extract<QuestCondition, { type: 'weigh_in' }>,
  window: Window,
  weighIns: WeighIn[],
): Outcome {
  const days = sortedDates(weighIns.filter((w) => inWindow(w.date, window)).map((w) => w.date));
  const reached = days.length >= c.count ? days[c.count - 1] : undefined;
  const progress = counted(days.length, c.count, 'weigh-ins');
  return { ...progress, ...(reached !== undefined ? { completedOn: reached } : {}) };
}

export function questProgress(quest: Quest, records: Records): QuestProgress {
  const { condition, window } = quest;

  switch (condition.type) {
    case 'log_meals':
      return withId(quest.id, logMeals(condition, window, records.foodEntries));
    case 'kcal_in_range':
      return withId(quest.id, kcalInRange(condition, window, records.foodEntries));
    case 'workout_count':
      return withId(quest.id, workoutCount(condition, window, records.workouts));
    case 'exercise_volume':
      return withId(quest.id, exerciseVolume(condition, window, records.workouts));
    case 'beat_pr':
      return withId(quest.id, beatPr(condition, window, records.workouts));
    case 'run_distance':
      return withId(quest.id, runDistance(condition, window, records.workouts));
    case 'run_time':
      return withId(quest.id, runTime(condition, window, records.workouts));
    case 'program_session':
      return withId(quest.id, programSession(condition, window, records.workouts));
    case 'weigh_in':
      return withId(quest.id, weighIn(condition, window, records.weighIns));
    default: {
      const unhandled: never = condition;
      throw new Error(`unhandled quest condition: ${JSON.stringify(unhandled)}`);
    }
  }
}
