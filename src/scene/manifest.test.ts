import { describe, expect, it } from 'vitest';
import { CharacterList } from './character.ts';
import { SceneManifest, SceneWorld, sceneSpan } from './manifest.ts';
import stationRaw from '../../public/scenes/station/scene.json?raw';
import worldRaw from '../../public/scenes/world.json?raw';
import charactersRaw from '../../public/characters/characters.json?raw';

const manifests = import.meta.glob<string>('../../public/scenes/*/scene.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const station = (): Record<string, unknown> & SceneManifest => JSON.parse(stationRaw);

/** The paths of the issues a manifest fails with, as dotted strings ("stops.2", "taps.0.box"). */
function problems(m: unknown): string[] {
  const r = SceneManifest.safeParse(m);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

describe('the shipped scenes', () => {
  it('the forest station validates', () => {
    expect(problems(station())).toEqual([]);
  });

  it('the world lists each scene once, and every listed scene has a valid manifest with that id', () => {
    const world = SceneWorld.parse(JSON.parse(worldRaw));
    expect(world.scenes.length).toBeGreaterThan(0);
    for (const id of world.scenes) {
      const raw = manifests[`../../public/scenes/${id}/scene.json`];
      expect(raw, `public/scenes/${id}/scene.json`).toBeDefined();
      const m = SceneManifest.parse(JSON.parse(raw!));
      expect(m.id).toBe(id);
    }
  });

  it('every scene folder is in the world list', () => {
    const world = SceneWorld.parse(JSON.parse(worldRaw));
    const folders = Object.keys(manifests).map((p) => p.split('/').at(-2));
    expect([...folders].sort()).toEqual([...world.scenes].sort());
  });

  it('the characters list validates', () => {
    expect(CharacterList.safeParse(JSON.parse(charactersRaw)).success).toBe(true);
  });
});

describe('SceneManifest field rules', () => {
  it('keeps the ground row inside the scene', () => {
    expect(problems({ ...station(), ground: 256 })).toEqual(['ground']);
    expect(problems({ ...station(), ground: -1 })).toEqual(['ground']);
    expect(problems({ ...station(), ground: 255 })).toEqual([]);
  });

  it('wants stops left to right, each inside the scene', () => {
    expect(problems({ ...station(), stops: [70, 215, 215, 455, 640] })).toEqual(['stops.2']);
    expect(problems({ ...station(), stops: [70, 330, 215, 455, 640] })).toEqual(['stops.2']);
    expect(problems({ ...station(), stops: [-1, 215, 330, 455, 640] })).toEqual(['stops.0']);
    expect(problems({ ...station(), stops: [70, 215, 330, 455, 751] })).toEqual(['stops.4']);
    expect(problems({ ...station(), stops: [0, 215, 330, 455, 750] })).toEqual([]);
    expect(problems({ ...station(), stops: [70, 60, 50, 455, 800] })).toEqual([
      'stops.1',
      'stops.2',
      'stops.4',
    ]);
  });

  it('lasts 5 to 10 levels, with no more stops than levels', () => {
    expect(problems({ ...station(), levels: 4, stops: [70, 215, 330, 455] })).toEqual(['levels']);
    expect(problems({ ...station(), levels: 11 })).toEqual(['levels']);
    expect(problems({ ...station(), levels: 10 })).toEqual([]);
    expect(problems({ ...station(), stops: [10, 20, 30, 40, 50, 60] })).toEqual(['stops']);
  });

  it('wants each layer file named once', () => {
    const m = station();
    m.layers = [...m.layers, { src: 'layer-1.webp', depth: 0 }];
    expect(problems(m)).toEqual(['layers.5.src']);
  });

  it('wants bands top above bottom and inside the scene', () => {
    expect(problems({ ...station(), lights: { top: 186, bottom: 110 } })).toEqual(['lights']);
    expect(problems({ ...station(), lights: { top: 110, bottom: 300 } })).toEqual(['lights']);
    expect(problems({ ...station(), puddles: { y0: 220, y1: 196 } })).toEqual(['puddles']);
    expect(problems({ ...station(), puddles: { y0: 196, y1: 257 } })).toEqual(['puddles']);
  });

  it('wants the firefly area the right way round', () => {
    const ff = { x0: 0, x1: 750, y0: 105, y1: 185, count: 36 };
    expect(problems({ ...station(), fireflies: { ...ff, x0: 750, x1: 0 } })).toEqual(['fireflies']);
    expect(problems({ ...station(), fireflies: { ...ff, y0: 185, y1: 105 } })).toEqual([
      'fireflies',
    ]);
  });

  it('keeps tap spots inside the scene, the right way round, with unique ids', () => {
    const tap = { id: 'lamp', label: 'Brighten the lamp', kind: 'lamp' as const };
    expect(problems({ ...station(), taps: [{ ...tap, box: [20, 10, 10, 30] }] })).toEqual([
      'taps.0.box',
    ]);
    expect(problems({ ...station(), taps: [{ ...tap, box: [10, 30, 20, 10] }] })).toEqual([
      'taps.0.box',
    ]);
    expect(problems({ ...station(), taps: [{ ...tap, box: [740, 10, 760, 30] }] })).toEqual([
      'taps.0.box',
    ]);
    expect(
      problems({
        ...station(),
        taps: [
          { ...tap, box: [10, 10, 20, 30] },
          { ...tap, box: [30, 10, 40, 30] },
        ],
      }),
    ).toEqual(['taps.1.id']);
  });

  it('wants a bell to come with its cut-out sprite, and only bells to have one', () => {
    const m = station();
    const bell = m.taps!.find((t) => t.kind === 'bell')!;
    delete bell.sprite;
    expect(problems(m)).toEqual(['taps.0.sprite']);

    const lampWithSprite = station();
    lampWithSprite.taps![1] = {
      ...lampWithSprite.taps![1]!,
      sprite: { src: 'sprite-lamp.webp', x: 30, y: 130 },
    };
    expect(problems(lampWithSprite)).toEqual(['taps.1.sprite']);
  });

  it('reports every broken rule at once', () => {
    expect(
      problems({ ...station(), ground: 999, levels: 12, stops: [5, 4, 300, 400, 500] }),
    ).toEqual(expect.arrayContaining(['ground', 'levels', 'stops.1']));
  });
});

describe('SceneWorld', () => {
  it('needs at least one scene and no repeats', () => {
    expect(SceneWorld.safeParse({ v: 1, scenes: [] }).success).toBe(false);
    expect(SceneWorld.safeParse({ v: 1, scenes: ['station', 'station'] }).success).toBe(false);
    expect(SceneWorld.safeParse({ v: 1, scenes: ['Station!'] }).success).toBe(false);
    expect(SceneWorld.safeParse({ v: 1, scenes: ['station', 'harbour'] }).success).toBe(true);
    expect(SceneWorld.safeParse({ v: 2, scenes: ['station'] }).success).toBe(false);
  });
});

describe('sceneSpan', () => {
  it("gives the level maths a scene's id, levels and number of stops", () => {
    expect(sceneSpan(SceneManifest.parse(station()))).toEqual({
      id: 'station',
      levels: 5,
      stops: 5,
    });
  });
});
