import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PushRow, RemoteRow } from '../core/sync.ts';
import {
  deleteWorkout,
  getProfile,
  listWeighIns,
  listWorkouts,
  openDb,
  saveProfile,
  upsertWeighIn,
  upsertWorkout,
  type FitnessDb,
} from '../db/db.ts';
import * as fx from '../test/fixtures.ts';
import { firstSyncWith, forgetSync, needsFirstSync, syncOnce, type RemoteStore } from './engine.ts';

/** One account's rows on a pretend server that stamps its own time on every write. */
class FakeServer implements RemoteStore {
  rows = new Map<string, RemoteRow>();
  private tick = 0;
  pushes = 0;
  private now() {
    this.tick += 1000;
    return new Date(Date.UTC(2026, 9, 27, 10) + this.tick).toISOString();
  }
  async pull(since: string | undefined) {
    return [...this.rows.values()]
      .filter((r) => !since || r.updated_at > since)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .map((r) => structuredClone(r));
  }
  async push(rows: PushRow[]) {
    this.pushes += rows.length;
    for (const r of rows) {
      this.rows.set(`${r.kind}/${r.id}`, { ...structuredClone(r), updated_at: this.now() });
    }
  }
  async count() {
    return [...this.rows.values()].filter((r) => !r.deleted).length;
  }
}

const USER = 'user-1';
const NOW = '2026-10-27T12:00:00.000Z';
let n = 0;
let a: FitnessDb;
let b: FitnessDb;
let server: FakeServer;

beforeEach(async () => {
  a = openDb(`sync-a-${++n}`);
  b = openDb(`sync-b-${n}`);
  await a.open();
  await b.open();
  server = new FakeServer();
});

afterEach(async () => {
  for (const db of [a, b]) {
    db.close();
    await db.delete();
  }
});

const sync = (db: FitnessDb) => syncOnce(db, server, USER, NOW);

describe('first sync', () => {
  it('uploads a phone into an empty account, then a new phone downloads it all', async () => {
    await saveProfile(a, fx.profile);
    await upsertWorkout(a, fx.strengthWorkout);
    await upsertWeighIn(a, fx.weighIn);
    expect(await needsFirstSync(a, USER)).toBe(true);
    expect(await firstSyncWith(a, server, USER, NOW)).toMatchObject({ pushed: 3 });
    expect(await needsFirstSync(a, USER)).toBe(false);

    expect(await firstSyncWith(b, server, USER, NOW)).toMatchObject({ pulled: 3 });
    expect(await getProfile(b)).toEqual(fx.profile);
    expect(await listWorkouts(b)).toEqual([fx.strengthWorkout]);
    expect(await listWeighIns(b)).toEqual([fx.weighIn]);
  });

  it('asks when both the phone and the account have data', async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await upsertWorkout(b, fx.runWorkout);
    expect(await firstSyncWith(b, server, USER, NOW)).toBe('ask');
    expect(await needsFirstSync(b, USER)).toBe(true);
  });

  it('"combine" leaves every record on both', async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await upsertWorkout(b, fx.runWorkout);
    await firstSyncWith(b, server, USER, NOW, 'combine');
    await sync(a);
    for (const db of [a, b]) {
      expect((await listWorkouts(db)).map((w) => w.id).sort()).toEqual(
        [fx.runWorkout.id, fx.strengthWorkout.id].sort(),
      );
    }
    // nothing changed since, so nothing is sent again
    const before = server.pushes;
    await sync(a);
    await sync(b);
    expect(server.pushes).toBe(before);
  });

  it('"account" replaces the phone\'s records with the account\'s', async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await upsertWorkout(b, fx.runWorkout);
    await firstSyncWith(b, server, USER, NOW, 'account');
    expect((await listWorkouts(b)).map((w) => w.id)).toEqual([fx.strengthWorkout.id]);
  });

  it('"phone" replaces the account\'s records with the phone\'s, on every phone', async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await upsertWorkout(b, fx.runWorkout);
    await firstSyncWith(b, server, USER, NOW, 'phone');
    await sync(a);
    for (const db of [a, b]) {
      expect((await listWorkouts(db)).map((w) => w.id)).toEqual([fx.runWorkout.id]);
    }
  });

  it('signing in to another account on this phone starts over', async () => {
    await firstSyncWith(a, server, USER, NOW);
    expect(await needsFirstSync(a, 'someone-else')).toBe(true);
  });
});

