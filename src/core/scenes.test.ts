import { describe, expect, it } from 'vitest';
import {
  placeForLevel,
  reachedStops,
  sceneToShow,
  unlockedScenes,
  type SceneSpan,
} from './scenes.ts';

// the forest station (5 levels, 5 stops), a 10-level scene with 5 stops, and an 8-level scene with 3 stops
const world: SceneSpan[] = [
  { id: 'station', levels: 5, stops: 5 },
  { id: 'harbour', levels: 10, stops: 5 },
  { id: 'peak', levels: 8, stops: 3 },
];

describe('placeForLevel', () => {
  it('starts at the first stop of the first scene on level 1', () => {
    expect(placeForLevel(world, 1)).toEqual({ scene: 0, id: 'station', stop: 0 });
  });

  it('moves one stop per level when a scene has as many stops as levels', () => {
    expect([1, 2, 3, 4, 5].map((l) => placeForLevel(world, l).stop)).toEqual([0, 1, 2, 3, 4]);
    expect(placeForLevel(world, 5).id).toBe('station');
  });

  it('starts the next scene on the level after the last one ends', () => {
    expect(placeForLevel(world, 6)).toEqual({ scene: 1, id: 'harbour', stop: 0 });
    expect(placeForLevel(world, 15)).toEqual({ scene: 1, id: 'harbour', stop: 4 });
    expect(placeForLevel(world, 16)).toEqual({ scene: 2, id: 'peak', stop: 0 });
  });

  it('spreads more levels than stops evenly: floor(levelInScene * stops / levels)', () => {
    // harbour: levels 6..15, 10 levels over 5 stops -> two levels per stop
    expect([6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((l) => placeForLevel(world, l).stop)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    // peak: levels 16..23, 8 levels over 3 stops
    expect([16, 17, 18, 19, 20, 21, 22, 23].map((l) => placeForLevel(world, l).stop)).toEqual([
      0, 0, 0, 1, 1, 1, 2, 2,
    ]);
  });

  it('stays at the last stop of the last scene past the end of the world', () => {
    expect(placeForLevel(world, 23)).toEqual({ scene: 2, id: 'peak', stop: 2 });
    expect(placeForLevel(world, 24)).toEqual({ scene: 2, id: 'peak', stop: 2 });
    expect(placeForLevel(world, 500)).toEqual({ scene: 2, id: 'peak', stop: 2 });
  });

  it('treats levels below 1 as level 1 and drops fractions', () => {
    expect(placeForLevel(world, 0)).toEqual({ scene: 0, id: 'station', stop: 0 });
    expect(placeForLevel(world, -3)).toEqual({ scene: 0, id: 'station', stop: 0 });
    expect(placeForLevel(world, 6.9)).toEqual({ scene: 1, id: 'harbour', stop: 0 });
  });

  it('works with a single scene', () => {
    const one: SceneSpan[] = [{ id: 'only', levels: 3, stops: 3 }];
    expect(placeForLevel(one, 2)).toEqual({ scene: 0, id: 'only', stop: 1 });
    expect(placeForLevel(one, 9)).toEqual({ scene: 0, id: 'only', stop: 2 });
  });

  it('rejects an empty world and bad spans', () => {
    expect(() => placeForLevel([], 1)).toThrow(RangeError);
    expect(() => placeForLevel([{ id: 'a', levels: 0, stops: 1 }], 1)).toThrow(RangeError);
    expect(() => placeForLevel([{ id: 'a', levels: 2, stops: 0 }], 1)).toThrow(RangeError);
    expect(() => placeForLevel([{ id: 'a', levels: 2.5, stops: 2 }], 1)).toThrow(RangeError);
  });

  it('does not change its input', () => {
    const copy = structuredClone(world);
    placeForLevel(world, 12);
    expect(world).toEqual(copy);
  });
});

describe('unlockedScenes', () => {
  it('has only the first scene at level 1', () => {
    expect(unlockedScenes(world, 1)).toEqual(['station']);
  });

  it('adds a scene on the level it starts, in world order', () => {
    expect(unlockedScenes(world, 5)).toEqual(['station']);
    expect(unlockedScenes(world, 6)).toEqual(['station', 'harbour']);
    expect(unlockedScenes(world, 15)).toEqual(['station', 'harbour']);
    expect(unlockedScenes(world, 16)).toEqual(['station', 'harbour', 'peak']);
    expect(unlockedScenes(world, 99)).toEqual(['station', 'harbour', 'peak']);
  });

  it('treats levels below 1 as level 1', () => {
    expect(unlockedScenes(world, 0)).toEqual(['station']);
  });
});

describe('sceneToShow', () => {
  it('shows the current place when nothing is picked', () => {
    expect(sceneToShow(world, 12, null)).toEqual(placeForLevel(world, 12));
    expect(sceneToShow(world, 12, undefined)).toEqual(placeForLevel(world, 12));
  });

  it('shows an earlier scene the user picked, at its last stop (it was finished)', () => {
    expect(sceneToShow(world, 12, 'station')).toEqual({ scene: 0, id: 'station', stop: 4 });
    expect(sceneToShow(world, 20, 'harbour')).toEqual({ scene: 1, id: 'harbour', stop: 4 });
  });

  it('shows the current place when the picked scene is the current one', () => {
    expect(sceneToShow(world, 12, 'harbour')).toEqual({ scene: 1, id: 'harbour', stop: 3 });
  });

  it('ignores a pick of a scene that is still locked or does not exist', () => {
    expect(sceneToShow(world, 12, 'peak')).toEqual(placeForLevel(world, 12));
    expect(sceneToShow(world, 12, 'moon')).toEqual(placeForLevel(world, 12));
  });

  it('past the end of the world, the last scene picked shows its last stop', () => {
    expect(sceneToShow(world, 40, 'peak')).toEqual({ scene: 2, id: 'peak', stop: 2 });
    expect(sceneToShow(world, 40, 'station')).toEqual({ scene: 0, id: 'station', stop: 4 });
  });
});

describe('sceneToShow with a picked stop', () => {
  it('shows any stop of a finished scene', () => {
    expect(sceneToShow(world, 12, 'station', 1)).toEqual({ scene: 0, id: 'station', stop: 1 });
    expect(sceneToShow(world, 12, 'station', 0)).toEqual({ scene: 0, id: 'station', stop: 0 });
  });

  it('shows a stop already reached in the current scene', () => {
    // level 12: harbour stop 3
    expect(sceneToShow(world, 12, 'harbour', 1)).toEqual({ scene: 1, id: 'harbour', stop: 1 });
    expect(sceneToShow(world, 12, 'harbour', 3)).toEqual({ scene: 1, id: 'harbour', stop: 3 });
  });

  it('never shows a stop not reached yet: it stops at the furthest one', () => {
    expect(sceneToShow(world, 12, 'harbour', 4)).toEqual({ scene: 1, id: 'harbour', stop: 3 });
    expect(sceneToShow(world, 12, 'station', 9)).toEqual({ scene: 0, id: 'station', stop: 4 });
  });

  it('treats a broken stop as no stop', () => {
    expect(sceneToShow(world, 12, 'station', -1)).toEqual({ scene: 0, id: 'station', stop: 4 });
    expect(sceneToShow(world, 12, 'station', 1.5)).toEqual({ scene: 0, id: 'station', stop: 4 });
    expect(sceneToShow(world, 12, 'station', Number.NaN)).toEqual({
      scene: 0,
      id: 'station',
      stop: 4,
    });
  });

  it('ignores the stop of a locked or unknown scene', () => {
    expect(sceneToShow(world, 12, 'peak', 0)).toEqual(placeForLevel(world, 12));
    expect(sceneToShow(world, 12, 'moon', 0)).toEqual(placeForLevel(world, 12));
  });

  it('past the end of the world, any stop of any scene', () => {
    expect(sceneToShow(world, 40, 'peak', 0)).toEqual({ scene: 2, id: 'peak', stop: 0 });
  });
});

describe('reachedStops', () => {
  it('counts every stop of a finished scene and the reached ones of the current scene', () => {
    expect(reachedStops(world, 12, 'station')).toBe(5);
    expect(reachedStops(world, 12, 'harbour')).toBe(4); // stops 0-3
    expect(reachedStops(world, 1, 'station')).toBe(1);
  });

  it('is 0 for a locked or unknown scene, and every stop past the end of the world', () => {
    expect(reachedStops(world, 12, 'peak')).toBe(0);
    expect(reachedStops(world, 12, 'moon')).toBe(0);
    expect(reachedStops(world, 40, 'peak')).toBe(3);
  });
});
