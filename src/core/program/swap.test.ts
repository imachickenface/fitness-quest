import { describe, expect, it } from 'vitest';
import type { PlannedSession, Program } from '../../contract.ts';
import { moveToToday } from './swap.ts';

const lift = { type: 'lift', exercise: 'Squat', sets: 3, reps: 5, amrapLastSet: false } as const;
const session = (id: string, week: number, day: number): PlannedSession => ({
  id,
  week,
  day,
  title: id,
  items: [lift],
});

// starts Monday 2026-10-19; 2026-10-29 is the Thursday (day 4) of week 2
const program = (extra: PlannedSession[] = []): Program => ({
  id: 'p1',
  goal: 'build_muscle',
  startDate: '2026-10-19',
  daysPerWeek: 4,
  weeks: 12,
  sessions: [
    session('w1-mon', 1, 1),
    session('w1-thu', 1, 4),
    session('mon', 2, 1),
    session('wed', 2, 3),
    session('thu', 2, 4),
    session('sat', 2, 6),
    ...extra,
    session('w3-mon', 3, 1),
  ],
  progression: [],
  active: true,
  createdAt: '2026-10-19T08:00:00.000Z',
});

const THU = '2026-10-29';
const none = new Set<string>();
const days = (p: Program | { error: string }) =>
  'error' in p ? p : Object.fromEntries(p.sessions.map((s) => [s.id, `${s.week}/${s.day}`]));

describe('moveToToday', () => {
  it('swaps a later session with today', () => {
    expect(days(moveToToday(program(), 'sat', THU, none))).toEqual({
      'w1-mon': '1/1',
      'w1-thu': '1/4',
      mon: '2/1',
      wed: '2/3',
      thu: '2/6',
      sat: '2/4',
      'w3-mon': '3/1',
    });
  });

  it('pulls a missed session into today and moves today to the next rest day', () => {
    expect(days(moveToToday(program(), 'wed', THU, none))).toMatchObject({
      wed: '2/4',
      thu: '2/5',
      sat: '2/6',
    });
  });

  it('puts today into the missed slot when no rest day is left this week', () => {
    const p = program([session('fri', 2, 5), session('sun', 2, 7)]);
    expect(days(moveToToday(p, 'wed', THU, none))).toMatchObject({
      wed: '2/4',
      thu: '2/3',
      fri: '2/5',
      sat: '2/6',
      sun: '2/7',
    });
  });

  it('moves a session onto a rest day without touching the others', () => {
    // Friday 2026-10-30 has no session
    expect(days(moveToToday(program(), 'sat', '2026-10-30', none))).toMatchObject({
      thu: '2/4',
      sat: '2/5',
    });
  });

  it('refuses sessions it must not move', () => {
    expect(moveToToday(program(), 'sat', THU, new Set(['sat']))).toEqual({ error: 'done' });
    expect(moveToToday(program(), 'thu', THU, none)).toEqual({ error: 'already-today' });
    expect(moveToToday(program(), 'w3-mon', THU, none)).toEqual({ error: 'not-this-week' });
    expect(moveToToday(program(), 'w1-mon', THU, none)).toEqual({ error: 'not-this-week' });
    expect(moveToToday(program(), 'nope', THU, none)).toEqual({ error: 'not-found' });
    expect(moveToToday(program(), 'sat', THU, new Set(['thu']))).toEqual({ error: 'today-done' });
    expect(moveToToday(program(), 'mon', '2026-10-12', none)).toEqual({ error: 'not-this-week' });
  });

  it('returns a new program and leaves the old one as it was', () => {
    const p = program();
    const before = JSON.stringify(p);
    const moved = moveToToday(p, 'sat', THU, none);
    expect(JSON.stringify(p)).toBe(before);
    expect(moved).not.toBe(p);
    if ('error' in moved) throw new Error(moved.error);
    expect(moved.sessions.map((s) => s.id)).toEqual(p.sessions.map((s) => s.id));
    expect({ ...moved, sessions: [] }).toEqual({ ...p, sessions: [] });
  });
});
