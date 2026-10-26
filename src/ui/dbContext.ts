import { createContext, useContext } from 'react';
import type { FitnessDb } from '../db/db.ts';

export const DbContext = createContext<FitnessDb | null>(null);

export function useDb(): FitnessDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb() used outside <DbContext.Provider>');
  return db;
}
