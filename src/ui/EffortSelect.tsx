import { useId } from 'react';
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
