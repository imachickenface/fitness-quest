/** What the player picks for their hero, and the body the game derives from their records. */

export const SKINS = ['#ffd9bd', '#f1bd96', '#d8955f', '#ad6b3e', '#86502d', '#5a3421'] as const;
export const HAIR_COLOURS = [
  '#3b2a20',
  '#6e4127',
  '#a8662f',
  '#e3b95a',
  '#c9512f',
  '#24242c',
] as const;
export const OUTFIT_COLOURS = [
  '#1f8ef1',
  '#e5484d',
  '#46c21b',
  '#8e5cd9',
  '#ff9600',
  '#2b3a42',
] as const;
export const HAIRS = ['short', 'spiky', 'long', 'bun', 'buzz'] as const;
export const OUTFITS = ['tee', 'tank', 'track', 'armor'] as const;
export const HEADGEAR = ['none', 'cap', 'headband', 'helmet', 'crown'] as const;

export type Look = {
  skin: number;
  hair: (typeof HAIRS)[number];
  hairColour: number;
  outfit: (typeof OUTFITS)[number];
  outfitColour: number;
  headgear: (typeof HEADGEAR)[number];
};

/** muscle 0..4, build -2 (under-fuelled) .. +2 (over-fuelled) */
export type Body = { muscle: number; build: number };

export const DEFAULT_LOOK: Look = {
  skin: 1,
  hair: 'short',
  hairColour: 1,
  outfit: 'tee',
  outfitColour: 0,
  headgear: 'none',
};
