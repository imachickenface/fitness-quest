import { overallRank, TIER_FLOORS, TIERS, type ExerciseRank, type Tier } from '../core/ranks.ts';
import { load, type Units } from './format.ts';

/** Each tier's colour; the three darkest are deepened so white text on them meets WCAG AA (4.5:1). */
const TIER_COLOURS: Record<Tier, string> = {
  Wood: '#8f6840',
  Bronze: '#cd7f32',
  Silver: '#9aa6b2',
  Gold: '#e0a800',
  Platinum: '#3fb6b2',
  Diamond: '#3d9df5',
  Champion: '#8b4ff0',
  Titan: '#d6383e',
  Olympian: '#ff9600',
};

/** Badge text: dark on the light tiers, white on the dark ones, whichever passes 4.5:1. */
const TIER_INK: Record<Tier, string> = {
  Wood: '#ffffff',
  Bronze: '#1f1f1f',
  Silver: '#1f1f1f',
  Gold: '#1f1f1f',
  Platinum: '#1f1f1f',
  Diamond: '#1f1f1f',
  Champion: '#ffffff',
  Titan: '#ffffff',
  Olympian: '#1f1f1f',
};

export function TierBadge({ tier, size = 'small' }: { tier: Tier; size?: 'small' | 'big' }) {
  return (
    <span
      className={`tier-badge tier-${size}`}
      style={{ background: TIER_COLOURS[tier], color: TIER_INK[tier] }}
    >
      {tier}
    </span>
  );
}

export function Ranks({ ranks, units }: { ranks: ExerciseRank[]; units: Units }) {
  if (ranks.length === 0) {
    return (
      <section className="ranks" aria-labelledby="ranks-title">
        <h2 id="ranks-title">Strength ranks</h2>
        <p className="muted">
          Log a lift like bench press, squat or curls with its weight and reps to get a rank, from
          Wood to Olympian.
        </p>
      </section>
    );
  }
  const overall = overallRank(ranks);
  return (
    <section className="ranks" aria-labelledby="ranks-title">
      <div className="ranks-head">
        <h2 id="ranks-title">Strength ranks</h2>
        <TierBadge tier={overall.tier} size="big" />
      </div>
      <p className="muted ranks-sub">
        Overall {overall.score} / 1000
        {overall.next && ` · ${overall.next.at - overall.score} to ${overall.next.tier}`}
      </p>
      <ul className="rank-list">
        {ranks.map((r) => {
          const floor = TIER_FLOORS[TIERS.indexOf(r.tier)] ?? 0;
          const next = tierAfter(r);
          // progress through the current tier
          const pct = next ? Math.min(100, ((r.score - floor) / (next.at - floor)) * 100) : 100;
          return (
            <li key={r.exercise.id} className="rank">
              <div className="rank-head">
                <span className="rank-name">{r.exercise.name}</span>
                <TierBadge tier={r.tier} />
              </div>
              <div className="bar bar-thin" aria-hidden="true">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: TIER_COLOURS[r.tier] }}
                />
              </div>
              <p className="muted rank-detail">
                Best{' '}
                {r.best.weightKg > 0
                  ? `${load(r.best.weightKg, units)} × ${r.best.reps}`
                  : `${r.best.reps} reps`}
                {' · '}
                {r.score} / 1000{next && ` · ${next.at - r.score} to ${next.tier}`}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="fine-print">
        Scores compare your estimated one-rep max with your bodyweight, like the Liftoff app. The
        standards are our own estimates.
      </p>
    </section>
  );
}

function tierAfter(r: ExerciseRank) {
  return overallRank([r]).next;
}
