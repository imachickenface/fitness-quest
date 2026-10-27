import type { HeroId } from '../../contract.ts';

/** What each character looks like, for the picker's labels. */
export const HERO_NAMES: Record<HeroId, string> = {
  'male-a': 'Glasses and green tee',
  'male-b': 'Beard and red tee',
  'male-c': 'Police officer',
  'male-d': 'Suit and tie',
  'male-e': 'Lab coat',
  'male-f': 'Green tee and braces',
  'female-a': 'Crutches and purple top',
  'female-b': 'Hair buns and yellow top',
  'female-c': 'Blue top and red skirt',
  'female-d': 'Grey suit',
  'female-e': 'White jacket',
  'female-f': 'Black top and braces',
};

export const DEFAULT_HERO: HeroId = 'male-a';
