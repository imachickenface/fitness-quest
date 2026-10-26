/**
 * Builds `public/foods.json` (the compact food list described in `src/core/foodsData.ts`) from
 * USDA FoodData Central CSV downloads.
 *
 * Runs directly under Node 24's type stripping, so only erasable TypeScript is used (no enums,
 * namespaces or parameter properties) and imports end in `.ts`:
 *   node scripts/build-foods.ts <foundationDir> <srLegacyDir> <outFile>
 */
import { createReadStream, existsSync, promises as fsp, statSync } from 'node:fs';
import * as readline from 'node:readline';
import * as nodePath from 'node:path';

import type { CompactFood, CompactPortion, FoodsFile } from '../src/core/foodsData.ts';

/** Nutrient ids we keep: 1008 energy, 2047/2048 energy, 1003 protein, 1004 fat, 1005 carbs. */
const NUTRIENT_IDS = new Set(['1008', '2047', '2048', '1003', '1004', '1005']);
/** Energy nutrient ids in preference order. */
const ENERGY_IDS = ['1008', '2048', '2047'];
/** Food categories we drop: 3 = baby foods, 27 = quality control materials. */
const SKIPPED_CATEGORIES = new Set(['3', '27']);

export type UsdaSource = { dir: string; dataType: 'foundation_food' | 'sr_legacy_food' };

/**
 * One CSV line -> fields. Fields may be quoted; inside quotes a comma is literal and `""` means one
 * `"`. Unquoted fields are allowed. One trailing `\r` is stripped (USDA files have no newlines inside
 * fields).
 */
export function parseCsvLine(line: string): string[] {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line;

  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === ',') {
      fields.push(field);
      field = '';
      started = false;
      continue;
    }
    if (ch === '"' && !started) {
      inQuotes = true;
      started = true;
      continue;
    }
    field += ch;
    started = true;
  }
  fields.push(field);
  return fields;
}

/** A CSV file: header names plus one `Map` per row, keyed by header name (never position). */
type CsvFile = { header: string[]; rows: Map<string, string>[] };

/** Read `path`, throwing an Error whose message includes the path when the file is missing. */
async function readFileOrThrow(path: string): Promise<string> {
  try {
    return await fsp.readFile(path, 'utf8');
  } catch {
    throw new Error(`missing USDA file: ${path}`);
  }
}

/** Parse a whole CSV file into header + row objects. */
function parseCsvFile(path: string, raw: string): CsvFile {
  const lines = raw.split(/\r\n|\r|\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const headerLine = lines[0] ?? '';
  if (headerLine === '') throw new Error(`${path}: no header row`);

  const header = parseCsvLine(headerLine).map((name) => name.trim());
  const rows: Map<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = new Map<string, string>();
    header.forEach((name, index) => {
      row.set(name, values[index] ?? '');
    });
    rows.push(row);
  }
  return { header, rows };
}

/** Require a column to exist, returning its index by header name. */
function columnOf(header: string[], name: string, path: string): number {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`${path}: missing column "${name}"`);
  return index;
}

/** Index a CSV file by a key column (first row wins). */
function indexBy(file: CsvFile, key: string): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  for (const row of file.rows) {
    const value = row.get(key);
    if (value === undefined || value === '') continue;
    if (!map.has(value)) map.set(value, row);
  }
  return map;
}

/**
 * Stream `food_nutrient.csv` line by line with `readline` (the real file is ~36 MB), keeping only
 * the wanted nutrient ids and only for the foods we keep.
 */
