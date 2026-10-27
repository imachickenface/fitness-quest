/**
 * The connection to Supabase: sign-in and the `records` table. The library is loaded only when it's
 * needed (signing in, coming back from Google, or a saved session), so the app stays small for anyone who
 * never signs in. Test builds (`VITE_SUPABASE_PROJECT=test`) talk to the test project.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushRow, RemoteRow } from '../core/sync.ts';
import { LIVE, TEST } from '../syncConfig.ts';
import type { RemoteStore } from './engine.ts';

export const IS_TEST_PROJECT = import.meta.env.VITE_SUPABASE_PROJECT === 'test';
const project = IS_TEST_PROJECT ? TEST : LIVE;
const ref = new URL(project.url).hostname.split('.')[0];

let client: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(project.url, project.publishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return client;
}

/** Whether there may be a session to pick up: one saved on this phone, or Google sending us back. */
export function mayBeSignedIn(): boolean {
  try {
    if (new URLSearchParams(location.search).has('code')) return true;
    return localStorage.getItem(`sb-${ref}-auth-token`) !== null;
  } catch {
    return false;
  }
}

export async function signInWithGoogle(): Promise<void> {
  const c = await getClient();
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${import.meta.env.BASE_URL}` },
  });
  if (error) throw error;
}

/** Test builds only: the test project's email + password users (automated tests can't use Google). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!IS_TEST_PROJECT) throw new Error('password sign-in is only for the test project');
  const c = await getClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const c = await getClient();
  await c.auth.signOut({ scope: 'local' });
}

/** Deletes the account and every record stored with it, then signs out. */
export async function deleteAccount(): Promise<void> {
  const c = await getClient();
  const { error } = await c.rpc('delete_my_account');
  if (error) throw error;
  await c.auth.signOut({ scope: 'local' });
}

const PAGE = 1000; // Supabase's default maximum rows per request
const CHUNK = 200;

/** The signed-in account's rows, through the access rules (the server only ever returns this user's rows). */
export function supabaseRemote(c: SupabaseClient, userId: string): RemoteStore {
  return {
    async pull(since) {
      const out: RemoteRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = c
          .from('records')
          .select('kind,id,data,deleted,updated_at')
          .order('updated_at')
          .order('kind')
          .order('id')
          .range(from, from + PAGE - 1);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data as RemoteRow[]));
        if (data.length < PAGE) return out;
      }
    },
    async push(rows: PushRow[]) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map((r) => ({
          user_id: userId,
          kind: r.kind,
          id: r.id,
          data: r.data,
          deleted: r.deleted,
        }));
        const { error } = await c.from('records').upsert(chunk, { onConflict: 'user_id,kind,id' });
        if (error) throw error;
      }
    },
    async count() {
      const { count, error } = await c
        .from('records')
        .select('id', { count: 'exact', head: true })
        .eq('deleted', false);
      if (error) throw error;
      return count ?? 0;
    },
  };
}
