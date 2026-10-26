/**
 * The hero, drawn in code from pixel layers on a 32x32 grid. Muscle and build reshape the body; the avatar
 * picks colours, hair and an accessory. Fills are painted first, then a 1 px outline is added around them.
 */

export const SKINS = ['#f6d6b8', '#eab48c', '#c98b5b', '#a3693f', '#7a4a2c', '#553220'] as const;
export const HAIR_COLOURS = [
  '#2b2b38',
  '#6b4226',
  '#e8c35a',
  '#c4512f',
  '#ececf2',
  '#4fa3e0',
] as const;
export const OUTFITS = ['#c0392b', '#2e6fd8', '#3f9e4d', '#8a4fbf', '#f2b632', '#3a3a4c'] as const;
export const HAIR_STYLES = ['short', 'spiky', 'long', 'bun', 'buzz'] as const;
export const ACCESSORIES = ['none', 'headband', 'cape', 'crown'] as const;

export type Avatar = {
  skin: number;
  hair: (typeof HAIR_STYLES)[number];
  hairColour: number;
  outfit: number;
  accessory: (typeof ACCESSORIES)[number];
};

/** muscle 0..4, build -2 (under-eating) .. +2 (over-eating) */
export type Body = { muscle: number; build: number };

export type Grid = (string | null)[][];

export const SIZE = 32;
const OUTLINE = '#1a1c2c';
const PANTS = '#3b3f6b';
const SHOES = '#4a3426';
const EYES = '#1a1c2c';

export function heroGrid(avatar: Avatar, body: Body): Grid {
  const g: Grid = Array.from({ length: SIZE }, () => Array<string | null>(SIZE).fill(null));
  const put = (x: number, y: number, c: string | null) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) g[y]![x] = c;
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };
  /** a row spanning centre +- half (pixels 16-half .. 15+half) */
  const row = (y: number, half: number, c: string) => rect(16 - half, y, half * 2, 1, c);

  const m = clamp(Math.round(body.muscle), 0, 4);
  const b = clamp(Math.round(body.build), -2, 2);

  const tired = b < 0 ? (b === -1 ? 0.22 : 0.4) : 0;
  const skin = mix(SKINS[avatar.skin] ?? SKINS[0], '#9aa3ad', tired);
  const skinShade = darken(skin, 0.18);
  const outfit = OUTFITS[avatar.outfit] ?? OUTFITS[0];
  const outfitShade = darken(outfit, 0.25);
  const hair = HAIR_COLOURS[avatar.hairColour] ?? HAIR_COLOURS[0];
  const hairShade = darken(hair, 0.25);

  const headTop = b <= -2 ? 5 : 4; // a slump when badly under-fuelled
  const torsoTop = 15;
  // muscle widens shoulders and arms and tapers the waist; build adds or takes away everywhere
  const shoulder = [5, 5, 6, 7, 8][m]! + (b === 2 ? 1 : 0) - (b === -1 ? 1 : b === -2 ? 2 : 0);
  const waist = [5, 5, 5, 4, 4][m]! + (b === 1 ? 1 : b === 2 ? 2 : 0) - (b <= -1 ? 1 : 0);
  const belly = b === 2 ? [0, 1, 2, 3, 3, 3, 2, 1, 0] : b === 1 ? [0, 0, 1, 1, 2, 2, 1, 1, 0] : [];
  const arm = b === -2 ? 1 : b === -1 ? 2 : [2, 3, 3, 4, 5][m]! + (b === 2 ? 1 : 0);
  const leg =
    b === -2 ? 2 : [3, 3, 4, 4, 5][m]! + (b === 1 ? 1 : b === 2 ? 2 : 0) - (b === -1 ? 1 : 0);
  const neck = b === 2 ? 8 : m >= 3 ? 6 : b <= -1 ? 2 : 4;

  // cape goes behind everything
  if (avatar.accessory === 'cape') {
    const cape = mix(outfit, '#1a1c2c', 0.35);
    for (let y = torsoTop; y <= 28; y++)
      row(y, shoulder + 1 + Math.floor((y - torsoTop) / 5), cape);
  }

  // legs and shoes
  const gap = 1;
  rect(16 - gap - leg, 24, leg, 6, PANTS);
  rect(16 + gap, 24, leg, 6, PANTS);
  rect(16 - gap - leg - 1, 30, leg + 1, 1, SHOES);
  rect(16 + gap, 30, leg + 1, 1, SHOES);
  for (let y = 24; y < 30; y++) put(16 + gap + leg - 1, y, darken(PANTS, 0.2));

  // torso: a tank top in the outfit colour, tapering from shoulders to waist, with a belly when overfed
  const halves: number[] = [];
  for (let r = 0; r < 9; r++) {
    const half = Math.round(shoulder + ((waist - shoulder) * r) / 8) + (belly[r] ?? 0);
    halves.push(half);
    row(torsoTop + r, half, outfit);
    put(15 + half, torsoTop + r, outfitShade);
  }
  rect(16 - halves[8]! - 0, 23, halves[8]! * 2, 1, darken(outfit, 0.35)); // belt line
  if (m >= 3 && b < 2) {
    rect(16 - shoulder + 2, torsoTop + 3, shoulder * 2 - 4, 1, outfitShade); // chest line
    put(15, torsoTop + 1, outfitShade);
    put(16, torsoTop + 1, outfitShade);
    put(15, torsoTop + 2, outfitShade);
    put(16, torsoTop + 2, outfitShade);
  }
  if (m >= 4 && b < 1)
    for (const [x, y] of [
      [14, 19],
      [17, 19],
      [14, 21],
      [17, 21],
    ] as const)
      put(x, y, outfitShade); // abs
  // straps show the shoulders as skin
  put(16 - shoulder, torsoTop, skin);
  put(15 + shoulder, torsoTop, skin);

  // arms: skin, hanging just outside the shoulders, hands at the bottom
  for (const side of [-1, 1] as const) {
    const x0 = side < 0 ? 16 - shoulder - arm : 16 + shoulder;
    rect(x0, torsoTop, arm, 8, skin);
    for (let y = torsoTop; y < torsoTop + 8; y++) put(side < 0 ? x0 : x0 + arm - 1, y, skinShade);
    if (m >= 2 && arm >= 3) {
      const hx = side < 0 ? x0 + 1 : x0 + arm - 2;
      put(hx, torsoTop + 2, mix(skin, '#ffffff', 0.3)); // bicep
      if (m >= 4) put(hx, torsoTop + 3, mix(skin, '#ffffff', 0.3));
      rect(side < 0 ? x0 : x0 + 1, torsoTop + 4, arm - 1, 1, skinShade); // elbow crease
    }
  }

  // an overfed belly sits in front of the arms
  if (belly.length > 0) {
    halves.forEach((half, r) => {
      if ((belly[r] ?? 0) === 0) return;
      row(torsoTop + r, half, outfit);
      put(15 + half, torsoTop + r, outfitShade);
      put(16 - half, torsoTop + r, outfitShade);
    });
    rect(14, torsoTop + 4, 3, b === 2 ? 3 : 2, mix(outfit, '#ffffff', 0.22)); // belly shine
    put(16, torsoTop + 6, outfitShade); // navel crease
  }

  // neck and head
  rect(16 - neck / 2, headTop + 10, neck, torsoTop - headTop - 10, skinShade);
  if (m >= 3 && b >= 0) {
    // traps sloping from the neck to the shoulders
    rect(16 - neck / 2 - 2, torsoTop - 1, neck + 4, 1, skin);
  }
  rect(11, headTop, 10, 10, skin);
  put(11, headTop, null); // rounded corners
  put(20, headTop, null);
  for (let y = headTop + 1; y < headTop + 10; y++) put(20, y, skinShade);
  // face
  put(13, headTop + 5, EYES);
  put(18, headTop + 5, EYES);
  if (b < 0) {
    put(13, headTop + 6, skinShade); // tired eyes
    put(18, headTop + 6, skinShade);
    rect(15, headTop + 8, 2, 1, skinShade); // flat mouth
  } else {
    put(14, headTop + 7, darken(skin, 0.35));
    rect(15, headTop + 8, 2, 1, darken(skin, 0.35));
    put(17, headTop + 7, darken(skin, 0.35));
  }
  if (b === 2) {
    // round cheeks spilling past the head and a double chin
    rect(10, headTop + 5, 1, 4, skin);
    rect(21, headTop + 5, 1, 4, skinShade);
    rect(13, headTop + 10, 6, 1, skin);
  }
  if (b === 2) {
    put(12, headTop + 7, mix(skin, '#e06060', 0.35)); // rosy cheeks
    put(19, headTop + 7, mix(skin, '#e06060', 0.35));
  }

  drawHair(avatar.hair, headTop, hair, hairShade, rect, put);

  if (avatar.accessory === 'headband') {
    rect(11, headTop + 2, 10, 1, outfit);
    put(21, headTop + 3, outfit);
  }
  if (avatar.accessory === 'crown') {
    const gold = '#f2b632';
    rect(12, headTop - 1, 8, 2, gold);
    for (const x of [12, 15, 16, 19]) put(x, headTop - 2, gold);
    put(15, headTop - 1, '#e04848');
  }

  return outline(g);
}

