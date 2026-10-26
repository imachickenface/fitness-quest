import { useState, type FormEvent } from 'react';
import { Sheet } from './Sheet.tsx';

type Props = {
  defaultName: string;
  itemCount: number;
  onSave: (name: string) => void;
  onClose: () => void;
};

export function SaveMealSheet({ defaultName, itemCount, onSave, onClose }: Props) {
  const [name, setName] = useState(defaultName);
  const valid = name.trim() !== '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) onSave(name.trim());
  }

  return (
    <Sheet title="Save as a meal" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">
          Saves these {itemCount} {itemCount === 1 ? 'food' : 'foods'} as one item you can log with
          a single tap.
        </p>
        <label className="field">
          <span>Meal name</span>
          <input autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Save meal
          </button>
        </div>
      </form>
    </Sheet>
  );
}