async function readNutrients(
  path: string,
  wanted: Set<string>,
  keepFdcIds: Set<string>,
): Promise<Map<string, Map<string, string>>> {
  const byFood = new Map<string, Map<string, string>>();

  const rl = readline.createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });

  let fdcCol = -1;
  let nutrientCol = -1;
  let amountCol = -1;
  let isFirstLine = true;

  for await (const line of rl) {
    if (line === '') continue;
    const fields = parseCsvLine(line);
    if (isFirstLine) {
      isFirstLine = false;
      const header = fields.map((name) => name.trim());
      fdcCol = columnOf(header, 'fdc_id', path);
      nutrientCol = columnOf(header, 'nutrient_id', path);
      amountCol = columnOf(header, 'amount', path);
      continue;
    }
    const nutrientId = fields[nutrientCol] ?? '';
    if (!wanted.has(nutrientId)) continue;
    const fdcId = fields[fdcCol] ?? '';
    if (fdcId === '') continue;

    let nutrients = byFood.get(fdcId);
    if (nutrients === undefined) {
      nutrients = new Map<string, string>();
      byFood.set(fdcId, nutrients);
    }
    if (!nutrients.has(nutrientId)) nutrients.set(nutrientId, fields[amountCol] ?? '');
  }
  return byFood;
}

