import { useState, type FormEvent } from 'react';
import type { Food, Macros } from '../contract.ts';
import { upsertFood } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { newId, nowStamp } from './format.ts';
import { Sheet } from './Sheet.tsx';

type Props = {
  barcode?: string;
  name?: string;
  brand?: string;
  onSaved: (food: Food) => void;
  onClose: () => void;
};

type Basis = '100g' | 'serving';

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Type a food in from its nutrition label. It is saved as a favourite so it is one tap next time. */
export function LabelSheet({
  barcode,
  name: initialName,
  brand: initialBrand,
  onSaved,
  onClose,
}: Props) {
  const db = useDb();
  const [name, setName] = useState(initialName ?? '');
  const [brand, setBrand] = useState(initialBrand ?? '');
  const [basis, setBasis] = useState<Basis>('100g');
  const [serving, setServing] = useState('');
  const [kcalText, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const servingG = Number(serving);
  const servingOk = serving.trim() !== '' && servingG > 0 && servingG <= 5000;
  const kcalValue = Number(kcalText);
  const kcalOk = kcalText.trim() !== '' && Number.isFinite(kcalValue) && kcalValue >= 0;
  const optional = [protein, carbs, fat].map(optionalNumber);
  const valid =
    name.trim() !== '' &&
    kcalOk &&
    optional.every((v) => v !== null) &&
    (basis === '100g' || servingOk);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const factor = basis === '100g' ? 1 : 100 / servingG;
    const per100g: Macros = { kcal: round1(kcalValue * factor) };
    if (per100g.kcal > 1000) {
      setError(
        basis === '100g'
          ? 'Over 1,000 kcal per 100 g is not possible. Check the number.'
          : 'That works out over 1,000 kcal per 100 g. Check the serving size.',
      );
      return;
    }
    const [p, c, f] = optional;
    if (typeof p === 'number') per100g.proteinG = round1(p * factor);
    if (typeof c === 'number') per100g.carbsG = round1(c * factor);
    if (typeof f === 'number') per100g.fatG = round1(f * factor);
    const food: Food = {
      id: barcode ? `custom-${barcode}` : `custom-${newId()}`,
      name: name.trim(),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(barcode ? { barcode } : {}),
      source: 'custom',
      per100g,
      portions: servingOk ? [{ label: '1 serving', grams: round1(servingG) }] : [],
      favourite: true,
      updatedAt: nowStamp(),
    };
    try {
      await upsertFood(db, food);
      onSaved(food);
    } catch {
      setError('Could not save this food. Check the numbers.');
    }
  }

  return (
    <Sheet title="From the label" onClose={onClose}>
      <form className="form" onSubmit={(e) => void submit(e)}>
        {barcode && <p className="muted">Barcode {barcode}</p>}
        <label className="field">
          <span>Name</span>
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Brand (optional)</span>
          <input value={brand} maxLength={200} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <fieldset className="segmented">
          <legend>Values on the label are</legend>
          {(
            [
              ['100g', 'Per 100 g'],
              ['serving', 'Per serving'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="basis"
                value={value}
                checked={basis === value}
                onChange={() => setBasis(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Serving size (g){basis === '100g' && ' (optional)'}</span>
          <input inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} />
        </label>
        <div className="field-row two">
          <NumberField label="Calories (kcal)" value={kcalText} onChange={setKcal} />
          <NumberField label="Protein (g)" value={protein} onChange={setProtein} />
        </div>
        <div className="field-row two">
          <NumberField label="Carbs (g)" value={carbs} onChange={setCarbs} />
          <NumberField label="Fat (g)" value={fat} onChange={setFat} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Save food
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Blank means "not on the label" (undefined); otherwise a number >= 0, or null when invalid. */
function optionalNumber(text: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function NumberField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
