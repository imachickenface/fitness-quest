import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import type { GameState, Profile, Quest, QuestProgress } from '../contract.ts';
import { localDate } from '../core/diary.ts';
import { bodyShape } from '../core/body.ts';
import { gameState } from '../core/game.ts';
import { dailyQuests, weekStart, weeklyQuest } from '../core/quests/daily.ts';
import { addDays } from '../core/dates.ts';
import { bossQuests } from '../core/quests/fromHistory.ts';
import { exerciseRanks } from '../core/ranks.ts';
import { questProgress } from '../core/quests/evaluate.ts';
import type { Records } from '../core/records.ts';
import { calorieTarget } from '../core/targets.ts';
import {
  addQuestsIfMissing,
  listAllFoodEntries,
  listQuests,
  listWeighIns,
  listWorkouts,
} from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { nowStamp } from './format.ts';

export type QuestView = { quest: Quest; progress: QuestProgress };

export type Game = {
  today: string;
  state: GameState;
  /** quests whose window includes today, dailies first */
  active: QuestView[];
  /** the hero's shape: muscle 0..4, build -2..2 */
  body: { muscle: number; build: number };
};

/** Everything game-related, derived from the stored records; undefined while they load. */
export function useGame(profile: Profile): Game | undefined {
  const db = useDb();
  const today = localDate(new Date());
  const foodEntries = useLiveQuery(() => listAllFoodEntries(db), [db]);
  const workouts = useLiveQuery(() => listWorkouts(db), [db]);
  const weighIns = useLiveQuery(() => listWeighIns(db), [db]);
  const quests = useLiveQuery(() => listQuests(db), [db]);

  const records: Records | undefined = useMemo(
    () => (foodEntries && workouts && weighIns ? { foodEntries, workouts, weighIns } : undefined),
    [foodEntries, workouts, weighIns],
  );

  // Today's and this week's quests are generated once, from the history as it was, then stored.
  const haveToday = quests?.some((q) => q.id.startsWith(`daily-${today}-`)) ?? false;
  useEffect(() => {
    if (!records || !quests || haveToday) return;
    const weightKg = records.weighIns.at(-1)?.kg;
    const target = weightKg ? calorieTarget(profile, weightKg, today) : undefined;
    const input = {
      date: today,
      records,
      goal: profile.goal,
      now: nowStamp(),
      ...(target ? { target: { kcal: target.kcal } } : {}),
    };
    // boss quests: progressive-overload targets for this week, tailored to the goal (stored once per week)
    const monday = weekStart(today);
    const bosses = weightKg
      ? bossQuests({
          ranks: exerciseRanks(records.workouts, weightKg, profile.sex),
          style: profile.style ?? 'bodybuilding',
          units: profile.units,
          goal: profile.goal,
          weekIndex: weeksSince(records, monday),
          stalled: stalledLifts(quests, records, monday),
          runs: records.workouts
            .filter((w) => w.kind === 'run' && w.date >= addDays(today, -28))
            .flatMap((w) => w.exercises.flatMap((e) => e.sets))
            .filter((x) => (x.distanceM ?? 0) > 0)
            .map((x) => ({
              distanceM: x.distanceM!,
              ...(x.durationS ? { durationS: x.durationS } : {}),
            })),
          ...(target ? { targetKcal: target.kcal } : {}),
          monday,
          now: input.now,
        })
      : [];
    void addQuestsIfMissing(db, [...dailyQuests(input), weeklyQuest(input), ...bosses]);
  }, [db, records, quests, haveToday, profile, today]);

  return useMemo(() => {
    if (!records || !quests) return undefined;
    const views = quests.map((quest) => ({ quest, progress: questProgress(quest, records) }));
    const order = { daily: 0, weekly: 1, boss: 2, story: 3 } as const;
    const active = views
      .filter((v) => v.quest.window.start <= today && today <= v.quest.window.end)
      .sort(
        (a, b) => order[a.quest.kind] - order[b.quest.kind] || a.quest.id.localeCompare(b.quest.id),
      );
    const state = gameState(records, views, today);
    const weightKg = records.weighIns.at(-1)?.kg;
    const body = bodyShape({
      records,
      questsCompletedOn: views.flatMap((v) =>
        v.progress.completedOn ? [v.progress.completedOn] : [],
      ),
      streakDays: state.streakDays,
      targetKcal: weightKg ? calorieTarget(profile, weightKg, today).kcal : undefined,
      today,
    });
    return { today, state, active, body };
  }, [records, quests, today, profile]);
}

/** Whole weeks between the week of the first workout and this week (0 in the first week). */
function weeksSince(records: Records, monday: string): number {
  const first = records.workouts.reduce<string | undefined>(
    (m, w) => (!m || w.date < m ? w.date : m),
    undefined,
  );
  if (!first) return 0;
  const days = (Date.parse(monday) - Date.parse(weekStart(first))) / 86_400_000;
  return Math.max(0, Math.round(days / 7));
}

/** Lifts whose (non-deload) boss was missed in each of the last two weeks. */
function stalledLifts(quests: Quest[], records: Records, monday: string): string[] {
  const missed = (week: string) =>
    new Set(
      quests
        .filter((q) => q.id.startsWith(`boss-${week}-`) && !q.title.startsWith('Deload'))
        .filter((q) => !questProgress(q, records).complete)
        .map((q) => q.id.slice(`boss-${week}-`.length)),
    );
  const last = missed(addDays(monday, -7));
  const before = missed(addDays(monday, -14));
  return [...last].filter((id) => before.has(id) && id !== 'run' && id !== 'kcal');
}
