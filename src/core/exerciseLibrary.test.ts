import { describe, expect, it } from 'vitest';
import {
  bodyPart,
  logName,
  searchLibrary,
  type LibraryExercise,
  type Muscle,
} from './exerciseLibrary.ts';

const ex = (
  id: string,
  name: string,
  primary: Muscle[],
  equipment: LibraryExercise['equipment'],
  more: Partial<LibraryExercise> = {},
): LibraryExercise => ({
  id,
  name,
  primary,
  secondary: [],
  equipment,
  level: 'beginner',
  category: 'strength',
  steps: ['Do it.'],
  ...more,
});

const bench = ex('Barbell_Bench_Press_-_Medium_Grip', 'Bench press', ['chest'], 'barbell', {
  alt: 'Barbell Bench Press - Medium Grip',
  ranked: 'bench-press',
});
const closeBench = ex(
  'Close-Grip_Barbell_Bench_Press',
  'Close-Grip Barbell Bench Press',
  ['triceps'],
  'barbell',
);
const dbBench = ex('Dumbbell_Bench_Press', 'Dumbbell bench press', ['chest'], 'dumbbell', {
  alt: 'Dumbbell Bench Press',
  ranked: 'dumbbell-bench-press',
});
const benchDips = ex('Bench_Dips', 'Bench Dips', ['triceps'], 'body only', {
  level: 'intermediate',
});
const pullups = ex('Pullups', 'Pull-up', ['lats'], 'body only', {
  alt: 'Pullups',
  ranked: 'pull-up',
});
const bandPull = ex('Band_Assisted_Pull-Up', 'Band Assisted Pull-Up', ['lats'], 'other');
const squat = ex('Barbell_Squat', 'Squat', ['quadriceps'], 'barbell', {
  alt: 'Barbell Squat',
  ranked: 'squat',
});
const goblet = ex('Goblet_Squat', 'Goblet Squat', ['quadriceps'], 'kettlebells');
const crunch = ex('Crunches', 'Crunches', ['abdominals'], 'body only');
const shrug = ex('Barbell_Shrug', 'Barbell Shrug', ['traps'], 'barbell', { level: 'expert' });
const calf = ex('Standing_Calf_Raises', 'Calf raise', ['calves'], 'machine', {
  alt: 'Standing Calf Raises',
  ranked: 'calf-raise',
});

const ALL = [
  bench,
  closeBench,
  dbBench,
  benchDips,
  pullups,
  bandPull,
  squat,
  goblet,
  crunch,
  shrug,
  calf,
];
const ids = (xs: LibraryExercise[]) => xs.map((x) => x.id);

describe('bodyPart', () => {
  it('groups the 17 muscles into six parts', () => {
    expect(bodyPart('chest')).toBe('chest');
    for (const m of ['lats', 'middle back', 'lower back', 'traps'] as const)
      expect(bodyPart(m)).toBe('back');
    for (const m of ['shoulders', 'neck'] as const) expect(bodyPart(m)).toBe('shoulders');
    for (const m of ['biceps', 'triceps', 'forearms'] as const) expect(bodyPart(m)).toBe('arms');
    for (const m of [
      'quadriceps',
      'hamstrings',
      'glutes',
      'calves',
      'adductors',
      'abductors',
    ] as const)
      expect(bodyPart(m)).toBe('legs');
    expect(bodyPart('abdominals')).toBe('core');
  });
});

describe('logName', () => {
  it('is the name shown, so ranked lifts log under the app name', () => {
    expect(logName(bench)).toBe('Bench press');
    expect(logName(goblet)).toBe('Goblet Squat');
  });
});

