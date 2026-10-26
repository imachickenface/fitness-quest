/**
 * The bundled offline food list (public/foods.json), built from USDA FoodData Central by
 * scripts/build-foods.ts. Rows are tuples to keep the file small; toFood() expands one into a Food.
 */
import type { Food } from '../contract.ts';

/** [label, grams] */
export type CompactPortion = [label: string, grams: number];

/** per-100 g values; null = not measured */
export type CompactFood = [
  id: string,
  name: string,
  kcal: number,
  proteinG: number | null,
  carbsG: number | null,
  fatG: number | null,
  portions: CompactPortion[],
];

export type FoodsFile = {
  version: 1;
  source: string;
  foods: CompactFood[];
};

export function toFood(row: CompactFood, updatedAt: string): Food {
  const [id, name, kcal, proteinG, carbsG, fatG, portions] = row;
  return {
    id,
    name,
    source: 'usda',
    sourceId: id.replace(/^usda-/, ''),
    per100g: {
      kcal,
      ...(proteinG === null ? {} : { proteinG }),
      ...(carbsG === null ? {} : { carbsG }),
      ...(fatG === null ? {} : { fatG }),
    },
    portions: portions.map(([label, grams]) => ({ label, grams })),
    favourite: false,
    updatedAt,
  };
}
