/**
 * Sync rules, as pure functions: what to send to the account and what to write on the phone.
 *
 * The server keeps one row per record (`supabase/migrations/001_records.sql`) and stamps `updated_at` itself,
 * so "newer" never depends on a phone's clock. Day to day:
 * - Push: every local write goes into an outbox; only the last change per record is sent.
 * - Pull: rows changed since the last pull are written locally, except records that still have unsent
 *   local changes; those reach the server later and so become the newest version there.
 * - Every pulled row is checked with its zod schema first; a bad row is skipped and reported, never written.
 * - Deletes travel as tombstones (`deleted: true`), so they reach the other phones.
 * The first sign-in on a phone that already has data, when the account has data too, can combine both:
 * for records on both sides the newer one by the record's own time wins (`planCombine`).
 */
import type { z } from 'zod';
import {
  Food,
  FoodEntry,
  Profile,
  Program,
  Quest,
  SavedMeal,
  WeighIn,
  Workout,
} from '../contract.ts';

export type RecordKind =
  | 'profile'
  | 'foods'
  | 'foodEntries'
  | 'savedMeals'
  | 'workouts'
  | 'weighIns'
  | 'programs'
  | 'quests';

const SCHEMAS: Record<RecordKind, z.ZodType> = {
  profile: Profile,
  foods: Food,
  foodEntries: FoodEntry,
  savedMeals: SavedMeal,
  workouts: Workout,
  weighIns: WeighIn,
  programs: Program,
  quests: Quest,
};

export const RECORD_KINDS = Object.keys(SCHEMAS) as RecordKind[];

/** A row as the server returns it. */
export type RemoteRow = {
  kind: RecordKind;
  id: string;
  data: unknown;
  deleted: boolean;
  updated_at: string;
};

/** A row to send; the server adds user_id and updated_at. */
export type PushRow = { kind: RecordKind; id: string; data: unknown; deleted: boolean };

/** One local write waiting to be sent; `seq` orders them. */
export type OutboxChange = PushRow & { seq: number };

export type PullPlan = {
  puts: { kind: RecordKind; id: string; value: unknown }[];
  deletes: { kind: RecordKind; id: string }[];
  skipped: { kind: RecordKind; id: string; reason: string }[];
  /** the newest updated_at seen, to pull from next time */
  cursor: string | undefined;
};

const key = (kind: RecordKind, id: string) => `${kind}/${id}`;

/** The id a record is stored under: its id, the date for weigh-ins, "profile" for the profile. */
export function recordId(kind: RecordKind, value: unknown): string {
  if (kind === 'profile') return 'profile';
  const v = value as { id?: unknown; date?: unknown };
  return String(kind === 'weighIns' ? v.date : v.id);
}

export function validateRecord(
  kind: RecordKind,
  id: string,
  data: unknown,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const parsed = SCHEMAS[kind].safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid' };
  }
  if (recordId(kind, parsed.data) !== id) return { ok: false, reason: 'id does not match' };
  return { ok: true, value: parsed.data };
}

/** The last change per record, ordered by when that last change happened. */
export function compactOutbox(changes: readonly OutboxChange[]): PushRow[] {
  const last = new Map<string, OutboxChange>();
  for (const c of [...changes].sort((a, b) => a.seq - b.seq)) {
    const k = key(c.kind, c.id);
    last.delete(k); // re-insert so the map keeps the order of last change
    last.set(k, c);
  }
  return [...last.values()].map(({ kind, id, data, deleted }) => ({ kind, id, data, deleted }));
}

/** Newest copy of each row (pulls overlap on purpose, so a row can come twice). */
function newestRows(rows: readonly RemoteRow[]): RemoteRow[] {
  const newest = new Map<string, RemoteRow>();
  for (const r of rows) {
    const k = key(r.kind, r.id);
    const seen = newest.get(k);
    if (!seen || Date.parse(r.updated_at) > Date.parse(seen.updated_at)) newest.set(k, r);
  }
  return [...newest.values()];
}

