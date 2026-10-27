import type { MealSlot } from '../contract.ts';

const int = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function kcal(n: number): string {
  return int.format(n);
}

export function grams(n: number): string {
  return `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n)} g`;
}

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** 'YYYY-MM-DD' shifted by whole days, in local time. */
export { addDays } from '../core/dates.ts';
import { addDays } from '../core/dates.ts';

export function dayTitle(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowStamp(): string {
  return new Date().toISOString();
}

export const LB = 0.45359237;
export type Units = 'metric' | 'imperial';

/** A weight for display: "83.9 kg" or "185 lb". */
export function load(kg: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(kg / LB)} lb` : `${Math.round(kg * 10) / 10} kg`;
}

/** A weight as the user types it: kilos or pounds. */
export function toUnit(kg: number, units: Units): number {
  return units === 'imperial' ? Math.round(kg / LB) : Math.round(kg * 10) / 10;
}

/** Back to kilos from what the user typed. */
export function fromUnit(value: number, units: Units): number {
  return units === 'imperial' ? Math.round(value * LB * 10) / 10 : value;
}