describe('day-to-day sync between two phones', () => {
  beforeEach(async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await firstSyncWith(b, server, USER, NOW);
  });

  it('a change on one phone reaches the other', async () => {
    const edited = { ...fx.strengthWorkout, title: 'Heavy day' };
    await upsertWorkout(a, edited);
    expect(await sync(a)).toMatchObject({ pushed: 1 });
    await sync(b);
    expect(await listWorkouts(b)).toEqual([edited]);
  });

  it('a delete on one phone reaches the other', async () => {
    await deleteWorkout(b, fx.strengthWorkout.id);
    await sync(b);
    await sync(a);
    expect(await listWorkouts(a)).toEqual([]);
    expect(server.rows.get(`workouts/${fx.strengthWorkout.id}`)?.deleted).toBe(true);
  });

  it('changes made offline on both phones all end up on both', async () => {
    await upsertWeighIn(a, fx.weighIn);
    await upsertWorkout(b, fx.runWorkout);
    await sync(a);
    await sync(b);
    await sync(a);
    for (const db of [a, b]) {
      expect((await listWorkouts(db)).length).toBe(2);
      expect(await listWeighIns(db)).toEqual([fx.weighIn]);
    }
  });

  it('when both change the same record, the change that reaches the server last wins everywhere', async () => {
    await upsertWorkout(a, { ...fx.strengthWorkout, title: 'From A' });
    await upsertWorkout(b, { ...fx.strengthWorkout, title: 'From B' });
    await sync(a);
    await sync(b); // B's unsent change isn't overwritten by A's; it is sent after
    await sync(a);
    for (const db of [a, b]) {
      expect((await listWorkouts(db))[0]?.title).toBe('From B');
    }
  });

  it('skips and reports a bad row from the server instead of writing it', async () => {
    server.rows.set('workouts/bad', {
      kind: 'workouts',
      id: 'bad',
      data: { ...fx.runWorkout, id: 'bad', date: 'nope' },
      deleted: false,
      updated_at: '2026-10-27T11:00:00.000Z',
    });
    const r = await sync(b);
    expect(r.skipped).toEqual([
      { kind: 'workouts', id: 'bad', reason: expect.stringMatching(/^date: /) },
    ]);
    expect((await listWorkouts(b)).map((w) => w.id)).toEqual([fx.strengthWorkout.id]);
  });
});

describe('signing out', () => {
  it('keeps or clears the data on this phone', async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await forgetSync(a, false);
    expect(await listWorkouts(a)).toHaveLength(1);
    expect(await needsFirstSync(a, USER)).toBe(true);
    await forgetSync(a, true);
    expect(await listWorkouts(a)).toEqual([]);
  });

  it("asks before another account's records left on this phone go into a new account", async () => {
    await upsertWorkout(a, fx.strengthWorkout);
    await firstSyncWith(a, server, USER, NOW);
    await forgetSync(a, false); // signs out, keeps the data here
    const other = new FakeServer();
    expect(await firstSyncWith(a, other, 'user-2', NOW)).toBe('ask');
    expect(other.rows.size).toBe(0);
    // the same person signing back in is not asked about their own records
    await firstSyncWith(a, other, 'user-2', NOW, 'account');
    await upsertWorkout(a, fx.runWorkout);
    await forgetSync(a, false);
    expect(await firstSyncWith(a, other, 'user-2', NOW)).not.toBe('ask');
  });
});
