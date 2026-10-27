/**
 * Backup file format: one JSON document holding every table, plus the app name, the schema version it
 * was written by and the moment it was exported.
 *
 * Reading a file is deliberately paranoid: it is user-supplied data from an unknown app version, so it is
 * parsed, migrated up to the current schema version, then validated with the contract's zod schema before
 * anything is handed to the app. A bad file never throws; it comes back as a `{ ok: false }` result saying
 * what is wrong, so the UI can show a plain sentence.
 */
import { Backup, BackupTables, SCHEMA_VERSION } from '../contract.ts';

export type TableCounts = {
  foods: number;
  foodEntries: number;
  savedMeals: number;
  workouts: number;
  weighIns: number;
  programs: number;
  quests: number;
};

/** Turns one schema version's tables into the next version's. Migrations never run in reverse. */
export type Migration = (tables: Record<string, unknown>) => Record<string, unknown>;

export type ReadResult =
  | { ok: true; backup: Backup; counts: TableCounts }
  | {
      ok: false;
      error: 'not-json' | 'not-a-backup' | 'newer-version' | 'invalid';
      detail?: string;
    };

/** migrations[v] turns version v tables into version v+1 tables; empty while SCHEMA_VERSION is 1. */
export const MIGRATIONS: Record<number, Migration> = {};

export function makeBackup(tables: BackupTables, now: string): Backup {
  return {
    app: 'fitness-quest',
    version: SCHEMA_VERSION,
    exportedAt: now,
    tables: structuredClone(tables),
  };
}

export function backupFileName(date: string): string {
  return `fitness-quest-backup-${date}.json`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function readBackup(
  text: string,
  opts?: { currentVersion?: number; migrations?: Record<number, Migration> },
): ReadResult {
  const current = opts?.currentVersion ?? SCHEMA_VERSION;
  const migrations = opts?.migrations ?? MIGRATIONS;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }

  if (!isObject(raw) || raw.app !== 'fitness-quest') {
    return { ok: false, error: 'not-a-backup' };
  }

  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'invalid', detail: 'bad version' };
  }

  if (version > current) return { ok: false, error: 'newer-version' };

  // Carry the tables up to the current version, one step at a time.
  let tables = raw.tables;
  for (let v = version; v < current; v += 1) {
    const migrate = migrations[v];
    if (migrate === undefined) {
      return { ok: false, error: 'invalid', detail: `no migration from version ${v}` };
    }
    if (isObject(tables)) {
      try {
        tables = migrate(tables);
      } catch {
        return { ok: false, error: 'invalid', detail: `migration from version ${v} failed` };
      }
    }
  }

  const parsed = Backup.safeParse({ ...raw, version: current, tables });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue ? issue.path.join('.') : '';
    const message = issue ? issue.message : 'unknown problem';
    return { ok: false, error: 'invalid', detail: `${path}: ${message}` };
  }

  const t = parsed.data.tables;
  return {
    ok: true,
    backup: parsed.data,
    counts: {
      foods: t.foods.length,
      foodEntries: t.foodEntries.length,
      savedMeals: t.savedMeals.length,
      workouts: t.workouts.length,
      weighIns: t.weighIns.length,
      programs: t.programs.length,
      quests: t.quests.length,
    },
  };
}
