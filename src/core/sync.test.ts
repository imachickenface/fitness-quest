import { describe, expect, it } from 'vitest';
import * as fx from '../test/fixtures.ts';
import {
  diffLocal,
  fingerprint,
  firstSync,
  planCombine,
  planPull,
  recordId,
  validateRecord,
  type RemoteRow,
} from './sync.ts';

const row = (r: Partial<RemoteRow> & Pick<RemoteRow, 'kind' | 'id'>): RemoteRow => ({
  data: null,
  deleted: false,
  updated_at: '2026-10-27T10:00:00.000Z',
  ...r,
});

describe('recordId', () => {
  it('is the record id, the date for weigh-ins and "profile" for the profile', () => {
    expect(recordId('workouts', fx.strengthWorkout)).toBe(fx.strengthWorkout.id);
    expect(recordId('weighIns', fx.weighIn)).toBe('2026-10-26');
    expect(recordId('profile', fx.profile)).toBe('profile');
  });
});

describe('validateRecord', () => {
  it('accepts a valid record whose id matches its row', () => {
    expect(validateRecord('foodEntries', fx.foodEntry.id, fx.foodEntry)).toEqual({
      ok: true,
      value: fx.foodEntry,
    });
  });

  it('rejects a record that fails its schema, with the field', () => {
    const r = validateRecord('workouts', fx.runWorkout.id, { ...fx.runWorkout, date: 'yesterday' });
    expect(r).toMatchObject({ ok: false });
    if (r.ok) throw new Error('should fail');
    expect(r.reason).toMatch(/^date: /);
  });

  it("rejects a record filed under another record's id", () => {
    expect(validateRecord('foodEntries', 'someone-else', fx.foodEntry)).toEqual({
      ok: false,
      reason: 'id does not match',
    });
  });
});

