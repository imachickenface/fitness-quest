import { useState, type FormEvent } from 'react';
import type { ActivityLevel, Goal, Profile } from '../contract.ts';
import { Profile as ProfileSchema } from '../contract.ts';
import { localDate } from '../core/diary.ts';
import { saveProfile, upsertWeighIn } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { fromUnit, nowStamp, toUnit } from './format.ts';

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

/** The automatic targets, shown as placeholders for the custom ones. */
export type TargetDefaults = { kcal: number; proteinG: number; carbsG: number; fatG: number };

type Props = {
  initial?: Profile;
  defaults?: TargetDefaults;
  initialWeightKg?: number;
  /** maintenance measured from the logs, and the target it gives for the goal */
  fromLogs?: { maintenance: number; kcal: number; kgPerWeek: number };
  onSaved: () => void;
  onCancel?: () => void;
};

export function ProfileForm({
  initial,
  defaults,
  initialWeightKg,
  fromLogs,
  onSaved,
  onCancel,
}: Props) {
  const db = useDb();
  const [sex, setSex] = useState<Profile['sex']>(initial?.sex ?? 'male');
  const [birthYear, setBirthYear] = useState(initial ? String(initial.birthYear) : '');
  const [heightCm, setHeightCm] = useState(initial ? String(initial.heightCm) : '');
  const [units, setUnits] = useState<Profile['units']>(initial?.units ?? 'metric');
  const [weight, setWeight] = useState(
    initialWeightKg ? String(toUnit(initialWeightKg, initial?.units ?? 'metric')) : '',
  );
  const [style, setStyle] = useState<NonNullable<Profile['style']>>(
    initial?.style ?? 'bodybuilding',
  );
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? 'light');
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'lose_weight');
  const [error, setError] = useState<string | null>(null);
  const [kcalT, setKcalT] = useState(asText(initial?.kcalTargetOverride));
  const [proteinT, setProteinT] = useState(asText(initial?.macroTargets?.proteinG));
  const [carbsT, setCarbsT] = useState(asText(initial?.macroTargets?.carbsG));
  const [fatT, setFatT] = useState(asText(initial?.macroTargets?.fatG));
  const custom = {
    kcal: whole(kcalT),
    proteinG: whole(proteinT),
    carbsG: whole(carbsT),
    fatG: whole(fatT),
  };
  const macroSum =
    custom.proteinG !== undefined && custom.carbsG !== undefined && custom.fatG !== undefined
      ? custom.proteinG * 4 + custom.carbsG * 4 + custom.fatG * 9
      : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const kg = fromUnit(Number(weight.replace(',', '.')), units);
    const macroTargets = {
      ...(custom.proteinG !== undefined ? { proteinG: custom.proteinG } : {}),
      ...(custom.carbsG !== undefined ? { carbsG: custom.carbsG } : {}),
      ...(custom.fatG !== undefined ? { fatG: custom.fatG } : {}),
    };
    // custom targets come from the form only, so clearing a box removes the old value
    const rest: Partial<Profile> = { ...initial };
    delete rest.kcalTargetOverride;
    delete rest.macroTargets;
    const parsed = ProfileSchema.safeParse({
      ...rest,
      ...(custom.kcal !== undefined ? { kcalTargetOverride: custom.kcal } : {}),
      ...(Object.keys(macroTargets).length > 0 ? { macroTargets } : {}),
      sex,
      birthYear: Number(birthYear),
      heightCm: Number(heightCm),
      activity,
      goal,
      units,
      style,
      updatedAt: nowStamp(),
    });
    if (!parsed.success || !(kg >= 20 && kg <= 400)) {
      setError(
        'Check the numbers: birth year, height in cm (100-250), weight in kg (20-400), and any custom targets (calories 800-6,000; protein up to 500 g, carbs 1,000 g, fat 400 g).',
      );
      return;
    }
    await saveProfile(db, parsed.data);
    if (initialWeightKg === undefined || Math.abs(kg - initialWeightKg) >= 0.05)
      await upsertWeighIn(db, { date: localDate(new Date()), kg });
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
          <span>Weight ({units === 'imperial' ? 'lb' : 'kg'})</span>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </label>
      </div>

      <fieldset className="segmented">
        <legend>Weights in</legend>
        {(
          [
            ['metric', 'Kilograms'],
            ['imperial', 'Pounds'],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="units"
              value={value}
              checked={units === value}
              onChange={() => {
                // keep the typed weight meaning the same thing
                const n = Number(weight.replace(',', '.'));
                if (weight.trim() && Number.isFinite(n))
                  setWeight(String(toUnit(fromUnit(n, units), value)));
                setUnits(value);
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

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

      <label className="field">
        <span>Training style (sets how your boss quests progress)</span>
        <select value={style} onChange={(e) => setStyle(e.target.value as typeof style)}>
          <option value="bodybuilding">Bodybuilding: add reps, then weight</option>
          <option value="powerlifting">Powerlifting: heavier sets of 5 or fewer</option>
          <option value="calisthenics">Calisthenics: bodyweight reps, then added weight</option>
        </select>
      </label>

      {initial && fromLogs && (
        <div className="from-logs">
          <p>
            From your last 4 weeks of logs, your maintenance is about{' '}
            <strong>{fromLogs.maintenance.toLocaleString('en')} kcal</strong> (weight trend{' '}
            {trendText(fromLogs.kgPerWeek, units)}).
          </p>
          <button
            type="button"
            className="btn btn-small"
            disabled={kcalT === String(fromLogs.kcal)}
            onClick={() => setKcalT(String(fromLogs.kcal))}
          >
            Use {fromLogs.kcal.toLocaleString('en')} kcal as my target
          </button>
        </div>
      )}

      {initial && (
        <details className="custom-targets" open={kcalT + proteinT + carbsT + fatT !== ''}>
          <summary>Custom targets</summary>
          <p className="muted">Leave a box blank to keep the automatic value shown in it.</p>
          <div className="field-row two">
            <TargetField
              label="Calories (kcal)"
              value={kcalT}
              onChange={setKcalT}
              auto={defaults?.kcal}
            />
            <TargetField
              label="Protein (g)"
              value={proteinT}
              onChange={setProteinT}
              auto={defaults?.proteinG}
            />
            <TargetField
              label="Carbs (g)"
              value={carbsT}
              onChange={setCarbsT}
              auto={defaults?.carbsG}
            />
            <TargetField label="Fat (g)" value={fatT} onChange={setFatT} auto={defaults?.fatG} />
          </div>
          {macroSum !== undefined && (
            <p className="muted" role="status">
              Your macros add up to {macroSum.toLocaleString('en-GB')} kcal
              {custom.kcal === undefined
                ? ', which becomes your calorie target.'
                : Math.abs(macroSum - custom.kcal) > custom.kcal * 0.05
                  ? `, not the ${custom.kcal.toLocaleString('en-GB')} kcal you set. The calorie target wins.`
                  : '.'}
            </p>
          )}
        </details>
      )}

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

function asText(n: number | undefined): string {
  return n === undefined ? '' : String(n);
}

/** Blank means automatic (undefined); otherwise the number rounded to a whole value, NaN if not a number. */
function whole(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  return Math.round(Number(text.replace(',', '.')));
}

function TargetField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  auto?: number;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        inputMode="numeric"
        placeholder={props.auto === undefined ? 'auto' : `auto: ${props.auto}`}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function trendText(kgPerWeek: number, units: Profile['units']): string {
  if (kgPerWeek === 0) return 'steady';
  const amount =
    units === 'imperial'
      ? `${Math.abs(kgPerWeek * 2.2046).toFixed(1)} lb`
      : `${Math.abs(kgPerWeek).toFixed(2)} kg`;
  return `${kgPerWeek < 0 ? 'down' : 'up'} ${amount} a week`;
}
