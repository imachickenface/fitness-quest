import { useEffect, useState } from 'react';
import { placeForLevel, reachedStops, sceneToShow, unlockedScenes } from '../../core/scenes.ts';
import { loadWorld, type World } from '../../scene/world.ts';
import { reducedMotion } from '../claimFx.ts';
import { Sheet } from '../Sheet.tsx';

const SCENE_BASE = `${import.meta.env.BASE_URL}scenes/`;

type Props = {
  level: number;
  /** Profile.scene: a scene picked to stay in; absent = follow the level */
  picked?: string;
  /** Profile.sceneStop: a stop picked in that scene; absent = the last one reached */
  pickedStop?: number;
  parallax: boolean;
  /** a scene (and a stop in it) to stay at, or null to follow the level */
  onPick: (pick: { scene: string; stop?: number } | null) => void;
  onParallax: (on: boolean) => void;
  onClose: () => void;
};

/** The scenes reached so far, to go back to one, and the scene's settings on this device. */
export function ScenesSheet({
  level,
  picked,
  pickedStop,
  parallax,
  onPick,
  onParallax,
  onClose,
}: Props) {
  const [world, setWorld] = useState<World | null>(null);
  // shown at once; the setting is saved on this device behind it
  const [moving, setMoving] = useState(parallax);
  useEffect(() => {
    let cancelled = false;
    loadWorld(SCENE_BASE).then(
      (w) => !cancelled && setWorld(w),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const current = world ? placeForLevel(world.spans, level) : null;
  const unlocked = world ? unlockedScenes(world.spans, level) : [];
  // the first level of each scene, for "Levels 1-5" and the next scene's unlock level
  const starts: number[] = [];
  let next = 1;
  for (const span of world?.spans ?? []) {
    starts.push(next);
    next += span.levels;
  }
  const shown = world ? sceneToShow(world.spans, level, picked ?? null, pickedStop) : null;
  const upcoming = world?.spans[unlocked.length];
  const noMotion = reducedMotion();

  return (
    <Sheet title="Scenes" onClose={onClose}>
      <p className="muted">
        Go back to a scene or a stop you've reached. Level-ups still count while you're there.
      </p>
      <ul className="scene-list">
        {world?.spans.map((span, i) => {
          if (!unlocked.includes(span.id)) return null;
          const m = world.manifests.get(span.id);
          const here = span.id === current?.id;
          const first = starts[i] ?? 1;
          const name = m?.name ?? span.id;
          const reached = reachedStops(world.spans, level, span.id);
          // the place the level is at means following it, rather than a pick
          const pick = (stop?: number) =>
            onPick(
              here && (stop === undefined || stop === current?.stop)
                ? null
                : { scene: span.id, ...(stop === undefined ? {} : { stop }) },
            );
          return (
            <li key={span.id}>
              <button
                type="button"
                className="scene-option"
                aria-pressed={shown?.id === span.id}
                onClick={() => pick()}
              >
                <img src={`${SCENE_BASE}${span.id}/base.webp`} alt="" />
                <span className="scene-option-text">
                  <strong>{name}</strong>
                  <small>
                    Levels {first}-{first + span.levels - 1}
                    {here ? ' · you are here' : ''}
                  </small>
                </span>
              </button>
              <div className="scene-stops" role="group" aria-label={`Stops in ${name}`}>
                {Array.from({ length: span.stops }, (_, stop) => (
                  <button
                    key={stop}
                    type="button"
                    className="scene-stop"
                    aria-label={`${name}, stop ${stop + 1}${stop < reached ? '' : ', not reached yet'}`}
                    aria-pressed={shown?.id === span.id && shown.stop === stop}
                    disabled={stop >= reached}
                    onClick={() => pick(stop)}
                  >
                    {stop + 1}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
        {upcoming && (
          <li className="scene-locked">
            <span>Next scene at level {starts[unlocked.length]}</span>
          </li>
        )}
      </ul>
      <label className="check">
        <input
          type="checkbox"
          checked={moving}
          onChange={(e) => {
            setMoving(e.target.checked);
            onParallax(e.target.checked);
          }}
        />
        <span>Move the scene when I tilt my phone or drag across it</span>
      </label>
      {noMotion && (
        <p className="fine-print">
          Your phone asks apps to reduce motion, so the scene stays still and level-ups jump instead
          of walking.
        </p>
      )}
    </Sheet>
  );
}
