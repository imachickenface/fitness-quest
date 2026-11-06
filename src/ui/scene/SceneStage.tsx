import { useEffect, useRef, useState } from 'react';
import type { CharacterId } from '../../contract.ts';
import { sceneToShow, type ScenePlace } from '../../core/scenes.ts';
import { loadCharacter, type CharacterEntry, type CharacterSprite } from '../../scene/character.ts';
import { createScene, type SceneView } from '../../scene/engine.ts';
import type { SceneManifest } from '../../scene/manifest.ts';
import { skyAt } from '../../scene/sky.ts';
import { loadWorld, type World } from '../../scene/world.ts';
import { reducedMotion } from '../claimFx.ts';
import { characterList, CHARACTER_BASE } from './characters.ts';

const SCENE_BASE = `${import.meta.env.BASE_URL}scenes/`;
/** the level last shown on this device, so a level-up made elsewhere (or on another tab) still walks */
const SHOWN_KEY = 'fq.sceneLevel';
const FADE_MS = 450;
/** the height the scene aims for; it snaps to a whole-number scale of the art */
const CSS_HEIGHT = 300;

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function readShown(): number | null {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const v = Number(raw);
    return raw !== null && Number.isInteger(v) && v >= 1 ? v : null;
  } catch {
    return null;
  }
}

function writeShown(level: number) {
  try {
    localStorage.setItem(SHOWN_KEY, String(level));
  } catch {
    // private mode or blocked storage: level-ups just won't walk
  }
}

type Taps = NonNullable<SceneManifest['taps']>;

type Props = {
  level: number;
  character: CharacterId;
  /** bumped on each level-up made while the app is open; a cheering character cheers when it arrives */
  cheer?: number;
  onChangeCharacter: () => void;
};

/**
 * The player's place in the world on the Quests screen: the scene for their level, with their character at
 * the level's stop. A level-up walks the character to the next stop; the level that finishes a scene walks
 * them to its end, fades, and opens the next scene. Built on the Canvas 2D engine in `src/scene/engine.ts`.
 */
