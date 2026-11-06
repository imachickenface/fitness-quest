/**
 * Player characters as pixel sprite strips (public/characters/, cut from the owner's sheets by
 * art/character_sheets.py). Every frame in a strip has the same size, with the feet on the bottom row and the
 * body centred, so any frame draws at the same anchor. Walk frames face right; the engine mirrors them.
 */
import { z } from 'zod';

export const CharacterEntry = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  src: z.string().min(1),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  walk: z.array(z.number().int().nonnegative()).min(2),
  stand: z.number().int().nonnegative(),
  emote: z
    .strictObject({ frame: z.number().int().nonnegative(), kind: z.string().min(1) })
    .optional(),
});
export type CharacterEntry = z.infer<typeof CharacterEntry>;

export const CharacterList = z.strictObject({
  v: z.literal(1),
  characters: z.array(CharacterEntry).min(1),
});

export type CharacterSprite = { entry: CharacterEntry; img: HTMLImageElement };

export async function loadCharacters(baseUrl: string): Promise<CharacterEntry[]> {
  const list = CharacterList.parse(await (await fetch(`${baseUrl}characters.json`)).json());
  return list.characters;
}

export function loadCharacter(baseUrl: string, entry: CharacterEntry): Promise<CharacterSprite> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ entry, img });
    img.onerror = () => reject(new Error(`could not load ${entry.src}`));
    img.src = baseUrl + entry.src;
  });
}
