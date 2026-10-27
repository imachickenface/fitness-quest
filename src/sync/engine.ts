/**
 * The sync engine: reads and writes IndexedDB and talks to the account's server through a small
 * `RemoteStore`, so tests can run it against an in-memory server. The rules themselves live in
 * `core/sync.ts`; this file only moves records around.
 *
 * Per account, `kv.syncState` remembers which account this phone last synced with and the pull cursor;
 * the `synced` table holds each record's fingerprint at that sync.
 */
import {
  diffLocal,
  fingerprint,
  firstSync,
  planCombine,
  planPull,
  recordId,
  recordKey,
  type LocalRecord,
  type PullPlan,
  type PushRow,
  type RemoteRow,
} from '../core/sync.ts';
import type { FitnessDb } from '../db/db.ts';

/** The server side, as the engine needs it. */
export interface RemoteStore {
  /** rows changed after `since` (every row when undefined), oldest first */
  pull(since: string | undefined): Promise<RemoteRow[]>;
  /** insert or update rows for the signed-in account */
  push(rows: PushRow[]): Promise<void>;
  /** how many live (not deleted) rows the account has */
  count(): Promise<number>;
}

export type SyncState = { userId: string; cursor?: string; lastSyncedAt?: string };

export type SyncResult = { pushed: number; pulled: number; skipped: PullPlan['skipped'] };

/** How a first sync combines a phone and an account that both have data. */
export type FirstSyncChoice = 'combine' | 'account' | 'phone';

const STATE_KEY = 'syncState';
/** who last signed out on this phone while keeping their data */
const PREVIOUS_KEY = 'syncPreviousUser';
/** pulls start this far before the cursor, so rows committed out of order are never missed */
const OVERLAP_MS = 5 * 60_000;

const TABLES = [
  'foods',
  'foodEntries',
  'savedMeals',
  'workouts',
  'weighIns',
  'programs',
  'quests',
] as const;
type TableKind = (typeof TABLES)[number];

export async function getSyncState(db: FitnessDb): Promise<SyncState | undefined> {
  return (await db.kv.get(STATE_KEY))?.value as SyncState | undefined;
}

async function setSyncState(db: FitnessDb, state: SyncState): Promise<void> {
  await db.kv.put({ key: STATE_KEY, value: state });
}

/** Forget the account on this phone (after signing out). Records stay unless `clearData`. */
export async function forgetSync(db: FitnessDb, clearData: boolean): Promise<void> {
  await db.transaction('rw', [db.kv, db.synced, ...TABLES.map((t) => db[t])], async () => {
    const previous = ((await db.kv.get(STATE_KEY))?.value as SyncState | undefined)?.userId;
    if (previous && !clearData) await db.kv.put({ key: PREVIOUS_KEY, value: previous });
    else await db.kv.delete(PREVIOUS_KEY);
    await db.kv.delete(STATE_KEY);
    await db.synced.clear();
    if (clearData) {
      await db.kv.delete('profile');
      for (const t of TABLES) await db[t].clear();
    }
  });
}

/** Every synced record on this phone. */
export async function readLocal(db: FitnessDb): Promise<LocalRecord[]> {
  const out: LocalRecord[] = [];
  const profile = (await db.kv.get('profile'))?.value;
  if (profile) out.push({ kind: 'profile', id: 'profile', data: profile });
  for (const kind of TABLES) {
    for (const data of await db[kind].toArray()) out.push({ kind, id: recordId(kind, data), data });
  }
  return out;
}

/** Write a pull plan locally and record the fingerprints of what was written. */
async function applyPlan(db: FitnessDb, plan: PullPlan): Promise<void> {
  if (plan.puts.length === 0 && plan.deletes.length === 0) return;
  await db.transaction('rw', [db.kv, db.synced, ...TABLES.map((t) => db[t])], async () => {
    for (const p of plan.puts) {
      if (p.kind === 'profile') await db.kv.put({ key: 'profile', value: p.value });
      else await db[p.kind as TableKind].put(p.value as never);
      await db.synced.put({ key: recordKey(p.kind, p.id), hash: fingerprint(p.value) });
    }
    for (const d of plan.deletes) {
      if (d.kind === 'profile') await db.kv.delete('profile');
      else await db[d.kind as TableKind].delete(d.id);
      await db.synced.delete(recordKey(d.kind, d.id));
    }
  });
}

