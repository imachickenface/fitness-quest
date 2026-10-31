import { useState, type FormEvent } from 'react';
import { exerciseKey, type ExerciseLog, type SetEntry } from '../contract.ts';
import { effortRow, effortText } from '../core/effort.ts';
import type { RecentExercise } from './workoutFormat.ts';
import { fromUnit, toUnit, type Units } from './format.ts';
import { EffortChart, EffortSelect } from './EffortSelect.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { Sheet } from './Sheet.tsx';
import { UnitSwitch } from './UnitSwitch.tsx';

type SetDraft = { reps: string; kg: string };
/** `rir`: the effort picked from the chart (core/effort.ts), absent when not rated */
type ExerciseDraft = { key: number; name: string; sets: SetDraft[]; rir?: number | undefined };

const toDraft = (s: SetEntry, units: Units): SetDraft => ({
  reps: s.reps === undefined ? '' : String(s.reps),
  kg: s.weightKg === undefined ? '' : String(toUnit(s.weightKg, units)),
});

type Props = {
  recent: RecentExercise[];
  /** pre-filled exercises and title, e.g. today's split day */
  initial?: { title: string; exercises: { name: string; sets: SetEntry[] }[] };
  units?: Units;
  /** the effort to aim for (a stored RIR), shown above the exercises */
  aim?: number;
  /** the kg | lb switch was flipped */
  onUnitsChange?: (units: Units) => void;
  onSave: (exercises: ExerciseLog[], title: string) => void;
  onClose: () => void;
};

export function WorkoutSheet({
  recent,
  initial,
  units: startUnits = 'metric',
  aim,
  onUnitsChange,
  onSave,
  onClose,
}: Props) {
  const [units, setUnits] = useState<Units>(startUnits);
  const unit = units === 'imperial' ? 'lb' : 'kg';
  const [exercises, setExercises] = useState<ExerciseDraft[]>(() =>
    (initial?.exercises ?? []).map((e, i) => ({
      key: i + 1,
      name: e.name,
      sets: e.sets.length > 0 ? e.sets.map((s) => toDraft(s, units)) : [{ reps: '', kg: '' }],
    })),
  );
  const [nextKey, setNextKey] = useState((initial?.exercises.length ?? 0) + 1);
  const [picking, setPicking] = useState(false);
  const [chart, setChart] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');

  const aimRow = aim === undefined ? undefined : effortRow(aim);
  const inWorkout = new Set(exercises.map((e) => exerciseKey(e.name)));
  const suggestions = recent.filter((r) => !inWorkout.has(exerciseKey(r.name)));

  function add(name: string, sets: SetDraft[] = [{ reps: '', kg: '' }]) {
    if (name.trim() === '' || inWorkout.has(exerciseKey(name))) return;
    setExercises((xs) => [...xs, { key: nextKey, name: name.trim(), sets }]);
    setNextKey((k) => k + 1);
  }

  /** Flip kg and lb, converting the weights typed so far. */
  function switchUnits(next: Units) {
    if (next === units) return;
    const convert = (text: string) => {
      const n = Number(text.replace(',', '.'));
      return text.trim() === '' || !Number.isFinite(n)
        ? text
        : String(toUnit(fromUnit(n, units), next));
    };
    setExercises((xs) =>
      xs.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, kg: convert(s.kg) })) })),
    );
    setUnits(next);
    onUnitsChange?.(next);
  }

  function update(key: number, fn: (e: ExerciseDraft) => ExerciseDraft) {
    setExercises((xs) => xs.map((e) => (e.key === key ? fn(e) : e)));
  }

  const logs: ExerciseLog[] = exercises
    .map((e) => ({
      name: e.name,
      sets: e.sets.map((s) => parseSet(s, units)).filter((s) => s !== null),
      ...(e.rir === undefined ? {} : { rir: e.rir }),
    }))
    .filter((e) => e.sets.length > 0);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (logs.length > 0) onSave(logs, title.trim());
  }

  return (
    <Sheet title="Log a workout" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="sheet-units">
          <span className="muted">Weights in</span>
          <UnitSwitch
            legend="Weights in"
            name="weight-unit"
            value={units}
            options={[
              ['metric', 'kg'],
              ['imperial', 'lb'],
            ]}
            onChange={switchUnits}
          />
        </div>
        {(aimRow || exercises.length > 0) && (
          <div className="effort-aim">
            {aimRow && (
              <p>
                Aim for <b>{effortText(aimRow)}</b> on your hardest set, then say how hard it was.
              </p>
            )}
            <p>
              <b>RIR</b> is reps in reserve: how many more you could have done. <b>RPE</b> is how
              hard it felt, out of 10.{' '}
              <button type="button" className="link-btn inline-link" onClick={() => setChart(true)}>
                Show the chart
              </button>
            </p>
          </div>
        )}
        {suggestions.length > 0 && (
          <div>
            <p className="muted">Tap to add with last time's sets</p>
            <ul className="chip-row">
              {suggestions.map((r) => (
                <li key={r.name}>
                  <button
                    type="button"
                    className="chip"
                    onClick={() =>
                      add(
                        r.name,
                        r.sets.map((s) => toDraft(s, units)),
                      )
                    }
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
                    {e.name} set {i + 1} {unit}
                  </span>
                  <input
                    inputMode="decimal"
                    placeholder={unit}
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
            <EffortSelect
              exercise={e.name}
              value={e.rir}
              onChange={(rir) => update(e.key, (x) => ({ ...x, rir }))}
            />
          </fieldset>
        ))}

        <button type="button" className="btn add-exercise" onClick={() => setPicking(true)}>
          + Add an exercise
        </button>

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
      {chart && <EffortChart onClose={() => setChart(false)} />}
      {picking && (
        <ExercisePicker
          taken={inWorkout}
          recent={recent.map((x) => x.name)}
          onPick={(name) => add(name)}
          onClose={() => setPicking(false)}
        />
      )}
    </Sheet>
  );
}

function setAt(sets: SetDraft[], i: number, value: SetDraft): SetDraft[] {
  return sets.map((s, j) => (j === i ? value : s));
}

/** Reps must be a whole number and kg a number >= 0; a set needs at least one of them. */
function parseSet(s: SetDraft, units: Units): SetEntry | null {
  const reps = s.reps.trim() === '' ? undefined : Number(s.reps);
  const kg = s.kg.trim() === '' ? undefined : Number(s.kg.replace(',', '.'));
  const repsOk = reps === undefined || (Number.isInteger(reps) && reps >= 0 && reps <= 1000);
  const kgOk = kg === undefined || (Number.isFinite(kg) && kg >= 0 && kg <= 1000);
  if (!repsOk || !kgOk || (reps === undefined && kg === undefined)) return null;
  return {
    ...(reps !== undefined ? { reps } : {}),
    ...(kg !== undefined ? { weightKg: fromUnit(kg, units) } : {}),
  };
}
