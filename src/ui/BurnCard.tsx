import { useLiveQuery } from 'dexie-react-hooks';
import { burnedOn } from '../core/burn.ts';
import { listWeighIns, listWorkouts } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { kcal } from './format.ts';

const NONE: never[] = [];

/**
 * About how many calories a day's workouts burned. Shown only: the food target already counts usual exercise.
 */
export function BurnCard({ date, today }: { date: string; today: string }) {
  const db = useDb();
  const workouts = useLiveQuery(() => listWorkouts(db), [db], NONE);
  const weighIns = useLiveQuery(() => listWeighIns(db), [db], NONE);
  // the weight on that day: the last weigh-in up to it, else the first one
  const kg = (weighIns.findLast((w) => w.date <= date) ?? weighIns[0])?.kg;
  const burn = kg ? burnedOn(workouts, date, kg) : undefined;

  return (
    <section className="panel burn" aria-labelledby="burn-title">
      <div className="burn-head">
        <h2 id="burn-title">Burned by exercise</h2>
        {burn && (
          <p className="burn-total">
            <span className="muted">about</span> <b>{kcal(burn.total)}</b> kcal
          </p>
        )}
      </div>
      {!kg ? (
        <p className="muted">Add a weigh-in to see roughly what your workouts burn.</p>
      ) : burn && burn.items.length > 0 ? (
        <>
          <ul className="burn-list">
            {burn.items.map((i) => (
              <li key={i.workoutId}>
                <span>{i.title}</span>
                <span className="muted">{kcal(i.kcal)} kcal</span>
              </li>
            ))}
          </ul>
          <p className="muted burn-note">
            Active calories on top of what your body burns at rest, from published activity values
            and your weight. Your food goal stays the same, since your activity level already counts
            exercise.
          </p>
        </>
      ) : (
        <p className="muted">
          {date === today
            ? 'No workouts logged today. Log one on the Train tab.'
            : 'No workouts logged this day.'}
        </p>
      )}
    </section>
  );
}
