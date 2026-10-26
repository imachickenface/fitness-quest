/**
 * The overworld: a 10 x 14 grid of 16 px tiles drawn in code, a path of quest nodes from the bottom to the
 * castle at the top. One completed quest moves the hero one node along.
 */
import { drawGrid, mix, type Grid } from './sprite.ts';

export const TILE = 16;

// T tree, . grass, f flowers, r rock, ~ water, = path, C castle
export const MAP = [
  'TTT.CC.TTT',
  'TT..CC..TT',
  'T...==...T',
  'T.f.=..r.T',
  '~~..====.T',
  '~~~....=.T',
  '~~..f..=.T',
  'T..=====.T',
  'T..=...f.T',
  'T.r=....TT',
  'TT.=====.T',
  'T......=.T',
  'TT.f...=TT',
  'TTT....=TT',
];

/** Quest nodes along the path, start first: [row, col]. */
export const NODES: [number, number][] = [
  [13, 7],
  [10, 5],
  [7, 4],
  [5, 7],
  [4, 5],
  [2, 4],
];

const C = {
  grass: '#5aa83b',
  grassDark: '#4a8f30',
  grassLight: '#7cc451',
  path: '#d9b77a',
  pathDark: '#b8955a',
  water: '#3b7dd8',
  waterLight: '#7fb6f0',
  trunk: '#6b4226',
  leaf: '#2f7a3a',
  leafDark: '#1f5a2a',
  leafLight: '#4fa34a',
  rock: '#8a8fa3',
  rockDark: '#5d6275',
  stone: '#c9c3b5',
  stoneDark: '#8f887a',
  castle: '#a9adbd',
  castleDark: '#6f7386',
  roof: '#c0392b',
  outline: '#1a1c2c',
};

/** Deterministic speckle so the grass looks hand-placed but never changes between frames. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  scale: number,
  heroNode: number,
  hero: Grid,
) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
  };

  MAP.forEach((line, r) =>
    [...line].forEach((t, c) => {
      const x = c * TILE;
      const y = r * TILE;
      // grass under everything
      px(x, y, TILE, TILE, C.grass);
      for (let i = 0; i < 6; i++) {
        const nx = Math.floor(noise(c * 7 + i, r * 3) * 15);
        const ny = Math.floor(noise(r * 5 + i, c * 11) * 15);
        px(x + nx, y + ny, 1, 1, i % 2 ? C.grassDark : C.grassLight);
      }
      if (t === '=' || t === 'C') {
        px(x, y, TILE, TILE, C.path);
        for (let i = 0; i < 4; i++)
          px(
            x + Math.floor(noise(c, r * 9 + i) * 14),
            y + Math.floor(noise(r, c * 5 + i) * 14),
            2,
            1,
            C.pathDark,
          );
      }
      if (t === '~') {
        px(x, y, TILE, TILE, C.water);
        px(x + 3, y + 4 + (c % 2) * 6, 5, 1, C.waterLight);
        px(x + 9, y + 9 - (c % 2) * 4, 4, 1, C.waterLight);
      }
      if (t === 'f') {
        for (const [fx, fy, col] of [
          [4, 5, '#f2b632'],
          [10, 3, '#e8e8f0'],
          [7, 11, '#e06080'],
          [12, 10, '#f2b632'],
        ] as const)
          px(x + fx, y + fy, 2, 2, col);
      }
      if (t === 'r') {
        px(x + 3, y + 6, 10, 7, C.rockDark);
        px(x + 4, y + 5, 8, 6, C.rock);
        px(x + 5, y + 6, 3, 1, mix(C.rock, '#ffffff', 0.4));
      }
      if (t === 'T') {
        px(x + 7, y + 11, 3, 5, C.trunk);
        px(x + 2, y + 2, 12, 10, C.leafDark);
        px(x + 3, y + 1, 10, 10, C.leaf);
        px(x + 5, y + 3, 4, 3, C.leafLight);
      }
    }),
  );

  // the castle on rows 0-1, cols 4-5
  const cx = 4 * TILE;
  px(cx + 2, 6, 28, 26, C.castleDark);
  px(cx + 3, 7, 26, 24, C.castle);
  for (let i = 0; i < 5; i++) px(cx + 3 + i * 6, 3, 4, 4, C.castle);
  px(cx + 12, 20, 8, 11, C.outline); // gate
  px(cx + 13, 21, 6, 10, '#3a2a1e');
  px(cx + 14, -2 + 4, 4, 1, C.roof);
  px(cx + 15, 0, 1, 4, C.outline); // flag pole
  px(cx + 16, 0, 4, 3, C.roof);

  // quest nodes: stepping stones; done ones gold
  NODES.forEach(([r, c], i) => {
    const x = c * TILE + 3;
    const y = r * TILE + 4;
    const done = i < heroNode;
    px(x, y + 1, 10, 7, C.stoneDark);
    px(x + 1, y, 8, 7, done ? '#f2b632' : C.stone);
    px(x + 2, y + 1, 3, 1, '#ffffff');
  });

  // the hero stands on its node, feet on the stone
  const [hr, hc] = NODES[Math.min(heroNode, NODES.length - 1)]!;
  drawGrid(ctx, hero, (hc * TILE - 8) * scale, (hr * TILE - 20) * scale, scale);
}
