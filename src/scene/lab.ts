/** The scene lab (scene-lab.html, dev only): try a scene's stops, sky, rain, taps and parallax. */
import { loadCharacter, loadCharacters, type CharacterEntry } from './character.ts';
import { createScene, type SceneView, type Sky } from './engine.ts';
import { skyAt } from '../core/sky.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const frame = $<HTMLDivElement>('frameEl');
const base = `${import.meta.env.BASE_URL}scenes/station/`;
const charBase = `${import.meta.env.BASE_URL}characters/`;
let characters: CharacterEntry[] = [];
let characterId = '';

let view: SceneView | null = null;
let stop = 0;
let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let rain = false;
let skyChoice = 'auto';
const spots: HTMLButtonElement[] = [];

async function start() {
  view?.dispose();
  for (const b of spots.splice(0)) b.remove();
  view = await createScene(canvas, base, reduced);
  view.setStop(stop, false);
  await applyCharacter();
  view.setRain(rain);
  applySky();
  const stopsEl = $('stops');
  stopsEl.replaceChildren(
    ...view.manifest.stops.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Stop ${i + 1}`;
      b.onclick = () => {
        stop = i;
        view?.setStop(i, true);
      };
      return b;
    }),
  );
  for (const tap of view.manifest.taps ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spot';
    b.setAttribute('aria-label', tap.label);
    b.onclick = (e) => {
      e.stopPropagation();
      view?.press(tap.id);
    };
    frame.append(b);
    spots.push(b);
  }
  placeSpots();
}

function placeSpots() {
  if (!view) return;
  const taps = view.manifest.taps ?? [];
  taps.forEach((tap, i) => {
    const r = view!.spotRect(tap.id);
    const b = spots[i];
    if (!r || !b) return;
    Object.assign(b.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  });
  requestAnimationFrame(placeSpots);
}

async function applyCharacter() {
  const entry = characters.find((c) => c.id === characterId);
  view?.setCharacter(entry ? await loadCharacter(charBase, entry) : null);
}

async function setupCharacters() {
  characters = await loadCharacters(charBase);
  characterId = characters[0]?.id ?? '';
  const pick = $<HTMLSelectElement>('character');
  pick.replaceChildren(
    ...characters.map((c) => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      return o;
    }),
  );
  pick.onchange = () => {
    characterId = pick.value;
    void applyCharacter();
  };
}

$('emote').onclick = () => view?.emote();

function applySky() {
  const sky: Sky = skyChoice === 'auto' ? skyAt(new Date()) : (skyChoice as Sky);
  view?.setSky(sky);
}

$('levelup').onclick = () => {
  if (!view) return;
  stop = (stop + 1) % view.manifest.stops.length;
  view.setStop(stop, true);
};
$<HTMLSelectElement>('sky').onchange = (e) => {
  skyChoice = (e.target as HTMLSelectElement).value;
  applySky();
};
$('rain').onclick = (e) => {
  rain = !rain;
  (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(rain));
  view?.setRain(rain);
};
$('reduced').onclick = (e) => {
  reduced = !reduced;
  (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(reduced));
  void setupCharacters().then(start);
};
$<HTMLSelectElement>('frame').onchange = (e) => {
  frame.style.setProperty('--frame', (e.target as HTMLSelectElement).value);
  view?.resize();
};
frame.style.setProperty('--frame', '390px');

// parallax from a drag across the scene, or from tilting the phone
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  view?.setLean(((e.clientX - r.left) / r.width) * 2 - 1);
});
canvas.addEventListener('pointerleave', () => view?.setLean(0));
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  view?.tapAt(e.clientX - r.left, e.clientY - r.top);
});
window.addEventListener('deviceorientation', (e) => {
  if (e.gamma !== null) view?.setLean(Math.max(-1, Math.min(1, e.gamma / 25)));
});
window.addEventListener('resize', () => view?.resize());

void setupCharacters().then(start);
