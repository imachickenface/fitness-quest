import { backupFileName, makeBackup } from '../core/backup.ts';
import { addDays } from '../core/dates.ts';
import { localDate } from '../core/diary.ts';
import { exportTables, updateSettings, type FitnessDb } from '../db/db.ts';
import { nowStamp } from './format.ts';

/** Download everything as a backup file and remember when. */
export async function saveBackup(db: FitnessDb): Promise<void> {
  const backup = makeBackup(await exportTables(db), nowStamp());
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(localDate(new Date()));
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await updateSettings(db, { lastBackupAt: backup.exportedAt });
}

/** Days since the last backup when a reminder is due (7+), else null. Never backed up counts from the first day of use. */
export function backupDue(
  lastBackupAt: string | undefined,
  firstDay: string | undefined,
  today: string,
): number | null {
  const since = lastBackupAt ? localDate(new Date(lastBackupAt)) : firstDay;
  if (!since || since > addDays(today, -7)) return null;
  return Math.round((Date.parse(today) - Date.parse(since)) / 86_400_000);
}
