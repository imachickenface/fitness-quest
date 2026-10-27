import type { GameState, QuestCondition } from '../contract.ts';
import { Icon, type IconName } from './Icon.tsx';
import type { Game, QuestView } from './useGame.ts';

const QUEST_ICON: Record<QuestCondition['type'], IconName> = {
  log_meals: 'apple',
  kcal_in_range: 'bolt',
  workout_count: 'dumbbell',
  exercise_volume: 'dumbbell',
  beat_pr: 'star',
  run_distance: 'run',
  run_time: 'run',
  program_session: 'shield',
  weigh_in: 'scale',
};

export function HeroCard({ state }: { state: GameState }) {
  const pct = Math.min(100, (state.xpIntoLevel / state.xpForLevel) * 100);
  return (
    <>
      <section className="panel hero-card" aria-label="Your hero">
        <span className="level-badge pixel" aria-hidden="true">
          {state.level}
        </span>
        <p className="hero-level">
          <span>Level</span> {state.level}
        </p>
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
        <p className="hero-xp">
          {state.xpIntoLevel} / {state.xpForLevel} XP to level {state.level + 1}
        </p>
      </section>
      <div className="streak-row">
        <p aria-label={`${state.streakDays}-day streak`}>
          <span className="flame">
            <Icon name="flame" size={30} />
          </span>
          <span>
            <strong>{state.streakDays}</strong>
            <small>day streak</small>
          </span>
        </p>
        <p aria-label={`${state.freezes} streak ${state.freezes === 1 ? 'freeze' : 'freezes'}`}>
          <span className="snow">
            <Icon name="snow" size={26} />
          </span>
          <span>
            <strong>{state.freezes} / 2</strong>
            <small>{state.freezes === 1 ? 'freeze' : 'freezes'}</small>
          </span>
        </p>
      </div>
    </>
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
      <QuestList title="Daily quests" views={daily} />
      {other.length > 0 && <QuestList title="This week" views={other} />}
      <p className="fine-print">
        Logging anything keeps your streak. Seven days in a row earns a freeze, which covers one
        missed day. New daily quests arrive each morning, sized to what you usually do.
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
            className={progress.complete ? 'quest done' : 'quest'}
            aria-label={`${quest.title}: ${progress.complete ? 'complete' : progress.label}`}
          >
            <span className="quest-icon" aria-hidden="true">
              <Icon name={progress.complete ? 'check' : QUEST_ICON[quest.condition.type]} />
            </span>
            <span className="quest-title">{quest.title}</span>
            <span className="quest-xp" aria-hidden="true">
              <Icon name="chest" size={26} />+{quest.xp} XP
            </span>
            <span className="bar quest-bar" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${progress.fraction * 100}%` }} />
              <span className="quest-label">{progress.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
