/**
 * The quest map's layout: an endless winding path of stops (one per completed quest) with scenery either side.
 * Pure and deterministic from the stop number, so the world never needs storing and always looks the same.
 * Units are three.js world units; the path runs away from the camera along -z.
 */

export const STEP = 2.2; // distance between stops along the path
export const CASTLE_EVERY = 10;

export type Point = { x: number; z: number };
export type Decor = {
  kind: 'tree' | 'pine' | 'rock' | 'flowers' | 'bush';
  x: number;
  z: number;
  scale: number;
  turn: number;
};

/** Where stop `i` sits. The path sways left and right with two overlapping waves so it never looks periodic. */
export function stopAt(i: number): Point {
  return { x: Math.sin(i * 0.8) * 1.4 + Math.sin(i * 0.31) * 0.9, z: -i * STEP };
}

/** A point part-way between stop i and i + 1 (t in 0..1), on a smooth curve through the stops. */
export function along(i: number, t: number): Point {
  const p0 = stopAt(i - 1);
  const p1 = stopAt(i);
  const p2 = stopAt(i + 1);
  const p3 = stopAt(i + 2);
  const t2 = t * t;
  const t3 = t2 * t;
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) };
}

/** Small deterministic random numbers in [0, 1) for a given seed. */
export function rand(seed: number): () => number {
  let s = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from a point to the path near stop i (checked against samples between i - 1 and i + 1). */
export function distanceToPath(p: Point, i: number): number {
  let best = Infinity;
  for (let k = i - 1; k <= i + 1; k++) {
    for (let s = 0; s <= 8; s++) {
      const q = along(k, s / 8);
      best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  return best;
}

const KINDS: Decor['kind'][] = [
  'tree',
  'tree',
  'pine',
  'pine',
  'rock',
  'bush',
  'flowers',
  'flowers',
];

/** Scenery for the stretch of land around stop i: 6-9 pieces either side, never on the path. */
export function decorFor(i: number): Decor[] {
  const r = rand(i + 1);
  const out: Decor[] = [];
  const centre = stopAt(i);
  const count = 6 + Math.floor(r() * 4);
  for (let n = 0; n < count * 3 && out.length < count; n++) {
    const side = r() < 0.5 ? -1 : 1;
    const p = { x: centre.x + side * (1.6 + r() * 5), z: centre.z + (r() - 0.5) * STEP };
    const kind = KINDS[Math.floor(r() * KINDS.length)]!;
    const scale = 0.7 + r() * 0.6;
    const turn = r() * Math.PI * 2;
    if (distanceToPath(p, i) < 1.2) continue; // keep the path clear
    out.push({ kind, x: p.x, z: p.z, scale, turn });
  }
  return out;
}
