import { useEffect, useState } from 'react';
import { placeForLevel, unlockedScenes } from '../../core/scenes.ts';
import { loadWorld, type World } from '../../scene/world.ts';
import { reducedMotion } from '../claimFx.ts';
import { Sheet } from '../Sheet.tsx';

const SCENE_BASE = `${import.meta.env.BASE_URL}scenes/`;

type Props = {
  level: number;
  /** Profile.scene: a scene picked to stay in; absent = follow the level */
  picked?: string;
  parallax: boolean;
  /** a scene id to stay in, or null to follow the level */
  onPick: (scene: string | null) => void;
  onParallax: (on: boolean) => void;
  onClose: () => void;
};

/** The scenes reached so far, to go back to one, and the scene's settings on this device. */
export function ScenesSheet({ level, picked, parallax, onPick, onParallax, onClose }: Props) {
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
  const following = !picked || picked === current?.id || !unlocked.includes(picked);
  const upcoming = world?.spans[unlocked.length];
  const noMotion = reducedMotion();

  return (
    <Sheet title="Scenes" onClose={onClose}>
      <p className="muted">
        Go back to a scene you've reached. Level-ups still count while you're there.
      </p>
      <ul className="scene-list">
        {world?.spans.map((span, i) => {
          if (!unlocked.includes(span.id)) return null;
          const m = world.manifests.get(span.id);
          const here = span.id === current?.id;
          const first = starts[i] ?? 1;
          return (
            <li key={span.id}>
              <button
                type="button"
                className="scene-option"
                aria-pressed={here ? following : picked === span.id}
                onClick={() => onPick(here ? null : span.id)}
              >
                <img src={`${SCENE_BASE}${span.id}/base.webp`} alt="" />
                <span className="scene-option-text">
                  <strong>{m?.name ?? span.id}</strong>
                  <small>
                    Levels {first}-{first + span.levels - 1}
                    {here ? ' · you are here' : ''}
                  </small>
                </span>
              </button>
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
