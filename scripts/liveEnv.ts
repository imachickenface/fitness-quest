/**
 * Shared by the live tests: the two test users of the test project (fitness-quest-test), from
 * .env.test.local. `ready` is false when that file isn't filled in, and the live tests skip.
 */
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
const filled = (k: string) => !!env[k] && env[k] !== 'replace-me';

export const ready =
  filled('SUPABASE_TEST_USER_A_PASSWORD') && filled('SUPABASE_TEST_USER_B_PASSWORD');

export const client = (): SupabaseClient =>
  createClient(TEST.url, TEST.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** A signed-in client for test user A or B, and its user id. */
export async function signIn(who: 'A' | 'B'): Promise<{ c: SupabaseClient; id: string }> {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({
    email: env[`SUPABASE_TEST_USER_${who}_EMAIL`]!,
    password: env[`SUPABASE_TEST_USER_${who}_PASSWORD`]!,
  });
  if (error) throw new Error(`test user ${who}: ${error.message}`);
  return { c, id: data.user.id };
}

/** Make sure the user has a username (a new one each run when it has none), and return it. */
export async function ensureUsername(
  c: SupabaseClient,
  id: string,
  prefix: string,
): Promise<string> {
  const { data } = await c.from('usernames').select('username').eq('user_id', id);
  const had = data?.[0]?.username as string | undefined;
  if (had) return had;
  const name = `${prefix}_${Date.now().toString(36)}`;
  const { error } = await c.from('usernames').insert({ user_id: id, username: name });
  if (error) throw new Error(error.message);
  return name;
}
