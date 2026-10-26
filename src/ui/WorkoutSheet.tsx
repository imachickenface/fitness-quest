import { useState, type FormEvent } from 'react';
import { exerciseKey, type ExerciseLog, type SetEntry } from '../contract.ts';
import type { RecentExercise } from './workoutFormat.ts';
import { Sheet } from './Sheet.tsx';

type SetDraft = { reps: string; kg: string };
type ExerciseDraft = { key: number; name: string; sets: SetDraft[] };

const toDraft = (s: SetEntry): SetDraft => ({
  reps: s.reps === undefined ? '' : String(s.reps),
  kg: s.weightKg === undefined ? '' : String(s.weightKg),
});

type Props = {
  recent: RecentExercise[];
  onSave: (exercises: ExerciseLog[], title: string) => void;
  onClose: () => void;
};

export function WorkoutSheet({ recent, onSave, onClose }: Props) {
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState('');

  const inWorkout = new Set(exercises.map((e) => exerciseKey(e.name)));
  const suggestions = recent.filter((r) => !inWorkout.has(exerciseKey(r.name)));

  function add(name: string, sets: SetDraft[] = [{ reps: '', kg: '' }]) {
    if (name.trim() === '' || inWorkout.has(exerciseKey(name))) return;
    setExercises((xs) => [...xs, { key: nextKey, name: name.trim(), sets }]);
    setNextKey((k) => k + 1);
  }

  function update(key: number, fn: (e: ExerciseDraft) => ExerciseDraft) {
    setExercises((xs) => xs.map((e) => (e.key === key ? fn(e) : e)));
  }

  const logs: ExerciseLog[] = exercises
    .map((e) => ({ name: e.name, sets: e.sets.map(parseSet).filter((s) => s !== null) }))
    .filter((e) => e.sets.length > 0);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (logs.length > 0) onSave(logs, title.trim());
  }

  return (
    <Sheet title="Log a workout" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {suggestions.length > 0 && (
          <div>
            <p className="muted">Tap to add with last time's sets</p>
            <ul className="chip-row">
              {suggestions.map((r) => (
                <li key={r.name}>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => add(r.name, r.sets.map(toDraft))}
                  >
                    + {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {exercises.map((e) => (
          <fieldset key={e.key} className="panel exercise">
            <legend className="exercise-name">{e.name}</legend>
            <button
              type="button"
              className="icon-btn icon-btn-small exercise-remove"
              aria-label={`Remove ${e.name}`}
              onClick={() => setExercises((xs) => xs.filter((x) => x.key !== e.key))}
            >
              ✕
            </button>
            {e.sets.map((s, i) => (
              <div key={i} className="set-row">
                <span className="muted set-no">{i + 1}</span>
                <label className="field">
                  <span className="visually-hidden">
                    {e.name} set {i + 1} reps
                  </span>
                  <input
                    inputMode="numeric"
                    placeholder="reps"
                    value={s.reps}
                    onChange={(ev) =>
                      update(e.key, (x) => ({
                        ...x,
                        sets: setAt(x.sets, i, { ...s, reps: ev.target.value }),
                      }))
                    }
                  />
                </label>
                <span aria-hidden="true">×</span>
                <label className="field">
                  <span className="visually-hidden">
                    {e.name} set {i + 1} kg
                  </span>
                  <input
                    inputMode="decimal"
                    placeholder="kg"
                    value={s.kg}
                    onChange={(ev) =>
                      update(e.key, (x) => ({
                        ...x,
                        sets: setAt(x.sets, i, { ...s, kg: ev.target.value }),
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-btn icon-btn-small"
                  aria-label={`Remove ${e.name} set ${i + 1}`}
                  disabled={e.sets.length === 1}
                  onClick={() =>
                    update(e.key, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                update(e.key, (x) => ({
                  ...x,
                  sets: [...x.sets, { ...(x.sets.at(-1) ?? { reps: '', kg: '' }) }],
                }))
              }
            >
              + Set
            </button>
          </fieldset>
        ))}

        <div className="add-exercise">
          <label className="field">
            <span>Add an exercise</span>
            <input
              list="exercise-names"
              placeholder="e.g. Squat"
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(newName);
                  setNewName('');
                }
              }}
            />
            <datalist id="exercise-names">
              {recent.map((r) => (
                <option key={r.name} value={r.name} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="btn"
            disabled={newName.trim() === ''}
            onClick={() => {
              add(newName);
              setNewName('');
            }}
          >
            Add
          </button>
        </div>

        <label className="field">
          <span>Name this workout (optional)</span>
          <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={logs.length === 0}>
            Save workout
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function setAt(sets: SetDraft[], i: number, value: SetDraft): SetDraft[] {
  return sets.map((s, j) => (j === i ? value : s));
}

/** Reps must be a whole number and kg a number >= 0; a set needs at least one of them. */
function parseSet(s: SetDraft): SetEntry | null {
  const reps = s.reps.trim() === '' ? undefined : Number(s.reps);
  const kg = s.kg.trim() === '' ? undefined : Number(s.kg.replace(',', '.'));
  const repsOk = reps === undefined || (Number.isInteger(reps) && reps >= 0 && reps <= 1000);
  const kgOk = kg === undefined || (Number.isFinite(kg) && kg >= 0 && kg <= 1000);
  if (!repsOk || !kgOk || (reps === undefined && kg === undefined)) return null;
  return { ...(reps !== undefined ? { reps } : {}), ...(kg !== undefined ? { weightKg: kg } : {}) };
}
