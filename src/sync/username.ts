/**
 * The account's username: picked once after the first sign-in, unique across all accounts (the server's
 * `usernames` table decides, ignoring capitals; see supabase/migrations/002_usernames.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** What's wrong with a username as typed, or undefined when it's fine to send. The server checks too. */
export function usernameProblem(name: string): string | undefined {
  if (name.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!/^[A-Za-z0-9_]+$/.test(name)) return 'Use only letters, numbers and _.';
  return undefined;
}

/** The account's username, or null when it hasn't picked one yet. */
export async function fetchUsername(c: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await c
    .from('usernames')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle<{ username: string }>();
  if (error) throw new Error(error.message);
  return data?.username ?? null;
}

/** Pick (or change, when `current` is set) the account's username. 'taken' when another account has it. */
export async function saveUsername(
  c: SupabaseClient,
  userId: string,
  name: string,
  current: string | null,
): Promise<'saved' | 'taken'> {
  const { error } = current
    ? await c.from('usernames').update({ username: name }).eq('user_id', userId)
    : await c.from('usernames').insert({ user_id: userId, username: name });
  if (!error) return 'saved';
  if (error.code === '23505') return 'taken'; // the unique index
  throw new Error(error.message);
}
