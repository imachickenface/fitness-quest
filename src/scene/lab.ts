/** The scene lab (scene-lab.html, dev only): try a scene's stops, sky, rain, taps and parallax. */
import { createScene, type SceneView, type Sky } from './engine.ts';
import { skyAt } from './sky.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const frame = $<HTMLDivElement>('frameEl');
const base = `${import.meta.env.BASE_URL}scenes/station/`;

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
  void start();
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

void start();
