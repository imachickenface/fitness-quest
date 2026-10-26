import type { MealSlot } from '../contract.ts';
import { MEAL_LABELS, MEAL_SLOTS } from './format.ts';

type Props = { value: MealSlot; onChange: (m: MealSlot) => void };

export function MealPicker({ value, onChange }: Props) {
  return (
    <fieldset className="segmented">
      <legend>Meal</legend>
      {MEAL_SLOTS.map((m) => (
        <label key={m}>
          <input
            type="radio"
            name="meal"
            value={m}
            checked={value === m}
            onChange={() => onChange(m)}
          />
          <span>{MEAL_LABELS[m]}</span>
        </label>
      ))}
    </fieldset>
  );
}
