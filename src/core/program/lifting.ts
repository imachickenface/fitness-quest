/**
 * A 12-week lifting program on the Arnold split.
 *
 * Pure like the rest of `src/core/`: no DOM, no clock, nothing is mutated. The split rotates
 * continuously - the k-th lifting session of the whole plan is `ARNOLD[k % 3]` - so a week that
 * trains 4 days starts where the previous week stopped. Loads are left out: the plan only fixes
 * sets and reps, and `progression.ts` works the weight out from what the user actually lifts.
 */
import type { Goal, PlannedItem, PlannedSession } from '../../contract.ts';
import { ARNOLD } from '../split.ts';
import type { Style } from '../progression.ts';
import { deloadWeek } from '../progression.ts';

const WEEKS = 12;

/** The 3..6 day week layouts, spread so no week trains more than two days in a row at the end. */
const LAYOUTS: number[][] = [
  [1, 3, 5],
  [1, 2, 4, 5],
  [1, 2, 3, 5, 6],
  [1, 2, 3, 4, 5, 6],
];

/** Training days in the week, Monday first; Sunday is always a rest day. Clamped to 3..6 days. */
export function liftDays(daysPerWeek: number): number[] {
  const n = Math.min(6, Math.max(3, Math.round(daysPerWeek)));
  return [...(LAYOUTS[n - 3] ?? LAYOUTS[0] ?? [])];
}

/** The sets, reps and amrap last set this style starts a lift at; `i` is the item's rank in the day. */
function load(
  style: Style,
  i: number,
): { sets: number; reps: number; amrap: boolean; tier?: 't1' | 't2' } {
  if (style === 'powerlifting') {
    // GZCLP-style: one T1 lift to failure, the rest as T2 support.
    return i === 0
      ? { tier: 't1', sets: 5, reps: 5, amrap: true }
      : { tier: 't2', sets: 3, reps: 8, amrap: false };
  }
  if (style === 'calisthenics') return { sets: 3, reps: 12, amrap: false };
  return { sets: 3, reps: 10, amrap: false };
}

export function liftPlan(opts: {
  goal: Goal;
  style: Style;
  daysPerWeek: number;
  /** exercise names for a split day id ('chest-back', 'shoulders-arms', 'legs'), most important first */
  exercises: (dayId: string) => string[];
}): { weeks: number; sessions: PlannedSession[] } {
  const loseWeight = opts.goal === 'lose_weight';
  const days = liftDays(loseWeight ? 3 : opts.daysPerWeek);
  const sessions: PlannedSession[] = [];
  let k = 0; // lifting sessions so far, so the split keeps rotating across weeks

  for (let week = 1; week <= WEEKS; week += 1) {
    const deload = deloadWeek(opts.style, week - 1);
    for (const day of days) {
      const split = ARNOLD[k % 3];
      k += 1;
      if (split === undefined) continue;
      const items: PlannedItem[] = opts
        .exercises(split.id)
        .slice(0, 5)
        .map((exercise, i) => {
          const l = load(opts.style, i);
          return {
            type: 'lift',
            exercise,
            ...(l.tier === undefined ? {} : { tier: l.tier }),
            sets: deload ? Math.max(2, l.sets - 2) : l.sets,
            reps: l.reps,
            amrapLastSet: deload ? false : l.amrap,
          };
        });
      sessions.push({
        id: `lift-w${week}-d${day}`,
        week,
        day,
        title: split.title + (deload ? ' (deload)' : ''),
        items,
      });
    }
    if (loseWeight) {
      for (const day of [2, 4]) {
        sessions.push({
          id: `cardio-w${week}-d${day}`,
          week,
          day,
          title: 'Cardio',
          items: [{ type: 'cardio', activity: 'Brisk walk, bike or rower', durationS: 1800 }],
        });
      }
    }
  }

  return {
    weeks: WEEKS,
    sessions: sessions.sort((a, b) => a.week - b.week || a.day - b.day),
  };
}
