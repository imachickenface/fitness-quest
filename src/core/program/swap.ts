/**
 * Pulling a session into today when a day was missed or a session was skipped.
 *
 * Pure like the rest of `src/core/`: the input program is never mutated; a new `Program` with a new
 * `sessions` array comes back, and only the sessions that move become new objects.
 */
import type { PlannedSession, Program } from '../../contract.ts';
import { isoDay, programWeek } from './generate.ts';

/** Why the move was refused. */
export type SwapError = 'not-found' | 'not-this-week' | 'done' | 'already-today' | 'today-done';

/**
 * Move a session of the current week onto today. Today's session (if any) takes the day the moved
 * session came from: a straight swap when it came from a later day, otherwise the first rest day after
 * today, falling back to that same swap when the week has no rest day left.
 */
export function moveToToday(
  program: Program,
  sessionId: string,
  today: string,
  done: ReadonlySet<string>,
): Program | { error: SwapError } {
  const picked = program.sessions.find((s) => s.id === sessionId);
  if (picked === undefined) return { error: 'not-found' };

  const week = programWeek(program, today);
  if (week === 0 || picked.week !== week) return { error: 'not-this-week' };
  if (done.has(sessionId)) return { error: 'done' };

  const todayDay = isoDay(today);
  if (picked.day === todayDay) return { error: 'already-today' };

  const current = program.sessions.find((s) => s.week === week && s.day === todayDay);
  if (current !== undefined && done.has(current.id)) return { error: 'today-done' };

  // Where today's session goes: the slot the picked session vacated...
  let currentDay = picked.day;
  if (current !== undefined && picked.day < todayDay) {
    // ...unless that slot is in the past, so take the first rest day after today instead.
    const used = new Set(program.sessions.filter((s) => s.week === week).map((s) => s.day));
    for (let d = todayDay + 1; d <= 7; d += 1) {
      if (!used.has(d)) {
        currentDay = d;
        break;
      }
    }
  }

  const sessions: PlannedSession[] = program.sessions.map((s) => {
    if (s.id === sessionId) return { ...s, day: todayDay };
    if (current !== undefined && s.id === current.id) return { ...s, day: currentDay };
    return s;
  });
  return { ...program, sessions };
}
