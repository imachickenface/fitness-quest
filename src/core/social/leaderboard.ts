/**
 * The weekly friends leaderboard: this week's XP for you and each friend, highest first. A summary from an
 * earlier week counts as 0 (that friend hasn't synced this week). Ties share a rank (1, 1, 3).
 */
import type { PublicProfile } from '../../contract.ts';
import { weekStart } from '../quests/daily.ts';

export type Player = { id: string; name: string; profile?: PublicProfile; me?: boolean };

export type Standing = { id: string; name: string; weekXp: number; rank: number; me: boolean };

export function leaderboard(players: Player[], today: string): Standing[] {
  const week = weekStart(today);
  const rows = players.map((p) => ({
    id: p.id,
    name: p.name,
    weekXp: p.profile && p.profile.week === week ? p.profile.weekXp : 0,
    me: p.me === true,
  }));
  rows.sort((a, b) => b.weekXp - a.weekXp || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return rows.map((r, i) => {
    const first = rows.findIndex((x) => x.weekXp === r.weekXp);
    return { ...r, rank: (first === -1 ? i : first) + 1 };
  });
}
