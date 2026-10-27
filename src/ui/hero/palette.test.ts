import { describe, expect, it } from 'vitest';
import { CELL_COLOURS, cellOf, choicesFor, remapUVs, usedCells } from './palette.ts';

describe('palette cells', () => {
  it('has 64 cells of colour', () => {
    expect(CELL_COLOURS).toHaveLength(64);
    for (const c of CELL_COLOURS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('finds the cell of a UV', () => {
    expect(cellOf(0.01, 0.01)).toBe(0);
    expect(cellOf(15.5 / 16, 0.01)).toBe(15);
    expect(cellOf(2.5 / 16, 2.5 / 4)).toBe(2 * 16 + 2);
    expect(cellOf(1, 1)).toBe(63); // edges clamp
  });

  it('lists used cells, most used first', () => {
    const uv = [2.5 / 16, 2.5 / 4, 2.5 / 16, 2.6 / 4, 0.5 / 16, 3.5 / 4];
    expect(usedCells([uv])).toEqual([34, 48]);
  });

  it('moves remapped vertices to the same spot in the new cell and leaves the rest', () => {
    const original = [2.25 / 16, 2.75 / 4, 0.5 / 16, 3.5 / 4];
    const target: number[] = [0, 0, 0, 0];
    remapUVs(original, target, { 34: 3 * 16 + 5 });
    expect(target[0]).toBeCloseTo(5.25 / 16);
    expect(target[1]).toBeCloseTo(3.75 / 4);
    expect(target.slice(2)).toEqual([0.5 / 16, 3.5 / 4]);
  });

  it('offers same-kind swatches from the clothing rows', () => {
    const flat = choicesFor(34);
    expect(flat).toHaveLength(16);
    expect(flat.every((c) => c % 2 === 0 && c >= 32)).toBe(true);
    expect(choicesFor(35).every((c) => c % 2 === 1)).toBe(true);
  });
});
