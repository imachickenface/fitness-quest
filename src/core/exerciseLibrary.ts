/**
 * The exercise library: ~870 exercises from free-exercise-db (public domain), slimmed into
 * public/exercises.json by art/slim_exercises.py. Ranked lifts carry the app's own name (`name`) and the
 * library's (`alt`), so logging them keeps ranks and progression working.
 *
 * Search is forgiving on purpose: case, hyphens and spaces don't matter ("pullup" finds "Pull-up"), words can
 * come in any order as word prefixes ("press dumb"), and the app's aliases count ("flat bench").
 */
import { exerciseKey } from '../contract.ts';
import { EXERCISES } from './exercises.ts';

export type Muscle =
  | 'abdominals'
  | 'abductors'
  | 'adductors'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'forearms'
  | 'glutes'
  | 'hamstrings'
  | 'lats'
  | 'lower back'
  | 'middle back'
  | 'neck'
  | 'quadriceps'
  | 'shoulders'
  | 'traps'
  | 'triceps';

export type Equipment =
  | 'bands'
  | 'barbell'
  | 'body only'
  | 'cable'
  | 'dumbbell'
  | 'e-z curl bar'
  | 'exercise ball'
  | 'foam roll'
  | 'kettlebells'
  | 'machine'
  | 'medicine ball'
  | 'other';

export type BodyPart = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';
export const BODY_PARTS: BodyPart[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

/** One exercise of public/exercises.json. */
export type LibraryExercise = {
  id: string;
  name: string;
  /** the library's own name when `name` is the app's name for a ranked lift */
  alt?: string;
  /** id in EXERCISES (src/core/exercises.ts) */
  ranked?: string;
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  level: 'beginner' | 'intermediate' | 'expert';
  category: string;
  steps: string[];
};

const PARTS: Record<Muscle, BodyPart> = {
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
  shoulders: 'shoulders',
  neck: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  abdominals: 'core',
};

export function bodyPart(m: Muscle): BodyPart {
  return PARTS[m];
}

/** The name a picked exercise is logged under. */
export function logName(e: LibraryExercise): string {
  return e.name;
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const compact = (s: string) => normalise(s).replace(/ /g, '');
const words = (s: string) => normalise(s).split(' ').filter(Boolean);

const ALIASES = new Map(EXERCISES.map((x) => [x.id, x.aliases]));

/** Best match tier of the query against one item's names: 0 whole name .. 3 substring; undefined = no match. */
function tier(item: LibraryExercise, q: string): number | undefined {
  const qc = q.replace(/ /g, '');
  const qw = q.split(' ');
  const haystacks = [
    item.name,
    ...(item.alt ? [item.alt] : []),
    ...((item.ranked && ALIASES.get(item.ranked)) || []),
  ];
  let best: number | undefined;
  for (const h of haystacks) {
    const hc = compact(h);
    const hw = words(h);
    const t =
      hc === qc
        ? 0
        : hc.startsWith(qc)
          ? 1
          : qw.every((w) => hw.some((x) => x.startsWith(w)))
            ? 2
            : hc.includes(qc)
              ? 3
              : undefined;
    if (t !== undefined && (best === undefined || t < best)) best = t;
  }
  return best;
}

export function searchLibrary(
  items: LibraryExercise[],
  opts: {
    query: string;
    part?: BodyPart;
    equipment?: Equipment;
    recent?: string[];
    limit?: number;
  },
): LibraryExercise[] {
  const q = normalise(opts.query);
  const recent = (opts.recent ?? []).map(exerciseKey);
  const recentIndex = (item: LibraryExercise) => {
    const keys = [exerciseKey(item.name), ...(item.alt ? [exerciseKey(item.alt)] : [])];
    const i = recent.findIndex((r) => keys.includes(r));
    return i === -1 ? Infinity : i;
  };

  const scored: { item: LibraryExercise; tier: number; recent: number }[] = [];
  for (const item of items) {
    if (opts.part && !item.primary.some((m) => PARTS[m] === opts.part)) continue;
    if (opts.equipment && item.equipment !== opts.equipment) continue;
    const t = q === '' ? 0 : tier(item, q);
    if (t === undefined) continue;
    scored.push({ item, tier: t, recent: recentIndex(item) });
  }

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.recent === b.recent ? 0 : a.recent < b.recent ? -1 : 1) ||
      Number(Boolean(b.item.ranked)) - Number(Boolean(a.item.ranked)) ||
      a.item.name.toLowerCase().localeCompare(b.item.name.toLowerCase()),
  );
  return scored.slice(0, opts.limit ?? 100).map((s) => s.item);
}
