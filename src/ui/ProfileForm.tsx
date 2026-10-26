import { useState, type FormEvent } from 'react';
import type { ActivityLevel, Goal, Profile } from '../contract.ts';
import { Profile as ProfileSchema } from '../contract.ts';
import { localDate } from '../core/diary.ts';
import { saveProfile, upsertWeighIn } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { nowStamp } from './format.ts';

const ACTIVITY: [ActivityLevel, string][] = [
  ['sedentary', 'Mostly sitting, little exercise'],
  ['light', 'On your feet some, or exercise 1-3 days a week'],
  ['moderate', 'Exercise 3-5 days a week'],
  ['active', 'Hard exercise 6-7 days a week'],
  ['very_active', 'Physical job plus hard training'],
];

const GOALS: [Goal, string][] = [
  ['lose_weight', 'Lose weight'],
  ['maintain', 'Stay where I am'],
  ['gain_weight', 'Gain weight'],
  ['build_muscle', 'Build muscle'],
  ['cardio', 'Better cardio'],
  ['five_k', 'Run a 5K'],
  ['ten_k', 'Run a 10K'],
  ['half_marathon', 'Run a half marathon'],
  ['marathon', 'Run a marathon'],
];

type Props = {
  initial?: Profile;
  initialWeightKg?: number;
  onSaved: () => void;
  onCancel?: () => void;
};

export function ProfileForm({ initial, initialWeightKg, onSaved, onCancel }: Props) {
  const db = useDb();
  const [sex, setSex] = useState<Profile['sex']>(initial?.sex ?? 'male');
  const [birthYear, setBirthYear] = useState(initial ? String(initial.birthYear) : '');
  const [heightCm, setHeightCm] = useState(initial ? String(initial.heightCm) : '');
  const [weightKg, setWeightKg] = useState(initialWeightKg ? String(initialWeightKg) : '');
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? 'light');
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'lose_weight');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const kg = Number(weightKg);
    const parsed = ProfileSchema.safeParse({
      ...initial,
      sex,
      birthYear: Number(birthYear),
      heightCm: Number(heightCm),
      activity,
      goal,
      units: 'metric',
      updatedAt: nowStamp(),
    });
    if (!parsed.success || !(kg >= 20 && kg <= 400)) {
      setError('Check the numbers: birth year, height in cm (100-250) and weight in kg (20-400).');
      return;
    }
    await saveProfile(db, parsed.data);
    if (kg !== initialWeightKg) await upsertWeighIn(db, { date: localDate(new Date()), kg });
    onSaved();
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="segmented">
        <legend>Sex (for the calorie formula)</legend>
        {(['male', 'female'] as const).map((s) => (
          <label key={s}>
            <input
              type="radio"
              name="sex"
              value={s}
              checked={sex === s}
              onChange={() => setSex(s)}
            />
            <span>{s === 'male' ? 'Male' : 'Female'}</span>
          </label>
        ))}
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>Birth year</span>
          <input
            inputMode="numeric"
            autoComplete="bday-year"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Height (cm)</span>
          <input
            inputMode="decimal"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Weight (kg)</span>
          <input
            inputMode="decimal"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="field">
        <span>How active are you?</span>
        <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
          {ACTIVITY.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Main goal</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
          {GOALS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          {initial ? 'Save' : 'Start the adventure'}
        </button>
      </div>
      <p className="fine-print">
        Targets use the Mifflin-St Jeor formula, which is typically within about 10% for most
        adults. It is a starting point, not medical advice.
      </p>
    </form>
  );
}
