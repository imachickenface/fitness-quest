/**
 * Pure game logic: XP, level, streak and the derived `GameState`.
 *
 * Nothing here is stored - the game state is recomputed from the user's records and quests on every call
 * (see contract.ts: "Game progress is derived from records and never stored"). No DOM, no clock: `today` is
 * passed in, the inputs are only ever read, and every date step goes through `addDays` so a DST change can
 * neither skip nor repeat a calendar day.
 */
import type { GameState, Quest, QuestProgress } from '../contract.ts';

import { addDays } from './dates.ts';
import type { Records } from './records.ts';

/** XP amounts, as documented: capped per day so logging more than the cap earns nothing extra. */
export const XP = {
  foodEntry: 2,
  foodEntriesPerDay: 5,
  workout: 20,
  workoutsPerDay: 2,
  weighIn: 5,
} as const;

/** XP earned inside one calendar day: the caps make a 8-meal day worth the same as a 5-meal day. */
function dayXp(foodEntries: number, workouts: number): number {
  return (
    Math.min(foodEntries, XP.foodEntriesPerDay) * XP.foodEntry +
    Math.min(workouts, XP.workoutsPerDay) * XP.workout
  );
}

/** Per-date tally of the records that earn XP. */
type DayCounts = { foodEntries: number; workouts: number };

/** How many food entries and workouts fall on each date, ignoring anything dated after today. */
function countPerDate(records: Records, today: string): Map<string, DayCounts> {
  const counts = new Map<string, DayCounts>();

  const bump = (date: string, key: 'foodEntries' | 'workouts'): void => {
    let day = counts.get(date);
    if (day === undefined) {
      day = { foodEntries: 0, workouts: 0 };
      counts.set(date, day);
    }
    day[key] += 1;
  };

  for (const entry of records.foodEntries) {
    if (entry.date <= today) bump(entry.date, 'foodEntries');
  }
  for (const workout of records.workouts) {
    if (workout.date <= today) bump(workout.date, 'workouts');
  }
  return counts;
}

/** Total XP from records: per-day capped food/workout XP, plus 5 for every weigh-in. */
export function recordXp(records: Records, today: string): number {
  let xp = 0;

  for (const day of countPerDate(records, today).values()) {
    xp += dayXp(day.foodEntries, day.workouts);
  }
  for (const weighIn of records.weighIns) {
    if (weighIn.date <= today) xp += XP.weighIn;
  }
  return xp;
}

/** XP needed to finish level L is 50 x (L + 1): level 1 costs 100, level 2 costs 150, and so on. */
function xpForLevel(level: number): number {
  return 50 * (level + 1);
}

/** Which level a total XP lands on, and how far into it. Junk XP (negative, NaN, infinite) counts as 0. */
export function levelFor(xp: number): { level: number; xpIntoLevel: number; xpForLevel: number } {
  let remaining = Number.isFinite(xp) && xp > 0 ? xp : 0;
  let level = 1;

  // Spend the XP level by level; each level costs more than the last, so this always terminates.
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForLevel: xpForLevel(level) };
}

/** The days with any record, oldest first, dropping anything after today. */
function activeDaysOnOrBefore(activeDays: Set<string>, today: string): string[] {
  const days = [...activeDays].filter((date) => date <= today);
  days.sort();
  return days;
}

/**
 * The current streak and the freeze budget earned along the way.
 *
 * Walks every calendar day from the first active day to today. Seven active days in a row earn a freeze (max
 * 2), and a freeze lets one missed day count towards the streak instead of breaking it. Today being unlogged
 * is not a miss - the day is simply not over yet.
 */
export function streak(
  activeDays: Set<string>,
  today: string,
): { streakDays: number; freezes: number } {
  const days = activeDaysOnOrBefore(activeDays, today);
  const first = days[0];
  if (first === undefined) return { streakDays: 0, freezes: 0 };

  let streakDays = 0;
  let freezes = 0;
  let activeRun = 0;

  let date = first;
  while (date <= today) {
    if (activeDays.has(date)) {
      streakDays += 1;
      activeRun += 1;
      if (activeRun % 7 === 0) freezes = Math.min(2, freezes + 1);
    } else if (date !== today) {
      // A missed day before today; an unlogged today is not a miss, the day is simply not over.
      if (freezes > 0) {
        // A spent freeze covers this missed day; the streak keeps counting, the run of active days does not.
        freezes -= 1;
        streakDays += 1;
      } else {
        streakDays = 0;
        activeRun = 0;
      }
    }
    date = addDays(date, 1);
  }

  return { streakDays, freezes };
}

/** The dates that count as "active" for the streak: any food entry, workout or weigh-in. */
function activeDaysFor(records: Records, today: string): Set<string> {
  const days = new Set<string>();
  for (const entry of records.foodEntries) {
    if (entry.date <= today) days.add(entry.date);
  }
  for (const workout of records.workouts) {
    if (workout.date <= today) days.add(workout.date);
  }
  for (const weighIn of records.weighIns) {
    if (weighIn.date <= today) days.add(weighIn.date);
  }
  return days;
}

/** The whole game state: records XP plus completed quest XP, level, streak and the overworld node. */
export function gameState(
  records: Records,
  quests: Array<{ quest: Quest; progress: QuestProgress }>,
  today: string,
): GameState {
  // Completed quests, in input order: their ids feed the map node and their XP feeds the total.
  const completed = quests.filter(({ progress }) => progress.complete);
  const completedQuestIds = completed.map(({ quest }) => quest.id);
  const questXp = completed.reduce((sum, { quest }) => sum + quest.xp, 0);

  const xp = recordXp(records, today) + questXp;
  const { level, xpIntoLevel, xpForLevel } = levelFor(xp);
  const { streakDays, freezes } = streak(activeDaysFor(records, today), today);

  return {
    xp,
    level,
    xpIntoLevel,
    xpForLevel,
    streakDays,
    freezes,
    completedQuestIds,
    mapNode: completedQuestIds.length,
  };
}
