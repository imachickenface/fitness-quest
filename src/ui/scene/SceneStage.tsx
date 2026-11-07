import { useEffect, useRef, useState } from 'react';
import type { CharacterId } from '../../contract.ts';
import { localDate } from '../../core/diary.ts';
import { placeForLevel, sceneToShow, type ScenePlace } from '../../core/scenes.ts';
import { skyAt, weatherOn, type Sky, type Weather } from '../../core/sky.ts';
import { loadCharacter, type CharacterEntry, type CharacterSprite } from '../../scene/character.ts';
import { createScene, type SceneView } from '../../scene/engine.ts';
import type { SceneManifest } from '../../scene/manifest.ts';
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

type Outside = { sky: Sky; weather: Weather };
/** the sky on the phone's clock and today's weather (the same for everyone today) */
function outsideNow(): Outside {
  const now = new Date();
  return { sky: skyAt(now), weather: weatherOn(localDate(now)) };
}

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
  /** a scene picked to stay in (Profile.scene); absent = follow the level */
  picked?: string;
  /** the device's parallax setting */
  parallax: boolean;
  onChangeCharacter: () => void;
  onOpenScenes: () => void;
  /** leave a picked scene and follow the level again */
  onFollow: () => void;
};

/**
 * The player's place in the world on the Quests screen: the scene for their level, with their character at
 * the level's stop. A level-up walks the character to the next stop; the level that finishes a scene walks
 * them to its end, fades, and opens the next scene. A scene picked from the Scenes sheet shows instead, with the
 * character at its last stop, until the player follows their level again. Built on the Canvas 2D engine in
 * `src/scene/engine.ts`.
 */
export function SceneStage({
  level,
  character,
  cheer,
  picked,
  parallax,
  onChangeCharacter,
  onOpenScenes,
  onFollow,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const view = useRef<SceneView | null>(null);
  const sceneId = useRef<string | null>(null);
  const sprite = useRef<CharacterSprite | null>(null);
  const entry = useRef<CharacterEntry | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  const lastPicked = useRef<string | null | undefined>(undefined);
  const parallaxOn = useRef(parallax);
  const [outside, setOutside] = useState(outsideNow);
  const outsideRef = useRef(outside);
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [fading, setFading] = useState(true);
  const [shown, setShown] = useState<ScenePlace | null>(null);
  const [taps, setTaps] = useState<Taps>([]);
  const [characterName, setCharacterName] = useState('');
  const spots = useRef<(HTMLButtonElement | null)[]>([]);

  const place = world ? sceneToShow(world.spans, level, picked ?? null) : null;
  const current = world ? placeForLevel(world.spans, level) : null;
  const following = !place || !current || place.id === current.id;
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
    // a new pick (or following the level again) fades straight to the other scene: nobody walked there
    const pick = picked ?? null;
    const switching = lastPicked.current !== undefined && lastPicked.current !== pick;
    lastPicked.current = pick;
    const goTo = async () => {
      if (!alive.current) return;
      const motion = !reducedMotion();
      const before = readShown();
      const prev = before === null ? null : sceneToShow(world.spans, before, null);
      let v = view.current;
      if (v && sceneId.current !== target.id) {
        // leaving a scene: walk to its end (when the level moved on), fade out
        if (motion) {
          if (following && !switching) {
            v.setStop(v.manifest.stops.length - 1, true);
            await v.arrived();
          }
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
        v.setParallax(parallaxOn.current);
        v.setSky(outsideRef.current.sky);
        v.setRain(outsideRef.current.weather === 'rain');
        // where to start: the last stop shown in this scene, the start of a scene arrived at, or right here
        const start =
          !following || switching
            ? target.stop
            : prev && prev.id === target.id && prev.stop <= target.stop
              ? prev.stop
              : prev && prev.scene < target.scene
                ? 0
                : target.stop;
        v.setStop(start, false);
        setTaps(v.manifest.taps ?? []);
        setStatus('ready');
        setFading(false);
      }
      v.setStop(target.stop, motion && following && !switching);
      setShown(target);
      // a picked past scene leaves the level shown alone, so following again picks up from there
      if (following) writeShown(level);
      await v.arrived();
    };
    queue.current = queue.current.then(goTo).catch(() => {
      if (alive.current) setStatus('failed');
    });
  }, [world, targetId, targetStop, targetScene, level, picked, following]);

  useEffect(() => {
    parallaxOn.current = parallax;
    view.current?.setParallax(parallax);
  }, [parallax]);

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

  // the sky follows the clock, and the weather the date
  useEffect(() => {
    const tick = setInterval(() => {
      setOutside((was) => {
        const next = outsideNow();
        return next.sky === was.sky && next.weather === was.weather ? was : next;
      });
    }, 60_000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    outsideRef.current = outside;
    view.current?.setSky(outside.sky);
    view.current?.setRain(outside.weather === 'rain');
  }, [outside]);

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
        data-sky={outside.sky}
        data-weather={outside.weather}
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
      {!following && (
        <button type="button" className="link-btn scene-follow" onClick={onFollow}>
          Back to level {level}
        </button>
      )}
      <button type="button" className="link-btn scene-scenes" onClick={onOpenScenes}>
        Scenes
      </button>
      <button type="button" className="link-btn scene-change" onClick={onChangeCharacter}>
        Change character
      </button>
    </section>
  );
}
