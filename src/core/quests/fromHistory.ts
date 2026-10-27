/**
 * Weekly boss quests, built from the player's own lifts and runs with the progressive-overload calculator
 * (progression.ts) and tailored to their goal: muscle goals fight two lift bosses, running goals one lift boss
 * plus a run boss, weight goals a calorie boss. Deload weeks and stalled lifts get lighter bosses.
 */
import type { Goal, Quest, QuestCondition } from '../../contract.ts';
import { addDays } from '../dates.ts';
import { deloadWeek, nextTarget, runTarget, type Style, type Units } from '../progression.ts';
import type { ExerciseRank } from '../ranks.ts';

const LB = 0.45359237;
const RUNNING: Goal[] = ['five_k', 'ten_k', 'half_marathon', 'marathon', 'cardio'];

export type BossInput = {
  /** best first */
  ranks: ExerciseRank[];
  style: Style;
  units: Units;
  goal: Goal;
  /** whole weeks since the player started training (0 = the first week) */
  weekIndex: number;
  /** exercise ids whose boss was missed two weeks running */
  stalled: string[];
  /** runs of the last four weeks */
  runs: { distanceM: number; durationS?: number }[];
  /** today's calorie target, for the weight-goal boss */
  targetKcal?: number;
  monday: string;
  now: string;
};

export function loadText(kg: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(kg / LB)} lb` : `${kg} kg`;
}

function time(s: number): string {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function bossQuests(input: BossInput): Quest[] {
  const { goal, monday } = input;
  const base = {
    kind: 'boss' as const,
    origin: 'history' as const,
    window: { start: monday, end: addDays(monday, 6) },
    createdAt: input.now,
  };
  const quests: Quest[] = [];
  const muscleGoal = goal === 'build_muscle' || goal === 'gain_weight';
  const deloading = deloadWeek(input.style, input.weekIndex);

  for (const rank of input.ranks.slice(0, muscleGoal ? 2 : 1)) {
    const { exercise, best } = rank;
    const deload = deloading ? 'week' : input.stalled.includes(exercise.id) ? 'stall' : undefined;
    const t = nextTarget(input.style, exercise, best, input.units, deload);
    const what =
      t.weightKg > 0
        ? `Lift ${loadText(t.weightKg, input.units)} for ${t.reps} reps.`
        : `Do ${t.reps} reps.`;
    const condition: QuestCondition = {
      type: 'beat_pr',
      exercise: exercise.name,
      weightKg: t.weightKg,
      reps: t.reps,
    };
    quests.push({
      ...base,
      id: `boss-${monday}-${exercise.id}`,
      title: t.deload ? `Deload: ${exercise.name}` : `Beat your ${exercise.name} best`,
      description: `${what} ${t.why}`,
      condition,
      xp: t.deload ? 80 : 150,
    });
  }

  if (RUNNING.includes(goal)) {
    const run = runTarget(goal, input.runs, {
      deload: input.weekIndex % 4 === 3,
      speed: input.weekIndex % 2 === 1,
    });
    if (run) {
      const km = `${run.meters / 1000} km`;
      quests.push({
        ...base,
        id: `boss-${monday}-run`,
        title: run.deload
          ? `Cut-back run: ${km}`
          : run.type === 'run_time'
            ? `Run ${km} in ${time(run.maxSeconds)}`
            : `Long run: ${km}`,
        description: run.why,
        condition:
          run.type === 'run_time'
            ? { type: 'run_time', meters: run.meters, maxSeconds: run.maxSeconds }
            : { type: 'run_distance', meters: run.meters, single: true },
        xp: run.deload ? 80 : 150,
      });
    }
  }

  if ((goal === 'lose_weight' || goal === 'gain_weight') && input.targetKcal) {
    const k = input.targetKcal;
    quests.push({
      ...base,
      id: `boss-${monday}-kcal`,
      title: 'Hit your calories 5 days this week',
      description: `Land within 10% of ${k} kcal on 5 of the 7 days.`,
      condition: {
        type: 'kcal_in_range',
        days: 5,
        minKcal: Math.round((k * 0.9) / 10) * 10,
        maxKcal: Math.round((k * 1.1) / 10) * 10,
      },
      xp: 150,
    });
  }
  return quests;
}
