/**
 * The data contract for Fitness Quest.
 *
 * Every record the app stores, imports or exports has a zod schema here, and its TypeScript type is
 * inferred from that schema, so the two can never drift apart. UI code, `src/core/` modules and tests
 * all import from this file. Changing a stored shape means bumping SCHEMA_VERSION and adding a backup
 * migration.
 *
 * Conventions:
 * - Weights in kg, distances in metres, durations in seconds, energy in kcal. The UI converts for
 *   display; storage is always metric.
 * - `LocalDate` is the user's calendar day (`YYYY-MM-DD`, phone's time zone), used for grouping and
 *   streaks. `Timestamp` is an exact moment (ISO 8601 with offset).
 * - Liquids are stored by weight, treating 1 ml as 1 g.
 * - Game progress (XP, level, streak, quest completion) is derived from records and never stored.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// ---------- primitives ----------

export const Id = z.string().min(1).max(64);
export const LocalDate = z.iso.date();
export const Timestamp = z.iso.datetime({ offset: true });

const nonNegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();

export const Macros = z.object({
  kcal: nonNegative,
  proteinG: nonNegative.optional(),
  carbsG: nonNegative.optional(),
  fatG: nonNegative.optional(),
});
export type Macros = z.infer<typeof Macros>;

// ---------- food ----------

export const FoodSource = z.enum(['usda', 'off', 'custom']);
export type FoodSource = z.infer<typeof FoodSource>;

export const Portion = z.object({
  label: z.string().min(1).max(60), // "1 slice", "1 cup", "1 serving (30 g)"
  grams: positive,
});
export type Portion = z.infer<typeof Portion>;

export const Food = z.object({
  id: Id,
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  /** EAN-8, EAN-13, UPC-A or UPC-E digits */
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .optional(),
  source: FoodSource,
  /** id in the source database (USDA fdcId, Open Food Facts code) */
  sourceId: z.string().max(64).optional(),
  per100g: Macros,
  portions: z.array(Portion),
  favourite: z.boolean(),
  updatedAt: Timestamp,
});
export type Food = z.infer<typeof Food>;

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealSlot = z.infer<typeof MealSlot>;

/**
 * One logged item. Nutrition is copied in at log time, so editing or deleting a food later never
 * rewrites history. `foodId: null` is a quick-add ("650 kcal lunch").
 */
export const FoodEntry = z.object({
  id: Id,
  date: LocalDate,
  loggedAt: Timestamp,
  meal: MealSlot,
  foodId: Id.nullable(),
  label: z.string().min(1).max(200),
  grams: positive.optional(),
  nutrition: Macros,
  /** set when the entry came from logging a saved meal */
  savedMealId: Id.optional(),
});
export type FoodEntry = z.infer<typeof FoodEntry>;

export const SavedMeal = z.object({
  id: Id,
  name: z.string().min(1).max(100),
  items: z.array(z.object({ foodId: Id, grams: positive })).min(1),
  favourite: z.boolean(),
  updatedAt: Timestamp,
});
export type SavedMeal = z.infer<typeof SavedMeal>;

// ---------- workouts ----------

export const SetEntry = z
  .object({
    reps: z.number().int().nonnegative().optional(),
    weightKg: nonNegative.optional(),
    durationS: nonNegative.optional(),
    distanceM: nonNegative.optional(),
    /** rate of perceived exertion, 1-10 */
    rpe: z.number().min(1).max(10).optional(),
    /** done "until failure" without counting the reps */
    toFailure: z.boolean().optional(),
  })
  .refine(
    (s) =>
      s.reps !== undefined ||
      s.weightKg !== undefined ||
      s.durationS !== undefined ||
      s.distanceM !== undefined ||
      s.toFailure === true,
    { message: 'a set needs reps, weight, duration, distance or to be to failure' },
  );
export type SetEntry = z.infer<typeof SetEntry>;

export const ExerciseLog = z.object({
  /** display name; matching across workouts uses exerciseKey() */
  name: z.string().min(1).max(100),
  sets: z.array(SetEntry).min(1),
});
export type ExerciseLog = z.infer<typeof ExerciseLog>;

export const WorkoutKind = z.enum(['strength', 'run', 'cardio', 'other']);
export type WorkoutKind = z.infer<typeof WorkoutKind>;

export const WorkoutSource = z.enum(['manual', 'import', 'program']);
export type WorkoutSource = z.infer<typeof WorkoutSource>;

/** A run is a Workout of kind 'run' whose exercise "Run" has sets with distanceM and durationS. */
export const Workout = z.object({
  id: Id,
  date: LocalDate,
  loggedAt: Timestamp,
  kind: WorkoutKind,
  title: z.string().max(100).optional(),
  exercises: z.array(ExerciseLog).min(1),
  durationMin: nonNegative.optional(),
  source: WorkoutSource,
  programSessionId: Id.optional(),
  note: z.string().max(2000).optional(),
});
export type Workout = z.infer<typeof Workout>;

