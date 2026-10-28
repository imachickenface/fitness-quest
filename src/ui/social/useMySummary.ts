import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Profile, PublicProfile } from '../../contract.ts';
import { exerciseRanks } from '../../core/ranks.ts';
import { publicSummary } from '../../core/social/summary.ts';
import { fingerprint } from '../../core/sync.ts';
import { activityItems, type ActivityItem } from '../../core/social/activity.ts';
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

type Client = Awaited<ReturnType<typeof getClient>>;

/**
 * Upload `value` a few seconds after it changes, while signed in with a username, and only when it differs
 * from the last upload (its fingerprint is kept per account under `key`). A change that arrives while an
 * upload is running is sent right after it, so the newest version always gets there.
 */
function useUpload<T>(
  key: string,
  value: T | undefined,
  hashOf: (v: T) => string,
  send: (c: Client, userId: string, v: T) => Promise<void>,
) {
  const db = useDb();
  const account = useAccount();
  const userId = account.status === 'signed-in' && account.username ? account.userId : undefined;
  const latest = useRef<{ value: T; userId: string } | undefined>(undefined);
  const sending = useRef(false);

  const flush = useCallback(async () => {
    if (sending.current) return; // the running upload picks up the newest value when it's done
    sending.current = true;
    try {
      for (;;) {
        const job = latest.current;
        if (!job || !navigator.onLine) return;
        const hash = hashOf(job.value);
        const last = (await db.kv.get(key))?.value as { userId: string; hash: string } | undefined;
        if (last?.userId !== job.userId || last.hash !== hash) {
          await send(await getClient(), job.userId, job.value);
          await db.kv.put({ key, value: { userId: job.userId, hash } });
        }
        if (latest.current === job) return;
      }
    } catch {
      // tried again on the next change, or when the app opens
    } finally {
      sending.current = false;
    }
  }, [db, key, hashOf, send]);

  useEffect(() => {
    if (value === undefined || !userId) return;
    latest.current = { value, userId };
    const timer = setTimeout(() => void flush(), AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [value, userId, flush]);
}

// the time a summary was worked out isn't a change
const profileHash = (me: PublicProfile) => fingerprint({ ...me, updatedAt: '' });
const activityHash = (items: ActivityItem[]) => fingerprint(items);

/** Upload the summary for friends a few seconds after it changes. */
export function usePublish(me: PublicProfile | undefined) {
  useUpload(PUBLISHED_KEY, me, profileHash, publishProfile);
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

  useUpload(ACTIVITY_KEY, items, activityHash, publishActivity);
}
