import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import type { ExerciseLog, Profile, Workout } from '../contract.ts';
import { localDate } from '../core/diary.ts';
import { findExercise } from '../core/exercises.ts';
import { exerciseRanks, TIERS } from '../core/ranks.ts';
import { ARNOLD, dayTemplate, nextSplitDay } from '../core/split.ts';
import { deleteWorkout, listWeighIns, listWorkouts, upsertWorkout } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { Icon } from './Icon.tsx';
import { ImportSheet } from './ImportSheet.tsx';
import { Ranks } from './Ranks.tsx';
import { dayTitle, newId, nowStamp } from './format.ts';
import { RunSheet } from './RunSheet.tsx';
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
  const nextDay = ARNOLD.find((d) => d.id === nextSplitDay(workouts)) ?? ARNOLD[0]!;
  const template = useMemo(() => dayTemplate(nextDay.id, workouts), [nextDay.id, workouts]);
  const [open, setOpen] = useState<'none' | 'lift' | 'split' | 'run' | 'import'>('none');
  const close = () => setOpen('none');

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

  async function save(w: Omit<Workout, 'id' | 'date' | 'loggedAt' | 'source'>) {
    const workout: Workout = {
      ...w,
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
      <section className="panel next-up" aria-labelledby="next-title">
        <p className="muted next-label">Next up · Arnold split</p>
        <h2 id="next-title">{nextDay.title}</h2>
        <p className="muted next-list">{template.map((e) => e.name).join(' · ')}</p>
        <button type="button" className="btn btn-primary" onClick={() => setOpen('split')}>
          Start {nextDay.title.toLowerCase()}
        </button>
      </section>
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

      <Ranks ranks={ranks} />

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
                <p className="muted workout-detail">{workoutDetail(w)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open === 'import' && (
        <ImportSheet onClose={close} onImport={(l) => void importWorkouts(l)} />
      )}
      {(open === 'lift' || open === 'split') && (
        <WorkoutSheet
          recent={recent}
          initial={open === 'split' ? { title: nextDay.title, exercises: template } : undefined}
          onClose={close}
          onSave={(exercises: ExerciseLog[], title) =>
            void save({ kind: 'strength', exercises, ...(title ? { title } : {}) })
          }
        />
      )}
      {open === 'run' && (
        <RunSheet
          onClose={close}
          onSave={(distanceM, durationS) =>
            void save({
              kind: 'run',
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

function workoutTitle(w: Workout): string {
  if (w.title) return w.title;
  if (w.kind === 'run') return `${km(runDistance(w))} km run`;
  return w.exercises.map((e) => e.name).join(', ');
}

function workoutDetail(w: Workout): string {
  if (w.kind === 'run') {
    const d = runDistance(w);
    const t = w.exercises.flatMap((e) => e.sets).reduce((s, x) => s + (x.durationS ?? 0), 0);
    return t > 0 ? `${km(d)} km · ${formatPace(d, t)}` : `${km(d)} km`;
  }
  return w.exercises
    .map((e) => {
      const best = e.sets.reduce((m, s) => Math.max(m, s.weightKg ?? 0), 0);
      return `${e.name} ${e.sets.length}×${best > 0 ? ` ${best} kg` : ''}`;
    })
    .join(' · ');
}

function runDistance(w: Workout): number {
  return w.exercises.flatMap((e) => e.sets).reduce((s, x) => s + (x.distanceM ?? 0), 0);
}

function km(m: number): string {
  return (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1);
}
