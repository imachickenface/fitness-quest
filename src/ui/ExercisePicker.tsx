import { useEffect, useMemo, useState } from 'react';
import { exerciseKey } from '../contract.ts';
import {
  BODY_PARTS,
  bodyPart,
  logName,
  searchLibrary,
  type BodyPart,
  type Equipment,
  type LibraryExercise,
} from '../core/exerciseLibrary.ts';
import { Sheet } from './Sheet.tsx';

const SHOWN = 60;

const PART_NAMES: Record<BodyPart, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

const EQUIPMENT: Equipment[] = [
  'barbell',
  'dumbbell',
  'body only',
  'cable',
  'machine',
  'kettlebells',
  'bands',
  'e-z curl bar',
  'medicine ball',
  'exercise ball',
  'foam roll',
  'other',
];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let library: Promise<LibraryExercise[]> | null = null;

/** The exercise list (public/exercises.json), fetched once and cached for offline use by the service worker. */
function loadLibrary(): Promise<LibraryExercise[]> {
  library ??= fetch(`${import.meta.env.BASE_URL}exercises.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<LibraryExercise[]>;
    })
    .catch((e: unknown) => {
      library = null; // try again next time
      throw e;
    });
  return library;
}

type Props = {
  /** names already in the workout */
  taken: Set<string>;
  /** names logged recently, most recent first */
  recent: string[];
  onPick: (name: string) => void;
  onClose: () => void;
};

/** Search or browse ~870 exercises by body part and equipment; a custom name is still allowed. */
export function ExercisePicker({ taken, recent, onPick, onClose }: Props) {
  const [items, setItems] = useState<LibraryExercise[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [part, setPart] = useState<BodyPart | undefined>(undefined);
  const [equipment, setEquipment] = useState<Equipment | undefined>(undefined);
  const [detail, setDetail] = useState<LibraryExercise | null>(null);

  useEffect(() => {
    let live = true;
    loadLibrary().then(
      (xs) => live && setItems(xs),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(
    () =>
      items
        ? searchLibrary(items, {
            query,
            recent,
            limit: items.length,
            ...(part ? { part } : {}),
            ...(equipment ? { equipment } : {}),
          })
        : [],
    [items, query, part, equipment, recent],
  );
  const custom = query.trim();
  const customTaken = taken.has(exerciseKey(custom));

  function pick(name: string) {
    onPick(name);
    onClose();
  }

  if (detail) {
    const name = logName(detail);
    return (
      <Sheet title={name} onClose={onClose}>
        <div className="exercise-detail">
          <p className="muted">
            {[...new Set(detail.primary.map((m) => capital(m)))].join(', ')}
            {detail.secondary.length > 0 && ` (also ${detail.secondary.join(', ')})`} ·{' '}
            {capital(detail.equipment)} · {capital(detail.level)}
          </p>
          {detail.alt && <p className="muted">Also called {detail.alt}</p>}
          <ol className="steps">
            {detail.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setDetail(null)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={taken.has(exerciseKey(name))}
              onClick={() => pick(name)}
            >
              Add to workout
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add an exercise" onClose={onClose}>
      <div className="picker">
        <label className="field">
          <span className="visually-hidden">Search exercises</span>
          <input
            type="search"
            placeholder="Search, e.g. incline press"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chip-row picker-parts" role="group" aria-label="Body part">
          <button
            type="button"
            className="chip"
            aria-pressed={part === undefined}
            onClick={() => setPart(undefined)}
          >
            All
          </button>
          {BODY_PARTS.map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              aria-pressed={part === p}
              onClick={() => setPart(part === p ? undefined : p)}
            >
              {PART_NAMES[p]}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Equipment</span>
          <select
            value={equipment ?? ''}
            onChange={(e) =>
              setEquipment(e.target.value === '' ? undefined : (e.target.value as Equipment))
            }
          >
            <option value="">Any</option>
            {EQUIPMENT.map((x) => (
              <option key={x} value={x}>
                {capital(x)}
              </option>
            ))}
          </select>
        </label>

        {failed && (
          <p className="form-error">
            Couldn't load the exercise list. Check your connection, or add your own name below.
          </p>
        )}
        {!items && !failed && <p className="muted">Loading exercises…</p>}

        {custom !== '' && (
          <button
            type="button"
            className="btn picker-custom"
            disabled={customTaken}
            onClick={() => pick(custom)}
          >
            Add “{custom}” as your own exercise
          </button>
        )}

        {items && (
          <>
            <p className="muted picker-count" aria-live="polite">
              {results.length === 0
                ? 'No exercises match. Try fewer words or another filter.'
                : results.length > SHOWN
                  ? `Showing ${SHOWN} of ${results.length}. Search or filter to narrow down.`
                  : `${results.length} ${results.length === 1 ? 'exercise' : 'exercises'}`}
            </p>
            <ul className="picker-list">
              {results.slice(0, SHOWN).map((e) => {
                const name = logName(e);
                const added = taken.has(exerciseKey(name));
                return (
                  <li key={e.id} className="picker-item">
                    <button
                      type="button"
                      className="picker-pick"
                      disabled={added}
                      onClick={() => pick(name)}
                    >
                      <span className="picker-name">{name}</span>
                      <span className="muted picker-meta">
                        {e.primary[0] ? PART_NAMES[bodyPart(e.primary[0])] : ''} ·{' '}
                        {capital(e.equipment)}
                        {added && ' · added'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-small picker-info"
                      aria-label={`How to do ${name}`}
                      onClick={() => setDetail(e)}
                    >
                      i
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
