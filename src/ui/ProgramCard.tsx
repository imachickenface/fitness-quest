import { useState } from 'react';
import type { Goal, PlannedSession, Program, Workout } from '../contract.ts';
import { addDays } from '../core/dates.ts';
import { localDate } from '../core/diary.ts';
import { isoDay, nextSession, programWeek, RUN_GOALS } from '../core/program/generate.ts';
import { Sheet } from './Sheet.tsx';
import { dayTitle } from './format.ts';
import { describeItem, GOAL_NAMES } from './programFormat.ts';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type CardProps = {
  program: Program;
  workouts: Workout[];
  today: string;
  /** the effort to aim for this week, shown with the next session */
  aim: string;
  onStart: (session: PlannedSession) => void;
  /** move a session of this week to today; returns a problem to show, or null */
  onMove: (session: PlannedSession) => string | null;
  onStop: () => void;
};

type DayState = 'rest' | 'done' | 'missed' | 'planned';

/** This week's days with their session and state, Monday first. */
function weekDays(program: Program, workouts: Workout[], today: string) {
  const done = new Set(workouts.flatMap((w) => (w.programSessionId ? [w.programSessionId] : [])));
  const monday = addDays(today, 1 - isoDay(today));
  // sessions before the day the program was started don't count as missed
  const started = localDate(new Date(program.createdAt));
  return WEEKDAYS.map((label, i) => {
    const date = addDays(monday, i);
    const session = program.sessions.find(
      (s) => s.week === programWeek(program, date) && s.day === i + 1,
    );
    const state: DayState = !session
      ? 'rest'
      : done.has(session.id)
        ? 'done'
        : date < today && date >= started
          ? 'missed'
          : date < today
            ? 'rest'
            : 'planned';
    return { label, date, session, state };
  });
}

