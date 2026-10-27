import { useState, type FormEvent } from 'react';
import { Sheet } from './Sheet.tsx';
import { formatPace, parseDuration } from './workoutFormat.ts';

type Props = {
  /** a planned session's target, shown above the form */
  target?: string;
  onSave: (distanceM: number, durationS: number | undefined) => void;
  onClose: () => void;
};

export function RunSheet({ target, onSave, onClose }: Props) {
  const [km, setKm] = useState('');
  const [time, setTime] = useState('');
  const distanceM = Math.round(Number(km.replace(',', '.')) * 1000);
  const distanceOk = km.trim() !== '' && distanceM > 0 && distanceM <= 500_000;
  const durationS = parseDuration(time);
  const timeOk = time.trim() === '' || (durationS !== null && durationS > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (distanceOk && timeOk) onSave(distanceM, durationS ?? undefined);
  }

  return (
    <Sheet title="Log a run" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {target && <p className="run-target">Today's plan: {target}</p>}
        <div className="field-row two">
          <label className="field">
            <span>Distance (km)</span>
            <input
              inputMode="decimal"
              autoFocus
              value={km}
              onChange={(e) => setKm(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Time (optional)</span>
            <input
              inputMode="text"
              placeholder="mm:ss"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
        {!timeOk && <p className="form-error">Write the time as 27:30, 1:05:00 or minutes.</p>}
        {distanceOk && durationS !== null && durationS > 0 && (
          <p className="muted">Pace {formatPace(distanceM, durationS)}</p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!distanceOk || !timeOk}>
            Save run
          </button>
        </div>
      </form>
    </Sheet>
  );
}
