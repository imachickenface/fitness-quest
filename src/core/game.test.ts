import { describe, expect, it } from 'vitest';
import type { FoodEntry, Quest, QuestProgress, Workout } from '../contract.ts';
import * as fx from '../test/fixtures.ts';
import { addDays } from './dates.ts';
import { gameState, levelFor, recordXp, streak, XP } from './game.ts';
import type { Records } from './records.ts';

const food = (id: string, date: string): FoodEntry => ({
  ...fx.foodEntry,
  id,
  date,
  loggedAt: `${date}T08:00:00Z`,
});
const workout = (id: string, date: string): Workout => ({
  ...fx.strengthWorkout,
  id,
  date,
  loggedAt: `${date}T18:00:00Z`,
});
const none: Records = { foodEntries: [], workouts: [], weighIns: [] };

describe('XP rules', () => {
  it('has the documented amounts', () => {
    expect(XP).toEqual({
      foodEntry: 2,
      foodEntriesPerDay: 5,
      workout: 20,
      workoutsPerDay: 2,
      weighIn: 5,
    });
  });

  it('caps food and workout XP per day so more is not rewarded', () => {
    const r: Records = {
      foodEntries: Array.from({ length: 8 }, (_, i) => food(`f${i}`, '2026-10-26')),
      workouts: [
        workout('a', '2026-10-26'),
        workout('b', '2026-10-26'),
        workout('c', '2026-10-26'),
      ],
      weighIns: [{ date: '2026-10-26', kg: 80 }],
    };
    expect(recordXp(r, '2026-10-26')).toBe(5 * 2 + 2 * 20 + 5);
    const twoDays: Records = {
      ...none,
      foodEntries: [food('a', '2026-10-25'), food('b', '2026-10-26')],
    };
    expect(recordXp(twoDays, '2026-10-26')).toBe(4);
  });

  it('ignores records dated after today', () => {
    expect(recordXp({ ...none, foodEntries: [food('a', '2026-10-27')] }, '2026-10-26')).toBe(0);
  });
});

describe('levelFor', () => {
  it('level L takes 50 x (L + 1) XP to finish', () => {
    expect(levelFor(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForLevel: 100 });
    expect(levelFor(99)).toEqual({ level: 1, xpIntoLevel: 99, xpForLevel: 100 });
    expect(levelFor(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForLevel: 150 });
    expect(levelFor(449)).toEqual({ level: 3, xpIntoLevel: 199, xpForLevel: 200 });
    expect(levelFor(450)).toEqual({ level: 4, xpIntoLevel: 0, xpForLevel: 250 });
  });
  it('treats negative or non-finite XP as 0', () => {
    expect(levelFor(-5)).toEqual(levelFor(0));
    expect(levelFor(Number.NaN)).toEqual(levelFor(0));
  });
});

describe('streak', () => {
  const days = (...ds: string[]) => new Set(ds);

  it('is 0 with no activity', () => {
    expect(streak(days(), '2026-10-26')).toEqual({ streakDays: 0, freezes: 0 });
  });

  it('counts consecutive active days ending today', () => {
    expect(streak(days('2026-10-24', '2026-10-25', '2026-10-26'), '2026-10-26').streakDays).toBe(3);
  });

  it('today not logged yet does not break it', () => {
    expect(streak(days('2026-10-24', '2026-10-25'), '2026-10-26').streakDays).toBe(2);
  });

  it('a missed day with no freeze resets it', () => {
    expect(streak(days('2026-10-22', '2026-10-23', '2026-10-25'), '2026-10-26').streakDays).toBe(1);
    expect(streak(days('2026-10-22', '2026-10-23'), '2026-10-26').streakDays).toBe(0);
  });

  it('earns a freeze per 7 active days in a row, at most 2', () => {
    const run = (start: string, n: number) =>
      Array.from({ length: n }, (_, i) => addDays(start, i));
    expect(streak(new Set(run('2026-10-01', 7)), '2026-10-07')).toEqual({
      streakDays: 7,
      freezes: 1,
    });
    expect(streak(new Set(run('2026-10-01', 21)), '2026-10-21')).toEqual({
      streakDays: 21,
      freezes: 2,
    });
  });

  it('a freeze covers a missed day, which still counts in the streak', () => {
    const active = new Set([
      ...Array.from({ length: 7 }, (_, i) => addDays('2026-10-01', i)), // 01..07
      // 08 missed: freeze used
      '2026-10-09',
    ]);
    expect(streak(active, '2026-10-09')).toEqual({ streakDays: 9, freezes: 0 });
  });

  it('two missed days with one freeze resets the streak and the freeze count is spent', () => {
    const active = new Set([
      ...Array.from({ length: 7 }, (_, i) => addDays('2026-10-01', i)),
      '2026-10-10',
    ]);
    expect(streak(active, '2026-10-10')).toEqual({ streakDays: 1, freezes: 0 });
  });

  it('runs across a DST change without losing or adding a day', () => {
    const active = new Set(Array.from({ length: 5 }, (_, i) => addDays('2026-10-23', i)));
    expect(streak(active, '2026-10-27').streakDays).toBe(5);
  });

  it('ignores activity after today', () => {
    expect(streak(days('2026-10-26', '2026-10-27'), '2026-10-26').streakDays).toBe(1);
  });
});

describe('gameState', () => {
  it('adds quest XP for completed quests and reports level, streak and map node', () => {
    const r: Records = {
      ...none,
      foodEntries: [food('a', '2026-10-25'), food('b', '2026-10-26')],
      workouts: [workout('w', '2026-10-26')],
    };
    const done = (id: string, xp: number): { quest: Quest; progress: QuestProgress } => ({
      quest: { ...fx.dailyQuest, id, xp },
      progress: {
        questId: id,
        fraction: 1,
        label: 'done',
        complete: true,
        completedOn: '2026-10-26',
      },
    });
    const open: { quest: Quest; progress: QuestProgress } = {
      quest: { ...fx.bossQuest, xp: 250 },
      progress: { questId: fx.bossQuest.id, fraction: 0.5, label: 'half', complete: false },
    };
    const s = gameState(r, [done('q1', 30), done('q2', 50), open], '2026-10-26');
    expect(s).toEqual({
      xp: 2 + 2 + 20 + 30 + 50, // 104
      level: 2,
      xpIntoLevel: 4,
      xpForLevel: 150,
      streakDays: 2,
      freezes: 0,
      completedQuestIds: ['q1', 'q2'],
      mapNode: 2,
    });
  });

  it('a weigh-in alone keeps the streak alive', () => {
    const s = gameState({ ...none, weighIns: [{ date: '2026-10-26', kg: 80 }] }, [], '2026-10-26');
    expect(s.streakDays).toBe(1);
  });
});
