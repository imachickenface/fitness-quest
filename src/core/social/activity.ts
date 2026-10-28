/**
 * The activity feed: what a player's friends see of their last 30 days (M8.7).
 *
 * Built from an allow-list like `publicSummary` in social/summary.ts, so nothing health-related leaks: no
 * body weight, calories, food, notes or birth year (see contract.ts: `PublicActivity`). Everything here is
 * pure like `core/game.ts` - no DOM, no clock: `today` feeds every date comparison, the inputs are only ever
 * read, and every date step goes through `addDays` so a DST change can neither skip nor repeat a calendar day.
 */
import type { PublicActivity, Quest, QuestProgress, Workout } from '../../contract.ts';
import { addDays } from '../dates.ts';
import { type ExerciseRank, exerciseRanks } from '../ranks.ts';
import type { Records } from '../records.ts';

/** How many days the feed covers, today included. */
export const ACTIVITY_DAYS = 30;

/** Items kept after sorting: a busy month is longer than a friend will scroll. */
const ITEM_MAX = 60;

/** Pounds in a kilogram, for the imperial lift display. */
const LB = 0.45359237;

/** A metre in imperial miles, for the run distance display. */
const MILE = 1609.344;

/** The ` · ` between the parts of a workout's detail line. */
const SEP = ' \u00b7 ';

/** Metric or imperial, as `Profile.units` spells it. */
type Units = 'metric' | 'imperial';

/** Everything the feed is built from. */
export type ActivityInput = {
  records: Records;
  quests: Array<{ quest: Quest; progress: QuestProgress }>;
  /** the latest weigh-in; best lifts need it */
  bodyweightKg: number | undefined;
  sex: 'male' | 'female';
  units: Units;
  /** false: no best-lift items */
  shareLifts: boolean;
  /** local date YYYY-MM-DD */
  today: string;
};

/** One feed entry: its stable id and what friends see of it. */
export type ActivityItem = { id: string; data: PublicActivity };

/** A number that is safe to show: junk (undefined, NaN, infinite, negative) reads as 0. */
function amount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** The first three exercises of a workout, as the title when the player gave it no title. */
function exerciseNames(workout: Workout): string {
  return workout.exercises
    .slice(0, 3)
    .map((log) => log.name)
    .join(', ');
}

/** Distance in the player's units, to one decimal: 5240 m is "5.2 km", 12000 m is "12 km". */
function distanceText(meters: number, units: Units): string {
  const value =
    units === 'imperial' ? Math.round((meters / MILE) * 10) / 10 : Math.round(meters / 100) / 10;
  return `${value} ${units === 'imperial' ? 'mi' : 'km'}`;
}

/** Effort time: `m:ss` under an hour, else `h:mm:ss`, with the seconds rounded. */
function timeText(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Weight lifted in the player's units: kilos to one decimal, pounds whole. */
function weightText(kg: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(kg / LB)} lb` : `${Math.round(kg * 10) / 10} kg`;
}

/** A run as friends see it: its distance and time, whichever of them were logged. */
function runItem(workout: Workout, units: Units): ActivityItem {
  let meters = 0;
  let seconds = 0;
  for (const log of workout.exercises) {
    for (const set of log.sets) {
      meters += amount(set.distanceM);
      seconds += amount(set.durationS);
    }
  }

  const distance = meters > 0 ? distanceText(meters, units) : '';
  const time = seconds > 0 ? timeText(seconds) : '';
  return {
    id: `workout:${workout.id}`,
    data: {
      v: 1,
      kind: 'run',
      date: workout.date,
      title: workout.title ?? 'Run',
      detail:
        distance !== '' && time !== ''
          ? `${distance} in ${time}`
          : distance !== ''
            ? distance
            : time,
    },
  };
}

/** A strength/cardio/other workout: what it held, and how long it took. */
function workoutItem(workout: Workout): ActivityItem {
  let sets = 0;
  for (const log of workout.exercises) sets += log.sets.length;

  const parts = [
    `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`,
    `${sets} set${sets === 1 ? '' : 's'}`,
  ];
  const minutes = amount(workout.durationMin);
  if (minutes > 0) parts.push(`${Math.round(minutes)} min`);

  return {
    id: `workout:${workout.id}`,
    data: {
      v: 1,
      kind: 'workout',
      date: workout.date,
      title: workout.title ?? exerciseNames(workout),
      detail: parts.join(SEP),
    },
  };
}

/** A quest the player finished: its title and the XP it was worth. */
function questItem(quest: Quest, completedOn: string): ActivityItem {
  return {
    id: `quest:${quest.id}`,
    data: {
      v: 1,
      kind: 'quest',
      date: completedOn,
      title: quest.title,
      detail: `+${quest.xp} XP`,
    },
  };
}

/** A new best lift: the exercise's own name and id, so the feed spells them the way the app does. */
function prItem(rank: ExerciseRank, units: Units): ActivityItem {
  const { exercise, best } = rank;
  return {
    id: `pr:${exercise.id}:${best.date}`,
    data: {
      v: 1,
      kind: 'pr',
      date: best.date,
      title: `New best: ${exercise.name}`,
      detail: `${weightText(best.weightKg, units)} \u00d7 ${best.reps}`,
    },
  };
}

/** Feed order: newest day first, then best lifts, quests, workouts and runs, then by id. */
const KIND_ORDER: Record<PublicActivity['kind'], number> = {
  pr: 0,
  quest: 1,
  workout: 2,
  run: 2,
};

/** Newest first, and the newest 60 of them. */
function inFeedOrder(items: ActivityItem[]): ActivityItem[] {
  return items.sort((a, b) => {
    if (a.data.date !== b.data.date) return a.data.date < b.data.date ? 1 : -1;
    const kind = KIND_ORDER[a.data.kind] - KIND_ORDER[b.data.kind];
    if (kind !== 0) return kind;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** What friends see of the last 30 days, newest first, at most 60 items. */
export function activityItems(input: ActivityInput): ActivityItem[] {
  const { records, quests, bodyweightKg, sex, units, shareLifts, today } = input;
  const from = addDays(today, -(ACTIVITY_DAYS - 1));
  const inWindow = (date: string): boolean => date >= from && date <= today;

  const items: ActivityItem[] = [];

  // Workouts in the window; a future one is not logged yet, so it never shows.
  for (const workout of records.workouts) {
    if (!inWindow(workout.date)) continue;
    items.push(workout.kind === 'run' ? runItem(workout, units) : workoutItem(workout));
  }

  // Quests finished inside the window; one finished with no date is nobody's day.
  for (const { quest, progress } of quests) {
    const completedOn = progress.completedOn;
    if (!progress.complete || completedOn === undefined || !inWindow(completedOn)) continue;
    items.push(questItem(quest, completedOn));
  }

  // Best lifts: only shared ones, and only ranked against the latest weigh-in. Ranks look at everything
  // logged up to today, so a best set inside the window is the player's current best, not just a good day.
  if (shareLifts && typeof bodyweightKg === 'number') {
    const logged = records.workouts.filter((workout) => workout.date <= today);
    for (const rank of exerciseRanks(logged, bodyweightKg, sex)) {
      if (!inWindow(rank.best.date)) continue;
      items.push(prItem(rank, units));
    }
  }

  // Titles are cut to what the schema allows; the order and the cap come after.
  for (const item of items) {
    item.data.title = item.data.title.slice(0, 100);
  }
  return inFeedOrder(items).slice(0, ITEM_MAX);
}
