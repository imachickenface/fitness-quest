/**
 * Seagulls drawn in code: small pixel birds that flap and glide across a scene's sky by day. Each gull alternates
 * a few seconds of flapping with a glide on still wings, bobs gently, and loops round when it leaves the area.
 * Far gulls are smaller and slower. A tap near one makes it flap hard and climb.
 */
import type { Sky } from '../core/sky.ts';

export type GullArea = { x0: number; x1: number; y0: number; y1: number; count: number };

export type Gull = {
  x: number;
  /** the height it bobs around */
  y: number;
  /** 1 flies right, -1 left */
  dir: 1 | -1;
  /** scene pixels a second */
  speed: number;
  far: boolean;
  /** seconds into the current flap or glide */
  clock: number;
  flapping: boolean;
  /** seconds the current flap or glide lasts */
  spell: number;
  /** extra climb after a tap, scene pixels a second (decays) */
  climb: number;
  seed: number;
};

/** How far past the area's sides a gull flies before it loops round, so it never pops in or out in view. */
export const GULL_MARGIN = 16;
const FLAP_FPS = 7;

/**
 * Frames as rows of pixels, wings drawn as a shallow M: `K` wing tip, `W` white wing and body, `G` grey belly.
 * Symmetric, so a gull flying left uses the same frames.
 */
export const GULL_FRAMES = {
  // 15 x 7: the body stays on rows 4-5 while the wings rise above it and sweep down past it
  near: {
    up: [
      'K.............K',
      '.K...........K.',
      '.WW.........WW.',
      '..WWW.....WWW..',
      '....WWWWWWW....',
      '......GGG......',
      '...............',
    ],
    mid: [
      '...............',
      '...............',
      '...............',
      '...WWW...WWW...',
      '.WW...WWW...WW.',
      'KK....GGG....KK',
      '...............',
    ],
    down: [
      '...............',
      '...............',
      '...............',
      '...............',
      '....WWWWWWW....',
      '..WWW.GGG.WWW..',
      'KK...........KK',
    ],
  },
  // 9 x 5, for gulls further out
  far: {
    up: ['K.......K', '.W.....W.', '..WW.WW..', '....W....', '.........'],
    mid: ['.........', '..WW.WW..', '.W..W..W.', 'K.......K', '.........'],
    down: ['.........', '.........', '...WWW...', '.WW.G.WW.', 'K.......K'],
  },
} as const;

export type GullFrame = keyof (typeof GULL_FRAMES)['near'];

export const GULL_COLOURS: Record<string, string> = {
  K: '#3a3f48',
  W: '#f6f8fb',
  G: '#aab4c0',
};

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

/** The flock for an area: spread across it, about a third of them far away. */
export function makeGulls(area: GullArea, seed = 99): Gull[] {
  const r = rand(seed);
  return Array.from({ length: area.count }, (_, i) => {
    const far = i % 3 === 2;
    return {
      x: area.x0 + r() * (area.x1 - area.x0),
      y: area.y0 + r() * (area.y1 - area.y0),
      dir: r() < 0.5 ? -1 : 1,
      speed: far ? 5 + r() * 3 : 9 + r() * 5,
      far,
      clock: r() * 2,
      flapping: r() < 0.6,
      spell: 1.5 + r() * 2,
      climb: 0,
      seed: r() * 100,
    };
  });
}

/** Move a gull on by `dt` seconds inside its area. */
export function stepGull(g: Gull, dt: number, area: GullArea): void {
  g.clock += dt;
  if (g.clock >= g.spell) {
    g.clock -= g.spell;
    g.flapping = !g.flapping;
    // flaps are short bursts; glides run a little longer
    const r = Math.abs(Math.sin(g.seed * 12.9898 + g.x * 0.01) * 43758.5453) % 1;
    g.spell = g.flapping ? 1.2 + r * 1.8 : 1.8 + r * 2.4;
  }
  // a glide is a touch faster than flapping, as the bird coasts
  g.x += g.dir * g.speed * (g.flapping ? 1 : 1.15) * dt;
  g.y = Math.min(area.y1, Math.max(area.y0, g.y + g.climb * dt));
  g.climb *= Math.exp(-dt * 1.5);
  if (Math.abs(g.climb) < 0.5) g.climb = 0;
  const left = area.x0 - GULL_MARGIN;
  const right = area.x1 + GULL_MARGIN;
  if (g.x > right) g.x = left + (g.x - right);
  if (g.x < left) g.x = right - (left - g.x);
}

/** The frame to draw now: up, mid, down, mid while flapping; level wings while gliding. */
export function gullFrame(g: Gull): GullFrame {
  if (!g.flapping) return 'mid';
  const cycle = ['up', 'mid', 'down', 'mid'] as const;
  return cycle[Math.floor(g.clock * FLAP_FPS) % cycle.length]!;
}

/** Where to draw a gull: its bob around its height (gliders bob less). */
export function gullY(g: Gull, time: number): number {
  return g.y + Math.sin(time * 0.8 + g.seed) * (g.flapping ? 1.5 : 0.8);
}

/** How many of the flock fly now: all by day and in the morning, half at dusk, none at night or in rain. */
export function gullsFlying(sky: Sky, rain: boolean, count: number): number {
  if (rain || sky === 'night') return 0;
  if (sky === 'dusk') return Math.ceil(count / 2);
  return count;
}

/** A tap near a gull (within `reach` scene pixels) startles it: it flaps and climbs. Returns whether any did. */
export function startleGulls(
  gulls: Gull[],
  x: number,
  y: number,
  flying: number,
  reach = 24,
): boolean {
  let any = false;
  for (const g of gulls.slice(0, flying)) {
    if (Math.hypot(g.x - x, g.y - y) > reach) continue;
    g.flapping = true;
    g.clock = 0;
    g.spell = 2;
    g.climb = -18;
    any = true;
  }
  return any;
}
