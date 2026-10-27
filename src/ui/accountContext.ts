import { createContext, useContext } from 'react';
import type { FirstSyncChoice } from '../sync/engine.ts';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export type Account =
  | { status: 'checking' }
  | { status: 'signed-out'; error?: string }
  | {
      status: 'signed-in';
      email: string;
      sync: SyncStatus;
      lastSyncedAt?: string;
      /** set when this phone and the account both have data and the user must choose */
      firstSyncChoice: boolean;
      error?: string;
    };

export type Actions = {
  signIn: () => Promise<void>;
  signInTest: (email: string, password: string) => Promise<void>;
  signOut: (clearPhone: boolean) => Promise<void>;
  deleteAccount: () => Promise<void>;
  syncNow: () => void;
  chooseFirstSync: (choice: FirstSyncChoice) => Promise<void>;
};

export const AccountContext = createContext<(Account & Actions) | null>(null);

export function useAccount(): Account & Actions {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount() used outside <AccountProvider>');
  return value;
}
