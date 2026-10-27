/**
 * A program from a goal: running goals get a running plan, everything else a lifting plan on the Arnold split
 * (weight loss adds cardio days). Weights aren't stored: the progression calculator fills them in when a session
 * starts, from the player's latest bests.
 */
import type { Goal, PlannedSession, Program } from '../../contract.ts';
import { addDays } from '../dates.ts';
import type { Style } from '../progression.ts';
import { liftPlan } from './lifting.ts';
import { runPlan } from './running.ts';

export const RUN_GOALS: Goal[] = ['five_k', 'ten_k', 'half_marathon', 'marathon', 'cardio'];

export type ProgramInput = {
  id: string;
  goal: Goal;
  style: Style;
  daysPerWeek: number;
  /** longest recent run, for running plans that need a base */
  longestM: number;
  /** exercise names for a split day, most important first */
  exercises: (dayId: string) => string[];
  /** the Monday week 1 starts on */
  startDate: string;
  now: string;
};

export function generateProgram(input: ProgramInput): Program | { error: 'needs-base' } {
  const plan = RUN_GOALS.includes(input.goal)
    ? runPlan(input.goal, { daysPerWeek: input.daysPerWeek, longestM: input.longestM })
    : liftPlan(input);
  if ('error' in plan) return plan;
  return {
    id: input.id,
    goal: input.goal,
    startDate: input.startDate,
    daysPerWeek: Math.min(6, Math.max(2, input.goal === 'five_k' ? 3 : input.daysPerWeek)),
    weeks: plan.weeks,
    sessions: plan.sessions,
    progression: [],
    active: true,
    createdAt: input.now,
  };
}

/** Week number (1-based) of a date in the program; 0 before it starts, beyond `weeks` after it ends. */
export function programWeek(program: Program, date: string): number {
  const days = Math.round((Date.parse(date) - Date.parse(program.startDate)) / 86_400_000);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

/** ISO weekday (1 = Monday) of a local date string. */
export function isoDay(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The session planned for a date, if any. */
export function sessionOn(program: Program, date: string): PlannedSession | undefined {
  const week = programWeek(program, date);
  const day = isoDay(date);
  return program.sessions.find((s) => s.week === week && s.day === day);
}

/** The next session on or after a date, with its date. */
export function nextSession(
  program: Program,
  date: string,
): { session: PlannedSession; date: string } | undefined {
  for (let i = 0; i < 14; i++) {
    const d = addDays(date, i);
    const session = sessionOn(program, d);
    if (session) return { session, date: d };
  }
  return undefined;
}
