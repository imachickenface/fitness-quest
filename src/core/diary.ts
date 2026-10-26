/**
 * Pure diary logic: turning foods and saved meals into logged entries, totalling a day, and
 * suggesting what to log next. No DOM, no clock, no mutation of inputs (see CLAUDE.md: `src/core/` is
 * deterministic; `now`/`today` and id generators are passed in).
 */
import type { Food, FoodEntry, Macros, MealSlot, SavedMeal } from '../contract.ts';

/** Round to one decimal place; every stored macro total uses this. */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Everything a log needs that the caller (not this module) knows: the day, the slot, "now", the new id. */
export type EntryContext = { date: string; meal: MealSlot; now: string; id: string };

/**
 * Scale a food's per-100 g values to a portion. Macros the food does not carry stay absent, so a total
 * never invents a zero for something that was simply never measured.
 */
export function nutritionFor(food: Food, grams: number): Macros {
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new RangeError(`grams must be a finite number > 0, got ${grams}`);
  }
  const scale = grams / 100;
  const out: Macros = { kcal: round1(food.per100g.kcal * scale) };
  if (food.per100g.proteinG !== undefined) {
    out.proteinG = round1(food.per100g.proteinG * scale);
  }
  if (food.per100g.carbsG !== undefined) {
    out.carbsG = round1(food.per100g.carbsG * scale);
  }
  if (food.per100g.fatG !== undefined) {
    out.fatG = round1(food.per100g.fatG * scale);
  }
  return out;
}

/** Log a real food: nutrition is copied in at log time, so later edits to the food never rewrite history. */
export function entryFromFood(food: Food, grams: number, ctx: EntryContext): FoodEntry {
  return {
    id: ctx.id,
    date: ctx.date,
    loggedAt: ctx.now,
    meal: ctx.meal,
    foodId: food.id,
    label: food.brand ? `${food.name} (${food.brand})` : food.name,
    grams,
    nutrition: nutritionFor(food, grams),
  };
}

/** A quick-add ("650 kcal lunch"): no food behind it, no grams, calories only. */
export function quickAddEntry(kcal: number, label: string, ctx: EntryContext): FoodEntry {
  if (!Number.isFinite(kcal) || kcal < 0) {
    throw new RangeError(`kcal must be a finite number >= 0, got ${kcal}`);
  }
  return {
    id: ctx.id,
    date: ctx.date,
    loggedAt: ctx.now,
    meal: ctx.meal,
    foodId: null,
    label: label.trim() || 'Quick add',
    nutrition: { kcal: round1(kcal) },
  };
}

/**
 * Re-log a saved meal as fresh entries. Ids come from the caller's generator so the db layer owns id
 * policy; a food that has since been deleted is a hard error rather than a silently skipped item.
 */
export function expandSavedMeal(
  meal: SavedMeal,
  foods: Map<string, Food>,
  ctx: { date: string; meal: MealSlot; now: string; newId: () => string },
): FoodEntry[] {
  return meal.items.map((item) => {
    const food = foods.get(item.foodId);
    if (food === undefined) {
      throw new Error(`Food ${item.foodId} not found for meal ${meal.name}`);
    }
    const entry = entryFromFood(food, item.grams, {
      date: ctx.date,
      meal: ctx.meal,
      now: ctx.now,
      id: ctx.newId(),
    });
    return { ...entry, savedMealId: meal.id };
  });
}

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number; count: number };

const emptyTotals = (): Totals => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, count: 0 });

/** Add one entry's nutrition to a running total; absent macros add nothing. */
function addEntry(total: Totals, entry: FoodEntry): void {
  total.kcal += entry.nutrition.kcal;
  total.proteinG += entry.nutrition.proteinG ?? 0;
  total.carbsG += entry.nutrition.carbsG ?? 0;
  total.fatG += entry.nutrition.fatG ?? 0;
  total.count += 1;
}

/** Round a raw running total to one decimal. */
function finish(total: Totals): Totals {
  return {
    kcal: round1(total.kcal),
    proteinG: round1(total.proteinG),
    carbsG: round1(total.carbsG),
    fatG: round1(total.fatG),
    count: total.count,
  };
}

/** The whole day in one number set. */
export function dayTotals(entries: FoodEntry[]): Totals {
  const total = emptyTotals();
  for (const entry of entries) addEntry(total, entry);
  return finish(total);
}

/** Per-slot totals; all four slots are always present so the UI can render the empty ones. */
export function totalsByMeal(entries: FoodEntry[]): Record<MealSlot, Totals> {
  const byMeal: Record<MealSlot, Totals> = {
    breakfast: emptyTotals(),
    lunch: emptyTotals(),
    dinner: emptyTotals(),
    snack: emptyTotals(),
  };
  for (const entry of entries) addEntry(byMeal[entry.meal], entry);
  for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
    byMeal[slot] = finish(byMeal[slot]);
  }
  return byMeal;
}

/** What the user logged recently - the "log it again" shortcut. */
export type RecentFood = { foodId: string; label: string; grams?: number; meal: MealSlot };

/**
 * Newest first, one entry per food (the most recent amount wins). The input array is copied before
 * sorting, and timestamps are compared as instants so a `+02:00` offset cannot beat a later `Z` time.
 */
export function recentFoods(entries: FoodEntry[], limit = 10): RecentFood[] {
  // filter() already returns a fresh array, so the input is never reordered.
  const sorted = entries
    .filter((entry): entry is Omit<FoodEntry, 'foodId'> & { foodId: string } => entry.foodId !== null)
    .sort((a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt));

  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const entry of sorted) {
    if (out.length >= limit) break;
    const foodId = entry.foodId;
    if (seen.has(foodId)) continue;
    seen.add(foodId);
    out.push({
      foodId,
      label: entry.label,
      ...(entry.grams === undefined ? {} : { grams: entry.grams }),
      meal: entry.meal,
    });
  }
  return out;
}

/** Default meal slot for a local hour; anything odd falls back to snack. */
export function defaultMealSlot(hour: number): MealSlot {
  if (hour >= 4 && hour <= 10) return 'breakfast';
  if (hour >= 11 && hour <= 14) return 'lunch';
  if (hour >= 17 && hour <= 21) return 'dinner';
  return 'snack';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The user's calendar day from a Date, in local time (toISOString would shift the day near midnight). */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
