import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CharacterId, GameState, Profile, QuestCondition } from '../contract.ts';
import { isClaimed, levelTier } from '../core/game.ts';
import { claimQuest, getSettings, saveProfile, updateSettings } from '../db/db.ts';
import { flyXp, reducedMotion } from './claimFx.ts';
import { useDb } from './dbContext.ts';
import { nowStamp } from './format.ts';
import { Icon, type IconName } from './Icon.tsx';
import { CharacterPicker } from './scene/CharacterPicker.tsx';
import { SceneStage } from './scene/SceneStage.tsx';
import { ScenesSheet } from './scene/ScenesSheet.tsx';
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

/** What the level bar shows; it trails the real state while it animates towards it. */
type Shown = { level: number; into: number; of: number; instant: boolean };

const FILL_MS = 700;

/**
 * The level bar's animation: a gain fills the bar to the new value; a level-up fills it to the end, empties
 * it under the new level number and fills it again. Under reduced motion the bar jumps straight there.
 */
function useXpBar(state: GameState): { shown: Shown; filling: boolean; levelUps: number } {
  const { level, xpIntoLevel, xpForLevel } = state;
  const [shown, setShown] = useState<Shown>({
    level,
    into: xpIntoLevel,
    of: xpForLevel,
    instant: true,
  });
  const [filling, setFilling] = useState(false);
  const [levelUps, setLevelUps] = useState(0);
  const last = useRef(shown);
  useEffect(() => {
    last.current = shown;
  }, [shown]);

  useEffect(() => {
    const from = last.current;
    if (from.level === level && from.into === xpIntoLevel && from.of === xpForLevel) return;
    const target: Shown = { level, into: xpIntoLevel, of: xpForLevel, instant: false };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, step: () => void) => timers.push(setTimeout(step, ms));
    const gain = level > from.level || (level === from.level && xpIntoLevel > from.into);

    if (!gain || reducedMotion()) {
      later(0, () => {
        setShown({ ...target, instant: true });
        if (level > from.level) setLevelUps((n) => n + 1);
      });
    } else if (level > from.level) {
      later(0, () => {
        setFilling(true);
        setShown({ ...from, into: from.of, instant: false });
      });
      later(FILL_MS, () => {
        setShown({ level, into: 0, of: xpForLevel, instant: true });
        setLevelUps((n) => n + 1);
      });
      later(FILL_MS + 60, () => setShown(target));
      later(FILL_MS * 2 + 60, () => setFilling(false));
    } else {
      later(0, () => {
        setFilling(true);
        setShown(target);
      });
      later(FILL_MS, () => setFilling(false));
    }
    return () => timers.forEach(clearTimeout);
  }, [level, xpIntoLevel, xpForLevel]);

  return { shown, filling, levelUps };
}

type HeroProps = {
  state: GameState;
  /** the level bar, where claimed XP flies to */
  barRef?: RefObject<HTMLDivElement | null>;
  character: CharacterId;
  /** bumped on each level-up made while the app is open */
  cheer?: number;
  picked?: string;
  pickedStop?: number;
  parallax: boolean;
  onChangeCharacter: () => void;
  onOpenScenes: () => void;
  onFollow: () => void;
};