export function SceneStage({ level, character, cheer, onChangeCharacter }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const view = useRef<SceneView | null>(null);
  const sceneId = useRef<string | null>(null);
  const sprite = useRef<CharacterSprite | null>(null);
  const entry = useRef<CharacterEntry | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [fading, setFading] = useState(true);
  const [shown, setShown] = useState<ScenePlace | null>(null);
  const [taps, setTaps] = useState<Taps>([]);
  const [characterName, setCharacterName] = useState('');
  const spots = useRef<(HTMLButtonElement | null)[]>([]);

  const place = world ? sceneToShow(world.spans, level, null) : null;
  const manifest = shown && world ? world.manifests.get(shown.id) : undefined;

  useEffect(() => {
    alive.current = true;
    loadWorld(SCENE_BASE).then(
      (w) => alive.current && setWorld(w),
      () => alive.current && setStatus('failed'),
    );
    return () => {
      alive.current = false;
      view.current?.dispose();
      view.current = null;
    };
  }, []);

  // the character: loaded on its own, swapped into the running scene without reloading it
  useEffect(() => {
    let cancelled = false;
    characterList()
      .then((list) => {
        const e = list.find((c) => c.id === character) ?? list[0];
        if (!e) throw new Error('no characters');
        return loadCharacter(CHARACTER_BASE, e);
      })
      .then((s) => {
        if (cancelled) return;
        sprite.current = s;
        entry.current = s.entry;
        setCharacterName(s.entry.name);
        view.current?.setCharacter(s);
      })
      .catch(() => {
        // the scene still shows, with the engine's stand-in figure
      });
    return () => {
      cancelled = true;
    };
  }, [character]);

  // move to the level's place: one move at a time, in order, each finishing its walk or scene change
  const targetId = place?.id;
  const targetStop = place?.stop;
  const targetScene = place?.scene;
  useEffect(() => {
    if (!world || targetId === undefined || targetStop === undefined || targetScene === undefined)
      return;
    const target: ScenePlace = { id: targetId, stop: targetStop, scene: targetScene };
    const el = canvas.current;
    if (!el) return;
    const goTo = async () => {
      if (!alive.current) return;
      const motion = !reducedMotion();
      const before = readShown();
      const prev = before === null ? null : sceneToShow(world.spans, before, null);
      let v = view.current;
      if (v && sceneId.current !== target.id) {
        // leaving a scene: walk to its end, fade out
        if (motion) {
          v.setStop(v.manifest.stops.length - 1, true);
          await v.arrived();
          setFading(true);
          await wait(FADE_MS);
        }
        v.dispose();
        v = null;
        view.current = null;
      }
      if (!v) {
        setFading(true);
        v = await createScene(el, `${SCENE_BASE}${target.id}/`, !motion, CSS_HEIGHT);
        if (!alive.current) {
          v.dispose();
          return;
        }
        view.current = v;
        sceneId.current = target.id;
        v.setCharacter(sprite.current);
        v.setSky(skyAt(new Date()));
        // where to start: the last stop shown in this scene, the start of a scene arrived at, or right here
        const start =
          prev && prev.id === target.id && prev.stop <= target.stop
            ? prev.stop
            : prev && prev.scene < target.scene
              ? 0
              : target.stop;
        v.setStop(start, false);
        setTaps(v.manifest.taps ?? []);
        setStatus('ready');
        setFading(false);
      }
      v.setStop(target.stop, motion);
      setShown(target);
      writeShown(level);
      await v.arrived();
    };
    queue.current = queue.current.then(goTo).catch(() => {
      if (alive.current) setStatus('failed');
    });
  }, [world, targetId, targetStop, targetScene, level]);

  // a level-up made while the app is open: a cheering character cheers once it gets there
  useEffect(() => {
    if (!cheer) return;
    void queue.current.then(async () => {
      const v = view.current;
      if (!v) return;
      await v.arrived();
      if (entry.current?.emote?.kind === 'cheer') v.emote();
    });
  }, [cheer]);

  // the sky follows the clock
  useEffect(() => {
    const tick = setInterval(() => view.current?.setSky(skyAt(new Date())), 60_000);
    return () => clearInterval(tick);
  }, []);

  // resizing, tilting the phone, and tap spots that follow the scene as it pans
  useEffect(() => {
    const resize = () => view.current?.resize();
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null) view.current?.setLean(Math.max(-1, Math.min(1, e.gamma / 25)));
    };
    window.addEventListener('resize', resize);
    window.addEventListener('deviceorientation', tilt);
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const v = view.current;
      if (!v) return;
      (v.manifest.taps ?? []).forEach((tap, i) => {
        const b = spots.current[i];
        const r = v.spotRect(tap.id);
        if (!b || !r) return;
        b.style.transform = `translate(${r.left}px, ${r.top}px)`;
        b.style.width = `${r.width}px`;
        b.style.height = `${r.height}px`;
      });
    };
    raf = requestAnimationFrame(place);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('deviceorientation', tilt);
      cancelAnimationFrame(raf);
    };
  }, []);

  const where =
    manifest && shown ? `${manifest.name}, stop ${shown.stop + 1} of ${manifest.stops.length}` : '';

  return (
    <section
      className="panel scene-stage"
      aria-label={characterName ? `Your character: ${characterName}` : 'Your character'}
    >
      <div
        ref={frame}
        className={fading ? 'scene-frame fading' : 'scene-frame'}
        data-state={status}
        data-scene={shown?.id ?? ''}
        data-stop={shown?.stop ?? ''}
        data-level={level}
        data-character={character}
      >
        {status === 'failed' && place && (
          <img className="scene-still" src={`${SCENE_BASE}${place.id}/base.webp`} alt="" />
        )}
        <canvas
          ref={canvas}
          className="scene-canvas"
          aria-hidden="true"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            view.current?.setLean(((e.clientX - r.left) / r.width) * 2 - 1);
          }}
          onPointerLeave={() => view.current?.setLean(0)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            view.current?.tapAt(e.clientX - r.left, e.clientY - r.top);
          }}
        />
        {taps.map((tap, i) => (
          <button
            key={tap.id}
            ref={(b) => {
              spots.current[i] = b;
            }}
            type="button"
            className="scene-spot"
            aria-label={tap.label}
            onClick={(e) => {
              e.stopPropagation();
              view.current?.press(tap.id);
            }}
          />
        ))}
      </div>
      <p className="visually-hidden" role="status">
        {where}
      </p>
      <button type="button" className="link-btn scene-change" onClick={onChangeCharacter}>
        Change character
      </button>
    </section>
  );
}
