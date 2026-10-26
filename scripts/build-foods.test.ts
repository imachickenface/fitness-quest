// @vitest-environment node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toFood, type FoodsFile } from '../src/core/foodsData.ts';
import { Food } from '../src/contract.ts';
import { buildFoods, parseCsvLine } from './build-foods.ts';

const fixtures = fileURLToPath(new URL('./fixtures/usda/', import.meta.url));
const sources = [
  { dir: `${fixtures}foundation`, dataType: 'foundation_food' as const },
  { dir: `${fixtures}sr`, dataType: 'sr_legacy_food' as const },
];

describe('parseCsvLine', () => {
  it('splits quoted fields, keeping commas and doubled quotes inside them', () => {
    expect(parseCsvLine('"1","Beef, flank, trimmed to 0"" fat","13"')).toEqual([
      '1',
      'Beef, flank, trimmed to 0" fat',
      '13',
    ]);
  });
  it('handles empty and unquoted fields', () => {
    expect(parseCsvLine('"a","",3,,"b"')).toEqual(['a', '', '3', '', 'b']);
  });
  it('ignores a trailing carriage return', () => {
    expect(parseCsvLine('"a","b"\r')).toEqual(['a', 'b']);
  });
});

describe('buildFoods', () => {
  it('builds the compact food list from the fixtures', async () => {
    const out = await buildFoods(sources);
    expect(out.version).toBe(1);
    expect(out.source).toBe('USDA FoodData Central (public domain, CC0)');
    expect(out.foods).toEqual([
      // Foundation wins over the SR Legacy food with the same name; energy prefers 2048 over 2047
      ['usda-2001', 'Apples, raw, with skin', 58.3, 0.2, 14.1, 0.1, [['1 cup sliced', 109]]],
      // quoted name with a doubled quote; carbs missing -> null
      ['usda-1002', 'Beef, flank, steak, trimmed to 0" fat, raw', 155, 21.2, null, 7.2, []],
      // undetermined unit dropped; zero-gram portion skipped; duplicate label skipped
      [
        'usda-1001',
        'Egg, whole, raw, fresh',
        143,
        12.6,
        0.7,
        9.5,
        [
          ['1 large', 50],
          ['1 cup (4.86 large eggs)', 243],
        ],
      ],
      // only Atwater general energy (2047); no macros
      ['usda-2002', 'Hummus, commercial', 229, null, null, null, [['2 tablespoon', 33.9]]],
      // zero kcal is valid; portion without grams skipped
      ['usda-2005', 'Salt, table', 0, null, null, null, []],
    ]);
    // left out: Babyfood (category 3), Control sample (category 27), Mystery powder (no energy),
    // the sample_food row, and the duplicate SR apple
  });

  it('every row expands into a valid Food', async () => {
    const out = await buildFoods(sources);
    for (const row of out.foods) {
      expect(() => Food.parse(toFood(row, '2026-10-26T00:00:00+00:00'))).not.toThrow();
    }
  });

  it('fails clearly when a source folder is missing', async () => {
    await expect(
      buildFoods([{ dir: `${fixtures}nope`, dataType: 'sr_legacy_food' }]),
    ).rejects.toThrow(/nope/);
  });

  const realOut = fileURLToPath(new URL('../public/foods.json', import.meta.url));
  it.skipIf(!existsSync(realOut))('the real public/foods.json is under 1 MB gzipped', async () => {
    const raw = await readFile(realOut);
    const parsed = JSON.parse(raw.toString('utf8')) as FoodsFile;
    expect(parsed.foods.length).toBeGreaterThan(7000);
    expect(gzipSync(raw).length).toBeLessThan(1024 * 1024);
  });
});
