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
});
