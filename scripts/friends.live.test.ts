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
    const forged = await b
      .from('friendships')
      .insert({
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
});
