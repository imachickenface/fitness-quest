import { describe, expect, it } from 'vitest';
import type { PublicProfile } from '../../contract.ts';
import { leaderboard } from './leaderboard.ts';

const TODAY = '2026-10-29'; // week of Monday 2026-10-26
const profile = (weekXp: number, week = '2026-10-26'): PublicProfile => ({
  v: 1,
  bio: '',
  titles: ['novice'],
  showcaseTitles: [],
  level: 3,
  xp: 400,
  week,
  weekXp,
  streakDays: 2,
  workouts: 4,
  questsDone: 1,
  lifts: [],
  updatedAt: '2026-10-29T08:00:00.000Z',
});

describe('leaderboard', () => {
  it('ranks by this week’s XP, highest first, ties by name and sharing a rank', () => {
    const got = leaderboard(
      [
        { id: 'b', name: 'bea', profile: profile(120) },
        { id: 'me', name: 'me_me', profile: profile(300), me: true },
        { id: 'a', name: 'al', profile: profile(120) },
        { id: 'c', name: 'cy', profile: profile(40) },
      ],
      TODAY,
    );
    expect(got.map((s) => [s.name, s.weekXp, s.rank, s.me])).toEqual([
      ['me_me', 300, 1, true],
      ['al', 120, 2, false],
      ['bea', 120, 2, false],
      ['cy', 40, 4, false],
    ]);
  });

  it('counts last week’s summary and no summary as 0', () => {
    const got = leaderboard(
      [
        { id: 'old', name: 'old', profile: profile(900, '2026-10-19') },
        { id: 'none', name: 'none' },
        { id: 'now', name: 'now', profile: profile(10) },
      ],
      TODAY,
    );
    expect(got.map((s) => [s.name, s.weekXp, s.rank])).toEqual([
      ['now', 10, 1],
      ['none', 0, 2],
      ['old', 0, 2],
    ]);
  });

  it('starts fresh on Monday and leaves its input alone', () => {
    const players = [{ id: 'x', name: 'x', profile: profile(50) }];
    const frozen = JSON.stringify(players);
    expect(leaderboard(players, '2026-11-02')[0]!.weekXp).toBe(0);
    expect(JSON.stringify(players)).toBe(frozen);
    expect(leaderboard([], TODAY)).toEqual([]);
  });
});
