import type { GameState } from '../contract.ts';
import type { Game, QuestView } from './useGame.ts';

export function HeroCard({ state }: { state: GameState }) {
  const pct = Math.min(100, (state.xpIntoLevel / state.xpForLevel) * 100);
  return (
    <section className="panel hero-card" aria-label="Your hero">
      <div className="hero-top">
        <p className="hero-level">
          <span className="muted">Level</span> <span className="pixel">{state.level}</span>
        </p>
        <p className="hero-streak">
          <span aria-hidden="true">🔥</span> {state.streakDays}-day streak
          {state.freezes > 0 && (
            <span className="muted">
              {' '}
              · <span aria-hidden="true">❄</span> {state.freezes}{' '}
              {state.freezes === 1 ? 'freeze' : 'freezes'}
            </span>
          )}
        </p>
      </div>
      <div
        className="bar xp-bar"
        role="progressbar"
        aria-label="XP to the next level"
        aria-valuemin={0}
        aria-valuemax={state.xpForLevel}
        aria-valuenow={state.xpIntoLevel}
      >
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted hero-xp">
        {state.xpIntoLevel} / {state.xpForLevel} XP to level {state.level + 1}
      </p>
    </section>
  );
}

export function Quests({ game }: { game: Game }) {
  const daily = game.active.filter((v) => v.quest.kind === 'daily');
  const other = game.active.filter((v) => v.quest.kind !== 'daily');
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Quests</h1>
      </header>
      <HeroCard state={game.state} />
      <QuestList title="Today" views={daily} />
      {other.length > 0 && <QuestList title="This week" views={other} />}
      <p className="fine-print">
        Logging anything keeps your streak. Seven days in a row earns a freeze that covers a missed
        day (you can hold two).
      </p>
    </div>
  );
}

function QuestList({ title, views }: { title: string; views: QuestView[] }) {
  return (
    <section className="quest-section" aria-label={title}>
      <h2>{title}</h2>
      <ul className="quest-list">
        {views.map(({ quest, progress }) => (
          <li
            key={quest.id}
            className={progress.complete ? 'panel quest done' : 'panel quest'}
            aria-label={`${quest.title}: ${progress.complete ? 'complete' : progress.label}`}
          >
            <div className="quest-head">
              <span className="quest-title">
                {progress.complete && <span aria-hidden="true">✓ </span>}
                {quest.title}
              </span>
              <span className="pixel quest-xp">+{quest.xp} XP</span>
            </div>
            <div className="bar bar-thin" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${progress.fraction * 100}%` }} />
            </div>
            <p className="muted quest-label">{progress.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
