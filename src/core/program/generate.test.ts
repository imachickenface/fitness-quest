import { describe, expect, it } from 'vitest';
import { Program as ProgramSchema } from '../../contract.ts';
import {
  generateProgram,
  isoDay,
  nextSession,
  programWeek,
  sessionOn,
  type ProgramInput,
} from './generate.ts';

const base: ProgramInput = {
  id: 'p1',
  goal: 'build_muscle',
  style: 'bodybuilding',
  daysPerWeek: 3,
  longestM: 0,
  exercises: () => ['Bench press', 'Barbell row'],
  startDate: '2026-11-02', // a Monday
  now: '2026-10-29T10:00:00+00:00',
};

describe('generateProgram', () => {
  it('lifting goals get the split as a valid program', () => {
    const p = generateProgram(base);
    if ('error' in p) throw new Error('no program');
    expect(ProgramSchema.parse(p)).toEqual(p);
    expect(p).toMatchObject({ goal: 'build_muscle', weeks: 12, daysPerWeek: 3, active: true });
    expect(p.sessions[0]!.title).toBe('Chest & back');
  });

  it('running goals get a running plan; the marathon needs a base', () => {
    const p = generateProgram({ ...base, goal: 'five_k' });
    if ('error' in p) throw new Error('no program');
    expect(p.weeks).toBe(9);
    expect(p.sessions[0]!.items[0]!.type).toBe('run');
    expect(generateProgram({ ...base, goal: 'marathon', longestM: 5000 })).toEqual({
      error: 'needs-base',
    });
  });
});

describe('finding sessions by date', () => {
  const p = generateProgram(base);
  if ('error' in p) throw new Error('no program');

  it('knows the week and weekday', () => {
    expect(programWeek(p, '2026-11-01')).toBe(0);
    expect(programWeek(p, '2026-11-02')).toBe(1);
    expect(programWeek(p, '2026-11-08')).toBe(1);
    expect(programWeek(p, '2026-11-09')).toBe(2);
    expect(isoDay('2026-11-02')).toBe(1);
    expect(isoDay('2026-11-08')).toBe(7);
  });

  it("finds today's session and the next one", () => {
    expect(sessionOn(p, '2026-11-02')?.title).toBe('Chest & back');
    expect(sessionOn(p, '2026-11-03')).toBeUndefined(); // a rest day
    expect(nextSession(p, '2026-11-03')).toMatchObject({
      date: '2026-11-04',
      session: { title: 'Shoulders & arms' },
    });
    expect(nextSession(p, '2026-10-29')).toMatchObject({ date: '2026-11-02' });
  });
});