/** The active program: this week at a glance and the next session to do. */
export function ProgramCard({ program, workouts, today, aim, onStart, onMove, onStop }: CardProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const week = programWeek(program, today);
  const days = weekDays(program, workouts, today);
  const done = new Set(
    days.flatMap((d) => (d.state === 'done' && d.session ? [d.session.id] : [])),
  );
  const next = nextSession(program, today);
  const finished = week > program.weeks;
  const canChange =
    week > 0 && !finished && days.some((d) => d.date !== today && d.state !== 'done' && d.session);

  return (
    <section className="panel next-up program" aria-labelledby="program-title">
      <p className="muted next-label">
        {GOAL_NAMES[program.goal]} ·{' '}
        {week === 0 ? 'starts Monday' : finished ? 'finished!' : `week ${week} of ${program.weeks}`}
      </p>
      <ol className="week-strip" aria-label="This week">
        {days.map(({ label, date, session, state }) => (
          <li key={date}>
            <button
              type="button"
              className={`week-day ${state}${date === today ? ' today' : ''}`}
              aria-label={`${dayTitle(date, today)}: ${session ? `${session.title}, ${state}` : 'rest'}. Show the week`}
              onClick={() => setPicking(date)}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>
      {next && !finished ? (
        <>
          <h2 id="program-title">
            {next.date === today ? 'Today' : dayTitle(next.date, today)}: {next.session.title}
          </h2>
          <p className="muted next-list">
            {next.session.items.map(describeItem).join(' · ')}
            {next.session.items.some((x) => x.type === 'lift') && ` · aim for ${aim}`}
          </p>
          {done.has(next.session.id) ? (
            <p className="done-note">Done. Nice work!</p>
          ) : (
            <div className="next-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onStart(next.session)}
              >
                Start {next.session.title.replace(' (deload)', '').toLowerCase()}
              </button>
              {canChange && (
                <button type="button" className="btn" onClick={() => setPicking(today)}>
                  Change
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <h2 id="program-title">{finished ? 'Program complete' : 'Rest week'}</h2>
      )}
      <button type="button" className="link-btn" onClick={onStop}>
        {finished ? 'Start a new program' : 'Stop program'}
      </button>
      {picking && (
        <WeekSheet
          days={days}
          today={today}
          focus={picking}
          movable={week > 0 && !finished}
          onStart={(s) => {
            setPicking(null);
            onStart(s);
          }}
          onMove={onMove}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  );
}

const STATE_WORDS: Record<DayState, string> = {
  rest: 'Rest',
  done: 'Done',
  missed: 'Missed',
  planned: 'Planned',
};

/** The week as a list: each day's session, with "Do it today" to swap it with today's. */
function WeekSheet({
  days,
  today,
  focus,
  movable,
  onStart,
  onMove,
  onClose,
}: {
  days: ReturnType<typeof weekDays>;
  today: string;
  focus: string;
  movable: boolean;
  onStart: (session: PlannedSession) => void;
  onMove: (session: PlannedSession) => string | null;
  onClose: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const todayDone = days.some((d) => d.date === today && d.state === 'done');
  return (
    <Sheet title="This week" onClose={onClose}>
      <p className="muted">
        Pick a workout to do today. It swaps places with today's, and the calendar shows the new
        order.
      </p>
      {problem && <p className="form-error">{problem}</p>}
      <ol className="week-list">
        {days.map(({ date, session, state }) => (
          <li
            key={date}
            className={`week-row${date === focus ? ' focus' : ''}${date === today ? ' is-today' : ''}`}
          >
            <span className={`week-day ${state}`} aria-hidden="true">
              {WEEKDAYS[isoDay(date) - 1]}
            </span>
            <div className="week-row-text">
              <b>
                {dayTitle(date, today)}
                {session ? `: ${session.title}` : ''}
              </b>
              <span className="muted">
                {session ? session.items.map(describeItem).join(' · ') : 'Rest day'}
              </span>
              <span className={`week-state ${state}`}>
                {/* a session from before the program started was never due */}
                {session && state === 'rest' ? 'Not due' : STATE_WORDS[state]}
              </span>
            </div>
            {session && state !== 'done' && date === today && (
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => onStart(session)}
              >
                Start
              </button>
            )}
            {session && state !== 'done' && date !== today && movable && !todayDone && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  const p = onMove(session);
                  if (p) setProblem(p);
                  else onClose();
                }}
              >
                Do it today
              </button>
            )}
          </li>
        ))}
      </ol>
      {todayDone && <p className="muted">Today's workout is done, so the week stays as it is.</p>}
    </Sheet>
  );
}

type SheetProps = {
  goal: Goal;
  longestM: number;
  onStart: (goal: Goal, daysPerWeek: number) => string | null;
  onClose: () => void;
};

/** Choose a goal and training days; the plan is built from them. */
export function ProgramSheet({ goal: initial, longestM, onStart, onClose }: SheetProps) {
  const [goal, setGoal] = useState<Goal>(initial);
  const running = RUN_GOALS.includes(goal);
  const [days, setDays] = useState(running ? 3 : 4);
  const [error, setError] = useState<string | null>(null);
  const options =
    goal === 'five_k' || goal === 'lose_weight' ? [3] : running ? [3, 4, 5] : [3, 4, 5, 6];
  const about: Partial<Record<Goal, string>> = {
    five_k: '9 weeks: walk/run intervals building to 30 minutes non-stop, then a 5K.',
    ten_k: '8 weeks: an easy run, a faster run and a long run each week, ending with a 10K.',
    half_marathon: '12 weeks: long runs up to 19 km, lighter weeks to recover, then race day.',
    marathon: '18 weeks: long runs up to 32 km, cut-back weeks, a 3-week taper and race day.',
    cardio: '8 weeks of steady runs, from 20 to about 37 minutes.',
    lose_weight: '12 weeks: 3 lifting days on your split plus 2 cardio days, with deload weeks.',
  };

  return (
    <Sheet title="Start a program" onClose={onClose}>
      <label className="field">
        <span>Goal</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
          {(Object.keys(GOAL_NAMES) as Goal[]).map((g) => (
            <option key={g} value={g}>
              {GOAL_NAMES[g]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        {about[goal] ?? '12 weeks of the Arnold split, with deload weeks to recover.'}
        {goal === 'marathon' &&
          longestM < 8000 &&
          ' You need to run 8 km first: try the half marathon plan.'}
      </p>
      {options.length > 1 && (
        <fieldset className="segmented">
          <legend>{running ? 'Runs' : 'Training days'} a week</legend>
          {options.map((n) => (
            <label key={n}>
              <input type="radio" name="days" checked={days === n} onChange={() => setDays(n)} />
              <span>{n}</span>
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setError(onStart(goal, options.includes(days) ? days : options[0]!))}
        >
          Start program
        </button>
      </div>
    </Sheet>
  );
}
