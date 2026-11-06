/**
 * A scene's manifest (`public/scenes/<id>/scene.json`): its size, layers and the spots its effects and taps use.
 * All coordinates are in the scene's own pixels (the art's true pixel size, e.g. 750 x 256), x from the left,
 * y from the top. Checked with zod on load, since scenes are hand-written.
 */
import { z } from 'zod';

const px = z.number().min(-4096).max(4096);
const box = z.tuple([px, px, px, px]);

export const SceneManifest = z
  .object({
    v: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
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
          id: z.string().regex(/^[a-z0-9-]{1,40}$/),
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
  .strict();
export type SceneManifest = z.infer<typeof SceneManifest>;
