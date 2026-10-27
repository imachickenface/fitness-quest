/**
 * Recolouring a Kenney character. All 12 share one 512 px palette texture: 16 x 4 cells (32 x 128 px), each a
 * flat colour or a soft gradient. A face's colour is the cell its UVs fall in, so recolouring moves UVs from one
 * cell to another: Kenney's own shading comes along. glTF UVs run from the top-left, as the texture is stored.
 */
import SWATCHES from './palette.json';

export const COLS = 16;
export const ROWS = 4;

/** The middle colour of each cell, row by row (from art/kenney's colormap.png). */
export const CELL_COLOURS: string[] = SWATCHES;

export function cellOf(u: number, v: number): number {
  const col = Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS)));
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS)));
  return row * COLS + col;
}

/** Cells used by a set of UV arrays, most used first (by vertex count). */
export function usedCells(uvArrays: ArrayLike<number>[]): number[] {
  const count = new Map<number, number>();
  for (const uv of uvArrays) {
    for (let i = 0; i + 1 < uv.length; i += 2) {
      const c = cellOf(uv[i]!, uv[i + 1]!);
      count.set(c, (count.get(c) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c);
}

/** Copy `original` UVs into `target`, moving every vertex whose cell is remapped to the same spot in the new cell. */
export function remapUVs(
  original: ArrayLike<number>,
  target: { [i: number]: number },
  map: Record<number, number>,
) {
  for (let i = 0; i + 1 < original.length; i += 2) {
    const u = original[i]!;
    const v = original[i + 1]!;
    const from = cellOf(u, v);
    const to = map[from];
    if (to === undefined || to === from) {
      target[i] = u;
      target[i + 1] = v;
      continue;
    }
    target[i] = u + ((to % COLS) - (from % COLS)) / COLS;
    target[i + 1] = v + (Math.floor(to / COLS) - Math.floor(from / COLS)) / ROWS;
  }
}

/**
 * Colours a cell can be swapped for: cells in the two bottom rows (the clothing, skin and hair colours) of the
 * same kind, flat or gradient (even or odd column), so the shading style stays the same.
 */
export function choicesFor(cell: number): number[] {
  const parity = cell % 2;
  const out: number[] = [];
  for (let c = 2 * COLS; c < ROWS * COLS; c++) if (c % 2 === parity) out.push(c);
  return out;
}
