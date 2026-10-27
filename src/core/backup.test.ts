import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../contract.ts';
import * as fx from '../test/fixtures.ts';
import { backupFileName, makeBackup, readBackup } from './backup.ts';

const now = '2026-10-30T18:00:00.000Z';

describe('makeBackup', () => {
  it('wraps the tables with the app name, current version and time', () => {
    const b = makeBackup(fx.backup.tables, now);
    expect(b).toEqual({
      app: 'fitness-quest',
      version: SCHEMA_VERSION,
      exportedAt: now,
      tables: fx.backup.tables,
    });
  });

  it('copies the tables rather than sharing them', () => {
    const b = makeBackup(fx.backup.tables, now);
    b.tables.foods.pop();
    expect(fx.backup.tables.foods).toHaveLength(2);
  });
});

describe('backupFileName', () => {
  it('names the file after the date', () => {
    expect(backupFileName('2026-10-30')).toBe('fitness-quest-backup-2026-10-30.json');
  });
});

describe('readBackup', () => {
  it('round-trips a backup through JSON', () => {
    const text = JSON.stringify(makeBackup(fx.backup.tables, now));
    const r = readBackup(text);
    expect(r).toEqual({
      ok: true,
      backup: makeBackup(fx.backup.tables, now),
      counts: {
        foods: 2,
        foodEntries: 2,
        savedMeals: 1,
        workouts: 2,
        weighIns: 1,
        programs: 1,
        quests: 2,
      },
    });
  });

  it('rejects text that is not JSON', () => {
    expect(readBackup('hello')).toEqual({ ok: false, error: 'not-json' });
    expect(readBackup('')).toEqual({ ok: false, error: 'not-json' });
  });

  it("rejects JSON that isn't one of our backups", () => {
    for (const text of ['[]', 'null', '42', '{"app":"other","version":1}', '{"version":1}']) {
      expect(readBackup(text)).toEqual({ ok: false, error: 'not-a-backup' });
    }
  });

  it('rejects a backup from a newer version of the app', () => {
    const text = JSON.stringify({ ...fx.backup, version: SCHEMA_VERSION + 1 });
    expect(readBackup(text)).toEqual({ ok: false, error: 'newer-version' });
  });

  it('rejects a missing or broken version number', () => {
    for (const version of [undefined, 0, 1.5, '1', -1]) {
      const text = JSON.stringify({ ...fx.backup, version });
      expect(readBackup(text)).toMatchObject({ ok: false, error: 'invalid' });
    }
  });

  it('says where a bad record is', () => {
    const bad = structuredClone(fx.backup);
    (bad.tables.workouts[1] as { date: string }).date = 'yesterday';
    const r = readBackup(JSON.stringify(bad));
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
    if (r.ok) throw new Error('should fail');
    expect(r.detail).toMatch(/^tables\.workouts\.1\.date: /);
  });

  it('rejects a backup with a table missing', () => {
    const bad = structuredClone(fx.backup) as { tables: Partial<typeof fx.backup.tables> };
    delete bad.tables.quests;
    const r = readBackup(JSON.stringify(bad));
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
    if (r.ok) throw new Error('should fail');
    expect(r.detail).toMatch(/^tables\.quests: /);
  });

  describe('migrations', () => {
    // A pretend future: version 3 renamed weighIns[].kg to weighIns[].weightKg in version 2, then back.
    const migrations = {
      1: (t: Record<string, unknown>) => ({
        ...t,
        weighIns: (t.weighIns as { date: string; kg: number }[]).map((w) => ({
          date: w.date,
          weightKg: w.kg,
        })),
      }),
      2: (t: Record<string, unknown>) => ({
        ...t,
        weighIns: (t.weighIns as { date: string; weightKg: number }[]).map((w) => ({
          date: w.date,
          kg: w.weightKg,
        })),
      }),
    };

    it('runs every migration from the file version up to the current one, in order', () => {
      const r = readBackup(JSON.stringify(fx.backup), { currentVersion: 3, migrations });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('should pass');
      expect(r.backup.version).toBe(3);
      expect(r.backup.tables.weighIns).toEqual(fx.backup.tables.weighIns);
    });

    it('starts from the file version, skipping older migrations', () => {
      const v2 = {
        ...fx.backup,
        version: 2,
        tables: { ...fx.backup.tables, weighIns: [{ date: '2026-10-26', weightKg: 81 }] },
      };
      const r = readBackup(JSON.stringify(v2), { currentVersion: 3, migrations });
      if (!r.ok) throw new Error('should pass');
      expect(r.backup.tables.weighIns).toEqual([{ date: '2026-10-26', kg: 81 }]);
    });

    it('fails when a step has no migration', () => {
      const r = readBackup(JSON.stringify(fx.backup), {
        currentVersion: 3,
        migrations: { 2: migrations[2] },
      });
      expect(r).toEqual({ ok: false, error: 'invalid', detail: 'no migration from version 1' });
    });

    it('fails cleanly when a migration throws', () => {
      const r = readBackup(JSON.stringify(fx.backup), {
        currentVersion: 2,
        migrations: {
          1: () => {
            throw new Error('boom');
          },
        },
      });
      expect(r).toEqual({ ok: false, error: 'invalid', detail: 'migration from version 1 failed' });
    });
  });
});