export function HeroCard({
  state,
  barRef,
  character,
  cheer,
  picked,
  pickedStop,
  parallax,
  onChangeCharacter,
  onOpenScenes,
  onFollow,
}: HeroProps) {
  const { shown, filling, levelUps } = useXpBar(state);
  const pct = Math.min(100, (shown.into / shown.of) * 100);
  return (
    <>
      <SceneStage
        level={state.level}
        character={character}
        cheer={cheer}
        picked={picked}
        pickedStop={pickedStop}
        parallax={parallax}
        onChangeCharacter={onChangeCharacter}
        onOpenScenes={onOpenScenes}
        onFollow={onFollow}
      />
      {/* the badge and the bar change colour every 10 levels (index.css, data-tier) */}
      <section className="panel hero-card" aria-label="Level" data-tier={levelTier(shown.level)}>
        <span
          key={levelUps}
          className={[
            'level-badge',
            levelUps > 0 ? 'level-up' : '',
            shown.level >= 100 ? 'long' : '',
          ].join(' ')}
          aria-hidden="true"
        >
          {shown.level}
        </span>
        <p className="hero-level">
          <span>Level</span> {shown.level}
        </p>
        <div
          ref={barRef}
          className={filling ? 'bar xp-bar filling' : 'bar xp-bar'}
          role="progressbar"
          aria-label="XP to the next level"
          aria-valuemin={0}
          aria-valuemax={shown.of}
          aria-valuenow={shown.into}
        >
          <div
            className={shown.instant ? 'bar-fill instant' : 'bar-fill'}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="hero-xp">
          {shown.into} / {shown.of} XP to level {shown.level + 1}
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

type Props = { game: Game; profile: Profile; cheer?: number };

export function Quests({ game, profile, cheer }: Props) {
  const db = useDb();
  const [picking, setPicking] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const settings = useLiveQuery(() => getSettings(db), [db]);
  const parallax = settings?.parallax ?? true;
  const bar = useRef<HTMLDivElement>(null);
  // quests mid-claim: their button is spent while the XP flies
  const [claiming, setClaiming] = useState<ReadonlySet<string>>(new Set());
  const [claimed, setClaimed] = useState('');
  const claim = async ({ quest }: QuestView, button: HTMLElement) => {
    if (claiming.has(quest.id)) return;
    setClaiming((ids) => new Set(ids).add(quest.id));
    if (!reducedMotion()) await flyXp(button, bar.current, quest.xp);
    await claimQuest(db, quest.id, nowStamp());
    setClaimed(`Claimed ${quest.xp} XP: ${quest.title}`);
  };
  const character = profile.character ?? 'jacket';
  const save = (patch: Partial<Profile>) =>
    void saveProfile(db, { ...profile, ...patch, updatedAt: nowStamp() });
  const daily = game.active.filter((v) => v.quest.kind === 'daily');
  const other = game.active.filter((v) => v.quest.kind !== 'daily');
  const list = (title: string, views: QuestView[]) => (
    <QuestList title={title} views={views} today={game.today} claiming={claiming} onClaim={claim} />
  );
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Quests</h1>
      </header>
      <HeroCard
        state={game.state}
        barRef={bar}
        character={character}
        cheer={cheer}
        picked={profile.scene}
        pickedStop={profile.sceneStop}
        parallax={parallax}
        onChangeCharacter={() => setPicking(true)}
        onOpenScenes={() => setScenesOpen(true)}
        onFollow={() => save({ scene: undefined, sceneStop: undefined })}
      />
      {list('Daily quests', daily)}
      {other.length > 0 && list('This week', other)}
      <p className="visually-hidden" role="status">
        {claimed}
      </p>
      <p className="fine-print">
        Logging anything keeps your streak. Seven days in a row earns a freeze, which covers one
        missed day. New daily quests arrive each morning, sized to what you usually do. Tap Claim on
        a finished quest to collect its XP; XP left unclaimed is added when the quest ends.
      </p>
      {picking && (
        <CharacterPicker
          current={character}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            save({ character: id });
          }}
        />
      )}
      {scenesOpen && (
        <ScenesSheet
          level={game.state.level}
          picked={profile.scene}
          pickedStop={profile.sceneStop}
          parallax={parallax}
          onClose={() => setScenesOpen(false)}
          onPick={(pick) => {
            setScenesOpen(false);
            save({ scene: pick?.scene, sceneStop: pick?.stop });
          }}
          onParallax={(on) => void updateSettings(db, { parallax: on })}
        />
      )}
    </div>
  );
}

type ListProps = {
  title: string;
  views: QuestView[];
  today: string;
  claiming: ReadonlySet<string>;
  onClaim: (view: QuestView, button: HTMLElement) => Promise<void>;
};

function QuestList({ title, views, today, claiming, onClaim }: ListProps) {
  return (
    <section className="quest-section" aria-label={title}>
      <h2>{title}</h2>
      <ul className="quest-list">
        {views.map((view) => {
          const { quest, progress } = view;
          const waiting = progress.complete && !isClaimed(quest, today);
          const spent = claiming.has(quest.id);
          const status = !progress.complete
            ? progress.label
            : waiting
              ? `complete, ${quest.xp} XP to claim`
              : 'complete';
          return (
            <li
              key={quest.id}
              className={progress.complete ? 'quest done' : 'quest'}
              aria-label={`${quest.title}: ${status}`}
            >
              <span className="quest-icon" aria-hidden="true">
                <Icon name={progress.complete ? 'check' : QUEST_ICON[quest.condition.type]} />
              </span>
              <span className="quest-title">{quest.title}</span>
              {waiting ? (
                <button
                  type="button"
                  className={spent ? 'claim-btn spent' : 'claim-btn'}
                  disabled={spent}
                  onClick={(e) => void onClaim(view, e.currentTarget)}
                >
                  <Icon name="chest" size={22} />
                  <span>Claim</span>
                  <small>+{quest.xp} XP</small>
                </button>
              ) : (
                <span
                  className={progress.complete ? 'quest-xp claimed' : 'quest-xp'}
                  aria-hidden="true"
                >
                  <Icon name="chest" size={26} />+{quest.xp} XP
                </span>
              )}
              <span className="bar quest-bar" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${progress.fraction * 100}%` }} />
                <span className="quest-label">{progress.label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
