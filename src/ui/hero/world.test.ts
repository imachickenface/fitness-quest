import { describe, expect, it } from 'vitest';
import { along, decorFor, distanceToPath, rand, STEP, stopAt, themeFor } from './world.ts';

describe('the quest path', () => {
  it('runs away from the camera one step per stop, swaying within the land', () => {
    for (let i = 0; i < 200; i++) {
      const p = stopAt(i);
      expect(p.z).toBeCloseTo(-i * STEP);
      expect(Math.abs(p.x)).toBeLessThan(2.4);
    }
  });

  it('the curve between stops starts and ends on them', () => {
    for (const i of [0, 7, 42]) {
      expect(along(i, 0).x).toBeCloseTo(stopAt(i).x);
      expect(along(i, 1).z).toBeCloseTo(stopAt(i + 1).z);
    }
  });
});

describe('scenery', () => {
  it('is the same every time for the same stop', () => {
    expect(decorFor(12)).toEqual(decorFor(12));
    expect(decorFor(12)).not.toEqual(decorFor(13));
  });

  it('never sits on the path', () => {
    for (let i = 0; i < 100; i++) {
      for (const d of decorFor(i)) expect(distanceToPath(d, i)).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('has a few pieces per stop', () => {
    for (let i = 0; i < 50; i++) {
      const n = decorFor(i).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});

describe('rand', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = rand(5);
    const b = rand(5);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('themeFor', () => {
  it('picks the world from the goal', () => {
    expect(themeFor('build_muscle').id).toBe('fortress');
    expect(themeFor('gain_weight').id).toBe('fortress');
    expect(themeFor('marathon').id).toBe('track');
    expect(themeFor('five_k').id).toBe('track');
    expect(themeFor('lose_weight').id).toBe('trail');
    expect(themeFor('maintain').id).toBe('trail');
  });
  it("scenery uses the theme's own pieces", () => {
    const kinds = themeFor('build_muscle').decor;
    for (let i = 0; i < 20; i++)
      for (const d of decorFor(i, kinds)) expect(kinds).toContain(d.kind);
  });
});
