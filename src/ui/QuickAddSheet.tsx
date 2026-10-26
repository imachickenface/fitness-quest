import { useState, type FormEvent } from 'react';
import type { MealSlot } from '../contract.ts';
import { MealPicker } from './MealPicker.tsx';
import { Sheet } from './Sheet.tsx';

type Props = {
  defaultMeal: MealSlot;
  onLog: (kcal: number, label: string, meal: MealSlot) => void;
  onClose: () => void;
};

export function QuickAddSheet({ defaultMeal, onLog, onClose }: Props) {
  const [kcalText, setKcalText] = useState('');
  const [label, setLabel] = useState('');
  const [meal, setMeal] = useState<MealSlot>(defaultMeal);
  const value = Number(kcalText);
  const valid = kcalText.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 10000;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) onLog(value, label, meal);
  }

  return (
    <Sheet title="Quick add" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Calories (kcal)</span>
          <input
            inputMode="numeric"
            autoFocus
            value={kcalText}
            onChange={(e) => setKcalText(e.target.value)}
          />
        </label>
        <label className="field">
          <span>What was it? (optional)</span>
          <input value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <MealPicker value={meal} onChange={setMeal} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Log it
          </button>
        </div>
      </form>
    </Sheet>
  );
}
