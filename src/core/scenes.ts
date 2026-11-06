/**
 * Pure scene maths: where the character stands for a given level, which scenes are unlocked, and which
 * scene the UI should show when the player picks one.
 *
 * The world is an ordered list of scenes; each scene lasts `levels` levels and has `stops` places. Level 1 is
 * the first stop of the first scene, and the next scene starts on the level after the previous one ends.
 * Nothing is stored: everything is recomputed from the scene list and the level, the inputs are only ever read.
 */

/** A scene in world order, as far as the level maths needs it. */
export type SceneSpan = { id: string; levels: number; stops: number };

/** Where the character is: index of the scene in the list, its id, and the 0-based stop in it. */
export type ScenePlace = { scene: number; id: string; stop: number };

/** Check the world is usable: at least one scene, and whole positive levels and stops in every scene. */
function checkScenes(scenes: readonly SceneSpan[]): void {
  if (scenes.length === 0) throw new RangeError('scenes: the world needs at least one scene');
  for (const scene of scenes) {
    if (!Number.isInteger(scene.levels) || scene.levels < 1) {
      throw new RangeError(`scenes: scene ${scene.id} needs an integer levels >= 1`);
    }
    if (!Number.isInteger(scene.stops) || scene.stops < 1) {
      throw new RangeError(`scenes: scene ${scene.id} needs an integer stops >= 1`);
    }
  }
}

/** The level to work with: fractions are dropped, anything below 1 counts as level 1. */
function normaliseLevel(level: number): number {
  const floored = Math.floor(level);
  return Number.isFinite(floored) && floored > 1 ? floored : 1;
}

/** The first level after the whole world ends, i.e. one past the last level of the last scene. */
function worldEndLevel(scenes: readonly SceneSpan[]): number {
  let end = 1;
  for (const scene of scenes) end += scene.levels;
  return end;
}

/** Where a level lands: the scene containing it and the stop inside that scene. */
export function placeForLevel(scenes: readonly SceneSpan[], level: number): ScenePlace {
  checkScenes(scenes);
  const safe = normaliseLevel(level);

  let start = 1;
  let last: ScenePlace | null = null;
  for (const [index, scene] of scenes.entries()) {
    last = { scene: index, id: scene.id, stop: scene.stops - 1 };
    if (safe < start + scene.levels) {
      // Inside this scene: spread its levels evenly over its stops (10 levels over 5 stops: two levels a stop).
      const into = safe - start;
      return { scene: index, id: scene.id, stop: Math.floor((into * scene.stops) / scene.levels) };
    }
    start += scene.levels;
  }

  // Past the end of the world: the character waits at the last stop of the last scene.
  return last ?? { scene: 0, id: '', stop: 0 };
}

/** Ids of the scenes the player has reached: every scene that starts on or before this level, in world order. */
export function unlockedScenes(scenes: readonly SceneSpan[], level: number): string[] {
  checkScenes(scenes);
  const safe = normaliseLevel(level);

  const ids: string[] = [];
  let start = 1;
  for (const scene of scenes) {
    if (start > safe) break;
    ids.push(scene.id);
    start += scene.levels;
  }
  return ids;
}

/**
 * Which scene to show for a level, honouring an optional user pick.
 *
 * A pick of an unlocked scene that sits before the current one shows that scene at its last stop (the player
 * has finished it). Past the end of the world every scene is finished, so any pick shows its last stop. Every
 * other pick - none, an unknown id, a locked scene, or the current scene - just shows the current place.
 */
export function sceneToShow(
  scenes: readonly SceneSpan[],
  level: number,
  picked: string | null | undefined,
): ScenePlace {
  const current = placeForLevel(scenes, level);
  if (picked === null || picked === undefined) return current;

  const safe = normaliseLevel(level);
  const pastEnd = safe >= worldEndLevel(scenes);

  let start = 1;
  for (const [index, scene] of scenes.entries()) {
    if (scene.id === picked) {
      const unlocked = start <= safe;
      if (index < current.scene || (pastEnd && unlocked)) {
        return { scene: index, id: scene.id, stop: scene.stops - 1 };
      }
      return current;
    }
    start += scene.levels;
  }
  return current;
}