/** Send rows, then remember them as synced. */
async function pushRows(db: FitnessDb, remote: RemoteStore, rows: PushRow[]): Promise<void> {
  if (rows.length === 0) return;
  await remote.push(rows);
  await db.transaction('rw', db.synced, async () => {
    for (const r of rows) {
      const k = recordKey(r.kind, r.id);
      if (r.deleted) await db.synced.delete(k);
      else await db.synced.put({ key: k, hash: fingerprint(r.data) });
    }
  });
}

const since = (cursor: string | undefined) =>
  cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : undefined;

/** True when this phone hasn't synced with this account yet (or synced with another one). */
export async function needsFirstSync(db: FitnessDb, userId: string): Promise<boolean> {
  return (await getSyncState(db))?.userId !== userId;
}

/** One round of sync for an account this phone already synced with: pull, then push. */
export async function syncOnce(
  db: FitnessDb,
  remote: RemoteStore,
  userId: string,
  now: string,
): Promise<SyncResult> {
  const state = await getSyncState(db);
  if (state?.userId !== userId) throw new Error('first sync needed');
  const synced = new Map((await db.synced.toArray()).map((r) => [r.key, r.hash]));
  const diff = diffLocal(await readLocal(db), synced);
  const rows = await remote.pull(since(state.cursor));
  const plan = planPull(rows, diff.pending, state.cursor);
  await applyPlan(db, plan);
  await pushRows(db, remote, diff.push);
  await setSyncState(db, {
    userId,
    ...(plan.cursor ? { cursor: plan.cursor } : {}),
    lastSyncedAt: now,
  });
  return {
    pushed: diff.push.length,
    pulled: plan.puts.length + plan.deletes.length,
    skipped: [...diff.skipped, ...plan.skipped],
  };
}

/**
 * The first sync of this phone with an account. Returns 'ask' when both have data and no choice was given.
 * - combine: both sides end up with everything; for a record on both, the newer one wins
 * - account: this phone's records are replaced by the account's
 * - phone: the account's records are replaced by this phone's
 */
export async function firstSyncWith(
  db: FitnessDb,
  remote: RemoteStore,
  userId: string,
  now: string,
  choice?: FirstSyncChoice,
): Promise<SyncResult | 'ask'> {
  const local = await readLocal(db);
  let mode = firstSync(local.length, await remote.count());
  // records another account left on this phone are never uploaded into this one without asking
  const previous = (await db.kv.get(PREVIOUS_KEY))?.value;
  if (mode === 'upload' && local.length > 0 && previous && previous !== userId) mode = 'ask';
  if (mode === 'ask' && !choice) return 'ask';
  await db.kv.delete(PREVIOUS_KEY);
  await db.synced.clear();

  if (mode === 'upload' || mode === 'download' || choice === 'account') {
    if (choice === 'account') await forgetSync(db, true);
    await setSyncState(db, { userId });
    return syncOnce(db, remote, userId, now);
  }

  const rows = await remote.pull(undefined);
  if (choice === 'phone') {
    const mine = new Set(local.map((l) => recordKey(l.kind, l.id)));
    const gone: PushRow[] = rows
      .filter((r) => !r.deleted && !mine.has(recordKey(r.kind, r.id)))
      .map((r) => ({ kind: r.kind, id: r.id, data: null, deleted: true }));
    await remote.push(gone);
    const cursor = planPull(rows, new Set()).cursor;
    await setSyncState(db, { userId, ...(cursor ? { cursor } : {}) });
    return syncOnce(db, remote, userId, now);
  }

  // combine
  const plan = planCombine(local, rows);
  await applyPlan(db, plan.pull);
  await pushRows(db, remote, plan.push);
  // records the phone and the account agree on are synced too
  const pushed = new Set(plan.push.map((p) => recordKey(p.kind, p.id)));
  const after = await readLocal(db);
  await db.transaction('rw', db.synced, async () => {
    for (const l of after) {
      const k = recordKey(l.kind, l.id);
      if (!pushed.has(k) && !(await db.synced.get(k))) {
        await db.synced.put({ key: k, hash: fingerprint(l.data) });
      }
    }
  });
  await setSyncState(db, {
    userId,
    ...(plan.pull.cursor ? { cursor: plan.pull.cursor } : {}),
    lastSyncedAt: now,
  });
  return {
    pushed: plan.push.length,
    pulled: plan.pull.puts.length + plan.pull.deletes.length,
    skipped: [...plan.skipped, ...plan.pull.skipped],
  };
}
