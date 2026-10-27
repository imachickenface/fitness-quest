import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import type { Backup, Settings } from '../contract.ts';
import { readBackup, type TableCounts } from '../core/backup.ts';
import { localDate } from '../core/diary.ts';
import { getSettings, restoreTables } from '../db/db.ts';
import { saveBackup } from './backupActions.ts';
import { useAccount } from './accountContext.ts';
import { useDb } from './dbContext.ts';
import { dayTitle } from './format.ts';

const NO_SETTINGS: Settings = {};

const ERRORS = {
  'not-json': "This isn't a Fitness Quest backup file.",
  'not-a-backup': "This isn't a Fitness Quest backup file.",
  'newer-version':
    'This backup is from a newer version of the app. Reload the app to update it, then try again.',
  invalid: "This backup file is damaged, so it can't be restored.",
} as const;

/** Save everything to a file, or replace everything from one. Data lives only on this phone. */
export function BackupPanel({ onRestored }: { onRestored: (text: string) => void }) {
  const db = useDb();
  const account = useAccount();
  const settings = useLiveQuery(() => getSettings(db), [db], NO_SETTINGS);
  const today = localDate(new Date());
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; counts: TableCounts } | null>(null);

  async function pick(f: File | undefined) {
    setError(null);
    setPending(null);
    if (!f) return;
    const r = readBackup(await f.text());
    if (r.ok) setPending(r);
    else setError(ERRORS[r.error]);
  }

  async function restore() {
    if (!pending) return;
    const { tables, exportedAt } = pending.backup;
    await restoreTables(db, {
      ...tables,
      settings: { ...tables.settings, lastBackupAt: exportedAt },
    });
    setPending(null);
    onRestored('Backup restored');
  }

  const last = settings.lastBackupAt
    ? dayTitle(localDate(new Date(settings.lastBackupAt)), today)
    : null;

  return (
    <section className="backup" aria-labelledby="backup-title">
      <h2 id="backup-title">Your data</h2>
      <p className="muted">
        {account.status === 'signed-in'
          ? 'Stored on this phone and synced to your account.'
          : 'Everything is stored only on this phone.'}{' '}
        {last
          ? `Last backup: ${/^(Today|Yesterday)$/.test(last) ? last.toLowerCase() : last}.`
          : 'No backup yet.'}
      </p>
      <div className="backup-actions">
        <button type="button" className="btn btn-primary" onClick={() => void saveBackup(db)}>
          Save a backup
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Restore from a file
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      {pending && (
        <div className="restore-confirm" role="alertdialog" aria-label="Restore this backup?">
          <p>
            Backup from <b>{dayTitle(localDate(new Date(pending.backup.exportedAt)), today)}</b>:{' '}
            {count(pending.counts.foodEntries, 'food entry', 'food entries')},{' '}
            {count(pending.counts.workouts, 'workout', 'workouts')},{' '}
            {count(pending.counts.weighIns, 'weigh-in', 'weigh-ins')}. Restoring replaces everything
            on this phone.
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Keep my data
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void restore()}>
              Replace my data
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
