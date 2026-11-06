/**
 * The world as the app sees it: the scene order from `public/scenes/world.json` and every scene's manifest,
 * loaded once and checked. The level maths (`core/scenes.ts`) works on the spans.
 */
import type { SceneSpan } from '../core/scenes.ts';
import { SceneManifest, SceneWorld, sceneSpan } from './manifest.ts';

export type World = { spans: SceneSpan[]; manifests: Map<string, SceneManifest> };

let loading: Promise<World> | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** The world under `baseUrl` (the folder holding world.json and the scene folders). */
export function loadWorld(baseUrl: string): Promise<World> {
  loading ??= (async () => {
    const world = SceneWorld.parse(await getJson(`${baseUrl}world.json`));
    const manifests = await Promise.all(
      world.scenes.map(async (id) => {
        const m = SceneManifest.parse(await getJson(`${baseUrl}${id}/scene.json`));
        if (m.id !== id) throw new Error(`${id}/scene.json says it is ${m.id}`);
        return m;
      }),
    );
    return { spans: manifests.map(sceneSpan), manifests: new Map(manifests.map((m) => [m.id, m])) };
  })();
  // a failed load (offline on first visit) may be tried again later
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