/** Normalises an exercise name for matching: "Bench Press " and "bench  press" are the same lift. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------- body and profile ----------

/** One weigh-in per day; the date is the key. */
export const WeighIn = z.object({
  date: LocalDate,
  kg: z.number().min(20).max(400),
});
export type WeighIn = z.infer<typeof WeighIn>;

export const Goal = z.enum([
  'lose_weight',
  'maintain',
  'gain_weight',
  'build_muscle',
  'cardio',
  'five_k',
  'ten_k',
  'half_marathon',
  'marathon',
]);
export type Goal = z.infer<typeof Goal>;

export const ActivityLevel = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

/** The 12 Kenney Mini Characters (public/hero/<id>.glb). */
export const HERO_IDS = [
  'male-a',
  'male-b',
  'male-c',
  'male-d',
  'male-e',
  'male-f',
  'female-a',
  'female-b',
  'female-c',
  'female-d',
  'female-e',
  'female-f',
] as const;
export const HeroId = z.enum(HERO_IDS);
export type HeroId = z.infer<typeof HeroId>;

export const Profile = z.object({
  /** used only by the Mifflin-St Jeor equation */
  sex: z.enum(['male', 'female']),
  birthYear: z.number().int().min(1900).max(2100),
  heightCm: z.number().min(100).max(250),
  activity: ActivityLevel,
  goal: Goal,
  units: z.enum(['metric', 'imperial']),
  /** manual override of the daily calorie target */
  kcalTargetOverride: z.number().int().min(800).max(6000).optional(),
  /** manual macro targets in g/day; a missing one is worked out from the calorie target */
  macroTargets: z
    .object({
      proteinG: z.number().int().min(0).max(500).optional(),
      carbsG: z.number().int().min(0).max(1000).optional(),
      fatG: z.number().int().min(0).max(400).optional(),
    })
    .optional(),
  /** the player's chosen character; the body shape on it comes from their records */
  hero: HeroId.optional(),
  /** customising the chosen character: another character's head, and palette cells swapped for others (0-63) */
  heroLook: z
    .object({
      head: HeroId.optional(),
      colours: z.record(z.string().regex(/^\d{1,2}$/), z.number().int().min(0).max(63)).optional(),
    })
    .optional(),
  /** how boss quests progress lifts; defaults from the goal when absent */
  style: z.enum(['powerlifting', 'bodybuilding', 'calisthenics']).optional(),
  updatedAt: Timestamp,
});
export type Profile = z.infer<typeof Profile>;

// ---------- programs ----------

export const LiftTier = z.enum(['t1', 't2', 't3']);
export type LiftTier = z.infer<typeof LiftTier>;

export const RunType = z.enum(['walk_run', 'easy', 'long', 'tempo', 'intervals']);
export type RunType = z.infer<typeof RunType>;

export const PlannedItem = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lift'),
    exercise: z.string().min(1).max(100),
    tier: LiftTier.optional(),
    sets: z.number().int().min(1).max(20),
    reps: z.number().int().min(1).max(100),
    /** the last set is "as many reps as possible" */
    amrapLastSet: z.boolean(),
    /** absent until the user's starting weight is known */
    weightKg: nonNegative.optional(),
  }),
  z.object({
    type: z.literal('run'),
    runType: RunType,
    distanceM: positive.optional(),
    durationS: positive.optional(),
    /** walk/run intervals, couch-to-5K style */
    intervals: z
      .object({
        runS: positive,
        walkS: nonNegative,
        repeats: z.number().int().min(1).max(50),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('cardio'),
    activity: z.string().min(1).max(60),
    durationS: positive,
  }),
]);
export type PlannedItem = z.infer<typeof PlannedItem>;

export const PlannedSession = z.object({
  id: Id,
  week: z.number().int().min(1),
  /** ISO weekday, 1 = Monday */
  day: z.number().int().min(1).max(7),
  title: z.string().min(1).max(100),
  items: z.array(PlannedItem).min(1),
});
export type PlannedSession = z.infer<typeof PlannedSession>;

/** Where a lift is in its progression (GZCLP-style stages: 0 = 3x10, 1 = 3x8, 2 = 3x6 for T1). */
export const LiftProgress = z.object({
  exercise: z.string().min(1).max(100),
  tier: LiftTier,
  stage: z.number().int().min(0).max(2),
  weightKg: nonNegative,
});
export type LiftProgress = z.infer<typeof LiftProgress>;

