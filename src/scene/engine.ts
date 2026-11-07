/**
 * A living pixel-art scene on a Canvas 2D: parallax layers, a camera that pans between stops, and code-drawn
 * life (fireflies, chimney smoke, drifting mist, flickering lamps, puddle shimmer, rain), a time-of-day grade and
 * tap reactions (a swinging bell, brighter lamps, fireflies that scatter).
 *
 * Everything is drawn into a buffer at the scene's own pixel size and copied to the screen at a whole-number scale
 * with smoothing off, so pixels stay square and crisp. The loop runs at about 30 frames a second and stops while
 * the page is hidden or the canvas is off screen. With reduced motion the scene is still: no particles, no
 * parallax, and stops are cuts instead of walks.
 */
import type { CharacterSprite } from './character.ts';
import { SceneManifest } from './manifest.ts';

export type Sky = 'morning' | 'day' | 'dusk' | 'night';

export type SceneTap = { id: string; label: string; box: [number, number, number, number] };

export type SceneView = {
  manifest: SceneManifest;
  /** Move to stop `i`; walks there when `walk` (and motion is allowed), else cuts. */
  setStop(i: number, walk: boolean): void;
  setSky(sky: Sky): void;
  setRain(on: boolean): void;
  /** Parallax lean from a drag or tilt, -1 .. 1. */
  setLean(x: number): void;
  /** The player's character (null draws a stand-in). */
  setCharacter(c: CharacterSprite | null): void;
  /** Parallax on or off (a setting); off, the view stays put on a tilt, a drag or a walk. */
  setParallax(on: boolean): void;
  /** Play the character's emote for a moment. */
  emote(): void;
  /** Resolves once the character stands still (at once if it is not walking). */
  arrived(): Promise<void>;
  /** Press a tap spot (from a button or a tap on the canvas). */
  press(id: string): void;
  /** A tap at a point on the canvas in CSS pixels: presses the spot there, or scatters fireflies. */
  tapAt(x: number, y: number): void;
  /** Where a tap spot is on the canvas, in CSS pixels (for placing accessible buttons over it). */
  spotRect(id: string): { left: number; top: number; width: number; height: number } | null;
  /** Re-fit to the canvas's CSS size. */
  resize(): void;
  dispose(): void;
};

const FRAME = 1 / 30;
const WALK_SPEED = 48; // scene pixels a second
const WALK_MAX_SECONDS = 4;
const WALK_FPS = 12; // walk-cycle frames a second at WALK_SPEED
const EMOTE_SECONDS = 1.8;
const BREATH_SECONDS = 3.8; // one slow breath while standing
const BREATH_WAIST = 0.75; // where the lifting body meets the legs (below the hands, so the arms lift whole)

/** 1 while the shoulders are lifted by a breath in, else 0: in for 40% of the breath, out and at rest for 60%. */
function breathIn(time: number): number {
  const p = (((time / BREATH_SECONDS) % 1) + 1) % 1;
  return p < 0.4 ? 1 : 0;
}
const MAX_LEAN = 10; // scene pixels the whole view slides at full lean
const FAR_LAG = 0.4; // the far layer (sky, mountains) slides this much less, for a little depth

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  seed: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('no 2D canvas');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Small deterministic random numbers in [0, 1) for a seed. */
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Separable box blur of a single-channel image, `passes` times (close to a Gaussian). */
function blur(
  src: Float32Array<ArrayBuffer>,
  w: number,
  h: number,
  r: number,
  passes: number,
): Float32Array<ArrayBuffer> {
  let a = src;
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += a[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[Math.min(h - 1, y + r + 1) * w + x]! - a[Math.max(0, y - r) * w + x]!;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

/** The lamps and windows: bright warm pixels in the light rows, as a sharp layer and a soft glow. */
function makeLights(base: HTMLImageElement, m: SceneManifest) {
  const w = m.width;
  const h = m.height;
  const c = canvas(w, h);
  const ctx = ctx2d(c);
  ctx.drawImage(base, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const mask = new Float32Array(w * h);
  const sharp = ctx.createImageData(w, h);
  const top = m.lights?.top ?? 0;
  const bottom = m.lights?.bottom ?? -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data.data[i]!;
      const g = data.data[i + 1]!;
      const b = data.data[i + 2]!;
      if (r > 200 && g > 140 && b < 150 && r - b > 90) {
        mask[y * w + x] = 1;
        sharp.data.set([r, g, b, 255], i);
      }
    }
  }
  const soft = blur(mask, w, h, 4, 3);
  const glowData = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, soft[i]! * 3.2);
    glowData.data.set([255, 176, 86, Math.round(a * 255)], i * 4);
  }
  const sharpC = canvas(w, h);
  ctx2d(sharpC).putImageData(sharp, 0, 0);
  const glowC = canvas(w, h);
  ctx2d(glowC).putImageData(glowData, 0, 0);
  return { sharp: sharpC, glow: glowC };
}

