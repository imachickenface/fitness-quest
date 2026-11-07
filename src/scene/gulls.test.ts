import { describe, expect, it } from 'vitest';
import {
  GULL_FRAMES,
  GULL_MARGIN,
  gullFrame,
  gullsFlying,
  makeGulls,
  startleGulls,
  stepGull,
} from './gulls.ts';

const area = { x0: 0, x1: 750, y0: 20, y1: 80, count: 7 };

describe('gull frames', () => {
  it('are rectangles, the same size within a size, and mirror-symmetric (so left-flying gulls look right)', () => {
    for (const size of Object.values(GULL_FRAMES)) {
      const frames = Object.values(size);
      const w = frames[0]![0]!.length;
      const h = frames[0]!.length;
      for (const f of frames) {
        expect(f).toHaveLength(h);
        for (const row of f) {
          expect(row).toHaveLength(w);
          expect(row).toBe([...row].reverse().join(''));
        }
      }
    }
  });
});

describe('the flock', () => {
  it('starts inside its area, about a third far away', () => {
    const gulls = makeGulls(area);
    expect(gulls).toHaveLength(7);
    expect(gulls.filter((g) => g.far)).toHaveLength(2);
    for (const g of gulls) {
      expect(g.x).toBeGreaterThanOrEqual(area.x0);
      expect(g.x).toBeLessThanOrEqual(area.x1);
      expect(g.y).toBeGreaterThanOrEqual(area.y0);
      expect(g.y).toBeLessThanOrEqual(area.y1);
    }
  });

  it('stays within the area and its margins over a long flight, and alternates flapping and gliding', () => {
    const gulls = makeGulls(area, 7);
    const seen = gulls.map(() => new Set<boolean>());
    for (let i = 0; i < 30 * 120; i++) {
      gulls.forEach((g, k) => {
        stepGull(g, 1 / 30, area);
        seen[k]!.add(g.flapping);
        expect(g.x).toBeGreaterThanOrEqual(area.x0 - GULL_MARGIN);
        expect(g.x).toBeLessThanOrEqual(area.x1 + GULL_MARGIN);
        expect(g.y).toBeGreaterThanOrEqual(area.y0);
        expect(g.y).toBeLessThanOrEqual(area.y1);
      });
    }
    for (const s of seen) expect(s.size).toBe(2);
  });

  it('flaps through up, mid, down while flapping, and holds its wings level in a glide', () => {
    const [g] = makeGulls({ ...area, count: 1 });
    g!.flapping = true;
    g!.spell = 10;
    const frames = new Set<string>();
    for (let i = 0; i < 30; i++) {
      g!.clock = i / 30;
      frames.add(gullFrame(g!));
    }
    expect([...frames].sort()).toEqual(['down', 'mid', 'up']);
    g!.flapping = false;
    expect(gullFrame(g!)).toBe('mid');
  });
});

describe('when gulls fly', () => {
  it('flies all of them by day and in the morning, half at dusk, none at night or in rain', () => {
    expect(gullsFlying('day', false, 7)).toBe(7);
    expect(gullsFlying('morning', false, 7)).toBe(7);
    expect(gullsFlying('dusk', false, 7)).toBe(4);
    expect(gullsFlying('night', false, 7)).toBe(0);
    expect(gullsFlying('day', true, 7)).toBe(0);
  });
});

describe('a tap', () => {
  it('startles only a flying gull near it, which flaps and climbs', () => {
    const gulls = makeGulls({ ...area, count: 2 });
    gulls[0]!.x = 100;
    gulls[0]!.y = 50;
    gulls[1]!.x = 400;
    gulls[1]!.y = 50;
    gulls[0]!.flapping = false;
    expect(startleGulls(gulls, 105, 52, 2)).toBe(true);
    expect(gulls[0]!.flapping).toBe(true);
    expect(gulls[0]!.climb).toBeLessThan(0);
    expect(gulls[1]!.climb).toBe(0);
    // a gull that isn't flying now (the second, with only one flying) isn't startled
    expect(startleGulls(gulls, 400, 50, 1)).toBe(false);
  });

  it('a startled gull climbs, then settles back to level flight', () => {
    const [g] = makeGulls({ ...area, count: 1 });
    g!.y = 70;
    startleGulls([g!], g!.x, g!.y, 1);
    for (let i = 0; i < 30; i++) stepGull(g!, 1 / 30, area);
    expect(g!.y).toBeLessThan(70);
    for (let i = 0; i < 30 * 5; i++) stepGull(g!, 1 / 30, area);
    expect(g!.climb).toBe(0);
  });
});
