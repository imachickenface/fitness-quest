/** Running programs: couch-to-5K, cardio weeks and the distance-race builds. */
import type { Goal, PlannedItem, PlannedSession, RunType } from '../../contract.ts';

/** Distances snap to a 500 m grid. */
const r500 = (m: number) => Math.round(m / 500) * 500;

/** ISO weekdays (1 = Mon) spread over the week, long run on the last day. */
export function runDays(daysPerWeek: number): number[] {
  const n = Math.min(5, Math.max(3, Math.round(daysPerWeek)));
  return n === 3 ? [2, 4, 6] : n === 4 ? [2, 3, 5, 7] : [1, 2, 4, 5, 7];
}

/** Long run metres: linear ramp to the peak, cut back 30% every 4th week before it. */
export function longRunKm(week: number, start: number, peak: number, peakWeek: number): number {
  const ramp = start + ((peak - start) * (week - 1)) / (peakWeek - 1);
  return week % 4 === 0 && week < peakWeek ? r500(r500(ramp) * 0.7) : r500(ramp);
}

type Intervals = { runS: number; walkS: number; repeats: number };
type Detail = { distanceM?: number; durationS?: number; intervals?: Intervals };
const run = (runType: RunType, detail: Detail): PlannedItem => ({
  type: 'run',
  runType,
  ...detail,
});

/** Couch-to-5K style walk/run block. */
const walkRun = (runS: number, walkS: number, minutes: number): PlannedItem => ({
  type: 'run',
  runType: 'walk_run',
  intervals: { runS, walkS, repeats: Math.ceil((minutes * 60) / runS) },
});

export function runPlan(
  goal: Goal,
  opts: { daysPerWeek: number; longestM: number },
): { weeks: number; sessions: PlannedSession[] } | { error: 'needs-base' } {
  if (goal === 'marathon' && opts.longestM < 8000) return { error: 'needs-base' };
  const days = runDays(opts.daysPerWeek);
  const sessions: PlannedSession[] = [];
  const push = (week: number, day: number, title: string, item: PlannedItem) =>
    sessions.push({ id: `run-w${week}-d${day}`, week, day, title, items: [item] });

  if (goal === 'five_k') {
    const runS = [60, 90, 120, 180, 300, 480];
    const walkS = [90, 120, 120, 120, 120, 120];
    const mins = [8, 9, 10, 12, 15, 16];
    const easy = [20, 25, 30];
    for (let w = 1; w <= 9; w++) {
      const m = w - 1;
      days.forEach((day, i) => {
        const race = w === 9 && i === 2; // the 5K itself
        const item = race
          ? run('long', { distanceM: 5000 })
          : w >= 7
            ? run('easy', { durationS: easy[w - 7]! * 60 })
            : walkRun(runS[m]!, walkS[m]!, mins[m]!);
        push(w, day, race ? 'Race day: 5K' : `Week ${w} · run ${i + 1}`, item);
      });
    }
    return { weeks: 9, sessions };
  }

  if (goal === 'cardio') {
    for (let w = 1; w <= 8; w++) {
      const durationS = Math.round((20 + 2.5 * (w - 1)) * 60);
      days.forEach((day, i) =>
        push(w, day, `Week ${w} · run ${i + 1}`, run('easy', { durationS })),
      );
    }
    return { weeks: 8, sessions };
  }

  // Distance races: W weeks, peak week P, start S, peak L, race distance R, taper factors after the peak.
  type Race = {
    weeks: number;
    P: number;
    S: number;
    L: number;
    R: number;
    name: string;
    taper: number[];
  };
  const races: { [k in 'ten_k' | 'half_marathon' | 'marathon']?: Race } = {
    ten_k: { weeks: 8, P: 7, S: 5000, L: 12000, R: 10000, name: '10K', taper: [] },
    half_marathon: {
      weeks: 12,
      P: 10,
      S: 8000,
      L: 19000,
      R: 21097,
      name: 'half marathon',
      taper: [0.75],
    },
    marathon: {
      weeks: 18,
      P: 15,
      S: 13000,
      L: 32000,
      R: 42195,
      name: 'marathon',
      taper: [0.75, 0.5],
    },
  };
  const cfg = races[goal as 'ten_k' | 'half_marathon' | 'marathon'];

  if (cfg) {
    const start = Math.max(cfg.S, r500(opts.longestM));
    for (let w = 1; w <= cfg.weeks; w++) {
      const raceWeek = w === cfg.weeks;
      // after the peak the long run drops back towards race day
      const long = raceWeek
        ? cfg.R
        : w <= cfg.P
          ? longRunKm(w, start, cfg.L, cfg.P)
          : r500(cfg.L * cfg.taper[w - cfg.P - 1]!);
      days.forEach((day, i) => {
        const last = i === days.length - 1; // last day = long run, second = quality
        const item = last
          ? run('long', { distanceM: long })
          : i === 1
            ? w % 2 === 1
              ? run('tempo', { durationS: Math.min(40, 20 + 2 * (w - 1)) * 60 })
              : run('intervals', {
                  intervals: { runS: 120, walkS: 90, repeats: Math.min(10, 4 + Math.floor(w / 2)) },
                })
            : run('easy', { distanceM: raceWeek ? 3000 : Math.max(3000, r500(long * 0.5)) });
        push(w, day, raceWeek && last ? `Race day: ${cfg.name}` : `Week ${w} · run ${i + 1}`, item);
      });
    }
    return { weeks: cfg.weeks, sessions };
  }

  return { weeks: 0, sessions: [] };
}
