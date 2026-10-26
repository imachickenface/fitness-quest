/**
 * Open Food Facts barcode lookup. Pure apart from the injected fetch / clock / sleep. The response is
 * untrusted, so every field is type-checked and parseProduct never throws.
 */
import type { Food, Macros, Portion } from '../contract.ts';

export const OFF_USER_AGENT = 'FitnessQuest/0.2 (https://github.com/imachickenface/fitness-quest)';

const FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments';
const BARCODE = /^\d{8,14}$/;

export type OffResult =
  | { status: 'found'; food: Food }
  | { status: 'not_found' }
  | { status: 'no_nutrition'; name?: string; brand?: string }
  | { status: 'error'; message: string; retryable: boolean };

export function productUrl(barcode: string): string {
  if (!BARCODE.test(barcode)) throw new RangeError(`not a food barcode: ${barcode}`);
  const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
  url.searchParams.set('fields', FIELDS);
  return url.toString();
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** A number or numeric string that is finite and >= 0; otherwise undefined. */
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function parseProduct(barcode: string, json: unknown, updatedAt: string): OffResult {
  if (!isObj(json) || json.status !== 1 || !isObj(json.product)) return { status: 'not_found' };
  const p = json.product;
  const n = isObj(p.nutriments) ? p.nutriments : {};

  const name = text(p.product_name, 200);
  const brand = typeof p.brands === 'string' ? text(p.brands.split(',')[0], 200) : '';

  const kj = num(n['energy-kj_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj === undefined ? undefined : kj / 4.184);
  if (kcal === undefined || kcal > 1000) {
    return {
      status: 'no_nutrition',
      ...(name ? { name } : {}),
      ...(brand ? { brand } : {}),
    };
  }

  const per100g: Macros = { kcal: round1(kcal) };
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  if (protein !== undefined) per100g.proteinG = round1(protein);
  if (carbs !== undefined) per100g.carbsG = round1(carbs);
  if (fat !== undefined) per100g.fatG = round1(fat);

  const portions: Portion[] = [];
  const servingG = num(p.serving_quantity);
  if (servingG !== undefined && servingG > 0) {
    const grams = round1(servingG);
    const size = text(p.serving_size, 200);
    portions.push({ label: `1 serving (${size || `${grams} g`})`.slice(0, 60), grams });
  }

  return {
    status: 'found',
    food: {
      id: `off-${barcode}`,
      name: name || `Product ${barcode}`,
      ...(brand ? { brand } : {}),
      barcode,
      source: 'off',
      sourceId: barcode,
      per100g,
      portions,
      favourite: false,
      updatedAt,
    },
  };
}

export function createOffClient(deps: {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  minSpacingMs?: number;
}): { lookup(barcode: string, updatedAt: string): Promise<OffResult> } {
  const spacing = deps.minSpacingMs ?? 4000;
  let last: number | undefined;

  return {
    async lookup(barcode, updatedAt) {
      const url = productUrl(barcode);
      if (last !== undefined) {
        const wait = last + spacing - deps.now();
        if (wait > 0) await deps.sleep(wait);
      }
      last = deps.now();

      let res: Response;
      try {
        res = await deps.fetch(url, {
          headers: { 'X-User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
        });
      } catch {
        return {
          status: 'error',
          message: 'Could not reach Open Food Facts (offline?)',
          retryable: true,
        };
      }
      if (res.status === 404) return { status: 'not_found' };
      if (res.status === 429 || res.status >= 500) {
        return {
          status: 'error',
          message: `Open Food Facts is busy (${res.status}). Try again in a minute.`,
          retryable: true,
        };
      }
      if (!res.ok) {
        return {
          status: 'error',
          message: `Open Food Facts said no (${res.status}).`,
          retryable: false,
        };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return {
          status: 'error',
          message: 'Open Food Facts sent an unreadable answer.',
          retryable: false,
        };
      }
      return parseProduct(barcode, body, updatedAt);
    },
  };
}
