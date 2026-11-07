/**
 * A character's portrait: a square around the head of its standing frame, used as the player's picture for
 * friends. The crop is found from the sprite itself, so a new character needs no extra numbers.
 */
import type { CharacterSprite } from './character.ts';

/** Side of the portrait square, in sprite pixels: the head and the top of the shoulders. */
export const PORTRAIT_SIZE = 24;
/** Rows from the top of the figure that count as the head when finding its centre. */
const HEAD_ROWS = 10;

type Frame = { w: number; h: number; opaque: (x: number, y: number) => boolean };

/** Where to crop the portrait in a frame: centred on the head, starting a row above the top of the hair. */
export function headBox({ w, h, opaque }: Frame): { x: number; y: number; size: number } {
  const size = Math.min(PORTRAIT_SIZE, w, h);
  let top = -1;
  for (let y = 0; y < h && top < 0; y++)
    for (let x = 0; x < w; x++)
      if (opaque(x, y)) {
        top = y;
        break;
      }
  if (top < 0) return { x: Math.floor((w - size) / 2), y: 0, size };
  let left = w;
  let right = -1;
  for (let y = top; y < Math.min(h, top + HEAD_ROWS); y++)
    for (let x = 0; x < w; x++)
      if (opaque(x, y)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
  const centre = (left + right + 1) / 2;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return {
    x: clamp(Math.round(centre - size / 2), w - size),
    y: clamp(top - 1, h - size),
    size,
  };
}

/** The portrait as an image URL, drawn at `zoom` screen pixels per sprite pixel with smoothing off. */
export function portraitUrl({ entry, img }: CharacterSprite, zoom = 4): string {
  const fw = entry.frameWidth;
  const fh = entry.frameHeight;
  const src = document.createElement('canvas');
  src.width = fw;
  src.height = fh;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('no 2D canvas');
  sctx.drawImage(img, entry.stand * fw, 0, fw, fh, 0, 0, fw, fh);
  const alpha = sctx.getImageData(0, 0, fw, fh).data;
  const box = headBox({ w: fw, h: fh, opaque: (x, y) => alpha[(y * fw + x) * 4 + 3]! > 0 });
  const out = document.createElement('canvas');
  out.width = out.height = box.size * zoom;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('no 2D canvas');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, box.x, box.y, box.size, box.size, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
