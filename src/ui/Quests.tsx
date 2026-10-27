import { lazy, Suspense, useState } from 'react';
import type { GameState, HeroId, Profile, QuestCondition } from '../contract.ts';
import { saveProfile } from '../db/db.ts';
import { useDb } from './dbContext.ts';
import { nowStamp } from './format.ts';
import type { Cheer, Look } from './hero/heroScene.ts';
import { DEFAULT_HERO, HERO_NAMES } from './hero/heroNames.ts';
import { CustomiseSheet } from './hero/CustomiseSheet.tsx';
import { HeroPicker } from './hero/HeroPicker.tsx';
import { Icon, type IconName } from './Icon.tsx';
import type { Game, QuestView } from './useGame.ts';

// three.js only loads when the Quests screen does
const HeroView = lazy(() => import('./hero/HeroView.tsx'));

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

type HeroProps = {
  state: GameState;
  goal: string;
  hero: HeroId;
  body: Game['body'];
  cheer?: { n: number; clip: Cheer };
  look?: Look;
  onCells: (cells: number[]) => void;
  onChange: () => void;
  onCustomise: () => void;
};

export function HeroCard({
  state,
  goal,
  hero,
  body,
  cheer,
  look,
  onCells,
  onChange,
  onCustomise,
}: HeroProps) {
  const pct = Math.min(100, (state.xpIntoLevel / state.xpForLevel) * 100);
  return (
    <>
      <section className="panel hero-stage" aria-label={`Your hero: ${HERO_NAMES[hero]}`}>
        <Suspense
          fallback={
            <div className="hero-view" data-hero={hero} data-state="loading">
              <img
                className="hero-still"
                src={`${import.meta.env.BASE_URL}hero/${hero}.png`}
                alt=""
              />
            </div>
          }
        >
          <HeroView
            key={goal}
            hero={hero}
            muscle={body.muscle}
            build={body.build}
            node={state.mapNode}
            goal={goal}
            look={look}
            onCells={onCells}
            cheer={cheer}
          />
        </Suspense>
        <button type="button" className="link-btn hero-change" onClick={onChange}>
          Change hero
        </button>
        <button type="button" className="link-btn hero-customise" onClick={onCustomise}>
          Customise
        </button>
      </section>
      <section className="panel hero-card" aria-label="Level">
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

type Props = { game: Game; profile: Profile; cheer?: { n: number; clip: Cheer } };

export function Quests({ game, profile, cheer }: Props) {
  const db = useDb();
  const [picking, setPicking] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [cells, setCells] = useState<number[]>([]);
  const hero = profile.hero ?? DEFAULT_HERO;
  const save = (patch: Partial<Profile>) =>
    void saveProfile(db, { ...profile, ...patch, updatedAt: nowStamp() });
  const daily = game.active.filter((v) => v.quest.kind === 'daily');
  const other = game.active.filter((v) => v.quest.kind !== 'daily');
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Quests</h1>
      </header>
      <HeroCard
        goal={profile.goal}
        state={game.state}
        hero={hero}
        body={game.body}
        cheer={cheer}
        look={profile.heroLook}
        onCells={setCells}
        onChange={() => setPicking(true)}
        onCustomise={() => setCustomising(true)}
      />
      <QuestList title="Daily quests" views={daily} />
      {other.length > 0 && <QuestList title="This week" views={other} />}
      <p className="fine-print">
        Logging anything keeps your streak. Seven days in a row earns a freeze, which covers one
        missed day. New daily quests arrive each morning, sized to what you usually do.
      </p>
      {picking && (
        <HeroPicker
          current={hero}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            // colours belong to one character's palette use, so a new hero starts fresh
            save({ hero: id, heroLook: undefined });
          }}
        />
      )}
      {customising && (
        <CustomiseSheet
          hero={hero}
          look={profile.heroLook ?? {}}
          cells={cells}
          onClose={() => setCustomising(false)}
          onChange={(look) => save({ heroLook: look })}
        />
      )}
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
