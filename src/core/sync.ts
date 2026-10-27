/**
 * Sync rules, as pure functions: what to send to the account and what to write on the phone.
 *
 * The server keeps one row per record (`supabase/migrations/001_records.sql`) and stamps `updated_at` itself,
 * so "newer" never depends on a phone's clock. Day to day:
 * - Push: each record's fingerprint is compared with the one it had at the last sync; changed and new
 *   records are sent, and records that disappeared are sent as deletes. No write log is needed, so a change
 *   can't be lost if the app is closed mid-write.
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

/** A record as it is on the phone. */
export type LocalRecord = { kind: RecordKind; id: string; data: unknown };

export type PullPlan = {
  puts: { kind: RecordKind; id: string; value: unknown }[];
  deletes: { kind: RecordKind; id: string }[];
  skipped: { kind: RecordKind; id: string; reason: string }[];
  /** the newest updated_at seen, to pull from next time */
  cursor: string | undefined;
};

/** The key a record is synced under: `kind/id`. */
export const recordKey = (kind: RecordKind, id: string) => `${kind}/${id}`;
const key = recordKey;

/** JSON with object keys sorted, so the same record always gives the same text (Postgres reorders jsonb keys). */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A short fingerprint of a record's content: 64-bit FNV-1a of its stable JSON, as hex. */
export function fingerprint(value: unknown): string {
  const text = stableJson(value);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

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

/**
 * What changed on the phone since the last sync. `synced` maps each record key to its fingerprint at the
 * last sync. Changed and new records are sent; synced records that are gone are sent as deletes. `pending`
 * holds every key with an unsent change, so a pull leaves those records alone.
 */
export function diffLocal(
  local: readonly LocalRecord[],
  synced: ReadonlyMap<string, string>,
): { push: PushRow[]; pending: Set<string>; skipped: PullPlan['skipped'] } {
  const push: PushRow[] = [];
  const pending = new Set<string>();
  const skipped: PullPlan['skipped'] = [];
  const seen = new Set<string>();
  for (const l of local) {
    const k = key(l.kind, l.id);
    seen.add(k);
    if (synced.get(k) === fingerprint(l.data)) continue;
    const v = validateRecord(l.kind, l.id, l.data);
    if (!v.ok) {
      skipped.push({ kind: l.kind, id: l.id, reason: v.reason });
      continue;
    }
    push.push({ kind: l.kind, id: l.id, data: v.value, deleted: false });
    pending.add(k);
  }
  for (const k of synced.keys()) {
    if (seen.has(k)) continue;
    const slash = k.indexOf('/');
    const kind = k.slice(0, slash) as RecordKind;
    const id = k.slice(slash + 1);
    push.push({ kind, id, data: null, deleted: true });
    pending.add(k);
  }
  return { push, pending, skipped };
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
