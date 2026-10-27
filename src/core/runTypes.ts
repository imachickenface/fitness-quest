/**
 * The kinds of run the log sheet offers, so a run can be logged as "Tempo run" or "8 × 400 m" without typing.
 * Paces are described by feel (talk test) and by race pace, the way beginner plans describe them.
 */
import type { PlannedItem } from '../contract.ts';

export type RunGroup = 'Steady' | 'Faster' | 'Intervals' | 'Race';

export type RunType = {
  id: string;
  name: string;
  group: RunGroup;
  /** what to do, in a sentence or two */
  how: string;
};

export const RUN_GROUPS: RunGroup[] = ['Steady', 'Faster', 'Intervals', 'Race'];

export const RUN_TYPES: RunType[] = [
  {
    id: 'easy',
    name: 'Easy run',
    group: 'Steady',
    how: 'Conversational pace: you could talk in full sentences. Most of your running should feel like this.',
  },
  {
    id: 'recovery',
    name: 'Recovery run',
    group: 'Steady',
    how: 'Short and very easy, the day after a hard run. Slower than feels necessary.',
  },
  {
    id: 'long',
    name: 'Long run',
    group: 'Steady',
    how: 'Your longest run of the week, at easy pace. Builds endurance; walk breaks are fine.',
  },
  {
    id: 'walk-run',
    name: 'Walk/run',
    group: 'Steady',
    how: 'Alternate running and walking, for example 1 min run and 1:30 walk. How most new runners start.',
  },
  {
    id: 'tempo',
    name: 'Tempo run',
    group: 'Faster',
    how: '10 min easy, 20 min comfortably hard (only short sentences), 10 min easy.',
  },
  {
    id: 'progression',
    name: 'Progression run',
    group: 'Faster',
    how: 'Start easy and speed up a little every third of the run, finishing at tempo pace.',
  },
  {
    id: 'fartlek',
    name: 'Fartlek',
    group: 'Faster',
    how: 'An easy run with fast bursts of 1-3 min when you feel like it, each followed by the same time easy.',
  },
  {
    id: 'hills',
    name: 'Hill repeats',
    group: 'Faster',
    how: 'Warm up, then run hard up a hill for 45-90 s and walk or jog down. Repeat 6-10 times.',
  },
  {
    id: 'strides',
    name: 'Easy run + strides',
    group: 'Faster',
    how: 'An easy run, then 4-6 quick, relaxed 20 s sprints with a full rest between.',
  },
  {
    id: 'intervals-400',
    name: '8 × 400 m',
    group: 'Intervals',
    how: 'Warm up, 8 × 400 m at about 5K race pace with a 90 s jog between, cool down.',
  },
  {
    id: 'intervals-800',
    name: '6 × 800 m',
    group: 'Intervals',
    how: 'Warm up, 6 × 800 m at 5K-10K race pace with a 2 min jog between, cool down.',
  },
  {
    id: 'intervals-1k',
    name: '5 × 1 km',
    group: 'Intervals',
    how: 'Warm up, 5 × 1 km at about 10K race pace with a 2 min jog between, cool down.',
  },
  {
    id: 'intervals-time',
    name: 'Time intervals',
    group: 'Intervals',
    how: 'Warm up, then 2-3 min hard and 90 s easy, 4-8 times, cool down. No track needed.',
  },
  {
    id: 'race',
    name: 'Race or time trial',
    group: 'Race',
    how: 'All out over a set distance: a parkrun, a 5K test or race day.',
  },
];

/** The title a run is saved under: "Tempo run", "Intervals: 8 × 400 m". */
export function runTitle(t: RunType): string {
  return t.group === 'Intervals' && t.id !== 'intervals-time' ? `Intervals: ${t.name}` : t.name;
}

/** The run type a program session asks for. */
export function runTypeFor(item: PlannedItem): RunType | undefined {
  if (item.type !== 'run') return undefined;
  const id = {
    walk_run: 'walk-run',
    easy: 'easy',
    long: 'long',
    tempo: 'tempo',
    intervals: 'intervals-time',
  }[item.runType];
  return RUN_TYPES.find((t) => t.id === id);
}
