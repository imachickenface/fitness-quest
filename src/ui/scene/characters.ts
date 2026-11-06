import { loadCharacters, type CharacterEntry } from '../../scene/character.ts';

export const CHARACTER_BASE = `${import.meta.env.BASE_URL}characters/`;

let list: Promise<CharacterEntry[]> | null = null;

/** The characters list (public/characters/characters.json), fetched once. */
export function characterList(): Promise<CharacterEntry[]> {
  list ??= loadCharacters(CHARACTER_BASE);
  list.catch(() => {
    list = null; // try again next time
  });
  return list;
}
