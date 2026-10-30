import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import type { ExerciseLog, Goal, PlannedSession, Profile, SetEntry, Workout } from '../contract.ts';
import { addDays } from '../core/dates.ts';
import { effortRow, effortText, logRir } from '../core/effort.ts';
import { localDate } from '../core/diary.ts';
import { findExercise } from '../core/exercises.ts';
import { generateProgram, isoDay } from '../core/program/generate.ts';
import { moveToToday, type SwapError } from '../core/program/swap.ts';
import { aimRir, effortTarget, lastEffort, nextTarget } from '../core/progression.ts';
import { exerciseRanks, TIERS } from '../core/ranks.ts';
import { runTitle, runTypeFor } from '../core/runTypes.ts';
import { ARNOLD, dayTemplate, nextSplitDay } from '../core/split.ts';
import {
  deleteWorkout,
  getActiveProgram,
  listWeighIns,
  listWorkouts,
  saveProfile,
  saveProgram,
  startProgram,
  stopProgram,
  upsertWorkout,
} from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { Icon } from './Icon.tsx';
import { ImportSheet } from './ImportSheet.tsx';
import { ProgramCard, ProgramSheet } from './ProgramCard.tsx';
import { describeItem } from './programFormat.ts';
import { Ranks } from './Ranks.tsx';
import { dayTitle, load, newId, nowStamp, type Units } from './format.ts';
import { RunSheet } from './RunSheet.tsx';
import { SplitCard } from './SplitCard.tsx';
import { formatPace, recentExercises } from './workoutFormat.ts';
import { WorkoutSheet } from './WorkoutSheet.tsx';

const NONE: never[] = [];

type Props = { profile: Profile; say: (text: string, undo?: () => void) => void };

