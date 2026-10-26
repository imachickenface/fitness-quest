import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { getProfile, openDb, type FitnessDb } from '../db/db.ts';
import { DbContext, useDb } from './dbContext.ts';
import { ProfileForm } from './ProfileForm.tsx';
import { Today } from './Today.tsx';

export function App({ db }: { db?: FitnessDb }) {
  const [database] = useState(() => db ?? openDb());
  return (
    <DbContext.Provider value={database}>
      <Main />
    </DbContext.Provider>
  );
}

function Main() {
  const db = useDb();
  const profile = useLiveQuery(async () => (await getProfile(db)) ?? null, [db]);

  if (profile === undefined) return <main className="title-screen" aria-busy="true" />;
  if (profile === null) return <Welcome />;
  return (
    <main>
      <Today profile={profile} />
    </main>
  );
}

function Welcome() {
  return (
    <main className="welcome">
      <div className="title-block">
        <img className="title-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <h1>Fitness Quest</h1>
        <p className="muted">A few numbers to set your daily calorie target.</p>
      </div>
      <ProfileForm onSaved={() => undefined} />
    </main>
  );
}
