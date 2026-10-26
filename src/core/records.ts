import type { FoodEntry, WeighIn, Workout } from '../contract.ts';

/** Everything the game reads: the user's logs. Game state and quest progress are derived from these. */
export type Records = { foodEntries: FoodEntry[]; workouts: Workout[]; weighIns: WeighIn[] };
