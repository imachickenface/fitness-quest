/**
 * Dexie wrapper for Fitness Quest.
 *
 * Every record shape lives in `src/contract.ts`; each write here runs the value through the matching
 * zod schema's `.parse()` *before* it touches IndexedDB, so a bad record throws a `ZodError` and the
 * store is left untouched. Reads return the contract types (or `undefined` when the row is missing).
 *
 * Indexes follow the queries the UI needs: secondary indexes only on strings/numbers (IndexedDB cannot
 * index booleans, so `favourite` is filtered in JS), `date` is the primary key of `weighIns` (one per
 * day), and `kv` holds singletons such as the profile and settings.
 */
import Dexie, { type Table } from 'dexie';
import {
  Food,
  FoodEntry,
  Profile,
  SavedMeal,
  Settings,
  WeighIn,
  Workout,
  Quest,
  Program,
} from '../contract.ts';

/** IndexedDB key type for the string primary keys used by every table here. */
type PK = string;

export class FitnessDb extends Dexie {
  foods!: Table<Food, PK>;
  foodEntries!: Table<FoodEntry, PK>;
  savedMeals!: Table<SavedMeal, PK>;
  workouts!: Table<Workout, PK>;
  weighIns!: Table<WeighIn, PK>;
  programs!: Table<Program, PK>;
  quests!: Table<Quest, PK>;
  kv!: Table<{ key: string; value: unknown }, PK>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      foods: 'id, barcode, name',
      foodEntries: 'id, date, loggedAt, foodId',
      savedMeals: 'id, name',
      workouts: 'id, date, loggedAt',
      weighIns: 'date',
      programs: 'id',
      quests: 'id, kind',
      kv: 'key',
    });
  }
}

/** Open (or create) the database. Dexie opens lazily; `open()` forces it. */
export function openDb(name = 'fitness-quest'): FitnessDb {
  return new FitnessDb(name);
}

// ---------- foods ----------

export async function upsertFood(db: FitnessDb, food: Food): Promise<void> {
  const parsed = Food.parse(food);
  await db.foods.put(parsed);
}

export async function getFood(db: FitnessDb, id: string): Promise<Food | undefined> {
  return await db.foods.get(id);
}

export async function getFoodByBarcode(db: FitnessDb, barcode: string): Promise<Food | undefined> {
  // `barcode` is an index, so this is a lookup rather than a scan.
  return await db.foods.where('barcode').equals(barcode).first();
}

export async function listFavouriteFoods(db: FitnessDb): Promise<Food[]> {
  const all = await db.foods.toArray();
  return all
    .filter((f) => f.favourite)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function setFoodFavourite(
  db: FitnessDb,
  id: string,
  favourite: boolean,
  now: string,
): Promise<void> {
  const food = await db.foods.get(id);
  if (food === undefined) throw new Error(`Food ${id} not found`);
  await upsertFood(db, { ...food, favourite, updatedAt: now });
}

// ---------- food entries ----------

export async function addFoodEntry(db: FitnessDb, entry: FoodEntry): Promise<void> {
  const parsed = FoodEntry.parse(entry);
  await db.foodEntries.add(parsed);
}

export async function addFoodEntries(db: FitnessDb, entries: readonly FoodEntry[]): Promise<void> {
  // Validate everything first: an invalid entry means nothing at all is written.
  const parsed = entries.map((entry) => FoodEntry.parse(entry));
  await db.transaction('rw', db.foodEntries, async () => {
    await db.foodEntries.bulkAdd(parsed);
  });
}

export async function deleteFoodEntry(db: FitnessDb, id: string): Promise<void> {
  await db.foodEntries.delete(id);
}

export async function listEntriesForDate(db: FitnessDb, date: string): Promise<FoodEntry[]> {
  const entries = await db.foodEntries.where('date').equals(date).toArray();
  return entries.sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
}

export async function listRecentEntries(db: FitnessDb, limit: number): Promise<FoodEntry[]> {
  if (limit <= 0) return [];
  return await db.foodEntries.orderBy('loggedAt').reverse().limit(limit).toArray();
}

// ---------- saved meals ----------

export async function upsertSavedMeal(db: FitnessDb, meal: SavedMeal): Promise<void> {
  const parsed = SavedMeal.parse(meal);
  await db.savedMeals.put(parsed);
}

export async function listSavedMeals(db: FitnessDb): Promise<SavedMeal[]> {
  const meals = await db.savedMeals.toArray();
  return meals.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function deleteSavedMeal(db: FitnessDb, id: string): Promise<void> {
  await db.savedMeals.delete(id);
}

// ---------- profile and settings (kv singletons) ----------

const PROFILE_KEY = 'profile';
const SETTINGS_KEY = 'settings';

export async function getProfile(db: FitnessDb): Promise<Profile | undefined> {
  const row = await db.kv.get(PROFILE_KEY);
  return row === undefined ? undefined : (row.value as Profile);
}

export async function saveProfile(db: FitnessDb, profile: Profile): Promise<void> {
  const parsed = Profile.parse(profile);
  await db.kv.put({ key: PROFILE_KEY, value: parsed });
}

export async function getSettings(db: FitnessDb): Promise<Settings> {
  const row = await db.kv.get(SETTINGS_KEY);
  return row === undefined ? {} : (row.value as Settings);
}

export async function updateSettings(db: FitnessDb, patch: Partial<Settings>): Promise<void> {
  const current = await getSettings(db);
  const parsed = Settings.parse({ ...current, ...patch });
  await db.kv.put({ key: SETTINGS_KEY, value: parsed });
}

// ---------- weigh-ins ----------

export async function upsertWeighIn(db: FitnessDb, weighIn: WeighIn): Promise<void> {
  const parsed = WeighIn.parse(weighIn);
  // The date is the primary key, so a second weigh-in on the same day replaces the first.
  await db.weighIns.put(parsed);
}

export async function listWeighIns(db: FitnessDb, from?: string, to?: string): Promise<WeighIn[]> {
  // The primary key is the date, so the table already comes back in date order.
  if (from === undefined && to === undefined) return await db.weighIns.toArray();
  return await db.weighIns
    .where('date')
    .between(from ?? '', to ?? '￿', true, true)
    .toArray();
}
