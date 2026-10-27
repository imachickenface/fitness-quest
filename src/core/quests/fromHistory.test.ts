import { describe, expect, it } from 'vitest';
import { Quest as QuestSchema } from '../../contract.ts';
import { findExercise } from '../exercises.ts';
import type { ExerciseRank } from '../ranks.ts';
import { bossQuests, nextBest } from './fromHistory.ts';

const rank = (id: string, weightKg: number, reps: number, score: number): ExerciseRank => ({
  exercise: findExercise(id)!,
  best: { weightKg, reps, date: '2026-10-20' },
  e1rmKg: 0,
  score,
  tier: 'Gold',
});

describe('nextBest', () => {
  it('adds 2.5 kg at the same reps', () => {
    expect(nextBest(90, 5)).toEqual({ weightKg: 92.5, reps: 5 });
  });
  it('adds a rep instead when 2.5 kg would be more than 5%', () => {
    expect(nextBest(40, 10)).toEqual({ weightKg: 40, reps: 11 });
    expect(nextBest(50, 8)).toEqual({ weightKg: 52.5, reps: 8 }); // exactly 5% is fine
  });
  it('bodyweight-only bests (0 kg) add a rep', () => {
    expect(nextBest(0, 8)).toEqual({ weightKg: 0, reps: 9 });
  });
});

describe('bossQuests', () => {
  const ranks = [
    rank('bench press', 90, 5, 714),
    rank('squat', 120, 5, 690),
    rank('pull up', 0, 8, 600),
    rank('barbell curl', 40, 10, 500),
  ];

  it('makes one weekly boss quest for each of the top two lifts', () => {
    const qs = bossQuests(ranks, '2026-10-26', '2026-10-26T06:00:00+00:00');
    for (const q of qs) expect(QuestSchema.parse(q)).toEqual(q);
    expect(qs.map((q) => [q.id, q.title, q.description, q.condition])).toEqual([
      [
        'boss-2026-10-26-bench-press',
        'Beat your Bench press best',
        'Lift 92.5 kg for 5 reps (your best: 90 kg x 5).',
        { type: 'beat_pr', exercise: 'Bench press', weightKg: 92.5, reps: 5 },
      ],
      [
        'boss-2026-10-26-squat',
        'Beat your Squat best',
        'Lift 122.5 kg for 5 reps (your best: 120 kg x 5).',
        { type: 'beat_pr', exercise: 'Squat', weightKg: 122.5, reps: 5 },
      ],
    ]);
    expect(qs[0]).toMatchObject({
      kind: 'boss',
      origin: 'history',
      xp: 150,
      window: { start: '2026-10-26', end: '2026-11-01' },
      createdAt: '2026-10-26T06:00:00+00:00',
    });
  });

  it('describes bodyweight bests in reps', () => {
    const qs = bossQuests([rank('pull up', 0, 8, 900)], '2026-10-26', '2026-10-26T06:00:00+00:00');
    expect(qs[0]!.description).toBe('Do 9 reps (your best: 8).');
  });

  it('makes none without ranked lifts', () => {
    expect(bossQuests([], '2026-10-26', '2026-10-26T06:00:00+00:00')).toEqual([]);
  });
});
