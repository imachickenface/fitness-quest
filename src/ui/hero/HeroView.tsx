import { useEffect, useRef, useState } from 'react';
import type { HeroId } from '../../contract.ts';
import { createHeroScene, type Cheer, type HeroScene, type Look } from './heroScene.ts';
import { themeFor } from './world.ts';

type Props = {
  hero: HeroId;
  muscle: number;
  build: number;
  /** stop on the quest path: completed quests so far */
  node: number;
  /** the player's goal picks the look of the world */
  goal: string;
  /** another character's head and recoloured palette cells */
  look?: Look;
  /** the palette cells this hero uses, once loaded (for the customise sheet) */
  onCells?: (cells: number[]) => void;
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
export default function HeroView({ hero, muscle, build, node, goal, look, onCells, cheer }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const [webgl] = useState(hasWebGL);
  // the world's look is fixed per view; Quests remounts the view when the goal changes
  const [theme] = useState(() => themeFor(goal));
  const head = look?.head;
  const colours = look?.colours;
  // read by the load effect without reloading when they change
  const coloursRef = useRef(colours);
  const onCellsRef = useRef(onCells);
  useEffect(() => {
    onCellsRef.current = onCells;
  }, [onCells]);
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
        sceneRef.current ??= createHeroScene(el, theme);
        return sceneRef.current.load(hero, { head, colours: coloursRef.current });
      })
      .then(() => {
        if (cancelled) return;
        setLoaded(hero);
        onCellsRef.current?.(sceneRef.current?.cells() ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(hero); // the still picture stays
      });
    return () => {
      cancelled = true;
    };
  }, [hero, head, webgl, theme]);

  // recolour live, without reloading the model
  useEffect(() => {
    coloursRef.current = colours;
    sceneRef.current?.setColours(colours ?? {});
  }, [colours]);

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
    <div
      className="hero-view"
      data-hero={hero}
      data-head={head ?? hero}
      data-state={state}
      data-node={node}
    >
      {state !== 'ready' && (
        <img className="hero-still" src={`${import.meta.env.BASE_URL}hero/${hero}.png`} alt="" />
      )}
      <canvas ref={canvas} className="hero-canvas" aria-hidden="true" />
    </div>
  );
}
