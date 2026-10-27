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
  onStart: (session: PlannedSession) => void;
  onStop: () => void;
};

/** The active program: this week at a glance and the next session to do. */
export function ProgramCard({ program, workouts, today, onStart, onStop }: CardProps) {
  const week = programWeek(program, today);
  const done = new Set(workouts.flatMap((w) => (w.programSessionId ? [w.programSessionId] : [])));
  const next = nextSession(program, today);
  const monday = addDays(today, 1 - isoDay(today));
  const finished = week > program.weeks;
  // sessions before the day the program was started don't count as missed
  const started = localDate(new Date(program.createdAt));

  return (
    <section className="panel next-up program" aria-labelledby="program-title">
      <p className="muted next-label">
        {GOAL_NAMES[program.goal]} ·{' '}
        {week === 0 ? 'starts Monday' : finished ? 'finished!' : `week ${week} of ${program.weeks}`}
      </p>
      <ol className="week-strip" aria-label="This week">
        {WEEKDAYS.map((label, i) => {
          const date = addDays(monday, i);
          const session = program.sessions.find(
            (s) => s.week === programWeek(program, date) && s.day === i + 1,
          );
          const state = !session
            ? 'rest'
            : done.has(session.id)
              ? 'done'
              : date < today && date >= started
                ? 'missed'
                : date < today
                  ? 'rest'
                  : 'planned';
          return (
            <li
              key={date}
              className={`week-day ${state}${date === today ? ' today' : ''}`}
              aria-label={`${dayTitle(date, today)}: ${session ? `${session.title}, ${state}` : 'rest'}`}
            >
              {label}
            </li>
          );
        })}
      </ol>
      {next && !finished ? (
        <>
          <h2 id="program-title">
            {next.date === today ? 'Today' : dayTitle(next.date, today)}: {next.session.title}
          </h2>
          <p className="muted next-list">{next.session.items.map(describeItem).join(' · ')}</p>
          {done.has(next.session.id) ? (
            <p className="done-note">Done. Nice work!</p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onStart(next.session)}>
              Start {next.session.title.replace(' (deload)', '').toLowerCase()}
            </button>
          )}
        </>
      ) : (
        <h2 id="program-title">{finished ? 'Program complete' : 'Rest week'}</h2>
      )}
      <button type="button" className="link-btn" onClick={onStop}>
        {finished ? 'Start a new program' : 'Stop program'}
      </button>
    </section>
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
