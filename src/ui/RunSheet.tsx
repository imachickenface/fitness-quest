import { useState, type FormEvent } from 'react';
import { RUN_GROUPS, RUN_TYPES, type RunType } from '../core/runTypes.ts';
import { Sheet } from './Sheet.tsx';
import { formatPace, parseDuration } from './workoutFormat.ts';

type Props = {
  /** a planned session's target, shown above the form */
  target?: string;
  /** the run type to start with, e.g. a program session's */
  initialType?: RunType;
  onSave: (distanceM: number, durationS: number | undefined, type: RunType | undefined) => void;
  onClose: () => void;
};

export function RunSheet({ target, initialType, onSave, onClose }: Props) {
  const [km, setKm] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<RunType | undefined>(initialType);
  const distanceM = Math.round(Number(km.replace(',', '.')) * 1000);
  const distanceOk = km.trim() !== '' && distanceM > 0 && distanceM <= 500_000;
  const durationS = parseDuration(time);
  const timeOk = time.trim() === '' || (durationS !== null && durationS > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (distanceOk && timeOk) onSave(distanceM, durationS ?? undefined, type);
  }

  return (
    <Sheet title="Log a run" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {target && <p className="run-target">Today's plan: {target}</p>}
        <fieldset className="run-types">
          <legend>What kind of run? (optional)</legend>
          {RUN_GROUPS.map((group) => (
            <div key={group} className="run-group">
              <span className="muted run-group-name">{group}</span>
              <div className="chip-row">
                {RUN_TYPES.filter((t) => t.group === group).map((t) => (
                  <label key={t.id} className="chip-choice">
                    <input
                      type="radio"
                      name="run-type"
                      checked={type?.id === t.id}
                      onChange={() => setType(t)}
                      onClick={() => type?.id === t.id && setType(undefined)}
                    />
                    <span>{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {type && (
            <p className="run-how" aria-live="polite">
              <b>{type.name}:</b> {type.how}
            </p>
          )}
        </fieldset>
        <div className="field-row two">
          <label className="field">
            <span>Distance (km)</span>
            <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
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
