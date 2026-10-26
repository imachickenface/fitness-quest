import { exerciseKey, type SetEntry, type Workout } from '../contract.ts';

export type RecentExercise = { name: string; sets: SetEntry[] };

/** Most recent first, one per exercise, with the sets from the last time it was done. */
export function recentExercises(workouts: Workout[], limit = 10): RecentExercise[] {
  const seen = new Set<string>();
  const out: RecentExercise[] = [];
  for (const w of workouts) {
    if (w.kind === 'run') continue;
    for (const e of w.exercises) {
      const k = exerciseKey(e.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: e.name, sets: e.sets });
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** "27:30" (mm:ss), "1:05:00" (h:mm:ss) or "27" (minutes) -> seconds; null if unreadable. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p)) || parts.length > 3) return null;
  const n = parts.map(Number);
  if (n.length === 1) return Math.round(n[0]! * 60);
  if (n.slice(1).some((v) => v >= 60)) return null;
  return n.length === 2 ? n[0]! * 60 + n[1]! : n[0]! * 3600 + n[1]! * 60 + n[2]!;
}

export function formatPace(distanceM: number, durationS: number): string {
  const perKm = durationS / (distanceM / 1000);
  const m = Math.floor(perKm / 60);
  const s = Math.round(perKm % 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, '0')} /km`;
}
