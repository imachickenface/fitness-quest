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
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(y, m - 1, d + days);
  return [t.getFullYear(), t.getMonth() + 1, t.getDate()]
    .map((v, i) => String(v).padStart(i === 0 ? 4 : 2, '0'))
    .join('-');
}

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
