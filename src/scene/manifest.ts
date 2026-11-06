/**
 * A scene's manifest (`public/scenes/<id>/scene.json`): its size, layers and the spots its effects and taps use.
 * All coordinates are in the scene's own pixels (the art's true pixel size, e.g. 750 x 256), x from the left,
 * y from the top. Checked with zod on load, since scenes are hand-written.
 */
import { z } from 'zod';
import type { SceneSpan } from '../core/scenes.ts';

const px = z.number().min(-4096).max(4096);
const box = z.tuple([px, px, px, px]);
const sceneId = z.string().regex(/^[a-z0-9-]{1,40}$/);

/** Report one broken rule: a plain-English message at the path of the thing that is wrong. */
function say(ctx: z.core.$RefinementCtx, path: PropertyKey[], message: string): void {
  ctx.addIssue({ code: 'custom', message, path });
}

/** Rules that compare several fields: the ranges above only check each number on its own. */
function checkManifest(m: SceneManifest, ctx: z.core.$RefinementCtx): void {
  // The ground row must be a whole row of the scene, from the top edge down to the last row.
  if (!Number.isInteger(m.ground) || m.ground < 0 || m.ground > m.height - 1) {
    say(
      ctx,
      ['ground'],
      `ground must be a whole row from 0 to ${m.height - 1}, the last row of the scene`,
    );
  }

  // A scene lasts between 5 and 10 levels, and has at most one stop per level.
  if (m.levels < 5 || m.levels > 10) {
    say(ctx, ['levels'], 'levels must be from 5 to 10');
  }
  if (m.stops.length > m.levels) {
    say(
      ctx,
      ['stops'],
      `there are ${m.stops.length} stops but only ${m.levels} levels: at most one stop per level`,
    );
  }

  // Stops: inside the scene, and strictly left to right. A stop that is both outside and out of order
  // is reported once, at its own index.
  m.stops.forEach((x, i) => {
    const before = m.stops[i - 1];
    if (x < 0 || x > m.width || (before !== undefined && x <= before)) {
      const after = i === 0 ? '' : ` and right of stop ${i - 1}`;
      say(ctx, ['stops', i], `stop ${i} must be inside the scene (0 to ${m.width})${after}`);
    }
  });

  // Every layer file may be used by only one layer.
  const layerSrcs = new Set<string>();
  for (let i = 0; i < m.layers.length; i += 1) {
    const src = m.layers[i]?.src;
    if (src === undefined) continue;
    if (layerSrcs.has(src))
      say(ctx, ['layers', i, 'src'], `layer file ${src} is already used by another layer`);
    else layerSrcs.add(src);
  }

  // Bands and areas must sit inside the scene and the right way round.
  if (m.lights !== undefined) {
    if (m.lights.top < 0 || m.lights.bottom > m.height || m.lights.top >= m.lights.bottom) {
      say(
        ctx,
        ['lights'],
        `lights must be inside the scene (0 to ${m.height}) with top above bottom`,
      );
    }
  }
  if (m.puddles !== undefined) {
    if (m.puddles.y0 < 0 || m.puddles.y1 > m.height || m.puddles.y0 >= m.puddles.y1) {
      say(ctx, ['puddles'], `puddles must be inside the scene (0 to ${m.height}) with y0 above y1`);
    }
  }
  if (m.fireflies !== undefined) {
    if (m.fireflies.x0 >= m.fireflies.x1 || m.fireflies.y0 >= m.fireflies.y1) {
      say(ctx, ['fireflies'], 'fireflies need x0 left of x1 and y0 above y1');
    }
  }

  // Taps: their spots, their ids, and the bell's cut-out sprite.
  const tapIds = new Set<string>();
  for (let i = 0; i < (m.taps?.length ?? 0); i += 1) {
    const tap = m.taps?.[i];
    if (tap === undefined) continue;
    const [x0, y0, x1, y1] = tap.box;
    if (
      x0 === undefined ||
      y0 === undefined ||
      x1 === undefined ||
      y1 === undefined ||
      x0 >= x1 ||
      y0 >= y1 ||
      x0 < 0 ||
      x1 > m.width ||
      y0 < 0 ||
      y1 > m.height
    ) {
      say(
        ctx,
        ['taps', i, 'box'],
        `tap ${i} box must be inside the scene (x 0 to ${m.width}, y 0 to ${m.height}) with x0 left of x1 and y0 above y1`,
      );
    }
    if (tapIds.has(tap.id))
      say(ctx, ['taps', i, 'id'], `tap id ${tap.id} is already used by another tap`);
    else tapIds.add(tap.id);
    if (tap.kind === 'bell' && tap.sprite === undefined) {
      say(ctx, ['taps', i, 'sprite'], `bell tap ${i} needs the sprite of the bell it rings`);
    }
    if (tap.kind !== 'bell' && tap.sprite !== undefined) {
      say(ctx, ['taps', i, 'sprite'], `only a bell tap has a sprite; tap ${i} is a ${tap.kind}`);
    }
  }
}

