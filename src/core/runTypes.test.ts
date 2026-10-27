import { describe, expect, it } from 'vitest';
import { RUN_GROUPS, RUN_TYPES, runTitle, runTypeFor } from './runTypes.ts';

describe('run types', () => {
  it('have unique ids and names, a known group and a description', () => {
    expect(new Set(RUN_TYPES.map((t) => t.id)).size).toBe(RUN_TYPES.length);
    expect(new Set(RUN_TYPES.map((t) => t.name)).size).toBe(RUN_TYPES.length);
    for (const t of RUN_TYPES) {
      expect(RUN_GROUPS).toContain(t.group);
      expect(t.how.length).toBeGreaterThan(20);
    }
  });

  it('titles interval sessions so the list reads well', () => {
    const find = (id: string) => RUN_TYPES.find((t) => t.id === id)!;
    expect(runTitle(find('tempo'))).toBe('Tempo run');
    expect(runTitle(find('intervals-400'))).toBe('Intervals: 8 × 400 m');
    expect(runTitle(find('intervals-time'))).toBe('Time intervals');
  });

  it("matches a program session's run to a type", () => {
    expect(runTypeFor({ type: 'run', runType: 'tempo', durationS: 1200 })?.id).toBe('tempo');
    expect(runTypeFor({ type: 'run', runType: 'walk_run' })?.id).toBe('walk-run');
    expect(runTypeFor({ type: 'run', runType: 'intervals' })?.id).toBe('intervals-time');
    expect(
      runTypeFor({ type: 'lift', exercise: 'Squat', sets: 3, reps: 5, amrapLastSet: false }),
    ).toBeUndefined();
  });
});
