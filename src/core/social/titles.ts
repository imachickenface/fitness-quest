/**
 * Titles: the badges a player unlocks and can show under their name on the profile screen.
 *
 * Everything here is derived, never stored: each title unlocks when a number worked out from the user's
 * records reaches its threshold (see contract.ts: TITLE_IDS). No DOM, no clock - `today` is passed in, records
 * dated after it are ignored, the inputs are only ever read, and every date step goes through `addDays` so a
 * DST change can neither skip nor repeat a calendar day.
 */
import { TITLE_IDS, type TitleId } from '../../contract.ts';
import { addDays } from '../dates.ts';
import type { Records } from '../records.ts';

/** What unlocks the titles. */
export type TitleInput = {
  level: number;
  records: Records;
  /** how many quests the player has completed */
  questsDone: number;
  /** index into TIERS (0 Wood .. 8 Olympian) of the overall lift rank; undefined = not ranked */
  overallTierIndex?: number;
  /** a local date, YYYY-MM-DD; records dated after it are ignored */
  today: string;
};

/** Each title's display name and how to unlock it, for the profile screen. */
export const TITLES: Record<TitleId, { name: string; how: string }> = {
  novice: { name: 'Novice', how: 'Start your adventure' },
  apprentice: { name: 'Apprentice', how: 'Reach level 5' },
  adventurer: { name: 'Adventurer', how: 'Reach level 10' },
  veteran: { name: 'Veteran', how: 'Reach level 20' },
  champion: { name: 'Champion', how: 'Reach level 35' },
  legend: { name: 'Legend', how: 'Reach level 50' },
  steady: { name: 'Steady', how: 'Be active 7 days in a row' },
  unbreakable: { name: 'Unbreakable', how: 'Be active 30 days in a row' },
  relentless: { name: 'Relentless', how: 'Be active 100 days in a row' },
  first_sweat: { name: 'First Sweat', how: 'Log your first workout' },
  regular: { name: 'Regular', how: 'Log 25 workouts' },
  iron_devotee: { name: 'Iron Devotee', how: 'Log 100 workouts' },
  gym_rat: { name: 'Gym Rat', how: 'Log 250 workouts' },
  road_runner: { name: 'Road Runner', how: 'Log 10 runs' },
  quester: { name: 'Quester', how: 'Complete 10 quests' },
  hero_of_the_realm: { name: 'Hero of the Realm', how: 'Complete 100 quests' },
  silver_lifter: { name: 'Silver Lifter', how: 'Reach Silver overall lift rank' },
  gold_lifter: { name: 'Gold Lifter', how: 'Reach Gold overall lift rank' },
  diamond_lifter: { name: 'Diamond Lifter', how: 'Reach Diamond overall lift rank' },
  titan: { name: 'Titan', how: 'Reach Titan overall lift rank' },
};

/** The numbers each title compares, all counted on or before `today`. */
type Values = {
  level: number;
  bestRun: number;
  workouts: number;
  runs: number;
  questsDone: number;
  /** -1 when the player has no overall lift rank, so no lifter title unlocks */
  overallTierIndex: number;
};

/** How many workouts (any kind) and runs fall on or before `today`. */
function workoutCounts(records: Records, today: string): { workouts: number; runs: number } {
  let workouts = 0;
  let runs = 0;
  for (const workout of records.workouts) {
    if (workout.date > today) continue;
    workouts += 1;
    if (workout.kind === 'run') runs += 1;
  }
  return { workouts, runs };
}

/** The dates with any record at all - food entry, workout or weigh-in - on or before `today`, oldest first. */
function activeDays(records: Records, today: string): string[] {
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
  return [...days].sort();
}

/** The longest run of consecutive calendar days with any record (food entry, workout or weigh-in). */
export function bestRun(records: Records, today: string): number {
  let best = 0;
  let run = 0;
  let previous: string | undefined;

  // A day counts once however many records it has; a new run starts whenever the gap is more than one day.
  for (const date of activeDays(records, today)) {
    run = previous === undefined || addDays(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > best) best = run;
  }
  return best;
}

/** What each title compares and the least value that unlocks it. */
const RULES: Record<TitleId, { need: number; value: (values: Values) => number }> = {
  // Novice is always unlocked: a player is never below level 1.
  novice: { need: 1, value: (v) => v.level },
  apprentice: { need: 5, value: (v) => v.level },
  adventurer: { need: 10, value: (v) => v.level },
  veteran: { need: 20, value: (v) => v.level },
  champion: { need: 35, value: (v) => v.level },
  legend: { need: 50, value: (v) => v.level },
  steady: { need: 7, value: (v) => v.bestRun },
  unbreakable: { need: 30, value: (v) => v.bestRun },
  relentless: { need: 100, value: (v) => v.bestRun },
  first_sweat: { need: 1, value: (v) => v.workouts },
  regular: { need: 25, value: (v) => v.workouts },
  iron_devotee: { need: 100, value: (v) => v.workouts },
  gym_rat: { need: 250, value: (v) => v.workouts },
  road_runner: { need: 10, value: (v) => v.runs },
  quester: { need: 10, value: (v) => v.questsDone },
  hero_of_the_realm: { need: 100, value: (v) => v.questsDone },
  silver_lifter: { need: 2, value: (v) => v.overallTierIndex },
  gold_lifter: { need: 3, value: (v) => v.overallTierIndex },
  diamond_lifter: { need: 5, value: (v) => v.overallTierIndex },
  titan: { need: 7, value: (v) => v.overallTierIndex },
};

/** Every unlocked title, in TITLE_IDS order. */
export function unlockedTitles(input: TitleInput): TitleId[] {
  const counts = workoutCounts(input.records, input.today);
  const values: Values = {
    level: input.level,
    bestRun: bestRun(input.records, input.today),
    workouts: counts.workouts,
    runs: counts.runs,
    questsDone: input.questsDone,
    overallTierIndex: input.overallTierIndex ?? -1,
  };

  // Filtering TITLE_IDS keeps the result in contract order for free.
  return TITLE_IDS.filter((id) => {
    const rule = RULES[id];
    return rule.value(values) >= rule.need;
  });
}
