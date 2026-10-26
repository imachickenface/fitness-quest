/**
 * Daily and weekly quests, generated from the user's own recent behaviour.
 *
 * Pure and deterministic: the clock and "today" come in through `QuestInput`, inputs are never
 * mutated, and the same input always gives the same quests. The `move` quest rotates through its options
 * with a 32-bit FNV-1a hash of the date, so a day's suggestion is stable but not always the same quest.
 */
import type { Goal, Quest, QuestCondition, Workout } from '../../contract.ts';
import { addDays } from '../dates.ts';
import type { Records } from '../records.ts';

/** What one day's quests are generated from. */
export type QuestInput = {
  date: string; // YYYY-MM-DD
  records: Records;
  goal: Goal;
  target?: { kcal: number };
  now: string; // createdAt for every quest
};

/** A move option: its condition plus the title and xp that go with it. */
type MoveOption = { condition: QuestCondition; title: string; xp: number };

/** 32-bit FNV-1a over charCodeAt; used to pick among the `move` options. */
export function seedFor(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The Monday on or before `date`; weeks start on Monday (ISO). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** Records dated `from` to `to`, inclusive. Returns a new array; the input is untouched. */
function inRange<T extends { date: string }>(records: T[], from: string, to: string): T[] {
  return records.filter((r) => r.date >= from && r.date <= to);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Sort ascending, then the middle value (odd length) or the mean of the two middle values (even). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The 14 days before `date`, inclusive: the behaviour a daily quest is modelled on. */
function historyBounds(date: string): [string, string] {
  return [addDays(date, -14), addDays(date, -1)];
}

/** Meals per logged day in the history; 2 (the minimum) when nothing was logged. */
function mealsCount(records: Records, from: string, to: string): number {
  const counts = new Map<string, number>();
  for (const entry of inRange(records.foodEntries, from, to)) {
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1);
  }
  if (counts.size === 0) return 2;
  return clamp(Math.round(median([...counts.values()])), 2, 4);
}

/** A run's distance is the sum of distanceM over its sets. */
function runDistance(workout: Workout): number {
  let total = 0;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) total += set.distanceM ?? 0;
  }
  return total;
}

const RUNNING_GOALS: Goal[] = ['five_k', 'ten_k', 'half_marathon', 'marathon'];

/**
 * The `move` quest options, built in workout / run / weigh-in order. A run distance is the median of the
 * user's recent runs rounded to the nearest 500 m, or 2 km when they have none but signed up for a running
 * goal.
 */
function moveOptions(records: Records, goal: Goal, from: string, to: string): MoveOption[] {
  const workouts = inRange(records.workouts, from, to);
  const runs = workouts.filter((w) => w.kind === 'run');
  const runningGoal = RUNNING_GOALS.includes(goal);

  const options: MoveOption[] = [];
  if (workouts.length > 0) {
    options.push({
      condition: { type: 'workout_count', count: 1 },
      title: 'Get a workout in',
      xp: 40,
    });
  }
  if (runs.length > 0 || runningGoal) {
    const meters =
      runs.length === 0
        ? 2000
        : clamp(Math.round(median(runs.map(runDistance)) / 500) * 500, 1000, 21000);
    options.push({
      condition: { type: 'run_distance', meters, single: true },
      title: `Run ${meters / 1000} km`,
      xp: 40,
    });
  }
  options.push({ condition: { type: 'weigh_in', count: 1 }, title: 'Step on the scale', xp: 10 });
  return options;
}

/** The quests for one day, in meals / calories / move order. */
export function dailyQuests(input: QuestInput): Quest[] {
  const { date, records, goal, target, now } = input;
  const [from, to] = historyBounds(date);
  const shared = {
    kind: 'daily' as const,
    origin: 'daily' as const,
    window: { start: date, end: date },
    createdAt: now,
  };

  const mealCount = mealsCount(records, from, to);
  const quests: Quest[] = [
    {
      id: `daily-${date}-meals`,
      ...shared,
      condition: { type: 'log_meals', count: mealCount },
      title: `Log ${mealCount} meals`,
      xp: 20,
    },
  ];

  if (target !== undefined) {
    const minKcal = Math.round((target.kcal * 0.9) / 10) * 10;
    const maxKcal = Math.round((target.kcal * 1.1) / 10) * 10;
    quests.push({
      id: `daily-${date}-kcal`,
      ...shared,
      condition: { type: 'kcal_in_range', days: 1, minKcal, maxKcal },
      title: 'Land on your calorie target',
      xp: 30,
    });
  }

  const options = moveOptions(records, goal, from, to);
  const pick = options[seedFor(date) % options.length]!;
  quests.push({ id: `daily-${date}-move`, ...shared, ...pick });

  return quests;
}

/** The one weekly quest: keep up the average workout count of the 4 weeks before this week. */
export function weeklyQuest(input: QuestInput): Quest {
  const monday = weekStart(input.date);
  const past = inRange(input.records.workouts, addDays(monday, -28), addDays(monday, -1)).length;
  const count = past === 0 ? 2 : clamp(Math.round(past / 4), 1, 6);

  return {
    id: `weekly-${monday}`,
    kind: 'weekly',
    origin: 'daily',
    condition: { type: 'workout_count', count },
    title: `${count} workouts this week`,
    xp: 100,
    window: { start: monday, end: addDays(monday, 6) },
    createdAt: input.now,
  };
}
