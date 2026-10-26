import { describe, expect, it } from 'vitest';
import type { Profile } from '../contract.ts';
import { Profile as ProfileSchema } from '../contract.ts';
import * as fx from '../test/fixtures.ts';
import { ACTIVITY_FACTORS, ageOn, bmrMifflin, calorieTarget } from './targets.ts';

const male: Profile = { ...fx.profile, sex: 'male', birthYear: 1995, heightCm: 180 };
const female: Profile = {
  ...fx.profile,
  sex: 'female',
  birthYear: 2000,
  heightCm: 165,
  activity: 'sedentary',
};

describe('ageOn', () => {
  it('is the calendar year difference (birth month is not stored)', () => {
    expect(ageOn(1995, '2026-10-26')).toBe(31);
    expect(ageOn(1995, '2026-01-01')).toBe(31);
    expect(ageOn(2000, '2026-12-31')).toBe(26);
  });
});

describe('bmrMifflin', () => {
  it('uses 10w + 6.25h - 5a + 5 for men', () => {
    expect(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, age: 31 })).toBeCloseTo(1775, 6);
  });
  it('uses 10w + 6.25h - 5a - 161 for women', () => {
    expect(bmrMifflin({ sex: 'female', weightKg: 60, heightCm: 165, age: 26 })).toBeCloseTo(
      1340.25,
      6,
    );
  });
});

describe('ACTIVITY_FACTORS', () => {
  it('has the standard multipliers', () => {
    expect(ACTIVITY_FACTORS).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    });
  });
});