describe('fingerprint', () => {
  it("doesn't depend on key order or undefined fields (Postgres reorders jsonb keys)", () => {
    expect(fingerprint({ a: 1, b: { c: [1, 2], d: 'x' } })).toBe(
      fingerprint({ b: { d: 'x', c: [1, 2] }, a: 1, e: undefined }),
    );
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
    expect(fingerprint(fx.strengthWorkout)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('diffLocal', () => {
  const k = (kind: RemoteRow['kind'], id: string) => `${kind}/${id}`;

  it('sends new and changed records, not unchanged ones, and marks them pending', () => {
    const synced = new Map([
      [k('workouts', fx.strengthWorkout.id), fingerprint(fx.strengthWorkout)],
      [k('weighIns', fx.weighIn.date), fingerprint(fx.weighIn)],
    ]);
    const changed = { ...fx.weighIn, kg: 79 };
    const d = diffLocal(
      [
        { kind: 'workouts', id: fx.strengthWorkout.id, data: fx.strengthWorkout },
        { kind: 'weighIns', id: fx.weighIn.date, data: changed },
        { kind: 'workouts', id: fx.runWorkout.id, data: fx.runWorkout },
      ],
      synced,
    );
    expect(d.push).toEqual([
      { kind: 'weighIns', id: fx.weighIn.date, data: changed, deleted: false },
      { kind: 'workouts', id: fx.runWorkout.id, data: fx.runWorkout, deleted: false },
    ]);
    expect(d.pending).toEqual(
      new Set([k('weighIns', fx.weighIn.date), k('workouts', fx.runWorkout.id)]),
    );
  });

  it('sends a delete for a synced record that is gone from the phone', () => {
    const d = diffLocal([], new Map([['foodEntries/e1', 'abc']]));
    expect(d.push).toEqual([{ kind: 'foodEntries', id: 'e1', data: null, deleted: true }]);
    expect(d.pending).toEqual(new Set(['foodEntries/e1']));
  });

  it('never sends a record that fails its schema', () => {
    const d = diffLocal(
      [{ kind: 'workouts', id: fx.runWorkout.id, data: { ...fx.runWorkout, date: 'x' } }],
      new Map(),
    );
    expect(d.push).toEqual([]);
    expect(d.skipped).toEqual([
      { kind: 'workouts', id: fx.runWorkout.id, reason: expect.stringMatching(/^date: /) },
    ]);
  });
});

describe('planPull', () => {
  it('writes valid rows, deletes tombstones and moves the cursor to the newest row', () => {
    const plan = planPull(
      [
        row({
          kind: 'workouts',
          id: fx.runWorkout.id,
          data: fx.runWorkout,
          updated_at: '2026-10-27T10:00:01.000Z',
        }),
        row({
          kind: 'foodEntries',
          id: 'gone',
          deleted: true,
          updated_at: '2026-10-27T10:00:03.000Z',
        }),
        row({
          kind: 'profile',
          id: 'profile',
          data: fx.profile,
          updated_at: '2026-10-27T10:00:02.000Z',
        }),
      ],
      new Set(),
    );
    expect(plan.puts).toEqual([
      { kind: 'workouts', id: fx.runWorkout.id, value: fx.runWorkout },
      { kind: 'profile', id: 'profile', value: fx.profile },
    ]);
    expect(plan.deletes).toEqual([{ kind: 'foodEntries', id: 'gone' }]);
    expect(plan.skipped).toEqual([]);
    expect(plan.cursor).toBe('2026-10-27T10:00:03.000Z');
  });

  it('uses the newest copy when a row comes twice (pulls overlap on purpose)', () => {
    const older = { ...fx.weighIn, kg: 80 };
    const newer = { ...fx.weighIn, kg: 79.5 };
    const plan = planPull(
      [
        row({
          kind: 'weighIns',
          id: fx.weighIn.date,
          data: newer,
          updated_at: '2026-10-27T10:00:05.000Z',
        }),
        row({
          kind: 'weighIns',
          id: fx.weighIn.date,
          data: older,
          updated_at: '2026-10-27T10:00:01.000Z',
        }),
      ],
      new Set(),
    );
    expect(plan.puts).toEqual([{ kind: 'weighIns', id: fx.weighIn.date, value: newer }]);
  });

  it('leaves records with unsent local changes alone: they reach the server later and win', () => {
    const plan = planPull(
      [row({ kind: 'workouts', id: fx.runWorkout.id, data: fx.runWorkout })],
      new Set([`workouts/${fx.runWorkout.id}`]),
    );
    expect(plan.puts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.cursor).toBe('2026-10-27T10:00:00.000Z');
  });

  it('skips and reports bad rows instead of writing them', () => {
    const plan = planPull(
      [
        row({ kind: 'workouts', id: fx.runWorkout.id, data: { ...fx.runWorkout, date: 'nope' } }),
        row({ kind: 'foodEntries', id: 'x', data: null }),
      ],
      new Set(),
    );
    expect(plan.puts).toEqual([]);
    expect(plan.skipped).toEqual([
      { kind: 'workouts', id: fx.runWorkout.id, reason: expect.stringMatching(/^date: /) },
      { kind: 'foodEntries', id: 'x', reason: 'no data' },
    ]);
  });

  it('keeps the old cursor when nothing came back', () => {
    expect(planPull([], new Set(), '2026-10-01T00:00:00.000Z').cursor).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect(planPull([], new Set()).cursor).toBeUndefined();
  });
});

describe('firstSync', () => {
  it('uploads into an empty account, downloads onto an empty phone, and asks when both have data', () => {
    expect(firstSync(12, 0)).toBe('upload');
    expect(firstSync(0, 40)).toBe('download');
    expect(firstSync(0, 0)).toBe('upload');
    expect(firstSync(12, 40)).toBe('ask');
  });
});

describe('planCombine', () => {
  const local = (kind: RemoteRow['kind'], data: unknown) => ({
    kind,
    id: recordId(kind, data),
    data,
  });

  it('pushes records only the phone has and writes records only the account has', () => {
    const plan = planCombine(
      [local('workouts', fx.strengthWorkout)],
      [row({ kind: 'workouts', id: fx.runWorkout.id, data: fx.runWorkout })],
    );
    expect(plan.push).toEqual([
      { kind: 'workouts', id: fx.strengthWorkout.id, data: fx.strengthWorkout, deleted: false },
    ]);
    expect(plan.pull.puts).toEqual([
      { kind: 'workouts', id: fx.runWorkout.id, value: fx.runWorkout },
    ]);
  });

  it("keeps the newer version of a record both have, by the record's own time", () => {
    const phone = { ...fx.profile, heightCm: 181, updatedAt: '2026-10-27T09:00:00+00:00' };
    const account = { ...fx.profile, heightCm: 179, updatedAt: '2026-10-20T09:00:00+00:00' };
    const plan = planCombine(
      [local('profile', phone)],
      [row({ kind: 'profile', id: 'profile', data: account })],
    );
    expect(plan.push).toEqual([{ kind: 'profile', id: 'profile', data: phone, deleted: false }]);
    expect(plan.pull.puts).toEqual([]);

    const plan2 = planCombine(
      [local('profile', account)],
      [row({ kind: 'profile', id: 'profile', data: phone })],
    );
    expect(plan2.push).toEqual([]);
    expect(plan2.pull.puts).toEqual([{ kind: 'profile', id: 'profile', value: phone }]);
  });

  it("uses the account's copy when neither has a time (weigh-ins) or both times are equal", () => {
    const plan = planCombine(
      [local('weighIns', { ...fx.weighIn, kg: 81 })],
      [row({ kind: 'weighIns', id: fx.weighIn.date, data: { ...fx.weighIn, kg: 80 } })],
    );
    expect(plan.push).toEqual([]);
    expect(plan.pull.puts).toEqual([
      { kind: 'weighIns', id: fx.weighIn.date, value: { ...fx.weighIn, kg: 80 } },
    ]);
  });

  it('a record deleted in the account stays deleted unless the phone changed it after the delete', () => {
    const deletedAt = '2026-10-25T00:00:00.000Z';
    const before = { ...fx.strengthWorkout, loggedAt: '2026-10-24T08:00:00+00:00' };
    const after = { ...fx.strengthWorkout, loggedAt: '2026-10-26T08:00:00+00:00' };
    const tomb = row({
      kind: 'workouts',
      id: fx.strengthWorkout.id,
      deleted: true,
      updated_at: deletedAt,
    });

    const gone = planCombine([local('workouts', before)], [tomb]);
    expect(gone.push).toEqual([]);
    expect(gone.pull.deletes).toEqual([{ kind: 'workouts', id: fx.strengthWorkout.id }]);

    const kept = planCombine([local('workouts', after)], [tomb]);
    expect(kept.push).toEqual([
      { kind: 'workouts', id: fx.strengthWorkout.id, data: after, deleted: false },
    ]);
    expect(kept.pull.deletes).toEqual([]);
  });

  it('never pushes a local record that fails its schema', () => {
    const plan = planCombine([local('workouts', { ...fx.runWorkout, date: 'bad' })], []);
    expect(plan.push).toEqual([]);
    expect(plan.skipped).toEqual([
      { kind: 'workouts', id: fx.runWorkout.id, reason: expect.stringMatching(/^date: /) },
    ]);
  });
});