/** What to write locally from pulled rows. `pending` holds `kind/id` keys with unsent local changes. */
export function planPull(
  rows: readonly RemoteRow[],
  pending: ReadonlySet<string>,
  cursor?: string,
): PullPlan {
  const plan: PullPlan = { puts: [], deletes: [], skipped: [], cursor };
  for (const r of rows) {
    if (!plan.cursor || Date.parse(r.updated_at) > Date.parse(plan.cursor))
      plan.cursor = r.updated_at;
  }
  for (const r of newestRows(rows)) {
    if (pending.has(key(r.kind, r.id))) continue;
    applyRow(plan, r);
  }
  return plan;
}

function applyRow(plan: PullPlan, r: RemoteRow) {
  if (r.deleted) {
    plan.deletes.push({ kind: r.kind, id: r.id });
    return;
  }
  if (r.data === null || r.data === undefined) {
    plan.skipped.push({ kind: r.kind, id: r.id, reason: 'no data' });
    return;
  }
  const v = validateRecord(r.kind, r.id, r.data);
  if (v.ok) plan.puts.push({ kind: r.kind, id: r.id, value: v.value });
  else plan.skipped.push({ kind: r.kind, id: r.id, reason: v.reason });
}

/** First sign-in on this phone: upload, download, or ask when both the phone and the account have data. */
export function firstSync(localCount: number, remoteCount: number): 'upload' | 'download' | 'ask' {
  if (remoteCount === 0) return 'upload';
  if (localCount === 0) return 'download';
  return 'ask';
}

/** A record's own time (when it was last changed or logged), or NaN when it has none. */
function recordTime(data: unknown): number {
  const d = data as { updatedAt?: unknown; loggedAt?: unknown; createdAt?: unknown } | null;
  const t = d?.updatedAt ?? d?.loggedAt ?? d?.createdAt;
  return typeof t === 'string' ? Date.parse(t) : NaN;
}

/**
 * "Combine both": every record the phone or the account has ends up on both, and for a record on both
 * sides the newer one wins by the record's own time. With no time to compare (weigh-ins) or a tie, the
 * account's copy wins. A record deleted in the account stays deleted unless the phone changed it later.
 */
export function planCombine(
  local: readonly { kind: RecordKind; id: string; data: unknown }[],
  remote: readonly RemoteRow[],
): { push: PushRow[]; pull: PullPlan; skipped: PullPlan['skipped'] } {
  const push: PushRow[] = [];
  const skipped: PullPlan['skipped'] = [];
  const pull = planPull([], new Set());
  const rows = newestRows(remote);
  for (const r of rows) {
    if (!pull.cursor || Date.parse(r.updated_at) > Date.parse(pull.cursor))
      pull.cursor = r.updated_at;
  }
  const remoteByKey = new Map(rows.map((r) => [key(r.kind, r.id), r]));
  const localKeys = new Set<string>();

  for (const l of local) {
    const k = key(l.kind, l.id);
    localKeys.add(k);
    const v = validateRecord(l.kind, l.id, l.data);
    if (!v.ok) {
      skipped.push({ kind: l.kind, id: l.id, reason: v.reason });
      continue;
    }
    const r = remoteByKey.get(k);
    const mine = { kind: l.kind, id: l.id, data: v.value, deleted: false };
    if (!r) push.push(mine);
    else if (r.deleted) {
      if (recordTime(v.value) > Date.parse(r.updated_at)) push.push(mine);
      else applyRow(pull, r);
    } else if (recordTime(v.value) > recordTime(r.data)) push.push(mine);
    else applyRow(pull, r);
  }

  for (const r of rows) {
    if (!localKeys.has(key(r.kind, r.id)) && !r.deleted) applyRow(pull, r);
  }
  return { push, pull, skipped };
}
