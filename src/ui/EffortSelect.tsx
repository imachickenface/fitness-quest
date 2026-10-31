import { useId } from 'react';
import { Sheet } from './Sheet.tsx';
import { EFFORT_ROWS, effortRow, effortText, type EffortLevel } from '../core/effort.ts';

/** The chart's colour band for a level, as a class: `effort-max`, `effort-moderate-plus`, ... */
const levelClass = (level: EffortLevel) =>
  `effort-${level.toLowerCase().replace('+', '-plus').replace(' ', '-')}`;

/** "How hard was it?" for one exercise: a row of the effort chart, or not rated. */
export function EffortSelect({
  exercise,
  value,
  onChange,
}: {
  exercise: string;
  value: number | undefined;
  onChange: (rir: number | undefined) => void;
}) {
  const id = useId();
  const row = value === undefined ? undefined : effortRow(value);
  return (
    <div className="effort-field">
      <label htmlFor={id}>How hard was it?</label>
      <span
        className={`effort-dot ${row ? levelClass(row.level) : 'effort-none'}`}
        aria-hidden="true"
      />
      <select
        id={id}
        aria-label={`${exercise}: how hard was it?`}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      >
        <option value="">Not rated</option>
        {EFFORT_ROWS.map((r) => (
          <option key={r.rir} value={String(r.rir)}>
            {effortText(r)} · {r.effort}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The owner's effort chart as a table: what each choice means. */
export function EffortChart({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Effort chart" onClose={onClose}>
      <p className="muted">
        Pick the row that matches your hardest set. RIR is the reps you had left; RPE is the effort
        out of 10. From the Mash Elite Relative Intensity chart.
      </p>
      <table className="effort-table">
        <thead>
          <tr>
            <th scope="col">RPE</th>
            <th scope="col">RIR</th>
            <th scope="col">What it feels like</th>
          </tr>
        </thead>
        <tbody>
          {EFFORT_ROWS.map((r) => (
            <tr key={r.rir}>
              <td>
                <span className={`effort-dot ${levelClass(r.level)}`} aria-hidden="true" />{' '}
                {r.level === 'Too light' ? '0-1' : r.rpeLabel}
              </td>
              <td>
                {r.rirLabel === '10+' && r.level === 'Too light' ? 'more than 10' : r.rirLabel}
              </td>
              <td>{r.effort}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  );
}
