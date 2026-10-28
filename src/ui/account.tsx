import Dexie from 'dexie';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  firstSyncWith,
  forgetSync,
  getSyncState,
  needsFirstSync,
  syncOnce,
  type FirstSyncChoice,
} from '../sync/engine.ts';
import {
  authErrorInUrl,
  clearAuthParams,
  deleteAccount as deleteRemoteAccount,
  getClient,
  mayBeSignedIn,
  signInWithGoogle,
  signInWithPassword,
  signOut as signOutRemote,
  supabaseRemote,
} from '../sync/supabase.ts';
import { saveBackup } from './backupActions.ts';
import { AccountContext, type Account, type Actions, type SyncStatus } from './accountContext.ts';
import { useDb } from './dbContext.ts';
import { nowStamp } from './format.ts';

const SYNC_EVERY_MS = 60_000;
const AFTER_CHANGE_MS = 3_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Signs in with Google and keeps this phone's records in sync with the account while the app is open. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [session, setSession] = useState<Session | null | undefined>(
    mayBeSignedIn() ? undefined : null,
  );
  const [sync, setSync] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);
  const [askFirst, setAskFirst] = useState(false);
  const [error, setError] = useState<string | undefined>(authErrorInUrl);
  const running = useRef(false);
  const again = useRef(false);
  const runLatest = useRef<() => void>(() => {});

  // Pick up a saved session or Google's redirect, and follow sign-ins and sign-outs.
  useEffect(() => {
    if (session === null && !mayBeSignedIn()) {
      clearAuthParams(); // a failed sign-in's error, already in `error`
      return;
    }
    let live = true;
    let unsubscribe = () => {};
    void getClient().then(async (c) => {
      const { data, error: failed } = await c.auth.getSession();
      if (!live) return;
      setSession(data.session);
      if (failed) setError(failed.message);
      const sub = c.auth.onAuthStateChange((_event, s) => setSession(s));
      unsubscribe = () => sub.data.subscription.unsubscribe();
      clearAuthParams();
    });
    return () => {
      live = false;
      unsubscribe();
    };
    // run once; later sign-ins arrive through onAuthStateChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userId = session?.user.id;

  const runSync = useCallback(
    async (choice?: FirstSyncChoice) => {
      if (!userId) return;
      if (running.current) {
        again.current = true;
        return;
      }
      if (!navigator.onLine) {
        setSync('offline');
        return;
      }
      running.current = true;
      setSync('syncing');
      try {
        const remote = supabaseRemote(await getClient(), userId);
        if (await needsFirstSync(db, userId)) {
          const r = await firstSyncWith(db, remote, userId, nowStamp(), choice);
          if (r === 'ask') {
            setAskFirst(true);
            setSync('idle');
            return;
          }
          setAskFirst(false);
        } else {
          await syncOnce(db, remote, userId, nowStamp());
        }
        setLastSyncedAt((await getSyncState(db))?.lastSyncedAt);
        setSync('idle');
        setError(undefined);
      } catch (e) {
        setSync(navigator.onLine ? 'error' : 'offline');
        setError(message(e));
      } finally {
        running.current = false;
        if (again.current) {
          again.current = false;
          setTimeout(() => runLatest.current(), AFTER_CHANGE_MS);
        }
      }
    },
    [db, userId],
  );

  // a change that arrived while syncing runs the newest runSync afterwards
  useEffect(() => {
    runLatest.current = () => void runSync();
  }, [runSync]);

  // Sync on sign-in, when the app comes back to the front or online, every minute, and soon after a change.
  useEffect(() => {
    if (!userId) return;
    const start = setTimeout(() => void runSync(), 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (running.current) return; // our own writes while syncing
      clearTimeout(timer);
      timer = setTimeout(() => void runSync(), AFTER_CHANGE_MS);
    };
    const visible = () => document.visibilityState === 'visible' && void runSync();
    const online = () => void runSync();
    const every = setInterval(
      () => document.visibilityState === 'visible' && void runSync(),
      SYNC_EVERY_MS,
    );
    Dexie.on('storagemutated', soon);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', online);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
      clearInterval(every);
      Dexie.on('storagemutated').unsubscribe(soon);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', online);
    };
  }, [userId, runSync]);

  const actions: Actions = {
    signIn: async () => {
      setError(undefined);
      try {
        await signInWithGoogle(); // leaves the page for Google, which sends the user back
      } catch (e) {
        setError(message(e));
      }
    },
    signInTest: async (email, password) => {
      setError(undefined);
      try {
        await signInWithPassword(email, password);
        setSession((await (await getClient()).auth.getSession()).data.session);
      } catch (e) {
        setError(message(e));
      }
    },
    signOut: async (clearPhone) => {
      await signOutRemote();
      await forgetSync(db, clearPhone);
      setSession(null);
      setAskFirst(false);
      setLastSyncedAt(undefined);
    },
    deleteAccount: async () => {
      await deleteRemoteAccount();
      await forgetSync(db, false);
      setSession(null);
      setAskFirst(false);
      setLastSyncedAt(undefined);
    },
    syncNow: () => void runSync(),
    chooseFirstSync: async (choice) => {
      // a backup file first, since "combine" and "account" change what's on this phone
      if (choice !== 'phone') await saveBackup(db);
      await runSync(choice);
    },
  };

  const account: Account =
    session === undefined
      ? { status: 'checking' }
      : session === null
        ? { status: 'signed-out', ...(error ? { error } : {}) }
        : {
            status: 'signed-in',
            email: session.user.email ?? '',
            sync,
            ...(lastSyncedAt ? { lastSyncedAt } : {}),
            firstSyncChoice: askFirst,
            ...(error ? { error } : {}),
          };

  return (
    <AccountContext.Provider value={{ ...account, ...actions }}>{children}</AccountContext.Provider>
  );
}
