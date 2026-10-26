import { describe, expect, it } from 'vitest';
import { Food as FoodSchema } from '../contract.ts';
import { createOffClient, OFF_USER_AGENT, parseProduct, productUrl } from './off.ts';

const at = '2026-10-27T09:00:00+00:00';
const code = '3017624010701';

const nutella = {
  code,
  status: 1,
  product: {
    code,
    product_name: '  Nutella ',
    brands: 'Ferrero, Nutella',
    serving_size: '15 g',
    serving_quantity: 15,
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
    },
  },
};

describe('productUrl', () => {
  it('asks only for the fields the app uses', () => {
    const url = new URL(productUrl(code));
    expect(url.origin + url.pathname).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json`,
    );
    expect(url.searchParams.get('fields')).toBe(
      'code,product_name,brands,serving_size,serving_quantity,nutriments',
    );
  });
  it('rejects anything that is not 8-14 digits', () => {
    expect(() => productUrl('123')).toThrow(RangeError);
    expect(() => productUrl('12345678x')).toThrow(RangeError);
    expect(() => productUrl('../../etc')).toThrow(RangeError);
  });
});

describe('parseProduct', () => {
  it('turns a full product into a valid Food', () => {
    const r = parseProduct(code, nutella, at);
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(FoodSchema.parse(r.food)).toEqual(r.food);
    expect(r.food).toEqual({
      id: `off-${code}`,
      name: 'Nutella',
      brand: 'Ferrero',
      barcode: code,
      source: 'off',
      sourceId: code,
      per100g: { kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9 },
      portions: [{ label: '1 serving (15 g)', grams: 15 }],
      favourite: false,
      updatedAt: at,
    });
  });

  it('falls back to kJ when kcal is missing, rounded to 0.1', () => {
    const json = {
      status: 1,
      product: { product_name: 'Crisps', nutriments: { 'energy-kj_100g': 2200 } },
    };
    const r = parseProduct(code, json, at);
    expect(r.status === 'found' && r.food.per100g).toEqual({ kcal: 525.8 });
  });

  it('accepts numeric strings and drops bad macro values', () => {
    const json = {
      status: 1,
      product: {
        product_name: 'Oat drink',
        nutriments: {
          'energy-kcal_100g': '46',
          proteins_100g: '1.0',
          carbohydrates_100g: 'n/a',
          fat_100g: -2,
        },
      },
    };
    const r = parseProduct(code, json, at);
    expect(r.status === 'found' && r.food.per100g).toEqual({ kcal: 46, proteinG: 1 });
  });

  it('names a nameless product and leaves brand and portions out when absent', () => {
    const json = { status: 1, product: { brands: ' ', nutriments: { 'energy-kcal_100g': 100 } } };
    const r = parseProduct(code, json, at);
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.food.name).toBe(`Product ${code}`);
    expect(r.food).not.toHaveProperty('brand');
    expect(r.food.portions).toEqual([]);
  });

  it('labels a serving without a size as "1 serving (N g)" and ignores a zero serving', () => {
    const base = { product_name: 'Bar', nutriments: { 'energy-kcal_100g': 400 } };
    const one = parseProduct(code, { status: 1, product: { ...base, serving_quantity: '42' } }, at);
    expect(one.status === 'found' && one.food.portions).toEqual([
      { label: '1 serving (42 g)', grams: 42 },
    ]);
    const zero = parseProduct(
      code,
      { status: 1, product: { ...base, serving_size: '0 g', serving_quantity: 0 } },
      at,
    );
    expect(zero.status === 'found' && zero.food.portions).toEqual([]);
  });

  it('clips long names and labels to what the contract allows', () => {
    const json = {
      status: 1,
      product: {
        product_name: 'x'.repeat(300),
        serving_size: 'y'.repeat(100),
        serving_quantity: 30,
        nutriments: { 'energy-kcal_100g': 100 },
      },
    };
    const r = parseProduct(code, json, at);
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(FoodSchema.parse(r.food)).toEqual(r.food);
    expect(r.food.name).toHaveLength(200);
  });

  it('reports a product with no usable energy value as no_nutrition, keeping its name', () => {
    const json = {
      status: 1,
      product: { product_name: 'Mystery tea', brands: 'Leafy', nutriments: {} },
    };
    expect(parseProduct(code, json, at)).toEqual({
      status: 'no_nutrition',
      name: 'Mystery tea',
      brand: 'Leafy',
    });
    const silly = { status: 1, product: { nutriments: { 'energy-kcal_100g': 5000 } } };
    expect(parseProduct(code, silly, at)).toEqual({ status: 'no_nutrition' });
  });

  it('reports status 0 or a missing product as not_found', () => {
    expect(parseProduct(code, { status: 0, status_verbose: 'product not found' }, at)).toEqual({
      status: 'not_found',
    });
    expect(parseProduct(code, { status: 1 }, at)).toEqual({ status: 'not_found' });
    expect(parseProduct(code, null, at)).toEqual({ status: 'not_found' });
  });

  it('does not mutate the response', () => {
    const copy = structuredClone(nutella);
    parseProduct(code, nutella, at);
    expect(nutella).toEqual(copy);
  });
});

type Call = { url: string; init?: RequestInit; at: number };

function fakeEnv(responses: Array<() => Promise<Response>>) {
  let clock = 1_000_000;
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchFn = (url: string, init?: RequestInit) => {
    calls.push({ url, init, at: clock });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  };
  return {
    calls,
    sleeps,
    advance: (ms: number) => (clock += ms),
    client: createOffClient({
      fetch: fetchFn as typeof fetch,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    }),
  };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

describe('createOffClient', () => {
  it('fetches the product with the X-User-Agent header and parses it', async () => {
    const env = fakeEnv([json(nutella)]);
    const r = await env.client.lookup(code, at);
    expect(r.status).toBe('found');
    expect(env.calls[0]!.url).toBe(productUrl(code));
    expect(new Headers(env.calls[0]!.init?.headers).get('X-User-Agent')).toBe(OFF_USER_AGENT);
    expect(OFF_USER_AGENT).toMatch(/^FitnessQuest\/[\d.]+ \(https:\/\/github\.com\/.+\)$/);
  });

  it('treats a 404 as not_found', async () => {
    const env = fakeEnv([json({ status: 0, status_verbose: 'product not found' }, 404)]);
    expect(await env.client.lookup(code, at)).toEqual({ status: 'not_found' });
  });

  it('reports 429 and 5xx as retryable errors', async () => {
    const env = fakeEnv([json({}, 503), json({}, 429)]);
    expect(await env.client.lookup(code, at)).toMatchObject({ status: 'error', retryable: true });
    expect(await env.client.lookup(code, at)).toMatchObject({ status: 'error', retryable: true });
  });

  it('reports other HTTP errors and bad JSON as non-retryable', async () => {
    const env = fakeEnv([
      json({}, 400),
      () => Promise.resolve(new Response('<html>oops</html>', { status: 200 })),
    ]);
    expect(await env.client.lookup(code, at)).toMatchObject({ status: 'error', retryable: false });
    expect(await env.client.lookup(code, at)).toMatchObject({ status: 'error', retryable: false });
  });

  it('reports a network failure (offline) as retryable, never throwing', async () => {
    const env = fakeEnv([() => Promise.reject(new TypeError('Failed to fetch'))]);
    const r = await env.client.lookup(code, at);
    expect(r).toMatchObject({ status: 'error', retryable: true });
    expect(r.status === 'error' && r.message.length).toBeGreaterThan(0);
  });

  it('spaces requests at least 4 s apart', async () => {
    const env = fakeEnv([json(nutella), json(nutella), json(nutella)]);
    await env.client.lookup(code, at);
    env.advance(1500);
    await env.client.lookup(code, at);
    env.advance(10_000);
    await env.client.lookup(code, at);
    expect(env.sleeps).toEqual([2500]);
    expect(env.calls[1]!.at - env.calls[0]!.at).toBe(4000);
    expect(env.calls[2]!.at - env.calls[1]!.at).toBe(10_000);
  });

  it('throws RangeError for an invalid barcode without fetching', async () => {
    const env = fakeEnv([]);
    await expect(env.client.lookup('abc', at)).rejects.toThrow(RangeError);
    expect(env.calls).toHaveLength(0);
  });
});
