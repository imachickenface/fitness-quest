/**
 * The everyday pick for common searches. USDA's list holds many forms of each food (dried egg, rice flour, potato
 * puffs), and plain word matching often ranked those first, so a new user searching "eggs" logged dried egg. When a
 * whole query is one of these keys, these foods (USDA FoodData Central ids, in order) come first.
 *
 * Keys are normalised (lower case, single spaces) and singular; plurals ending in -s or -es map onto them, and
 * irregular ones are listed. Chosen from public/foods.json; a test checks every id is still in it.
 */
export const EVERYDAY: Readonly<Record<string, readonly string[]>> = {
  egg: ['usda-171287', 'usda-173424', 'usda-173423'], // raw, hard-boiled, fried
  banana: ['usda-173944'],
  apple: ['usda-171688'],
  orange: ['usda-169097'],
  avocado: ['usda-171705'],
  grape: ['usda-2263891'],
  strawberry: ['usda-327699'],
  strawberries: ['usda-327699'],
  blueberry: ['usda-2263889'],
  blueberries: ['usda-2263889'],
  rice: ['usda-168878', 'usda-169704'], // white cooked, brown cooked
  'white rice': ['usda-168878'],
  'brown rice': ['usda-169704'],
  pasta: ['usda-169737'],
  bread: ['usda-325871', 'usda-335240'], // white, whole-wheat
  oat: ['usda-2346396', 'usda-173905'], // rolled dry, cooked with water
  oatmeal: ['usda-173905', 'usda-2346396'],
  potato: ['usda-170438', 'usda-170093'], // boiled, baked
  'sweet potato': ['usda-168483'],
  milk: ['usda-322892', 'usda-321359'], // whole, 2%
  cheese: ['usda-328637'],
  yogurt: ['usda-330137', 'usda-2259793'], // Greek nonfat, plain whole milk
  'greek yogurt': ['usda-330137', 'usda-2259794'],
  butter: ['usda-173410'],
  'peanut butter': ['usda-172470'],
  almond: ['usda-170567'],
  chicken: ['usda-171477'], // breast, roasted
  'chicken breast': ['usda-171477'],
  beef: ['usda-171799'], // ground 80/20, cooked
  'ground beef': ['usda-171799'],
  turkey: ['usda-174516'],
  salmon: ['usda-175168', 'usda-171998'],
  tuna: ['usda-334194'],
  shrimp: ['usda-175180'],
  tofu: ['usda-172448'],
  bean: ['usda-173735'],
  'black bean': ['usda-173735'],
  lentil: ['usda-172421'],
  broccoli: ['usda-321900', 'usda-169967'],
  spinach: ['usda-168462'],
  carrot: ['usda-170393'],
  tomato: ['usda-170457'],
  'olive oil': ['usda-171413'],
  honey: ['usda-169640'],
};

/** The everyday picks for a normalised query, trying it as typed and without a plural -s or -es. */
export function everydayFor(query: string): readonly string[] {
  return (
    EVERYDAY[query] ??
    (query.endsWith('es') ? EVERYDAY[query.slice(0, -2)] : undefined) ??
    (query.endsWith('s') ? EVERYDAY[query.slice(0, -1)] : undefined) ??
    []
  );
}
