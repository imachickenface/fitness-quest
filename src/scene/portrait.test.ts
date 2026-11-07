import { describe, expect, it } from 'vitest';
import { headBox, PORTRAIT_SIZE } from './portrait.ts';

/** A frame from rows of text: '#' is an opaque pixel. */
function frame(rows: string[]) {
  const w = rows[0]!.length;
  return { w, h: rows.length, opaque: (x: number, y: number) => rows[y]![x] === '#' };
}

describe('headBox', () => {
  it('centres a square on the head at the top of the figure', () => {
    // a 12-wide head (columns 10-21) starting on row 2, in a 34 x 45 frame
    const rows = Array.from({ length: 45 }, (_, y) =>
      y >= 2 && y < 14 ? '.'.repeat(10) + '#'.repeat(12) + '.'.repeat(12) : '.'.repeat(34),
    );
    const box = headBox(frame(rows));
    expect(box.size).toBe(PORTRAIT_SIZE);
    // head centre is x = 16; the square starts half its size to the left, and a row above the hair
    expect(box.x).toBe(16 - PORTRAIT_SIZE / 2);
    expect(box.y).toBe(1);
  });

  it('ignores arms and legs further down when finding the head', () => {
    const rows = Array.from({ length: 45 }, (_, y) => {
      if (y < 12) return '.'.repeat(14) + '#'.repeat(6) + '.'.repeat(14); // head, centre 17
      return '#'.repeat(34); // a wide body below
    });
    expect(headBox(frame(rows)).x).toBe(17 - PORTRAIT_SIZE / 2);
  });

  it('stays inside the frame', () => {
    const rows = Array.from({ length: 45 }, (_, y) =>
      y < 10 ? '##' + '.'.repeat(30) : '.'.repeat(32),
    );
    const box = headBox(frame(rows));
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.x + box.size).toBeLessThanOrEqual(32);
  });

  it('falls back to the top centre of an empty frame', () => {
    const rows = Array.from({ length: 45 }, () => '.'.repeat(32));
    expect(headBox(frame(rows))).toEqual({ x: 4, y: 0, size: PORTRAIT_SIZE });
  });
});
