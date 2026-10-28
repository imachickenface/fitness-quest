/**
 * Live check of the friends access rules (003_friends.sql) on the test project, with test users A and B.
 * Skipped without .env.test.local. Each run starts by clearing whatever an earlier run left between them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { client, ensureUsername, ready, signIn } from './liveEnv.ts';

describe.skipIf(!ready)('friends on the test project', () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let aId = '';
  let bId = '';
  let aName = '';
  let bName = '';

  const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => {
    const { data, error } = await c.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as string;
  };
  const rows = async (c: SupabaseClient) =>
    (await c.from('friendships').select('status, requested_by')).data ?? [];
  const profileOf = async (c: SupabaseClient, id: string) =>
    (await c.from('profiles').select('data').eq('user_id', id)).data ?? [];
  const usernameOf = async (c: SupabaseClient, id: string) =>
    (await c.from('usernames').select('username').eq('user_id', id)).data ?? [];

  beforeAll(async () => {
    ({ c: a, id: aId } = await signIn('A'));
    ({ c: b, id: bId } = await signIn('B'));
    aName = await ensureUsername(a, aId, 'qa');
    bName = await ensureUsername(b, bId, 'qb');
    // a clean slate between A and B
    for (const [c, other] of [
      [a, bId],
      [b, aId],
    ] as const) {
      await rpc(c, 'unblock_user', { other });
      await rpc(c, 'remove_friend', { other });
      await rpc(c, 'answer_friend_request', { other, accept: false });
    }
    expect(await rows(a)).toEqual([]);
    const pub = { v: 1, bio: 'A test profile' };
    const { error } = await a
      .from('profiles')
      .upsert({ user_id: aId, data: pub }, { onConflict: 'user_id' });
    expect(error).toBeNull();
  }, 60_000);

  it('signed out: nothing is readable and no function runs', async () => {
    const anon = client();
    expect((await anon.from('profiles').select('*')).error?.code).toBe('42501');
    expect((await anon.from('friendships').select('*')).error?.code).toBe('42501');
    const call = await anon.rpc('send_friend_request', { target_username: aName });
    expect(call.error).not.toBeNull();
  });

  it("strangers can't see each other's profile or name", async () => {
    expect(await profileOf(b, aId)).toEqual([]);
    expect(await usernameOf(b, aId)).toEqual([]);
    expect((await profileOf(a, aId))[0]?.data).toEqual({ v: 1, bio: 'A test profile' });
  });

  it("friendships can't be written directly, only through the functions", async () => {
    const forged = await b.from('friendships').insert({
      user_a: [aId, bId].sort()[0],
      user_b: [aId, bId].sort()[1],
      status: 'accepted',
      requested_by: bId,
    });
    expect(forged.error?.code).toBe('42501');
    const helper = await b.rpc('lock_pair', { a: aId, b: bId });
    expect(helper.error).not.toBeNull();
  });

  it('a request by username needs a yes before anything is shared', async () => {
    expect(await rpc(a, 'send_friend_request', { target_username: 'no_such_user_xyz' })).toBe(
      'not_found',
    );
    expect(await rpc(a, 'send_friend_request', { target_username: aName })).toBe('self');
    // capitals don't matter
    expect(await rpc(a, 'send_friend_request', { target_username: bName.toUpperCase() })).toBe(
      'sent',
    );
    expect(await rpc(a, 'send_friend_request', { target_username: bName })).toBe('already_sent');
    expect(await rows(b)).toEqual([{ status: 'pending', requested_by: aId }]);
    // B can read who asked, but not their profile yet
    expect(await usernameOf(b, aId)).toEqual([{ username: aName }]);
    expect(await profileOf(b, aId)).toEqual([]);
    // only B can answer
    expect(await rpc(a, 'answer_friend_request', { other: bId, accept: true })).toBe('not_found');
    expect(await rpc(b, 'answer_friend_request', { other: aId, accept: true })).toBe('accepted');
    expect((await profileOf(b, aId))[0]?.data).toEqual({ v: 1, bio: 'A test profile' });
    expect(await rpc(b, 'send_friend_request', { target_username: aName })).toBe('already_friends');
    expect((await b.rpc('is_friend', { other: aId })).data).toBe(true);
  });

  it("friends still can't change each other's profile", async () => {
    await b
      .from('profiles')
      .update({ data: { v: 1, bio: 'hacked' } })
      .eq('user_id', aId);
    expect((await profileOf(a, aId))[0]?.data).toEqual({ v: 1, bio: 'A test profile' });
    const forged = await b.from('profiles').insert({ user_id: aId, data: { v: 1 } });
    expect(forged.error?.code).toBe('42501');
  });

  it('unfriending stops the sharing', async () => {
    expect(await rpc(b, 'remove_friend', { other: aId })).toBe('removed');
    expect(await profileOf(b, aId)).toEqual([]);
    expect(await usernameOf(b, aId)).toEqual([]);
    expect(await rows(a)).toEqual([]);
  });

  it('asking back accepts, and a declined request leaves nothing', async () => {
    expect(await rpc(b, 'send_friend_request', { target_username: aName })).toBe('sent');
    expect(await rpc(a, 'send_friend_request', { target_username: bName })).toBe('accepted');
    expect(await rpc(a, 'remove_friend', { other: bId })).toBe('removed');
    expect(await rpc(b, 'send_friend_request', { target_username: aName })).toBe('sent');
    expect(await rpc(a, 'answer_friend_request', { other: bId, accept: false })).toBe('declined');
    expect(await rows(a)).toEqual([]);
    expect(await rows(b)).toEqual([]);
  });

  it('a block is invisible to the blocked person and stops their requests', async () => {
    expect(await rpc(a, 'send_friend_request', { target_username: bName })).toBe('sent');
    expect(await rpc(b, 'block_user', { other: aId })).toBe('blocked');
    // the request is gone and A sees no row at all
    expect(await rows(a)).toEqual([]);
    expect(await rows(b)).toEqual([{ status: 'blocked', requested_by: bId }]);
    expect(await rpc(a, 'send_friend_request', { target_username: bName })).toBe('not_found');
    // B still sees who it blocked; A doesn't see B's name
    expect(await usernameOf(b, aId)).toEqual([{ username: aName }]);
    expect(await usernameOf(a, bId)).toEqual([]);
    expect(await rpc(b, 'send_friend_request', { target_username: aName })).toBe('blocked');
    // A can't lift B's block, or turn it into its own
    expect(await rpc(a, 'unblock_user', { other: bId })).toBe('not_found');
    expect(await rpc(a, 'block_user', { other: bId })).toBe('blocked');
    expect(await rows(b)).toEqual([{ status: 'blocked', requested_by: bId }]);
    expect(await rpc(a, 'remove_friend', { other: bId })).toBe('not_found');
    expect(await rpc(b, 'unblock_user', { other: aId })).toBe('unblocked');
    expect(await rows(b)).toEqual([]);
  });

  it('the server refuses an oversized profile', async () => {
    const big = { v: 1, bio: 'x'.repeat(9000) };
    const { error } = await a.from('profiles').update({ data: big }).eq('user_id', aId);
    expect(error?.code).toBe('23514');
  });
  describe('invite links', () => {
    beforeAll(async () => {
      await rpc(a, 'remove_friend', { other: bId });
      await rpc(b, 'remove_friend', { other: aId });
      // cancel A's earlier links
      const { data } = await a.from('invites').select('token');
      for (const i of data ?? []) await a.from('invites').delete().eq('token', i.token);
    });

    it('a link makes friends at once, and says whose it is', async () => {
      const token = await rpc(a, 'create_invite', {});
      expect(token).toMatch(/^[0-9a-f]{32}$/);
      expect((await b.rpc('invite_owner_name', { invite: token })).data).toBe(aName);
      expect((await a.rpc('invite_owner_name', { invite: token })).data).toBeNull(); // own link
      expect(await rpc(a, 'redeem_invite', { invite: token })).toBe('own');
      expect(await rpc(b, 'redeem_invite', { invite: token })).toBe('friends');
      expect(await rpc(b, 'redeem_invite', { invite: token })).toBe('already_friends');
      expect((await b.rpc('is_friend', { other: aId })).data).toBe(true);
      expect(await rpc(b, 'remove_friend', { other: aId })).toBe('removed');
    });

    it('only the owner sees or cancels a link; a cancelled or unknown link is "expired"', async () => {
      const token = await rpc(a, 'create_invite', {});
      expect((await b.from('invites').select('token')).data).toEqual([]);
      await b.from('invites').delete().eq('token', token);
      expect((await a.from('invites').select('token').eq('token', token)).data).toHaveLength(1);
      const forged = await b.from('invites').insert({ token: 'f'.repeat(32), owner: bId });
      expect(forged.error?.code).toBe('42501');
      expect((await a.from('invites').delete().eq('token', token)).error).toBeNull();
      expect(await rpc(b, 'redeem_invite', { invite: token })).toBe('expired');
      expect(await rpc(b, 'redeem_invite', { invite: '0'.repeat(32) })).toBe('expired');
    });

    it("a block wins over a link, and the link doesn't give the block away", async () => {
      const token = await rpc(a, 'create_invite', {});
      expect(await rpc(a, 'block_user', { other: bId })).toBe('blocked');
      expect((await b.rpc('invite_owner_name', { invite: token })).data).toBeNull();
      expect(await rpc(b, 'redeem_invite', { invite: token })).toBe('expired');
      expect((await b.rpc('is_friend', { other: aId })).data).toBe(false);
      expect(await rpc(a, 'unblock_user', { other: bId })).toBe('unblocked');
      await a.from('invites').delete().eq('token', token);
    });

    it('at most 5 live links per account', async () => {
      const { data: left } = await a.from('invites').select('token');
      for (const i of left ?? []) await a.from('invites').delete().eq('token', i.token);
      const made: string[] = [];
      for (let i = 0; i < 5; i++) made.push(await rpc(a, 'create_invite', {}));
      expect(made.every((t) => /^[0-9a-f]{32}$/.test(t))).toBe(true);
      expect(new Set(made).size).toBe(5);
      expect((await a.rpc('create_invite', {})).data).toBeNull();
      for (const t of made) await a.from('invites').delete().eq('token', t);
    });

    it('signed out: no links made, named or used', async () => {
      const anon = client();
      expect((await anon.rpc('create_invite', {})).error).not.toBeNull();
      expect(
        (await anon.rpc('invite_owner_name', { invite: '0'.repeat(32) })).error,
      ).not.toBeNull();
      expect((await anon.from('invites').select('*')).error?.code).toBe('42501');
    });
  });
  describe('activity and cheers', () => {
    const item = { v: 1, kind: 'workout', date: '2026-10-27', title: 'Push day', detail: '3 sets' };
    const aItems = async (c: SupabaseClient) =>
      (await c.from('activity').select('id').eq('owner', aId)).data ?? [];

    beforeAll(async () => {
      await rpc(a, 'remove_friend', { other: bId });
      await a.from('activity').delete().eq('owner', aId);
      const { error } = await a.from('activity').upsert(
        [
          { owner: aId, id: 'workout:live-1', data: item },
          { owner: aId, id: 'workout:live-2', data: { ...item, title: 'Pull day' } },
        ],
        { onConflict: 'owner,id' },
      );
      expect(error).toBeNull();
    });

    it("strangers see none of it and can't cheer", async () => {
      expect(await aItems(b)).toEqual([]);
      const c = await b
        .from('cheers')
        .insert({ owner: aId, activity_id: 'workout:live-1', from_user: bId });
      expect(c.error?.code).toBe('42501');
    });

    it('friends see the items and can cheer once each, the owner sees who cheered', async () => {
      expect(await rpc(b, 'send_friend_request', { target_username: aName })).toBe('sent');
      expect(await rpc(a, 'answer_friend_request', { other: bId, accept: true })).toBe('accepted');
      expect((await aItems(b)).map((r) => r.id).sort()).toEqual([
        'workout:live-1',
        'workout:live-2',
      ]);
      const first = await b
        .from('cheers')
        .insert({ owner: aId, activity_id: 'workout:live-1', from_user: bId });
      expect(first.error).toBeNull();
      const again = await b
        .from('cheers')
        .insert({ owner: aId, activity_id: 'workout:live-1', from_user: bId });
      expect(again.error?.code).toBe('23505');
      const seen = (await a.from('cheers').select('from_user, activity_id')).data;
      expect(seen).toEqual([{ from_user: bId, activity_id: 'workout:live-1' }]);
    });

    it("no forged cheers, no cheering yourself, no touching a friend's items", async () => {
      const forged = await b
        .from('cheers')
        .insert({ owner: aId, activity_id: 'workout:live-2', from_user: aId });
      expect(forged.error?.code).toBe('42501');
      const self = await a
        .from('cheers')
        .insert({ owner: aId, activity_id: 'workout:live-2', from_user: aId });
      expect(self.error?.code).toBe('42501');
      await b.from('activity').delete().eq('owner', aId);
      await b
        .from('activity')
        .update({ data: { ...item, title: 'hacked' } })
        .eq('owner', aId);
      const planted = await b.from('activity').insert({ owner: aId, id: 'workout:x', data: item });
      expect(planted.error?.code).toBe('42501');
      expect((await aItems(a)).length).toBe(2);
      // A can't take back B's cheer
      await a.from('cheers').delete().eq('from_user', bId);
      expect((await b.from('cheers').select('activity_id')).data).toHaveLength(1);
    });

    it('removing an item takes its cheers with it; unfriending hides the rest', async () => {
      expect((await a.from('activity').delete().eq('id', 'workout:live-1')).error).toBeNull();
      expect((await b.from('cheers').select('activity_id')).data).toEqual([]);
      expect(await rpc(a, 'remove_friend', { other: bId })).toBe('removed');
      expect(await aItems(b)).toEqual([]);
    });

    it('the server refuses an oversized item, and signed-out visitors see nothing', async () => {
      const big = await a
        .from('activity')
        .insert({ owner: aId, id: 'workout:big', data: { ...item, title: 'x'.repeat(3000) } });
      expect(big.error?.code).toBe('23514');
      const anon = client();
      expect((await anon.from('activity').select('*')).error?.code).toBe('42501');
      expect((await anon.from('cheers').select('*')).error?.code).toBe('42501');
      await a.from('activity').delete().eq('owner', aId);
    });
  });
  describe('shared quests', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ids: string[] = [];
    const clear = async () => {
      // A and B take back their open proposals and decline the other's
      for (const c of [a, b]) {
        const { data } = await c.from('challenges').select('id, from_user, status');
        for (const r of data ?? []) {
          if (r.status === 'accepted') {
            await rpc(c, 'quit_challenge', { challenge: r.id });
            continue;
          }
          if (r.status !== 'pending') continue;
          if (r.from_user === (c === a ? aId : bId))
            await rpc(c, 'cancel_challenge', { challenge: r.id });
          else await rpc(c, 'answer_challenge', { challenge: r.id, accept: false });
        }
      }
    };

    beforeAll(async () => {
      await rpc(a, 'remove_friend', { other: bId });
      await clear();
    });

    it('only friends can propose, and the start must be about today', async () => {
      const r = await rpc(a, 'propose_challenge', {
        friend: bId,
        goal: 'workouts',
        target: 3,
        starts: today,
      });
      expect(r).toBe('not_friends');
      expect(await rpc(b, 'send_friend_request', { target_username: aName })).toBe('sent');
      expect(await rpc(a, 'answer_friend_request', { other: bId, accept: true })).toBe('accepted');
      const late = await rpc(a, 'propose_challenge', {
        friend: bId,
        goal: 'workouts',
        target: 3,
        starts: '2020-01-01',
      });
      expect(late).toBe('bad_start');
      const bad = await a.rpc('propose_challenge', {
        friend: bId,
        goal: 'active_days',
        target: 9,
        starts: today,
      });
      expect(bad.error).not.toBeNull(); // more than 7 days in a week
    });

    it('a proposal needs a yes; then each side writes only its own progress', async () => {
      const id = await rpc(a, 'propose_challenge', {
        friend: bId,
        goal: 'workouts',
        target: 3,
        starts: today,
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      ids.push(id);
      // not running yet: no progress
      const early = await a
        .from('challenge_progress')
        .insert({ challenge_id: id, user_id: aId, value: 1 });
      expect(early.error?.code).toBe('42501');
      expect(await rpc(a, 'answer_challenge', { challenge: id, accept: true })).toBe('not_found');
      expect(await rpc(b, 'answer_challenge', { challenge: id, accept: true })).toBe('accepted');
      expect(
        (
          await a
            .from('challenge_progress')
            .upsert(
              { challenge_id: id, user_id: aId, value: 2 },
              { onConflict: 'challenge_id,user_id' },
            )
        ).error,
      ).toBeNull();
      const forged = await b
        .from('challenge_progress')
        .insert({ challenge_id: id, user_id: aId, value: 0 });
      expect(forged.error?.code).toBe('42501');
      await b.from('challenge_progress').update({ value: 0 }).eq('user_id', aId);
      expect((await b.from('challenge_progress').select('user_id, value')).data).toEqual([
        { user_id: aId, value: 2 },
      ]);
    });

    it("strangers can't see a shared quest, and nobody writes them directly", async () => {
      const anon = client();
      expect((await anon.from('challenges').select('*')).error?.code).toBe('42501');
      const direct = await a.from('challenges').insert({
        from_user: aId,
        to_user: bId,
        goal: 'workouts',
        target: 1,
        starts: today,
        ends: today,
      });
      expect(direct.error?.code).toBe('42501');
      await a.from('challenges').update({ status: 'accepted' }).eq('id', ids[0]!);
      await a.from('challenges').update({ target: 1 }).eq('id', ids[0]!);
      expect((await a.from('challenges').select('target').eq('id', ids[0]!)).data).toEqual([
        { target: 3 },
      ]);
    });

    it('at most 3 open or running per person', async () => {
      // one running from before; two more proposals fill it up
      ids.push(
        await rpc(b, 'propose_challenge', {
          friend: aId,
          goal: 'run_km',
          target: 10,
          starts: today,
        }),
      );
      ids.push(
        await rpc(b, 'propose_challenge', {
          friend: aId,
          goal: 'active_days',
          target: 5,
          starts: today,
        }),
      );
      expect(
        await rpc(a, 'propose_challenge', {
          friend: bId,
          goal: 'workouts',
          target: 2,
          starts: today,
        }),
      ).toBe('too_many');
      expect(await rpc(a, 'cancel_challenge', { challenge: ids[1]! })).toBe('not_found'); // only the proposer
      expect(await rpc(b, 'cancel_challenge', { challenge: ids[1]! })).toBe('cancelled');
      expect(await rpc(a, 'answer_challenge', { challenge: ids[2]!, accept: false })).toBe(
        'declined',
      );
      await clear();
      expect(await rpc(a, 'remove_friend', { other: bId })).toBe('removed');
    });
  });
});