/** `Math.round(x * 10) / 10`, i.e. one decimal place. */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Parse a numeric CSV field; null when blank or not a finite number. */
function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `String(Number(x))` so "1.0" -> "1"; null when blank or not a number. */
function amountText(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

/** Truncate a portion label to 60 characters. */
function clip(label: string): string {
  return label.length > 60 ? label.slice(0, 60) : label;
}

/**
 * Portions for one food, in file order: label = the non-empty parts of [amount, unit,
 * portion_description, modifier] joined by one space, where unit is the measure_unit name or omitted
 * when the name is "undetermined". An empty label becomes `${grams} g`. Portions with a blank,
 * non-numeric or <= 0 gram_weight are skipped, as are duplicate labels; at most 6 per food.
 */
function buildPortions(
  rows: Map<string, string>[],
  units: Map<string, Map<string, string>>,
): CompactPortion[] {
  const portions: CompactPortion[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const gramsRaw = numOrNull(row.get('gram_weight') ?? '');
    if (gramsRaw === null || gramsRaw <= 0) continue;
    const grams = round1(gramsRaw);

    const amount = amountText(row.get('amount') ?? '');
    const unitName = units.get(row.get('measure_unit_id') ?? '')?.get('name') ?? '';
    const unit = unitName === '' || unitName === 'undetermined' ? null : unitName;

    const parts = [
      amount,
      unit,
      (row.get('portion_description') ?? '').trim(),
      (row.get('modifier') ?? '').trim(),
    ].filter((part) => part !== null && part !== '');

    const rawLabel = parts.join(' ');
    const label = clip(rawLabel === '' ? `${grams} g` : rawLabel);
    if (label === '' || seen.has(label)) continue;

    seen.add(label);
    portions.push([label, grams]);
    if (portions.length >= 6) break;
  }
  return portions;
}

export async function buildFoods(sources: UsdaSource[]): Promise<FoodsFile> {
  const foods: CompactFood[] = [];
  const seenNames = new Set<string>();

  for (const source of sources) {
    const dir = source.dir;
    const foodPath = nodePath.join(dir, 'food.csv');
    if (!existsSync(foodPath)) throw new Error(`missing USDA file: ${foodPath}`);

    const foodFile = parseCsvFile(foodPath, await readFileOrThrow(foodPath));
    const portionPath = nodePath.join(dir, 'food_portion.csv');
    const portionFile = parseCsvFile(portionPath, await readFileOrThrow(portionPath));
    const measurePath = nodePath.join(dir, 'measure_unit.csv');
    const measureFile = parseCsvFile(measurePath, await readFileOrThrow(measurePath));

    const nutrientPath = nodePath.join(dir, 'food_nutrient.csv');
    if (!existsSync(nutrientPath)) throw new Error(`missing USDA file: ${nutrientPath}`);

    // Which fdc_ids this source contributes, decided before the 36 MB nutrient file is streamed.
    const keptFdcIds = new Set<string>();
    for (const row of foodFile.rows) {
      if (row.get('data_type') !== source.dataType) continue;
      if (SKIPPED_CATEGORIES.has((row.get('food_category_id') ?? '').trim())) continue;
      const fdcId = (row.get('fdc_id') ?? '').trim();
      if (fdcId === '') continue;
      if ((row.get('description') ?? '').trim() === '') continue;
      keptFdcIds.add(fdcId);
    }

    const nutrients = await readNutrients(nutrientPath, NUTRIENT_IDS, keptFdcIds);

    const units = indexBy(measureFile, 'id');
    const portionsByFood = new Map<string, Map<string, string>[]>();
    for (const row of portionFile.rows) {
      const fdcId = row.get('fdc_id') ?? '';
      if (fdcId === '') continue;
      let rows = portionsByFood.get(fdcId);
      if (rows === undefined) {
        rows = [];
        portionsByFood.set(fdcId, rows);
      }
      rows.push(row);
    }

    for (const row of foodFile.rows) {
      if (row.get('data_type') !== source.dataType) continue;
      if (SKIPPED_CATEGORIES.has((row.get('food_category_id') ?? '').trim())) continue;

      const fdcId = (row.get('fdc_id') ?? '').trim();
      if (fdcId === '') continue;
      const name = row.get('description') ?? '';
      if (name.trim() === '') continue;

      // Sources are in priority order: an earlier source wins on a duplicate name.
      const key = name.trim().toLowerCase();
      if (seenNames.has(key)) continue;

      const foodNutrients = nutrients.get(fdcId);
      let kcal: number | null = null;
      for (const nutrientId of ENERGY_IDS) {
        const candidate = numOrNull(foodNutrients?.get(nutrientId) ?? '');
        if (candidate !== null) {
          kcal = candidate;
          break;
        }
      }
      if (kcal === null) continue;

      const protein = numOrNull(foodNutrients?.get('1003') ?? '');
      const carbs = numOrNull(foodNutrients?.get('1005') ?? '');
      const fat = numOrNull(foodNutrients?.get('1004') ?? '');

      seenNames.add(key);
      foods.push([
        `usda-${fdcId}`,
        name,
        round1(kcal),
        protein === null ? null : round1(protein),
        carbs === null ? null : round1(carbs),
        fat === null ? null : round1(fat),
        buildPortions(portionsByFood.get(fdcId) ?? [], units),
      ]);
    }
  }

  foods.sort((a, b) => {
    const an = a[1].toLowerCase();
    const bn = b[1].toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });

  return {
    version: 1,
    source: 'USDA FoodData Central (public domain, CC0)',
    foods,
  };
}

/** This file's own path, derived from `import.meta.url` (no `node:url` import needed). */
function selfPath(): string {
  const url = import.meta.url;
  if (!url.startsWith('file://')) return url;
  let path = decodeURIComponent(url.slice('file://'.length));
  // file:///C:/x/y on Windows -> C:/x/y
  if (path.startsWith('/') && /^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return path;
}

/** True only when this file is the process entry point, so importing it from a test is inert. */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return nodePath.resolve(entry) === nodePath.resolve(selfPath());
}

async function main(): Promise<void> {
  const [foundationDir, srLegacyDir, outFile] = process.argv.slice(2);
  if (foundationDir === undefined || srLegacyDir === undefined || outFile === undefined) {
    console.error('usage: node scripts/build-foods.ts <foundationDir> <srLegacyDir> <outFile>');
    process.exitCode = 1;
    return;
  }

  const result = await buildFoods([
    { dir: foundationDir, dataType: 'foundation_food' },
    { dir: srLegacyDir, dataType: 'sr_legacy_food' },
  ]);
  const json = JSON.stringify(result);
  await fsp.writeFile(outFile, json, 'utf8');
  console.log(`${result.foods.length} foods -> ${outFile} (${statSync(outFile).size} bytes)`);
}

if (isMainModule()) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
