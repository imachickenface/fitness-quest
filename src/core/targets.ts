/**
 * Daily energy and macro targets, derived from the user's Profile and latest weigh-in.
 *
 * Everything here is a pure function: no DOM, no clock, no mutation of the inputs. The
 * Mifflin-St Jeor BMR and the activity-factor TDEE follow the standard public-health
 * formulas; the goal adjustments are capped so a deficit or surplus can never get extreme.
 */
import type { ActivityLevel, Goal, Profile } from '../contract.ts';

/** TDEE multipliers on BMR, per activity level (Mifflin-St Jeor's five levels). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * Age in completed calendar years. The profile stores only a birth year, so this is a plain
 * year difference; `today` is a 'YYYY-MM-DD' local date.
 */
export function ageOn(birthYear: number, today: string): number {
  return Number(today.slice(0, 4)) - birthYear;
}

/** Mifflin-St Jeor BMR in kcal/day: 10w + 6.25h - 5a + 5 (men) / -161 (women). Unrounded. */
export function bmrMifflin(p: {
  sex: 'male' | 'female';
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

export type CalorieTarget = {
  bmr: number; // Math.round(bmr)
  tdee: number; // Math.round(bmr * activity factor)
  kcal: number; // daily target, rounded to the nearest 10
  deltaKcal: number; // kcal - tdee (both rounded values)
  proteinG: number;
  carbsG: number;
  fatG: number;
  note?: 'floor' | 'override' | 'macros';
};

/** Raw goal adjustment applied to the unrounded TDEE. */
function goalTarget(goal: Goal, tdee: number): number {
  switch (goal) {
    case 'lose_weight':
      return tdee - Math.min(0.2 * tdee, 750);
    case 'gain_weight':
      return tdee + Math.min(0.15 * tdee, 500);
    case 'build_muscle':
      return tdee + Math.min(0.1 * tdee, 300);
    default:
      // maintain, cardio and every running goal simply eat at TDEE.
      return tdee;
  }
}

/** Protein target in g/kg of body weight, by goal. */
function proteinFactor(goal: Goal): number {
  if (goal === 'lose_weight') return 2.0;
  if (goal === 'build_muscle') return 1.8;
  return 1.6;
}

export function calorieTarget(profile: Profile, weightKg: number, today: string): CalorieTarget {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError(`weightKg must be a finite number > 0, got ${weightKg}`);
  }

  const age = ageOn(profile.birthYear, today);
  const bmr = bmrMifflin({ sex: profile.sex, weightKg, heightCm: profile.heightCm, age });
  const tdee = bmr * ACTIVITY_FACTORS[profile.activity];

  let target = goalTarget(profile.goal, tdee);
  let note: 'floor' | 'override' | 'macros' | undefined;

  if (profile.goal === 'lose_weight') {
    const floor = Math.max(bmr, profile.sex === 'male' ? 1500 : 1200);
    if (target < floor) {
      target = floor;
      note = 'floor';
    }
  }

  if (profile.kcalTargetOverride !== undefined) {
    target = profile.kcalTargetOverride;
    note = 'override';
  }

  // All three macros set and no calorie override: the macros define the calories.
  const m = profile.macroTargets ?? {};
  if (
    profile.kcalTargetOverride === undefined &&
    m.proteinG !== undefined &&
    m.carbsG !== undefined &&
    m.fatG !== undefined
  ) {
    target = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
    note = 'macros';
  }

  const kcal = Math.round(target / 10) * 10;
  const proteinG = m.proteinG ?? Math.round(weightKg * proteinFactor(profile.goal));
  const fatG = m.fatG ?? Math.round((kcal * 0.25) / 9);
  const carbsG = m.carbsG ?? Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  const roundedBmr = Math.round(bmr);
  const roundedTdee = Math.round(tdee);

  return {
    bmr: roundedBmr,
    tdee: roundedTdee,
    kcal,
    deltaKcal: kcal - roundedTdee,
    proteinG,
    carbsG,
    fatG,
    ...(note === undefined ? {} : { note }),
  };
}
