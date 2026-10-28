import { useEffect, useMemo, useRef } from 'react';
import type { Profile, PublicProfile } from '../../contract.ts';
import { exerciseRanks } from '../../core/ranks.ts';
import { publicSummary } from '../../core/social/summary.ts';
import { fingerprint } from '../../core/sync.ts';
import { activityItems } from '../../core/social/activity.ts';
import { challengeValue } from '../../core/social/challenge.ts';
import { addDays } from '../../core/dates.ts';
import {
  fetchChallenges,
  publishActivity,
  publishProfile,
  publishProgress,
} from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';
import { useAccount } from '../accountContext.ts';
import { useDb } from '../dbContext.ts';
import { nowStamp } from '../format.ts';
import { GOAL_NAMES } from '../programFormat.ts';
import type { Game } from '../useGame.ts';

const PUBLISHED_KEY = 'publishedProfile';
const AFTER_CHANGE_MS = 3_000;

export type MySummary = {
  me: PublicProfile | undefined;
  /** exercises with a rank, best first, for the showcase picker */
  liftChoices: { id: string; name: string }[];
};

/** Your own summary as friends see it, worked out from this phone's records. */
export function useMySummary(profile: Profile, game: Game | undefined): MySummary {
  return useMemo(() => {
    if (!game) return { me: undefined, liftChoices: [] };
    const bodyweightKg = game.records.weighIns.at(-1)?.kg;
    const me = publicSummary({
      profile,
      records: game.records,
      quests: game.views,
      bodyweightKg,
      programName: game.program
        ? `${GOAL_NAMES[game.program.goal]} (${game.program.weeks}-week program)`
        : undefined,
      today: game.today,
      now: nowStamp(),
    });
    const liftChoices = bodyweightKg
      ? exerciseRanks(game.records.workouts, bodyweightKg, profile.sex)
          .sort((a, b) => b.score - a.score)
          .map((r) => ({ id: r.exercise.id, name: r.exercise.name }))
      : [];
    return { me, liftChoices };
  }, [profile, game]);
}

/**
 * Upload the summary for friends a few seconds after it changes, while signed in with a username. The last
 * upload's fingerprint is kept per account, so nothing is sent when nothing changed.
 */
export function usePublish(me: PublicProfile | undefined) {
  const db = useDb();
  const account = useAccount();
  const userId = account.status === 'signed-in' && account.username ? account.userId : undefined;
  const sending = useRef(false);

  useEffect(() => {
    if (!me || !userId) return;
    // the time it was worked out isn't a change
    const hash = fingerprint({ ...me, updatedAt: '' });
    const timer = setTimeout(() => {
      if (sending.current || !navigator.onLine) return;
      sending.current = true;
      void (async () => {
        try {
          const last = (await db.kv.get(PUBLISHED_KEY))?.value as
            { userId: string; hash: string } | undefined;
          if (last?.userId === userId && last.hash === hash) return;
          await publishProfile(await getClient(), userId, me);
          await db.kv.put({ key: PUBLISHED_KEY, value: { userId, hash } });
        } catch {
          // tried again on the next change, or when the app opens
        } finally {
          sending.current = false;
        }
      })();
    }, AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [db, me, userId]);
}

/** Publish this phone's progress on running shared quests a few seconds after the records change. */
export function usePublishProgress(game: Game | undefined) {
  const account = useAccount();
  const userId = account.status === 'signed-in' && account.username ? account.userId : undefined;
  const records = game?.records;
  const today = game?.today;

  useEffect(() => {
    if (!records || !today || !userId) return;
    const timer = setTimeout(() => {
      if (!navigator.onLine) return;
      void (async () => {
        try {
          const c = await getClient();
          const running = (await fetchChallenges(c, addDays(today, -1))).filter(
            (ch) => ch.status === 'accepted' && ch.starts <= today,
          );
          const rows = running
            .map((ch) => ({
              challengeId: ch.id,
              value: challengeValue(ch.goal, records, ch.starts, ch.ends, today),
              was: ch.progress[userId],
            }))
            .filter((r) => r.value !== r.was)
            .map(({ challengeId, value }) => ({ challengeId, value }));
          await publishProgress(c, userId, rows);
        } catch {
          // tried again on the next change
        }
      })();
    }, AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [records, today, userId]);
}

const ACTIVITY_KEY = 'publishedActivity';

/**
 * Publish the last 30 days of activity for friends a few seconds after it changes; with sharing turned
 * off, remove what was published. The last upload's fingerprint is kept per account.
 */
export function usePublishActivity(profile: Profile, game: Game | undefined) {
  const db = useDb();
  const account = useAccount();
  const userId = account.status === 'signed-in' && account.username ? account.userId : undefined;
  const sending = useRef(false);

  const items = useMemo(() => {
    if (!game) return undefined;
    if (profile.social?.shareActivity === false) return [];
    return activityItems({
      records: game.records,
      quests: game.views,
      bodyweightKg: game.records.weighIns.at(-1)?.kg,
      sex: profile.sex,
      units: profile.units,
      shareLifts: profile.social?.shareLifts !== false,
      today: game.today,
    });
  }, [game, profile]);

  useEffect(() => {
    if (!items || !userId) return;
    const hash = fingerprint(items);
    const timer = setTimeout(() => {
      if (sending.current || !navigator.onLine) return;
      sending.current = true;
      void (async () => {
        try {
          const last = (await db.kv.get(ACTIVITY_KEY))?.value as
            { userId: string; hash: string } | undefined;
          if (last?.userId === userId && last.hash === hash) return;
          await publishActivity(await getClient(), userId, items);
          await db.kv.put({ key: ACTIVITY_KEY, value: { userId, hash } });
        } catch {
          // tried again on the next change
        } finally {
          sending.current = false;
        }
      })();
    }, AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [db, items, userId]);
}
