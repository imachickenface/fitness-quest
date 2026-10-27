/**
 * The adaptive TDEE: what the player's logged intake and their weight trend say their real maintenance
 * burn is, instead of trusting the Mifflin-St Jeor formula alone.
 *
 * Pure like the rest of `src/core/`: `today` is passed in, dates are compared as `YYYY-MM-DD` strings, and
 * no input record is mutated (weigh-ins are copied before sorting).
 *
 * The idea (MacroFactor-style): if the trend shows the player is losing weight while eating `intake`, then
 * their real maintenance is higher than `intake` by the deficit the scale shows - about 7700 kcal per kg.
 * The result is capped at ±25% of the formula value so a bad week of logging cannot wreck the target.
 */
import type { FoodEntry, WeighIn } from '../contract.ts';

import { addDays } from './dates.ts';

/** Look-back window: the 28 days before today, today excluded (it is still in progress). */
const WINDOW_DAYS = 28;
/** Below this many complete days of logging, or too short a weigh-in span, the data is too thin. */
const MIN_COUNTED_DAYS = 14;
const MIN_SPAN_DAYS = 14;
/** Rough energy-per-kilogram conversion (docs/RESEARCH.md). */
const KCAL_PER_KG = 7700;
/** The estimate never strays more than 25% from the formula. */
const MIN_FACTOR = 0.75;
const MAX_FACTOR = 1.25;

const byDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** Whole days since the epoch, so a span is exact regardless of DST. */
const dayNumber = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type AdaptiveTdeeInput = {
  foodEntries: FoodEntry[];
  weighIns: WeighIn[];
  /** the Mifflin-St Jeor daily burn from `src/core/targets.ts` */
  formulaTdee: number;
  today: string; // YYYY-MM-DD
};

export type AdaptiveTdeeResult = {
  /** estimated real maintenance calories per day */
  kcal: number;
  /** how many days of logging the estimate is based on */
  days: number;
  /** smoothed weight change per week, kg/week (negative = losing) */
  kgPerWeek: number;
};

/**
 * A slow-moving line through the weigh-ins: the first point is the real weight, and each later point only
 * travels 10% of the way towards that day's scale value. Day-to-day weigh-in noise (water, food volume)
 * is damped out, so the slope over a span is a usable trend rather than a reaction to the last weigh-in.
 *
 * The input is copied before sorting, so the caller's array keeps its order.
 */
export function trend(weighIns: WeighIn[]): { date: string; kg: number }[] {
  const sorted = [...weighIns].sort(byDate);
  const points: { date: string; kg: number }[] = [];
  let prev: number | undefined;
  for (const weighIn of sorted) {
    const kg = prev === undefined ? weighIn.kg : prev + 0.1 * (weighIn.kg - prev);
    points.push({ date: weighIn.date, kg });
    prev = kg;
  }
  return points;
}

/**
 * Maintenance calories from the last 28 days of logs, or `null` when there is not enough data.
 *
 * A day only counts when it has at least two entries - one entry is probably an unfinished day of logging -
 * and today never counts. Weigh-ins outside the window are ignored.
 */
export function adaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult | null {
  const from = addDays(input.today, -WINDOW_DAYS);
  const to = addDays(input.today, -1);

  // Intake: mean kcal total over the days in the window that have 2+ entries.
  const byDay = new Map<string, { entries: number; kcal: number }>();
  for (const entry of input.foodEntries) {
    if (entry.date < from || entry.date > to) continue;
    const day = byDay.get(entry.date) ?? { entries: 0, kcal: 0 };
    day.entries += 1;
    day.kcal += entry.nutrition.kcal;
    byDay.set(entry.date, day);
  }

  let days = 0;
  let intakeTotal = 0;
  for (const day of byDay.values()) {
    if (day.entries < 2) continue;
    days += 1;
    intakeTotal += day.kcal;
  }
  if (days < MIN_COUNTED_DAYS) return null;
  const intake = intakeTotal / days;

  // Trend: weigh-ins inside the window, oldest to newest.
  const inWindow = input.weighIns.filter((weighIn) => weighIn.date >= from && weighIn.date <= to);
  if (inWindow.length < 2) return null;
  const sortedWeighIns = [...inWindow].sort(byDate);
  const first = sortedWeighIns[0]!;
  const last = sortedWeighIns[sortedWeighIns.length - 1]!;
  const spanDays = dayNumber(last.date) - dayNumber(first.date);
  if (spanDays < MIN_SPAN_DAYS) return null;

  const smoothed = trend(sortedWeighIns);
  const start = smoothed[0]!;
  const end = smoothed[smoothed.length - 1]!;
  let kgPerWeek = round2(((end.kg - start.kg) / spanDays) * 7);
  if (kgPerWeek === 0) kgPerWeek = 0; // -0 would break an equality check against 0

  // Eating `intake` and still losing weight means the real maintenance is higher than `intake`.
  const raw = intake - (kgPerWeek / 7) * KCAL_PER_KG;
  const capped = Math.min(
    Math.max(raw, input.formulaTdee * MIN_FACTOR),
    input.formulaTdee * MAX_FACTOR,
  );
  const kcal = Math.round(capped / 10) * 10;

  return { kcal, days, kgPerWeek };
}
