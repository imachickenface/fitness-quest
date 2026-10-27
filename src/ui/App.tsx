import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { getProfile, openDb, type FitnessDb } from '../db/db.ts';
import { AccountProvider } from './account.tsx';
import { AccountPanel, FirstSyncSheet } from './AccountPanel.tsx';
import { useAccount } from './accountContext.ts';
import { DbContext, useDb } from './dbContext.ts';
import { ProfileForm } from './ProfileForm.tsx';
import { Shell } from './Shell.tsx';

export function App({ db }: { db?: FitnessDb }) {
  const [database] = useState(() => db ?? openDb());
  return (
    <DbContext.Provider value={database}>
      <AccountProvider>
        <Main />
        <FirstSyncSheet />
      </AccountProvider>
    </DbContext.Provider>
  );
}

function Main() {
  const db = useDb();
  const profile = useLiveQuery(async () => (await getProfile(db)) ?? null, [db]);

  if (profile === undefined) return <main className="title-screen" aria-busy="true" />;
  if (profile === null) return <Welcome />;
  return <Shell profile={profile} />;
}

function Welcome() {
  const account = useAccount();
  return (
    <main className="welcome">
      <div className="title-block">
        <img className="title-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <h1>Fitness Quest</h1>
        <p className="muted">A few numbers to set your daily calorie target.</p>
      </div>
      {account.status === 'signed-in' && (
        <p className="restoring" aria-live="polite">
          Signed in as <b>{account.email}</b>.{' '}
          {account.sync === 'syncing'
            ? 'Bringing your data to this phone…'
            : 'No profile in your account yet: fill it in below to start.'}
        </p>
      )}
      <ProfileForm onSaved={() => undefined} />
      <div className="welcome-account">
        {account.status === 'signed-out' && (
          <p className="muted">
            Used Fitness Quest on another phone? Sign in to bring your data here.
          </p>
        )}
        <AccountPanel />
      </div>
    </main>
  );
}