describe('calorieTarget', () => {
  it('weight loss: 20% deficit, macros from protein 2.0 g/kg and 25% fat', () => {
    // BMR 1775, TDEE 1775 * 1.55 = 2751.25, deficit 550.25 -> 2201 -> rounded to 2200
    const t = calorieTarget({ ...male, goal: 'lose_weight' }, 80, '2026-10-26');
    expect(t.bmr).toBe(1775);
    expect(t.tdee).toBe(2751);
    expect(t.kcal).toBe(2200);
    expect(t.deltaKcal).toBe(2200 - 2751);
    expect(t.proteinG).toBe(160); // 80 kg x 2.0
    expect(t.fatG).toBe(61); // 2200 x 0.25 / 9 = 61.1
    expect(t.carbsG).toBe(253); // (2200 - 160*4 - 61*9) / 4 = 252.75
    expect(t.note).toBeUndefined();
  });

  it('weight loss deficit is capped at 750 kcal', () => {
    // very active, heavy: TDEE well above 3750, so 20% would exceed 750
    const big: Profile = { ...male, activity: 'very_active', goal: 'lose_weight' };
    const t = calorieTarget(big, 130, '2026-10-26');
    // BMR = 1300 + 1125 - 155 + 5 = 2275; TDEE = 4322.5; deficit 750 -> 3572.5 -> 3570
    expect(t.tdee).toBe(4323);
    expect(t.kcal).toBe(3570);
  });

  it('weight loss never goes below max(BMR, 1200 for women / 1500 for men)', () => {
    // BMR 1340.25, TDEE 1608.3, 20% deficit -> 1286.64, below BMR -> floor at BMR -> 1340
    const t = calorieTarget({ ...female, goal: 'lose_weight' }, 60, '2026-10-26');
    expect(t.bmr).toBe(1340);
    expect(t.kcal).toBe(1340);
    expect(t.note).toBe('floor');
  });

  it('the 1500 kcal floor applies to men with a low BMR', () => {
    // BMR = 500 + 937.5 - 400 + 5 = 1042.5; TDEE sedentary 1251; deficit 250.2 -> 1000.8 -> floor 1500
    const small: Profile = {
      ...male,
      birthYear: 1946,
      heightCm: 150,
      activity: 'sedentary',
      goal: 'lose_weight',
    };
    const t = calorieTarget(small, 50, '2026-10-26');
    expect(t.kcal).toBe(1500);
    expect(t.note).toBe('floor');
  });

  it('maintain and running goals eat at TDEE', () => {
    for (const goal of [
      'maintain',
      'cardio',
      'five_k',
      'ten_k',
      'half_marathon',
      'marathon',
    ] as const) {
      const t = calorieTarget({ ...male, goal }, 80, '2026-10-26');
      expect(t.kcal, goal).toBe(2750); // 2751.25 rounded to the nearest 10
      expect(t.deltaKcal, goal).toBe(2750 - 2751);
      expect(t.proteinG, goal).toBe(128); // 1.6 g/kg
    }
  });

  it('weight gain: +15% capped at 500 kcal, protein 1.6 g/kg', () => {
    const t = calorieTarget({ ...male, goal: 'gain_weight' }, 80, '2026-10-26');
    // 2751.25 + min(412.69, 500) = 3163.94 -> 3160
    expect(t.kcal).toBe(3160);
    expect(t.proteinG).toBe(128);
    const big = calorieTarget(
      { ...male, activity: 'very_active', goal: 'gain_weight' },
      130,
      '2026-10-26',
    );
    expect(big.kcal).toBe(4820); // 4322.5 + 500 = 4822.5 -> 4820
  });

  it('muscle gain: +10% capped at 300 kcal, protein 1.8 g/kg', () => {
    const t = calorieTarget({ ...male, goal: 'build_muscle' }, 80, '2026-10-26');
    // 2751.25 + min(275.125, 300) = 3026.375 -> 3030
    expect(t.kcal).toBe(3030);
    expect(t.proteinG).toBe(144);
    const big = calorieTarget(
      { ...male, activity: 'very_active', goal: 'build_muscle' },
      130,
      '2026-10-26',
    );
    expect(big.kcal).toBe(4620); // 4322.5 + 300 = 4622.5 -> 4620
  });

  it('a manual override wins and is reported', () => {
    const t = calorieTarget(
      { ...male, goal: 'lose_weight', kcalTargetOverride: 2400 },
      80,
      '2026-10-26',
    );
    expect(t.kcal).toBe(2400);
    expect(t.deltaKcal).toBe(2400 - 2751);
    expect(t.note).toBe('override');
    expect(t.proteinG).toBe(160);
    expect(t.fatG).toBe(67); // 2400 x 0.25 / 9 = 66.67
    expect(t.carbsG).toBe(289); // (2400 - 640 - 603) / 4 = 289.25
  });

  it('manual macros replace the worked-out ones; the rest fill the calorie target', () => {
    const t = calorieTarget(
      { ...male, goal: 'lose_weight', kcalTargetOverride: 2400, macroTargets: { proteinG: 180 } },
      80,
      '2026-10-26',
    );
    expect(t.kcal).toBe(2400);
    expect(t.note).toBe('override');
    expect(t.proteinG).toBe(180);
    expect(t.fatG).toBe(67);
    expect(t.carbsG).toBe(269); // (2400 - 720 - 603) / 4 = 269.25

    const fatOnly = calorieTarget(
      { ...male, goal: 'maintain', macroTargets: { fatG: 50 } },
      80,
      '2026-10-26',
    );
    expect(fatOnly.fatG).toBe(50);
    expect(fatOnly.carbsG).toBe(Math.round((fatOnly.kcal - 128 * 4 - 450) / 4));
  });

  it('all three macros and no calorie override: calories are their sum', () => {
    const t = calorieTarget(
      { ...male, goal: 'lose_weight', macroTargets: { proteinG: 150, carbsG: 200, fatG: 60 } },
      80,
      '2026-10-26',
    );
    expect(t).toMatchObject({ kcal: 1940, proteinG: 150, carbsG: 200, fatG: 60, note: 'macros' });
  });

  it('a calorie override beats the macro sum', () => {
    const t = calorieTarget(
      {
        ...male,
        kcalTargetOverride: 2000,
        macroTargets: { proteinG: 150, carbsG: 200, fatG: 60 },
      },
      80,
      '2026-10-26',
    );
    expect(t).toMatchObject({ kcal: 2000, note: 'override', carbsG: 200 });
  });

  it('carbs never go negative', () => {
    // tiny override with high protein need
    const t = calorieTarget(
      { ...male, goal: 'lose_weight', kcalTargetOverride: 800 },
      150,
      '2026-10-26',
    );
    expect(t.carbsG).toBe(0);
  });

  it('rejects impossible body weights', () => {
    expect(() => calorieTarget(male, 0, '2026-10-26')).toThrow(RangeError);
    expect(() => calorieTarget(male, -5, '2026-10-26')).toThrow(RangeError);
    expect(() => calorieTarget(male, Number.NaN, '2026-10-26')).toThrow(RangeError);
  });

  it('does not mutate the profile', () => {
    const p = ProfileSchema.parse({ ...male });
    const copy = structuredClone(p);
    calorieTarget(p, 80, '2026-10-26');
    expect(p).toEqual(copy);
  });
});