/** A strip of soft value noise for a mist band, tileable left to right. */
function makeMist(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, h);
  const r = rand(seed);
  const cells = 24;
  const grid = Array.from({ length: cells }, () => r());
  for (let x = 0; x < w; x++) {
    const u = (x / w) * cells;
    const i = Math.floor(u);
    const f = u - i;
    const t = f * f * (3 - 2 * f);
    const v = grid[i % cells]! * (1 - t) + grid[(i + 1) % cells]! * t;
    for (let y = 0; y < h; y++) {
      const edge = Math.sin((y / (h - 1)) * Math.PI); // fades out at the top and bottom of the band
      const a = Math.max(0, v * 1.3 - 0.25) * edge;
      img.data.set([214, 224, 232, Math.round(Math.min(1, a) * 255)], (y * w + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let audio: AudioContext | null = null;

/** A small bell: a few inharmonic partials with a quick strike and a long fade. */
function ringBell() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const now = audio.currentTime;
    const out = audio.createGain();
    out.gain.value = 0.18;
    out.connect(audio.destination);
    for (const [ratio, amp, decay] of [
      [1, 1, 2.6],
      [2.0, 0.5, 1.8],
      [2.76, 0.35, 1.4],
      [5.4, 0.15, 0.7],
    ] as const) {
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.frequency.value = 660 * ratio;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }
  } catch {
    // no sound is fine
  }
}

export async function createScene(
  target: HTMLCanvasElement,
  baseUrl: string,
  reducedMotion: boolean,
  /** the height to aim for in CSS pixels; the canvas snaps to the nearest whole-number scale of the art */
  cssHeight = 420,
): Promise<SceneView> {
  const m = SceneManifest.parse(await (await fetch(`${baseUrl}scene.json`)).json());
  const [base, ...layerImgs] = await Promise.all([
    loadImage(`${baseUrl}base.webp`),
    ...m.layers.map((l) => loadImage(baseUrl + l.src)),
  ]);
  const W = m.width;
  const H = m.height;

  // layers as canvases
  const layers = layerImgs.map((img) => {
    const c = canvas(W, H);
    ctx2d(c).drawImage(img, 0, 0);
    return c;
  });
  const propsIndex = m.layers.reduce(
    (best, l, i) => (Math.abs(l.depth) < Math.abs(m.layers[best]!.depth) ? i : best),
    0,
  );
  // moving parts come as their own sprites, already cut out of the layers (art/scene_layers.py)
  const bells = await Promise.all(
    (m.taps ?? [])
      .filter((t) => t.kind === 'bell' && t.sprite)
      .map(async (t) => ({
        id: t.id,
        x0: t.sprite!.x,
        y0: t.sprite!.y,
        sprite: await loadImage(baseUrl + t.sprite!.src),
        pivot: t.pivot ?? [(t.box[0] + t.box[2]) / 2, t.box[1]],
        swing: -1,
      })),
  );
  const lights = makeLights(base!, m);
  const mists = (m.mist ?? []).map((band, i) => ({
    band,
    img: makeMist(W, Math.max(2, Math.round(band.height)), 7 + i),
  }));

  const ctx = ctx2d(target);
  let buffer = canvas(1, H);
  let bctx = ctx2d(buffer);
  let scale = 1;
  let viewW = 1;
  let cssPerPx = 1;

  let sky: Sky = 'dusk';
  let rain = false;
  let lean = 0;
  let parallax = true;
  let stop = 0;
  let charX = m.stops[0]!;
  let camX = 0;
  let walkingTo: number | null = null;
  let walkFrom = 0; // where the current walk started
  let hero: CharacterSprite | null = null;
  let facing = 1; // 1 right, -1 left
  let stepClock = 0; // seconds of walking, for the walk cycle
  let emoteLeft = 0;
  const waiting: (() => void)[] = []; // arrived() promises, resolved when a walk ends
  let t = 0;
  const lampBoost = new Map<string, number>(); // tap id -> seconds left
  const r = rand(1234);

  const fireflies: Particle[] = [];
  const ff = m.fireflies;
  if (ff && !reducedMotion) {
    for (let i = 0; i < ff.count; i++) {
      fireflies.push({
        x: ff.x0 + r() * (ff.x1 - ff.x0),
        y: ff.y0 + r() * (ff.y1 - ff.y0),
        vx: 0,
        vy: 0,
        age: r() * 10,
        life: 0,
        size: 1,
        seed: r() * 100,
      });
    }
  }
  const smoke: Particle[] = [];
  const drops: Particle[] = [];
  const ripples: Particle[] = [];
  let smokeTimer = 0;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = target.getBoundingClientRect();
    const devW = Math.max(1, Math.round(rect.width * dpr));
    // from the wanted height, not the canvas's own (which this sets), so a resize can grow it again
    scale = Math.max(1, Math.round((cssHeight * dpr) / H));
    target.width = devW;
    target.height = H * scale;
    target.style.height = `${(H * scale) / dpr}px`;
    // keep MAX_LEAN of art spare on both sides so a lean can always slide the whole view
    scale = Math.max(scale, Math.ceil(devW / (W - 2 * MAX_LEAN)));
    viewW = Math.min(W - 2 * MAX_LEAN, Math.ceil(devW / scale));
    buffer = canvas(viewW, H);
    bctx = ctx2d(buffer);
    ctx.imageSmoothingEnabled = false;
    cssPerPx = scale / dpr;
  }

  function cameraFor(x: number) {
    return Math.min(Math.max(MAX_LEAN, x - viewW / 2), Math.max(MAX_LEAN, W - viewW - MAX_LEAN));
  }

  function update(dt: number) {
    t += dt;
    emoteLeft = Math.max(0, emoteLeft - dt);
    if (walkingTo !== null) {
      const dir = Math.sign(walkingTo - charX);
      if (dir !== 0) facing = dir;
      // a long way (several levels at once) is walked faster, so no walk takes much over WALK_MAX_SECONDS;
      // the steps speed up with it, so the feet don't slide
      const speed = Math.max(WALK_SPEED, Math.abs(walkingTo - walkFrom) / WALK_MAX_SECONDS);
      stepClock += (dt * speed) / WALK_SPEED;
      emoteLeft = 0;
      charX += dir * speed * dt;
      if (Math.sign(walkingTo - charX) !== dir) {
        charX = walkingTo;
        walkingTo = null;
        stepClock = 0;
        for (const done of waiting.splice(0)) done();
      }
    }
    const want = cameraFor(charX);
    camX += (want - camX) * Math.min(1, dt * 4);
    for (const [id, left] of lampBoost) {
      if (left - dt <= 0) lampBoost.delete(id);
      else lampBoost.set(id, left - dt);
    }
    for (const b of bells) if (b.swing >= 0) b.swing = b.swing + dt > 4 ? -1 : b.swing + dt;
    if (reducedMotion) return;

    for (const f of fireflies) {
      f.age += dt;
      f.vx *= 0.92;
      f.vy *= 0.92;
      f.x += (Math.sin(f.age * 0.7 + f.seed) * 4 + f.vx) * dt;
      f.y += (Math.cos(f.age * 0.9 + f.seed * 2) * 2.5 + f.vy) * dt;
      if (ff) {
        if (f.x < ff.x0) f.x += ff.x1 - ff.x0;
        if (f.x > ff.x1) f.x -= ff.x1 - ff.x0;
        f.y = Math.min(ff.y1, Math.max(ff.y0, f.y));
      }
    }
    smokeTimer -= dt;
    if (smokeTimer <= 0 && m.smoke) {
      smokeTimer = 0.45;
      for (const s of m.smoke)
        smoke.push({
          x: s.x + (r() - 0.5) * 2,
          y: s.y,
          vx: 1.5 + r(),
          vy: -5 - r() * 2,
          age: 0,
          life: 6 + r() * 2,
          size: 1,
          seed: r(),
        });
    }
    for (const p of smoke) {
      p.age += dt;
      p.x += (p.vx + Math.sin(p.age * 1.3 + p.seed * 6) * 1.2) * dt;
      p.y += p.vy * dt;
      p.size = 1 + p.age * 0.55;
    }
    for (let i = smoke.length - 1; i >= 0; i--)
      if (smoke[i]!.age > smoke[i]!.life) smoke.splice(i, 1);

    if (rain) {
      const want = Math.round(viewW * 0.45);
      while (drops.length < want)
        drops.push({
          x: camX + r() * (viewW + 40),
          y: -r() * H,
          vx: -40,
          vy: 230 + r() * 60,
          age: 0,
          life: 0,
          size: 3 + Math.round(r() * 2),
          seed: r(),
        });
      for (const d of drops) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const floor = m.puddles ? m.puddles.y0 + d.seed * (m.puddles.y1 - m.puddles.y0) : H;
        if (d.y > floor) {
          if (m.puddles && r() < 0.5)
            ripples.push({
              x: d.x,
              y: Math.round(floor),
              vx: 0,
              vy: 0,
              age: 0,
              life: 0.5,
              size: 0,
              seed: 0,
            });
          d.x = camX + r() * (viewW + 40);
          d.y = -r() * 20;
        }
      }
    } else drops.length = 0;
    for (const p of ripples) p.age += dt;
    for (let i = ripples.length - 1; i >= 0; i--)
      if (ripples[i]!.age > ripples[i]!.life) ripples.splice(i, 1);
  }

  // the view's left edge in scene pixels as last drawn (the camera plus the lean), for taps and spots
  let viewX = 0;

  /** How far the whole view slides: a lean from the user, plus a little drift while walking. */
  function shift() {
    if (reducedMotion || !parallax) return 0;
    const drift =
      walkingTo === null ? 0 : Math.max(-1, Math.min(1, (charX - (m.stops[stop] ?? charX)) / 60));
    return Math.round(MAX_LEAN * Math.max(-1, Math.min(1, lean + drift)));
  }

  /** Offset of a layer from the view: 0 for everything in the scene, a lag for the far layer (depth < 0). */
  function lean_(depth: number) {
    return depth < 0 ? Math.round(-depth * FAR_LAG * shift()) : 0;
  }

  function draw() {
    const cam = Math.max(0, Math.min(W - viewW, Math.round(camX) + shift()));
    viewX = cam;
    const g = bctx;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, viewW, H);
    m.layers.forEach((l, i) => {
      const off = lean_(l.depth);
      // never read past the art's edges (that would leave an empty strip): at the ends the layer stops leaning
      const sx = Math.max(0, Math.min(W - viewW, cam - off));
      g.drawImage(layers[i]!, sx, 0, viewW, H, 0, 0, viewW, H);
      if (i === 1 && !reducedMotion) {
        for (const { band, img } of mists) {
          const shift = (((t * band.speed) % W) + W) % W;
          g.globalAlpha = band.alpha;
          for (const dx of [-W, 0, W])
            g.drawImage(
              img,
              Math.round(dx + shift - cam + off),
              Math.round(band.y - band.height / 2),
            );
          g.globalAlpha = 1;
        }
      }
    });

    // moving parts go on top of every layer (the scene behind them was filled when they were cut out)
    {
      const off = lean_(m.layers[propsIndex]!.depth);
      for (const b of bells) {
        const age = b.swing;
        const angle = age < 0 ? 0 : Math.sin(age * 7) * 0.45 * Math.exp(-age * 1.1);
        g.save();
        g.translate(Math.round(b.pivot[0] - cam + off), Math.round(b.pivot[1]));
        g.rotate(angle);
        g.drawImage(b.sprite, Math.round(b.x0 - b.pivot[0]), Math.round(b.y0 - b.pivot[1]));
        g.restore();
      }
    }

    // puddle shimmer: each row of the wet surface sways a pixel
    if (m.puddles && !reducedMotion) {
      const groundIdx = m.layers.length - 2;
      const off = lean_(m.layers[groundIdx]!.depth);
      for (let y = m.puddles.y0; y < m.puddles.y1; y++) {
        const dx = Math.round(Math.sin(t * 2.2 + y * 0.9) * (rain ? 1.4 : 0.7));
        const sx = Math.max(0, Math.min(W - viewW, cam - off - dx));
        if (dx !== 0) g.drawImage(layers[groundIdx]!, sx, y, viewW, 1, 0, y, viewW, 1);
      }
      const front = m.layers.length - 1;
      g.drawImage(
        layers[front]!,
        cam - lean_(m.layers[front]!.depth),
        m.puddles.y0,
        viewW,
        m.puddles.y1 - m.puddles.y0,
        0,
        m.puddles.y0,
        viewW,
        m.puddles.y1 - m.puddles.y0,
      );
    }

    // the player's character, standing on the platform, with a faint reflection in the wet stone
    drawCharacter(g, Math.round(charX - cam), m.ground);

    // smoke and fireflies
    if (!reducedMotion) {
      for (const p of smoke) {
        const a = Math.max(0, 0.5 * (1 - p.age / p.life));
        g.fillStyle = `rgba(190,190,200,${a.toFixed(3)})`;
        const s = Math.round(p.size);
        g.fillRect(Math.round(p.x - cam - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }

    // time of day
    const night = sky === 'night';
    if (sky === 'night') {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(92,104,170)';
      g.fillRect(0, 0, viewW, H);
    } else if (sky === 'morning') {
      g.globalCompositeOperation = 'screen';
      g.fillStyle = 'rgba(120,150,190,0.28)';
      g.fillRect(0, 0, viewW, H);
    } else if (sky === 'day') {
      g.globalCompositeOperation = 'screen';
      g.fillStyle = 'rgba(150,170,190,0.42)';
      g.fillRect(0, 0, viewW, H);
    }
    if (rain) {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(176,184,206)';
      g.fillRect(0, 0, viewW, H);
    }
    g.globalCompositeOperation = 'source-over';

    // lamps: the lit pixels stay bright through the grade, with a flickering glow on top
    const propsOff = lean_(m.layers[propsIndex]!.depth);
    if (night || rain) g.drawImage(lights.sharp, cam - propsOff, 0, viewW, H, 0, 0, viewW, H);
    g.globalCompositeOperation = 'lighter';
    const baseGlow = night ? 0.85 : sky === 'dusk' ? 0.35 : 0.12;
    const strip = 24;
    for (let x0 = 0; x0 < viewW; x0 += strip) {
      const sx = cam - propsOff + x0;
      const flicker = reducedMotion
        ? 1
        : 0.85 + 0.15 * Math.sin(t * 9 + sx * 0.37) * Math.sin(t * 3.1 + sx * 0.11);
      let boost = 1;
      for (const [id, left] of lampBoost) {
        const tap = m.taps?.find((tp) => tp.id === id);
        if (tap && sx + strip > tap.box[0] - 10 && sx < tap.box[2] + 10)
          boost = Math.max(boost, 1 + 1.6 * Math.min(1, left));
      }
      g.globalAlpha = Math.min(1, baseGlow * flicker * boost);
      g.drawImage(lights.glow, sx, 0, strip, H, x0, 0, strip, H);
    }
    g.globalAlpha = 1;

    if (!reducedMotion) {
      const showFireflies = sky !== 'day';
      if (showFireflies) {
        const ffOff = lean_(m.layers[1]?.depth ?? 0);
        for (const f of fireflies) {
          const blink = Math.max(0, Math.sin(f.age * 1.7 + f.seed * 3));
          if (blink < 0.05) continue;
          const x = Math.round(f.x - cam + ffOff);
          const y = Math.round(f.y);
          g.fillStyle = `rgba(255,214,90,${(0.25 * blink).toFixed(3)})`;
          g.fillRect(x - 1, y - 1, 3, 3);
          g.fillStyle = `rgba(255,240,150,${(0.9 * blink).toFixed(3)})`;
          g.fillRect(x, y, 1, 1);
        }
      }
      g.globalCompositeOperation = 'source-over';
      if (rain) {
        g.fillStyle = 'rgba(190,205,240,0.55)';
        for (const d of drops) {
          const x = Math.round(d.x - cam);
          const y = Math.round(d.y);
          for (let k = 0; k < d.size; k++) g.fillRect(x - Math.round(k * 0.18), y - k, 1, 1);
        }
        for (const p of ripples) {
          const rr = Math.round(1 + p.age * 6);
          g.fillStyle = `rgba(210,220,250,${(0.6 * (1 - p.age / p.life)).toFixed(3)})`;
          g.fillRect(Math.round(p.x - cam) - rr, p.y, 1, 1);
          g.fillRect(Math.round(p.x - cam) + rr, p.y, 1, 1);
        }
      }
    }
    g.globalCompositeOperation = 'source-over';

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buffer, 0, 0, viewW, H, 0, 0, viewW * scale, H * scale);
  }

  function drawCharacter(g: CanvasRenderingContext2D, x: number, groundY: number) {
    if (hero) {
      const e = hero.entry;
      const walking = walkingTo !== null && !reducedMotion;
      const frame = walking
        ? e.walk[Math.floor(stepClock * WALK_FPS) % e.walk.length]!
        : emoteLeft > 0 && e.emote
          ? e.emote.frame
          : e.stand;
      const fw = e.frameWidth;
      const fh = e.frameHeight;
      if (m.puddles && groundY < m.puddles.y1) {
        g.save();
        g.beginPath();
        g.rect(x - fw, groundY, fw * 2, m.puddles.y1 - groundY);
        g.clip();
        g.globalAlpha = 0.22;
        g.translate(x, groundY);
        g.scale(facing < 0 ? -1 : 1, -1);
        g.drawImage(hero.img, frame * fw, 0, fw, fh, -Math.floor(fw / 2), -fh, fw, fh);
        g.restore();
      }
      g.save();
      g.translate(x, groundY - fh);
      if (facing < 0) g.scale(-1, 1);
      const left = -Math.floor(fw / 2);
      const sx = frame * fw;
      if (frame === e.stand && !reducedMotion) {
        // breathing: the shoulders lift on the breath in, carrying the arms and head with them as one piece,
        // and settle on the breath out; the legs stay put. The legs are drawn one row taller upwards, so the
        // lifted body never leaves a gap at the waist.
        const waist = Math.round(fh * BREATH_WAIST);
        const lift = breathIn(t);
        g.drawImage(
          hero.img,
          sx,
          waist - 1,
          fw,
          fh - waist + 1,
          left,
          waist - 1,
          fw,
          fh - waist + 1,
        );
        g.drawImage(hero.img, sx, 0, fw, waist, left, -lift, fw, waist);
      } else g.drawImage(hero.img, sx, 0, fw, fh, left, 0, fw, fh);
      g.restore();
      return;
    }
    const walking = walkingTo !== null && !reducedMotion;
    const step = walking ? Math.floor(t * 8) % 2 : 0;
    const bob = walking ? step : 0;
    const y = groundY - 16 - bob;
    g.fillStyle = '#2a1d1a';
    g.fillRect(x - 3, y, 7, 6); // hair
    g.fillStyle = '#f2c6a0';
    g.fillRect(x - 2, y + 2, 5, 4); // face
    g.fillStyle = '#efe7d8';
    g.fillRect(x - 3, y + 6, 7, 4); // top
    g.fillStyle = '#3b3b44';
    g.fillRect(x - 3, y + 10, 3, 5 + (step ? 0 : 1)); // legs
    g.fillRect(x + 1, y + 10, 3, 5 + (step ? 1 : 0));
    g.fillStyle = '#3c6fd8';
    g.fillRect(x - 3, y + 15 + (step ? 0 : 1), 3, 1); // shoes
    g.fillRect(x + 1, y + 15 + (step ? 1 : 0), 3, 1);
  }

  fit();
  camX = cameraFor(charX);
  viewX = Math.round(camX);

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  });
  io.observe(target);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    if (acc < FRAME) return;
    update(acc);
    acc = 0;
    draw();
  };
  raf = requestAnimationFrame(loop);

  function toScene(x: number, y: number) {
    return { x: x / cssPerPx + viewX, y: y / cssPerPx };
  }

  const view: SceneView = {
    manifest: m,
    setStop(i, walk) {
      stop = Math.max(0, Math.min(m.stops.length - 1, i));
      const x = m.stops[stop]!;
      // a walk to where the character already stands would never arrive: that is a cut
      if (walk && !reducedMotion && x !== charX) {
        walkingTo = x;
        walkFrom = charX;
      } else {
        walkingTo = null;
        for (const done of waiting.splice(0)) done();
        charX = x;
        camX = cameraFor(x);
      }
    },
    setSky(s) {
      sky = s;
    },
    setRain(on) {
      rain = on;
    },
    setLean(x) {
      lean = Math.max(-1, Math.min(1, x));
    },
    setParallax(on) {
      parallax = on;
    },
    setCharacter(c) {
      hero = c;
    },
    arrived() {
      return walkingTo === null ? Promise.resolve() : new Promise((done) => waiting.push(done));
    },
    emote() {
      if (hero?.entry.emote && walkingTo === null) emoteLeft = EMOTE_SECONDS;
    },
    press(id) {
      const tap = m.taps?.find((tp) => tp.id === id);
      if (!tap) return;
      if (tap.kind === 'bell') {
        const b = bells.find((bb) => bb.id === id);
        if (b) b.swing = 0;
        ringBell();
      } else lampBoost.set(id, 1.4);
    },
    tapAt(x, y) {
      const p = toScene(x, y);
      if (hero) {
        const half = hero.entry.frameWidth / 2;
        if (
          Math.abs(p.x - charX) <= half &&
          p.y <= m.ground &&
          p.y >= m.ground - hero.entry.frameHeight
        ) {
          view.emote();
          return;
        }
      }
      const hit = m.taps?.find(
        (tp) => p.x >= tp.box[0] && p.x <= tp.box[2] && p.y >= tp.box[1] && p.y <= tp.box[3],
      );
      if (hit) {
        view.press(hit.id);
        return;
      }
      for (const f of fireflies) {
        const dx = f.x - p.x;
        const dy = f.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 40) {
          f.vx += (dx / (d || 1)) * 60;
          f.vy += (dy / (d || 1)) * 40;
        }
      }
    },
    spotRect(id) {
      const tap = m.taps?.find((tp) => tp.id === id);
      if (!tap) return null;
      const [x0, y0, x1, y1] = tap.box;
      return {
        left: (x0 - viewX) * cssPerPx,
        top: y0 * cssPerPx,
        width: (x1 - x0) * cssPerPx,
        height: (y1 - y0) * cssPerPx,
      };
    },
    resize() {
      fit();
      camX = cameraFor(charX);
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      for (const done of waiting.splice(0)) done();
    },
  };
  return view;
}
