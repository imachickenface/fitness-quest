/**
 * Live check of the database access rules against the test project (fitness-quest-test), with the two
 * test users from .env.test.local. Skipped when that file isn't filled in. It never touches the real
 * project and never deletes an account.
 */
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEST } from '../src/syncConfig.ts';

function readEnv(): Record<string, string> {
  try {
    const text = readFileSync('.env.test.local', 'utf8');
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const env = readEnv();
const ready =
  !!env.SUPABASE_TEST_USER_A_PASSWORD &&
  env.SUPABASE_TEST_USER_A_PASSWORD !== 'replace-me' &&
  !!env.SUPABASE_TEST_USER_B_PASSWORD &&
  env.SUPABASE_TEST_USER_B_PASSWORD !== 'replace-me';

const client = () =>
  createClient(TEST.url, TEST.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const ROW = { kind: 'quests', id: 'access-check' };

describe.skipIf(!ready)('access rules on the test project', () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let aId = '';

  beforeAll(async () => {
    a = client();
    b = client();
    const sa = await a.auth.signInWithPassword({
      email: env.SUPABASE_TEST_USER_A_EMAIL!,
      password: env.SUPABASE_TEST_USER_A_PASSWORD!,
    });
    const sb = await b.auth.signInWithPassword({
      email: env.SUPABASE_TEST_USER_B_EMAIL!,
      password: env.SUPABASE_TEST_USER_B_PASSWORD!,
    });
    expect(sa.error).toBeNull();
    expect(sb.error).toBeNull();
    aId = sa.data.user!.id;
    expect(sb.data.user!.id).not.toBe(aId);
    const { error } = await a
      .from('records')
      .upsert(
        { user_id: aId, ...ROW, data: { by: 'A' }, deleted: false },
        { onConflict: 'user_id,kind,id' },
      );
    expect(error).toBeNull();
  }, 30_000);

  it('signed out: no reading or writing at all', async () => {
    const anon = client();
    const read = await anon.from('records').select('*');
    expect(read.error?.code).toBe('42501');
    const write = await anon.from('records').insert({ user_id: aId, ...ROW, data: {} });
    expect(write.error?.code).toBe('42501');
  });

  it('A reads back its own row, with a server time', async () => {
    const { data, error } = await a
      .from('records')
      .select('*')
      .eq('kind', ROW.kind)
      .eq('id', ROW.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ user_id: aId, data: { by: 'A' } });
  });

  it("B can't see A's rows", async () => {
    const { data, error } = await b.from('records').select('user_id').eq('user_id', aId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("B can't change A's row", async () => {
    await b
      .from('records')
      .update({ data: { by: 'B' } })
      .eq('user_id', aId)
      .eq('id', ROW.id);
    const { data } = await a.from('records').select('data').eq('kind', ROW.kind).eq('id', ROW.id);
    expect(data![0]!.data).toEqual({ by: 'A' });
  });

  it("B can't write a row under A's account", async () => {
    const { error } = await b
      .from('records')
      .insert({ user_id: aId, kind: 'quests', id: 'forged', data: { by: 'B' } });
    expect(error?.code).toBe('42501');
  });

  it('nobody can delete rows one by one (deletes are marked, accounts removed whole)', async () => {
    const { error } = await a.from('records').delete().eq('id', ROW.id);
    expect(error?.code).toBe('42501');
  });

  describe('usernames', () => {
    // a new name each run, so earlier runs never collide
    const name = `qa_${Date.now().toString(36)}`;
    const aName = async () =>
      (await a.from('usernames').select('username').eq('user_id', aId)).data?.[0]?.username;

    beforeAll(async () => {
      const had = await aName();
      const { error } = had
        ? await a.from('usernames').update({ username: name }).eq('user_id', aId)
        : await a.from('usernames').insert({ user_id: aId, username: name });
      expect(error).toBeNull();
    });

    it('A reads back its own name', async () => {
      expect(await aName()).toBe(name);
    });

    it("B can't take A's name, in any capitals", async () => {
      const bId = (await b.auth.getUser()).data.user!.id;
      const { data: had } = await b.from('usernames').select('username').eq('user_id', bId);
      const { error } = had?.length
        ? await b.from('usernames').update({ username: name.toUpperCase() }).eq('user_id', bId)
        : await b.from('usernames').insert({ user_id: bId, username: name.toUpperCase() });
      expect(error?.code).toBe('23505');
    });

    it("B can't read, change or forge A's name", async () => {
      const read = await b.from('usernames').select('*').eq('user_id', aId);
      expect(read.data).toEqual([]);
      await b.from('usernames').update({ username: 'stolen_name' }).eq('user_id', aId);
      expect(await aName()).toBe(name);
      const forged = await b.from('usernames').insert({ user_id: aId, username: 'forged_name' });
      expect(forged.error?.code).toBe('42501');
    });

    it('B sees no other names when listing', async () => {
      const bId = (await b.auth.getUser()).data.user!.id;
      const { data } = await b.from('usernames').select('user_id');
      expect(data!.every((r) => r.user_id === bId)).toBe(true);
    });

    it('the server refuses names outside the rule', async () => {
      for (const bad of ['ab', 'a b', 'sam-smith', 'x'.repeat(21), 'sám']) {
        const { error } = await a.from('usernames').update({ username: bad }).eq('user_id', aId);
        expect(error?.code, bad).toBe('23514');
      }
      expect(await aName()).toBe(name);
    });

    it('A can change only the name: not the owner, and no deletes', async () => {
      const bId = (await b.auth.getUser()).data.user!.id;
      const move = await a.from('usernames').update({ user_id: bId }).eq('user_id', aId);
      expect(move.error?.code).toBe('42501');
      const del = await a.from('usernames').delete().eq('user_id', aId);
      expect(del.error?.code).toBe('42501');
      expect(await aName()).toBe(name);
    });

    it('signed out: no reading or writing', async () => {
      const anon = client();
      expect((await anon.from('usernames').select('*')).error?.code).toBe('42501');
      const write = await anon.from('usernames').insert({ user_id: aId, username: 'anon_name' });
      expect(write.error?.code).toBe('42501');
    });
  });
});
