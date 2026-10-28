import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContacts, type Contact } from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';

const EVERY_MS = 60_000;

export type Contacts = {
  /** undefined until the first answer */
  contacts: Contact[] | undefined;
  error: string | undefined;
  refresh: () => Promise<void>;
};

/** Friends, requests and blocks for the signed-in account; refreshed when shown, every minute and on demand. */
export function useContacts(userId: string | undefined): Contacts {
  const [contacts, setContacts] = useState<{ userId: string; list: Contact[] } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const run = ++latest.current;
    try {
      const list = await fetchContacts(await getClient(), userId);
      if (run !== latest.current) return; // a newer refresh answers instead
      setContacts({ userId, list });
      setError(undefined);
    } catch (e) {
      if (run !== latest.current) return;
      setError(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : 'offline');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const start = setTimeout(() => void refresh(), 0);
    const visible = () => document.visibilityState === 'visible' && void refresh();
    const every = setInterval(visible, EVERY_MS);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(start);
      clearInterval(every);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId, refresh]);

  return {
    contacts: contacts && contacts.userId === userId ? contacts.list : undefined,
    error,
    refresh,
  };
}