function drawHair(
  style: Avatar['hair'],
  top: number,
  c: string,
  shade: string,
  rect: (x: number, y: number, w: number, h: number, c: string) => void,
  put: (x: number, y: number, c: string) => void,
) {
  switch (style) {
    case 'buzz':
      rect(11, top, 10, 2, c);
      break;
    case 'short':
      rect(11, top - 1, 10, 3, c);
      rect(11, top + 2, 1, 3, c);
      rect(20, top + 2, 1, 3, shade);
      rect(16, top + 2, 4, 1, c);
      break;
    case 'spiky':
      rect(11, top - 1, 10, 3, c);
      for (const x of [11, 14, 17, 20]) put(x, top - 2, c);
      for (const x of [12, 15, 18]) put(x, top - 3, c);
      rect(11, top + 2, 1, 2, c);
      rect(20, top + 2, 1, 2, shade);
      break;
    case 'long':
      rect(11, top - 1, 10, 3, c);
      rect(10, top + 1, 2, 11, c);
      rect(20, top + 1, 2, 11, shade);
      break;
    case 'bun':
      rect(11, top - 1, 10, 3, c);
      rect(14, top - 4, 4, 3, c);
      put(17, top - 4, shade);
      rect(11, top + 2, 1, 2, c);
      break;
  }
}

/** Add a 1 px outline around every filled pixel (4-neighbourhood). */
function outline(g: Grid): Grid {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (g[y]![x]) continue;
      const near = g[y - 1]?.[x] || g[y + 1]?.[x] || g[y]![x - 1] || g[y]![x + 1];
      if (near) out[y]![x] = OUTLINE;
    }
  return out;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  x: number,
  y: number,
  scale: number,
) {
  for (let j = 0; j < grid.length; j++)
    for (let i = 0; i < grid[j]!.length; i++) {
      const c = grid[j]![i];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
    }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function darken(c: string, t: number): string {
  return mix(c, '#000000', t);
}