export function Train({ profile, say }: Props) {
  const db = useDb();
  const today = localDate(new Date());
  const workouts = useLiveQuery(() => listWorkouts(db), [db], NONE);
  const weighIns = useLiveQuery(() => listWeighIns(db), [db], NONE);
  const bodyweight = weighIns.at(-1)?.kg;
  const recent = useMemo(() => recentExercises(workouts), [workouts]);
  const ranks = useMemo(
    () => (bodyweight ? exerciseRanks(workouts, bodyweight, profile.sex) : []),
    [workouts, bodyweight, profile.sex],
  );
  const style = profile.style ?? 'bodybuilding';
  const suggested = nextSplitDay(workouts);
  // a split day picked with "Change" holds until the next workout is logged
  const [picked, setPicked] = useState<{ dayId: string; after: string | undefined } | null>(null);
  const pickedId = picked && picked.after === workouts[0]?.id ? picked.dayId : suggested;
  const nextDay = ARNOLD.find((d) => d.id === pickedId) ?? ARNOLD[0]!;
  const template = useMemo(
    () =>
      dayTemplate(nextDay.id, workouts).map((e) => {
        // with an effort logged last time, the sets carry the chart's next weight
        const ex = findExercise(e.name);
        const last = ex ? lastEffort(workouts, ex.id) : undefined;
        const t = ex && last ? effortTarget(style, ex, last, profile.units, {}) : undefined;
        if (!t) return e;
        const set: SetEntry = { reps: t.reps, ...(t.weightKg > 0 ? { weightKg: t.weightKg } : {}) };
        return { name: e.name, sets: e.sets.map(() => ({ ...set })) };
      }),
    [nextDay.id, workouts, style, profile.units],
  );
  const program = useLiveQuery(() => getActiveProgram(db), [db], null);
  const [open, setOpen] = useState<
    'none' | 'lift' | 'split' | 'run' | 'import' | 'program' | 'session-lift' | 'session-run'
  >('none');
  const [session, setSession] = useState<PlannedSession | null>(null);
  const close = () => {
    setOpen('none');
    setSession(null);
  };
  const aimText = (deload: boolean) => effortText(effortRow(aimRir(style, deload))!);
  const longestM = Math.max(
    0,
    ...workouts
      .filter((w) => w.kind === 'run' && w.date >= addDays(today, -56))
      .flatMap((w) => w.exercises.flatMap((e) => e.sets.map((s) => s.distanceM ?? 0))),
  );

  /** Build and start a program; returns an error to show, or null. */
  function beginProgram(goal: Goal, daysPerWeek: number): string | null {
    const day = isoDay(today);
    // start this week if it's early in the week, else next Monday
    const startDate = addDays(today, day <= 3 ? 1 - day : 8 - day);
    const made = generateProgram({
      id: newId(),
      goal,
      style,
      daysPerWeek,
      longestM,
      exercises: (dayId) => dayTemplate(dayId, workouts).map((e) => e.name),
      startDate,
      now: nowStamp(),
    });
    if ('error' in made) {
      return 'The marathon plan needs a base: run 8 km first, or start with the half.';
    }
    void startProgram(db, made).then(() =>
      goal === profile.goal
        ? undefined
        : saveProfile(db, { ...profile, goal, updatedAt: nowStamp() }),
    );
    close();
    say(`Program started: ${made.weeks} weeks`);
    return null;
  }

  /** Planned lifts as pre-filled sets, weights from the progression calculator and your bests. */
  function sessionExercises(s: PlannedSession) {
    const deload = s.title.endsWith('(deload)');
    return s.items.flatMap((item) => {
      if (item.type !== 'lift') return [];
      const ex = findExercise(item.exercise);
      const rank = ranks.find((r) => ex?.id === r.exercise.id);
      const last = ex && !deload ? lastEffort(workouts, ex.id) : undefined;
      // the effort chart when last time was rated, else the style's rules from the best set
      const fromEffort =
        ex && last ? effortTarget(style, ex, last, profile.units, { reps: item.reps }) : undefined;
      const target =
        fromEffort ??
        (rank
          ? nextTarget(style, rank.exercise, rank.best, profile.units, deload ? 'week' : undefined)
          : undefined);
      const set: SetEntry = {
        reps: fromEffort ? fromEffort.reps : item.reps,
        ...(target && target.weightKg > 0 ? { weightKg: target.weightKg } : {}),
      };
      return [{ name: item.exercise, sets: Array.from({ length: item.sets }, () => ({ ...set })) }];
    });
  }

  function startSession(s: PlannedSession) {
    setSession(s);
    const first = s.items[0];
    if (first?.type === 'cardio') {
      void save(
        {
          kind: 'cardio',
          title: s.title,
          exercises: [{ name: first.activity, sets: [{ durationS: first.durationS }] }],
        },
        s.id,
      );
      return;
    }
    setOpen(first?.type === 'run' ? 'session-run' : 'session-lift');
  }

  /** Move a session of this week to today, swapping days; a problem to show, or null. */
  function moveSession(s: PlannedSession): string | null {
    if (!program) return null;
    const done = new Set(workouts.flatMap((w) => (w.programSessionId ? [w.programSessionId] : [])));
    const moved = moveToToday(program, s.id, today, done);
    if ('error' in moved) return MOVE_PROBLEMS[moved.error];
    void saveProgram(db, moved);
    say(`${s.title} moved to today`, () => void saveProgram(db, program));
    return null;
  }

  /** "Bench press ranked up: Gold to Platinum!" when a new workout moves a lift up a tier. */
  function rankUp(workout: Workout): string | null {
    if (!bodyweight) return null;
    for (const r of exerciseRanks([...workouts, workout], bodyweight, profile.sex)) {
      const old = ranks.find((x) => x.exercise.id === r.exercise.id);
      if (!old && workout.exercises.some((e) => findExercise(e.name)?.id === r.exercise.id)) {
        return `New rank: ${r.exercise.name} is ${r.tier}!`;
      }
      if (old && TIERS.indexOf(r.tier) > TIERS.indexOf(old.tier)) {
        return `${r.exercise.name} ranked up: ${old.tier} to ${r.tier}!`;
      }
    }
    return null;
  }

  async function importWorkouts(list: Workout[]) {
    for (const w of list) await upsertWorkout(db, w);
    close();
    say(`Imported ${list.length} ${list.length === 1 ? 'workout' : 'workouts'}`);
  }

  async function save(
    w: Omit<Workout, 'id' | 'date' | 'loggedAt' | 'source'>,
    sessionId = session?.id,
  ) {
    const workout: Workout = {
      ...w,
      ...(sessionId ? { programSessionId: sessionId } : {}),
      id: newId(),
      date: today,
      loggedAt: nowStamp(),
      source: 'manual',
    };
    const up = rankUp(workout);
    await upsertWorkout(db, workout);
    close();
    say(up ?? `${workoutTitle(workout)} logged: +20 XP`, () => void deleteWorkout(db, workout.id));
  }

  async function remove(w: Workout) {
    await deleteWorkout(db, w.id);
    say(`Removed ${workoutTitle(w)}`, () => void upsertWorkout(db, w));
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Train</h1>
      </header>
      {program ? (
        <ProgramCard
          program={program}
          workouts={workouts}
          today={today}
          aim={aimText(false)}
          onStart={startSession}
          onMove={moveSession}
          onStop={() => void stopProgram(db, program.id)}
        />
      ) : (
        <>
          <SplitCard
            workouts={workouts}
            today={today}
            day={nextDay}
            suggested={suggested}
            template={template}
            aim={aimText(false)}
            exercisesFor={(id) => dayTemplate(id, workouts).map((e) => e.name)}
            onPick={(dayId) => setPicked({ dayId, after: workouts[0]?.id })}
            onStart={() => setOpen('split')}
          />
          <button
            type="button"
            className="link-btn start-program"
            onClick={() => setOpen('program')}
          >
            Follow a program built from your goal
          </button>
        </>
      )}
      <div className="actions actions-two">
        <button type="button" className="btn btn-primary btn-big" onClick={() => setOpen('lift')}>
          <Icon name="dumbbell" size={20} />
          Log workout
        </button>
        <button type="button" className="btn btn-big" onClick={() => setOpen('run')}>
          <Icon name="run" size={20} />
          Log run
        </button>
      </div>

      <Ranks ranks={ranks} units={profile.units} />

      <section className="history" aria-labelledby="history-title">
        <div className="history-head">
          <h2 id="history-title">Recent</h2>
          <button type="button" className="link-btn" onClick={() => setOpen('import')}>
            Import from notes
          </button>
        </div>
        {workouts.length === 0 ? (
          <p className="muted">No workouts yet. Each one is worth 20 XP.</p>
        ) : (
          <ul className="workout-list">
            {workouts.slice(0, 30).map((w) => (
              <li key={w.id} className="workout">
                <div className="workout-head">
                  <span className="workout-title">{workoutTitle(w)}</span>
                  <span className="muted">{dayTitle(w.date, today)}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-small"
                    aria-label={`Remove ${workoutTitle(w)}`}
                    onClick={() => void remove(w)}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
                <p className="muted workout-detail">{workoutDetail(w, profile.units)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open === 'program' && (
        <ProgramSheet
          goal={profile.goal}
          longestM={longestM}
          onStart={beginProgram}
          onClose={close}
        />
      )}
      {open === 'session-lift' && session && (
        <WorkoutSheet
          recent={recent}
          units={profile.units}
          onUnitsChange={(units) =>
            void saveProfile(db, { ...profile, units, updatedAt: nowStamp() })
          }
          initial={{ title: session.title, exercises: sessionExercises(session) }}
          aim={aimRir(style, session.title.endsWith('(deload)'))}
          onClose={close}
          onSave={(exercises: ExerciseLog[], title) =>
            void save({ kind: 'strength', exercises, ...(title ? { title } : {}) })
          }
        />
      )}
      {open === 'session-run' && session && (
        <RunSheet
          target={session.items.map(describeItem).join(' · ')}
          {...(session.items[0] && runTypeFor(session.items[0])
            ? { initialType: runTypeFor(session.items[0]) }
            : {})}
          onClose={close}
          onSave={(distanceM, durationS) =>
            void save({
              kind: 'run',
              title: session.title,
              exercises: [
                { name: 'Run', sets: [{ distanceM, ...(durationS ? { durationS } : {}) }] },
              ],
            })
          }
        />
      )}
      {open === 'import' && (
        <ImportSheet onClose={close} onImport={(l) => void importWorkouts(l)} />
      )}
      {(open === 'lift' || open === 'split') && (
        <WorkoutSheet
          recent={recent}
          units={profile.units}
          onUnitsChange={(units) =>
            void saveProfile(db, { ...profile, units, updatedAt: nowStamp() })
          }
          initial={open === 'split' ? { title: nextDay.title, exercises: template } : undefined}
          {...(open === 'split' ? { aim: aimRir(style, false) } : {})}
          onClose={close}
          onSave={(exercises: ExerciseLog[], title) =>
            void save({ kind: 'strength', exercises, ...(title ? { title } : {}) })
          }
        />
      )}
      {open === 'run' && (
        <RunSheet
          onClose={close}
          onSave={(distanceM, durationS, type) =>
            void save({
              kind: 'run',
              ...(type ? { title: runTitle(type) } : {}),
              exercises: [
                { name: 'Run', sets: [{ distanceM, ...(durationS ? { durationS } : {}) }] },
              ],
            })
          }
        />
      )}
    </div>
  );
}

const MOVE_PROBLEMS: Record<SwapError, string> = {
  'not-found': 'That session is no longer in the program.',
  'not-this-week': 'Only sessions from this week can move to today.',
  done: 'That session is already done.',
  'already-today': "That's already today's session.",
  'today-done': "Today's session is done, so the week stays as it is.",
};

function workoutTitle(w: Workout): string {
  if (w.title) return w.title;
  if (w.kind === 'run') return `${km(runDistance(w))} km run`;
  return w.exercises.map((e) => e.name).join(', ');
}

function workoutDetail(w: Workout, units: Units): string {
  if (w.kind === 'run') {
    const d = runDistance(w);
    const t = w.exercises.flatMap((e) => e.sets).reduce((s, x) => s + (x.durationS ?? 0), 0);
    return t > 0 ? `${km(d)} km · ${formatPace(d, t)}` : `${km(d)} km`;
  }
  return w.exercises
    .map((e) => {
      const best = e.sets.reduce((m, s) => Math.max(m, s.weightKg ?? 0), 0);
      const failure = e.sets.every((s) => s.toFailure) ? ' to failure' : '';
      const rir = logRir(e);
      const row = rir === undefined ? undefined : effortRow(rir);
      const effort = row
        ? ` @ ${row.level === 'Too light' ? 'too light' : `RPE ${row.rpeLabel}`}`
        : '';
      return `${e.name} ${e.sets.length}×${best > 0 ? ` ${load(best, units)}` : ''}${failure}${effort}`;
    })
    .join(' · ');
}

function runDistance(w: Workout): number {
  return w.exercises.flatMap((e) => e.sets).reduce((s, x) => s + (x.distanceM ?? 0), 0);
}

function km(m: number): string {
  return (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1);
}
