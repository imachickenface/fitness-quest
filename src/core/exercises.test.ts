import { describe, expect, it } from 'vitest';
import { EXERCISES, findExercise } from './exercises.ts';

describe('findExercise', () => {
  it.each([
    ['Bench', 'bench-press'],
    ['flat bench press', 'bench-press'],
    ['BB Bench', 'bench-press'],
    ['Pull-up', 'pull-up'],
    ['pull up', 'pull-up'],
    ['Pull ups', 'pull-up'],
    ['OHP', 'overhead-press'],
    ['Lateral raises', 'lateral-raise'],
    ['RDL', 'romanian-deadlift'],
    ['Squats', 'squat'],
    ['  db   curl ', 'dumbbell-curl'],
  ])('%s -> %s', (name, id) => {
    expect(findExercise(name)?.id).toBe(id);
  });

  it('is undefined for unknown names', () => {
    expect(findExercise('Underwater basket weaving')).toBeUndefined();
  });

  it('has unique ids and no alias shared by two exercises', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    const seen = new Map<string, string>();
    for (const e of EXERCISES) {
      for (const a of [e.name, ...e.aliases]) {
        const owner = seen.get(a.toLowerCase());
        expect(owner === undefined || owner === e.id, `${a} is used by ${owner} and ${e.id}`).toBe(
          true,
        );
        seen.set(a.toLowerCase(), e.id);
      }
    }
  });
});