export const SceneManifest = z
  .object({
    v: z.literal(1),
    id: sceneId,
    name: z.string().min(1).max(60),
    width: z.number().int().min(64).max(4096),
    height: z.number().int().min(64).max(1024),
    /** the row the character's feet stand on */
    ground: px,
    /** back to front; depth -1 (far) .. 1 (near), how far a layer moves for parallax */
    layers: z
      .array(
        z.object({
          src: z.string().regex(/^[\w.-]+\.(webp|png)$/),
          depth: z.number().min(-1).max(1),
        }),
      )
      .min(1)
      .max(8),
    /** x positions the character stops at, one per level, left to right */
    stops: z.array(px).min(1).max(12),
    /** how many levels the scene lasts */
    levels: z.number().int().min(1).max(12),
    /** rows where lamps and windows are; bright warm pixels there glow at night and flicker */
    lights: z.object({ top: px, bottom: px }).optional(),
    smoke: z.array(z.object({ x: px, y: px })).optional(),
    fireflies: z
      .object({ x0: px, x1: px, y0: px, y1: px, count: z.number().int().min(0).max(200) })
      .optional(),
    mist: z
      .array(z.object({ y: px, height: px, speed: z.number(), alpha: z.number().min(0).max(1) }))
      .optional(),
    /** a wet surface that catches rain ripples and light sparkles */
    puddles: z.object({ y0: px, y1: px }).optional(),
    taps: z
      .array(
        z.object({
          id: sceneId,
          label: z.string().min(1).max(60),
          kind: z.enum(['bell', 'lamp']),
          box,
          pivot: z.tuple([px, px]).optional(),
          /** a moving part cut out of the scene (art/scene_layers.py), drawn at x, y */
          sprite: z
            .object({ src: z.string().regex(/^[\w.-]+\.(webp|png)$/), x: px, y: px })
            .optional(),
        }),
      )
      .optional(),
  })
  .strict()
  .superRefine(checkManifest);
export type SceneManifest = z.infer<typeof SceneManifest>;

/** The world: scene ids in the order the player meets them. */
export const SceneWorld = z.strictObject({
  v: z.literal(1),
  scenes: z.array(sceneId).min(1).refine(uniqueSceneIds, 'each scene may be listed only once'),
});
export type SceneWorld = z.infer<typeof SceneWorld>;

/** True when the world lists each scene once; a repeated id would make the level maths ambiguous. */
function uniqueSceneIds(scenes: string[]): boolean {
  return new Set(scenes).size === scenes.length;
}

/** What the level maths (core/scenes.ts) needs from a manifest. */
export function sceneSpan(m: SceneManifest): SceneSpan {
  return { id: m.id, levels: m.levels, stops: m.stops.length };
}
