import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import type { ExerciseLog, Workout } from '../contract.ts';
import { localDate } from '../core/diary.ts';
import { deleteWorkout, listWorkouts, upsertWorkout } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { dayTitle, newId, nowStamp } from './format.ts';
import { RunSheet } from './RunSheet.tsx';
import { formatPace, recentExercises } from './workoutFormat.ts';
import { WorkoutSheet } from './WorkoutSheet.tsx';

const NONE: never[] = [];

type Props = { say: (text: string, undo?: () => void) => void };

export function Train({ say }: Props) {
  const db = useDb();
  const today = localDate(new Date());
  const workouts = useLiveQuery(() => listWorkouts(db), [db], NONE);
  const recent = useMemo(() => recentExercises(workouts), [workouts]);
  const [open, setOpen] = useState<'none' | 'lift' | 'run'>('none');
  const close = () => setOpen('none');

  async function save(w: Omit<Workout, 'id' | 'date' | 'loggedAt' | 'source'>) {
    const workout: Workout = {
      ...w,
      id: newId(),
      date: today,
      loggedAt: nowStamp(),
      source: 'manual',
    };
    await upsertWorkout(db, workout);
    close();
    say(`${workoutTitle(workout)} logged: +20 XP`, () => void deleteWorkout(db, workout.id));
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
      <div className="actions actions-two">
        <button type="button" className="btn btn-primary btn-big" onClick={() => setOpen('lift')}>
          Log workout
        </button>
        <button type="button" className="btn btn-big" onClick={() => setOpen('run')}>
          Log run
        </button>
      </div>

      <section className="history" aria-labelledby="history-title">
        <h2 id="history-title">Recent</h2>
        {workouts.length === 0 ? (
          <p className="muted">No workouts yet. Each one is worth 20 XP.</p>
        ) : (
          <ul className="workout-list">
            {workouts.slice(0, 30).map((w) => (
              <li key={w.id} className="panel workout">
                <div className="workout-head">
                  <span className="workout-title">{workoutTitle(w)}</span>
                  <span className="muted">{dayTitle(w.date, today)}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-small"
                    aria-label={`Remove ${workoutTitle(w)}`}
                    onClick={() => void remove(w)}
                  >
                    ✕
                  </button>
                </div>
                <p className="muted workout-detail">{workoutDetail(w)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open === 'lift' && (
        <WorkoutSheet
          recent={recent}
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
