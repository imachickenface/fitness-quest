/**
 * The public profile card: what a player's friends see, published by their phone after each sync.
 *
 * Built from an allow-list, so nothing health-related can leak: no body weight, calories, food, notes or
 * birth year (see contract.ts: `PublicProfile`). Everything here is pure like `core/game.ts` - no DOM, no
 * clock: `today` feeds every date comparison and `now` is only stamped into `updatedAt`; the inputs are only
 * ever read, and every optional key is left out rather than set to `undefined`.
 */
import {
  SHOWCASE_MAX,
  type HeroLook,
  type Profile,
  type PublicLift,
  type PublicProfile,
  type Quest,
  type QuestProgress,
  type Workout,
} from '../../contract.ts';
import { gameState, recordXp } from '../game.ts';
import { TIERS, type ExerciseRank, exerciseRanks, overallRank } from '../ranks.ts';
import type { Records } from '../records.ts';
import { weekStart } from '../quests/daily.ts';
import { unlockedTitles } from './titles.ts';

/** Everything the card is built from. */
export type SummaryInput = {
  profile: Profile;
  records: Records;
  /** every stored quest with its progress */
  quests: Array<{ quest: Quest; progress: QuestProgress }>;
  /** the latest weigh-in; lifts are only ranked with it */
  bodyweightKg: number | undefined;
  /** the active program's name, already worded for people */
  programName: string | undefined;
  /** local date YYYY-MM-DD */
  today: string;
  /** timestamp for updatedAt */
  now: string;
};

/** Records dated `from` to `to`, inclusive. Returns new arrays; the input is untouched. */
function datedBetween<T extends { date: string }>(items: T[], from: string, to: string): T[] {
  return items.filter((item) => item.date >= from && item.date <= to);
}

/** Workouts dated on or before `today`; anything in the future is not logged yet. */
function loggedWorkouts(records: Records, today: string): Workout[] {
  return records.workouts.filter((workout) => workout.date <= today);
}

/**
 * XP earned from Monday (`weekStart(today)`) to today: `recordXp` over just those days' records, so the
 * per-day caps apply inside the week exactly as they do everywhere else.
 */
export function weekXp(records: Records, today: string): number {
  const week = weekStart(today);
  const inWeek = <T extends { date: string }>(items: T[]) => datedBetween(items, week, today);
  return recordXp(
    {
      foodEntries: inWeek(records.foodEntries),
      workouts: inWeek(records.workouts),
      weighIns: inWeek(records.weighIns),
    },
    today,
  );
}

/** XP from quests finished inside the current week; a completed quest with no date is not this week's. */
function weekQuestXp(
  quests: Array<{ quest: Quest; progress: QuestProgress }>,
  week: string,
  today: string,
): number {
  let xp = 0;
  for (const { quest, progress } of quests) {
    const completedOn = progress.completedOn;
    if (
      progress.complete &&
      completedOn !== undefined &&
      week <= completedOn &&
      completedOn <= today
    ) {
      xp += quest.xp;
    }
  }
  return xp;
}

/** The lifts to show: the chosen showcase ones in the chosen order, else the best ranked ones. */
function showcaseRanks(
  ranks: ExerciseRank[],
  chosen: readonly string[] | undefined,
): ExerciseRank[] {
  if (chosen === undefined || chosen.length === 0) {
    // A stable sort keeps ranks.ts' own order (score, then name) for equal scores.
    return [...ranks].sort((a, b) => b.score - a.score).slice(0, SHOWCASE_MAX);
  }

  const byId = new Map(ranks.map((rank) => [rank.exercise.id, rank]));
  const picked: ExerciseRank[] = [];
  for (const id of chosen) {
    const rank = byId.get(id);
    // Skip ids that were never logged, and ids already picked.
    if (rank !== undefined && !picked.includes(rank)) picked.push(rank);
  }
  return picked.slice(0, SHOWCASE_MAX);
}

/** One lift as friends see it: its rank and its best set, with the numbers rounded for display. */
function publicLift(rank: ExerciseRank): PublicLift {
  return {
    exerciseId: rank.exercise.id,
    name: rank.exercise.name,
    tierIndex: TIERS.indexOf(rank.tier),
    score: Math.round(rank.score),
    e1rmKg: Math.round(rank.e1rmKg * 10) / 10,
    best: rank.best,
  };
}

/** The chosen character's customisation, keeping only the keys the player actually set. */
function heroLookOf(profile: Profile): HeroLook | undefined {
  const look = profile.heroLook;
  if (look === undefined) return undefined;
  return {
    ...(look.head !== undefined ? { head: look.head } : {}),
    ...(look.colours !== undefined ? { colours: { ...look.colours } } : {}),
  };
}

/** What friends see. */
export function publicSummary(input: SummaryInput): PublicProfile {
  const { profile, records, quests, bodyweightKg, programName, today, now } = input;

  const g = gameState(records, quests, today);
  const week = weekStart(today);
  const workouts = loggedWorkouts(records, today);
  const questsDone = quests.filter(({ progress }) => progress.complete).length;

  // Lifts are shared unless the player turned them off, and need the latest weigh-in to rank against.
  const shareLifts = profile.social?.shareLifts !== false;
  const ranks =
    shareLifts && typeof bodyweightKg === 'number'
      ? exerciseRanks(workouts, bodyweightKg, profile.sex)
      : [];

  const overall = ranks.length === 0 ? undefined : overallRank(ranks);

  // Hidden lifts never unlock lifter titles: `overallTierIndex` is left out when there is no overall rank.
  const titles = unlockedTitles({
    level: g.level,
    records,
    questsDone,
    today,
    ...(overall === undefined ? {} : { overallTierIndex: overall.index }),
  });

  // A chosen title is only published once it is unlocked.
  const chosenTitle = profile.social?.title;
  const title = chosenTitle !== undefined && titles.includes(chosenTitle) ? chosenTitle : undefined;

  // Chosen showcase titles, dropped when not unlocked, duplicates removed, at most SHOWCASE_MAX.
  const showcaseTitles = [
    ...new Set((profile.social?.showcaseTitles ?? []).filter((t) => titles.includes(t))),
  ].slice(0, SHOWCASE_MAX);

  const heroLook = heroLookOf(profile);
  const lifts = showcaseRanks(ranks, profile.social?.showcaseLifts).map(publicLift);

  return {
    v: 1,
    ...(profile.hero === undefined ? {} : { hero: profile.hero }),
    ...(heroLook === undefined ? {} : { heroLook }),
    bio: profile.social?.bio?.trim() ?? '',
    ...(title === undefined ? {} : { title }),
    titles,
    showcaseTitles,
    level: g.level,
    xp: g.xp,
    week,
    weekXp: weekXp(records, today) + weekQuestXp(quests, week, today),
    streakDays: g.streakDays,
    workouts: workouts.length,
    questsDone,
    ...(overall === undefined
      ? {}
      : { overall: { tierIndex: overall.index, score: Math.round(overall.score) } }),
    lifts,
    ...(typeof programName === 'string' ? { program: programName } : {}),
    updatedAt: now,
  };
}
