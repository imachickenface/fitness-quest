import { useState } from 'react';
import type { Food, MealSlot } from '../contract.ts';
import { nutritionFor } from '../core/diary.ts';
import { Sheet } from './Sheet.tsx';
import { MealPicker } from './MealPicker.tsx';
import { kcal } from './format.ts';

type Props = {
  food: Food;
  defaultGrams?: number;
  defaultMeal: MealSlot;
  onLog: (food: Food, grams: number, meal: MealSlot, favourite: boolean) => void;
  onClose: () => void;
};

export function PortionSheet({ food, defaultGrams, defaultMeal, onLog, onClose }: Props) {
  const options = [...food.portions, { label: '100 g', grams: 100 }];
  const start = defaultGrams ?? food.portions[0]?.grams ?? 100;
  const [gramsText, setGramsText] = useState(String(start));
  const [meal, setMeal] = useState<MealSlot>(defaultMeal);
  const [favourite, setFavourite] = useState(food.favourite);

  const grams = Number(gramsText);
  const valid = Number.isFinite(grams) && grams > 0 && grams <= 5000;
  const preview = valid ? nutritionFor(food, grams) : null;

  return (
    <Sheet title={food.name} onClose={onClose}>
      {food.brand && <p className="muted">{food.brand}</p>}

      <div className="portion-grid" role="group" aria-label="Portion">
        {options.map((p) => (
          <button
            key={p.label}
            type="button"
            className="chip"
            aria-pressed={grams === p.grams}
            onClick={() => setGramsText(String(p.grams))}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Amount (g)</span>
        <input
          inputMode="decimal"
          value={gramsText}
          onChange={(e) => setGramsText(e.target.value)}
          aria-invalid={!valid}
        />
      </label>

      <MealPicker value={meal} onChange={setMeal} />

      <p className="portion-preview" aria-live="polite">
        {preview ? (
          <>
            <strong>{kcal(preview.kcal)} kcal</strong>
            {preview.proteinG !== undefined && <span> · P {Math.round(preview.proteinG)} g</span>}
            {preview.carbsG !== undefined && <span> · C {Math.round(preview.carbsG)} g</span>}
            {preview.fatG !== undefined && <span> · F {Math.round(preview.fatG)} g</span>}
          </>
        ) : (
          'Enter an amount in grams'
        )}
      </p>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={favourite}
          onClick={() => setFavourite((f) => !f)}
        >
          {favourite ? '★ Favourite' : '☆ Favourite'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => onLog(food, grams, meal, favourite)}
        >
          Log it
        </button>
      </div>
    </Sheet>
  );
}