export const Program = z.object({
  id: Id,
  goal: Goal,
  /** a Monday; week 1 starts here */
  startDate: LocalDate,
  daysPerWeek: z.number().int().min(2).max(6),
  weeks: z.number().int().min(1).max(30),
  sessions: z.array(PlannedSession).min(1),
  progression: z.array(LiftProgress),
  active: z.boolean(),
  createdAt: Timestamp,
});
export type Program = z.infer<typeof Program>;

// ---------- quests ----------

/** What a quest asks for; progress is evaluated from records inside the quest's window. */
export const QuestCondition = z.discriminatedUnion('type', [
  /** log at least `count` food entries */
  z.object({ type: z.literal('log_meals'), count: z.number().int().min(1) }),
  /** on at least `days` days, total kcal falls inside [minKcal, maxKcal] */
  z.object({
    type: z.literal('kcal_in_range'),
    days: z.number().int().min(1),
    minKcal: nonNegative,
    maxKcal: positive,
  }),
  /** log at least `count` workouts (of `kind`, if given) */
  z.object({
    type: z.literal('workout_count'),
    count: z.number().int().min(1),
    kind: WorkoutKind.optional(),
  }),
  /** total volume (sum of reps x weightKg) for one exercise reaches `kg` */
  z.object({
    type: z.literal('exercise_volume'),
    exercise: z.string().min(1).max(100),
    kg: positive,
  }),
  /** one set of the exercise with at least `weightKg` for at least `reps` */
  z.object({
    type: z.literal('beat_pr'),
    exercise: z.string().min(1).max(100),
    weightKg: nonNegative,
    reps: z.number().int().min(1),
  }),
  /** total run distance reaches `meters` (or a single run does, if `single`) */
  z.object({ type: z.literal('run_distance'), meters: positive, single: z.boolean() }),
  /** one run of at least `meters` in at most `maxSeconds` */
  z.object({ type: z.literal('run_time'), meters: positive, maxSeconds: positive }),
  /** a workout linked to this planned session is logged */
  z.object({ type: z.literal('program_session'), sessionId: Id }),
  /** weigh in on at least `count` days */
  z.object({ type: z.literal('weigh_in'), count: z.number().int().min(1) }),
]);
export type QuestCondition = z.infer<typeof QuestCondition>;
export type QuestConditionType = QuestCondition['type'];

export const QuestKind = z.enum(['daily', 'weekly', 'story', 'boss']);
export type QuestKind = z.infer<typeof QuestKind>;

export const QuestOrigin = z.enum(['daily', 'history', 'program', 'story']);
export type QuestOrigin = z.infer<typeof QuestOrigin>;

/** Quests are generated and then stored, so a day's quests don't change after they are shown. */
export const Quest = z
  .object({
    id: Id,
    kind: QuestKind,
    origin: QuestOrigin,
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    condition: QuestCondition,
    xp: z.number().int().min(1).max(10_000),
    /** inclusive local-date window in which records count */
    window: z.object({ start: LocalDate, end: LocalDate }),
    createdAt: Timestamp,
  })
  .refine((q) => q.window.start <= q.window.end, { message: 'window ends before it starts' });
export type Quest = z.infer<typeof Quest>;

export type QuestProgress = {
  questId: string;
  /** 0..1 */
  fraction: number;
  /** e.g. "2 / 3 meals" */
  label: string;
  complete: boolean;
  /** the local date the quest was completed on, if it is */
  completedOn?: string;
};

/** Derived on the fly from records and quests; never stored. */
export type GameState = {
  xp: number;
  level: number;
  /** XP earned inside the current level, and XP needed to finish it */
  xpIntoLevel: number;
  xpForLevel: number;
  /** consecutive days with any record, counting frozen days */
  streakDays: number;
  /** streak freezes available (max 2) */
  freezes: number;
  completedQuestIds: string[];
  /** index of the hero's node on the overworld path */
  mapNode: number;
};

// ---------- settings ----------

export const Settings = z.object({
  lastBackupAt: Timestamp.optional(),
  /** asked navigator.storage.persist() and got this answer */
  storagePersisted: z.boolean().optional(),
});
export type Settings = z.infer<typeof Settings>;

// ---------- backup file ----------

export const BackupTables = z.object({
  profile: Profile.nullable(),
  settings: Settings,
  foods: z.array(Food),
  foodEntries: z.array(FoodEntry),
  savedMeals: z.array(SavedMeal),
  workouts: z.array(Workout),
  weighIns: z.array(WeighIn),
  programs: z.array(Program),
  quests: z.array(Quest),
});
export type BackupTables = z.infer<typeof BackupTables>;

export const Backup = z.object({
  app: z.literal('fitness-quest'),
  version: z.number().int().min(1),
  exportedAt: Timestamp,
  tables: BackupTables,
});
export type Backup = z.infer<typeof Backup>;
