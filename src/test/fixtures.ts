/**
 * Valid example records for tests. Each one parses with its schema in contract.test.ts, so tests in
 * src/core/ can spread and override them: `{ ...fixtures.foodEntry, kcal: ... }`.
 */
import type {
  Backup,
  Food,
  FoodEntry,
  Profile,
  Program,
  Quest,
  SavedMeal,
  WeighIn,
  Workout,
} from '../contract.ts';
import { SCHEMA_VERSION } from '../contract.ts';

const at = '2026-10-26T08:30:00+00:00';

export const food: Food = {
  id: 'food-oats',
  name: 'Oats, rolled',
  source: 'usda',
  sourceId: '173904',
  per100g: { kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5 },
  portions: [{ label: '1/2 cup', grams: 40 }],
  favourite: true,
  updatedAt: at,
};

export const barcodeFood: Food = {
  id: 'food-off-3017624010701',
  name: 'Nutella',
  brand: 'Ferrero',
  barcode: '3017624010701',
  source: 'off',
  sourceId: '3017624010701',
  per100g: { kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9 },
  portions: [{ label: '1 serving (15 g)', grams: 15 }],
  favourite: false,
  updatedAt: at,
};

export const foodEntry: FoodEntry = {
  id: 'entry-1',
  date: '2026-10-26',
  loggedAt: at,
  meal: 'breakfast',
  foodId: 'food-oats',
  label: 'Oats, rolled',
  grams: 40,
  nutrition: { kcal: 151.6, proteinG: 5.28, carbsG: 27.08, fatG: 2.6 },
};

export const quickAdd: FoodEntry = {
  id: 'entry-2',
  date: '2026-10-26',
  loggedAt: '2026-10-26T13:00:00+00:00',
  meal: 'lunch',
  foodId: null,
  label: 'Lunch out',
  nutrition: { kcal: 650 },
};

export const savedMeal: SavedMeal = {
  id: 'meal-breakfast',
  name: 'Usual breakfast',
  items: [{ foodId: 'food-oats', grams: 40 }],
  favourite: true,
  updatedAt: at,
};

export const strengthWorkout: Workout = {
  id: 'workout-1',
  date: '2026-10-25',
  loggedAt: '2026-10-25T18:00:00+00:00',
  kind: 'strength',
  exercises: [
    {
      name: 'Bench Press',
      sets: [
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
        { reps: 7, weightKg: 60, rpe: 9 },
      ],
    },
  ],
  source: 'manual',
};

export const runWorkout: Workout = {
  id: 'workout-2',
  date: '2026-10-24',
  loggedAt: '2026-10-24T07:00:00+00:00',
  kind: 'run',
  exercises: [{ name: 'Run', sets: [{ distanceM: 5000, durationS: 1710 }] }],
  source: 'import',
};

export const weighIn: WeighIn = { date: '2026-10-26', kg: 80.4 };

export const profile: Profile = {
  sex: 'male',
  birthYear: 1995,
  heightCm: 180,
  activity: 'moderate',
  goal: 'lose_weight',
  units: 'metric',
  updatedAt: at,
};

export const program: Program = {
  id: 'program-1',
  goal: 'five_k',
  startDate: '2026-10-26',
  daysPerWeek: 3,
  weeks: 9,
  sessions: [
    {
      id: 'session-w1d1',
      week: 1,
      day: 1,
      title: 'Walk/run intervals',
      items: [{ type: 'run', runType: 'walk_run', intervals: { runS: 60, walkS: 90, repeats: 8 } }],
    },
    {
      id: 'session-w1d3',
      week: 1,
      day: 3,
      title: 'Strength A',
      items: [
        {
          type: 'lift',
          exercise: 'Squat',
          tier: 't1',
          sets: 3,
          reps: 10,
          amrapLastSet: false,
          weightKg: 60,
        },
        { type: 'cardio', activity: 'Bike', durationS: 600 },
      ],
    },
  ],
  progression: [{ exercise: 'Squat', tier: 't1', stage: 0, weightKg: 60 }],
  active: true,
  createdAt: at,
};

export const dailyQuest: Quest = {
  id: 'quest-daily-2026-10-26-meals',
  kind: 'daily',
  origin: 'daily',
  title: 'Log three meals',
  condition: { type: 'log_meals', count: 3 },
  xp: 30,
  window: { start: '2026-10-26', end: '2026-10-26' },
  createdAt: at,
};

export const bossQuest: Quest = {
  id: 'quest-boss-bench',
  kind: 'boss',
  origin: 'history',
  title: 'The Bench Golem',
  description: 'Beat your bench press best: 62.5 kg for 8 reps.',
  condition: { type: 'beat_pr', exercise: 'Bench Press', weightKg: 62.5, reps: 8 },
  xp: 250,
  window: { start: '2026-10-26', end: '2026-11-08' },
  createdAt: at,
};

export const backup: Backup = {
  app: 'fitness-quest',
  version: SCHEMA_VERSION,
  exportedAt: '2026-10-26T20:00:00+00:00',
  tables: {
    profile,
    settings: { lastBackupAt: '2026-10-19T20:00:00+00:00', storagePersisted: true },
    foods: [food, barcodeFood],
    foodEntries: [foodEntry, quickAdd],
    savedMeals: [savedMeal],
    workouts: [strengthWorkout, runWorkout],
    weighIns: [weighIn],
    programs: [program],
    quests: [dailyQuest, bossQuest],
  },
};