describe('searchLibrary', () => {
  it('without a query lists recent first (in recent order), then ranked lifts, then by name', () => {
    const r = searchLibrary(ALL, { query: '', recent: ['Goblet squat', 'bench press'] });
    expect(ids(r).slice(0, 2)).toEqual(['Goblet_Squat', 'Barbell_Bench_Press_-_Medium_Grip']);
    // then the other ranked lifts by name: Calf raise, Dumbbell bench press, Pull-up, Squat
    expect(ids(r).slice(2, 6)).toEqual([
      'Standing_Calf_Raises',
      'Dumbbell_Bench_Press',
      'Pullups',
      'Barbell_Squat',
    ]);
    // then the rest by name, ignoring case
    expect(ids(r).slice(6)).toEqual([
      'Band_Assisted_Pull-Up',
      'Barbell_Shrug',
      'Bench_Dips',
      'Close-Grip_Barbell_Bench_Press',
      'Crunches',
    ]);
  });

  it('ranks a whole-name match, then name prefixes, then word prefixes, then substrings', () => {
    const r = searchLibrary(ALL, { query: 'bench' });
    // "Bench press" (ranked) and "Bench Dips" start with it; ranked first.
    // Dumbbell bench press and Close-Grip Barbell Bench Press only have a word that starts with it.
    expect(ids(r)).toEqual([
      'Barbell_Bench_Press_-_Medium_Grip',
      'Bench_Dips',
      'Dumbbell_Bench_Press',
      'Close-Grip_Barbell_Bench_Press',
    ]);
    expect(ids(searchLibrary(ALL, { query: 'Bench Press' }))[0]).toBe(
      'Barbell_Bench_Press_-_Medium_Grip',
    );
  });

  it('matches every word, in any order, as word prefixes', () => {
    // 'db bench press' is an alias of Dumbbell bench press
    expect(ids(searchLibrary(ALL, { query: 'press bench db' }))).toEqual(['Dumbbell_Bench_Press']);
    expect(ids(searchLibrary(ALL, { query: 'press dumb' }))).toEqual(['Dumbbell_Bench_Press']);
    expect(ids(searchLibrary(ALL, { query: 'sq gob' }))).toEqual(['Goblet_Squat']);
  });

  it('ignores case, hyphens and spaces: pullup, pull up and pull-up all find pull-ups', () => {
    for (const q of ['pullup', 'pull up', 'PULL-UP', 'pull-ups']) {
      expect(ids(searchLibrary(ALL, { query: q }))[0]).toBe('Pullups');
    }
  });

  it("searches the library's own name and the app's aliases too", () => {
    expect(ids(searchLibrary(ALL, { query: 'medium grip' }))).toEqual([
      'Barbell_Bench_Press_-_Medium_Grip',
    ]);
    // 'flat bench' is an alias of Bench press in src/core/exercises.ts
    expect(ids(searchLibrary(ALL, { query: 'flat bench' }))[0]).toBe(
      'Barbell_Bench_Press_-_Medium_Grip',
    );
    // 'standing calf' is only in the library name
    expect(ids(searchLibrary(ALL, { query: 'standing calf' }))).toEqual(['Standing_Calf_Raises']);
  });

  it('filters by body part (any primary muscle) and equipment', () => {
    expect(ids(searchLibrary(ALL, { query: '', part: 'back' }))).toEqual([
      'Pullups',
      'Band_Assisted_Pull-Up',
      'Barbell_Shrug',
    ]);
    expect(ids(searchLibrary(ALL, { query: 'bench', part: 'arms' }))).toEqual([
      'Bench_Dips',
      'Close-Grip_Barbell_Bench_Press',
    ]);
    expect(ids(searchLibrary(ALL, { query: '', equipment: 'kettlebells' }))).toEqual([
      'Goblet_Squat',
    ]);
    expect(ids(searchLibrary(ALL, { query: 'squat', part: 'legs', equipment: 'barbell' }))).toEqual(
      ['Barbell_Squat'],
    );
  });

  it('ignores punctuation-only queries and never changes its input', () => {
    const copy = structuredClone(ALL);
    expect(searchLibrary(ALL, { query: ' - ' })).toHaveLength(ALL.length);
    expect(ALL).toEqual(copy);
  });

  it('caps the results', () => {
    expect(searchLibrary(ALL, { query: '', limit: 3 })).toHaveLength(3);
  });
});
