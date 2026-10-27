import { useEffect, useRef, useState } from 'react';
import type { HeroId } from '../../contract.ts';
import { createHeroScene, type Cheer, type HeroScene } from './heroScene.ts';

type Props = {
  hero: HeroId;
  muscle: number;
  build: number;
  /** stop on the quest path: completed quests so far */
  node: number;
  /** bump `n` to play a one-off animation */
  cheer?: { n: number; clip: Cheer };
};

/** Cheers already played, so remounting the view (switching tabs) doesn't replay one. */
let lastCheer = 0;

const SHOWN_KEY = 'fq.mapNode';

function readShownNode(): number | null {
  try {
    const v = Number(localStorage.getItem(SHOWN_KEY));
    return Number.isInteger(v) && localStorage.getItem(SHOWN_KEY) !== null ? v : null;
  } catch {
    return null;
  }
}

function writeShownNode(n: number) {
  try {
    localStorage.setItem(SHOWN_KEY, String(n));
  } catch {
    // private mode or blocked storage: the hero just won't walk
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Default export so the Quests screen can lazy-load three.js with it. */
export default function HeroView({ hero, muscle, build, node, cheer }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const [webgl] = useState(hasWebGL);
  const [loaded, setLoaded] = useState<HeroId | null>(null);
  const [failed, setFailed] = useState<HeroId | null>(null);
  const state = !webgl || failed === hero ? 'failed' : loaded === hero ? 'ready' : 'loading';

  useEffect(
    () => () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!webgl || !el) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        sceneRef.current ??= createHeroScene(el);
        return sceneRef.current.load(hero);
      })
      .then(() => {
        if (!cancelled) setLoaded(hero);
      })
      .catch(() => {
        if (!cancelled) setFailed(hero); // the still picture stays
      });
    return () => {
      cancelled = true;
    };
  }, [hero, webgl]);

  useEffect(() => {
    sceneRef.current?.setBody(muscle, build);
  }, [muscle, build, loaded]);

  // walk from the stop shown last time (remembered on this device) to the current one
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || loaded !== hero) return;
    const shown = readShownNode();
    if (shown !== null && shown < node) {
      scene.setNode(shown, false);
      scene.setNode(node, true);
    } else {
      scene.setNode(node, false);
    }
    writeShownNode(node);
  }, [node, loaded, hero]);

  useEffect(() => {
    if (state !== 'ready' || !cheer || cheer.n <= lastCheer) return;
    lastCheer = cheer.n;
    sceneRef.current?.play(cheer.clip);
  }, [cheer, state]);

  return (
    <div className="hero-view" data-hero={hero} data-state={state} data-node={node}>
      {state !== 'ready' && (
        <img className="hero-still" src={`${import.meta.env.BASE_URL}hero/${hero}.png`} alt="" />
      )}
      <canvas ref={canvas} className="hero-canvas" aria-hidden="true" />
    </div>
  );
}
