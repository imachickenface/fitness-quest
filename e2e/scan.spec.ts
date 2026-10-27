import { expect, test, type Page } from '@playwright/test';

const NUTELLA = '3017624010701';
const UNKNOWN = '4006381333931';

/**
 * Replace the camera with a canvas showing an EAN-13 barcode, so the real detector (the zxing-wasm
 * polyfill on desktop Chromium) has to read it from video frames.
 */
async function fakeCamera(page: Page, code: string) {
  await page.addInitScript((digits: string) => {
    const L = [
      '0001101',
      '0011001',
      '0010011',
      '0111101',
      '0100011',
      '0110001',
      '0101111',
      '0111011',
      '0110111',
      '0001011',
    ];
    const G = [
      '0100111',
      '0110011',
      '0011011',
      '0100001',
      '0011101',
      '0111001',
      '0000101',
      '0010001',
      '0001001',
      '0010111',
    ];
    const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
    const PARITY = [
      'LLLLLL',
      'LLGLGG',
      'LLGGLG',
      'LLGGGL',
      'LGLLGG',
      'LGGLLG',
      'LGGGLL',
      'LGLGLG',
      'LGLGGL',
      'LGGLGL',
    ];
    const d = [...digits].map(Number);
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]!]![i - 1] === 'L' ? L : G)[d[i]!];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[d[i]!];
    bits += '101';

    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      const draw = () => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#000';
        const x0 = (640 - bits.length * 5) / 2;
        [...bits].forEach((b, i) => {
          if (b === '1') ctx.fillRect(x0 + i * 5, 140, 5, 200);
        });
      };
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  }, code);
}

async function setUp(page: Page, code: string) {
  // the decoder must come from the app itself, never the library's default CDN
  await page.route(/jsdelivr|unpkg/, (route) => route.abort());
  await fakeCamera(page, code);
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await expect(page.getByText('Calories remaining')).toBeVisible();
}

test('scan a product found in Open Food Facts and log it', async ({ page }) => {
  const asked: string[] = [];
  await page.route('https://world.openfoodfacts.org/**', async (route) => {
    asked.push(route.request().headers()['x-user-agent'] ?? '');
    await route.fulfill({
      json: {
        status: 1,
        product: {
          product_name: 'Nutella',
          brands: 'Ferrero',
          serving_size: '15 g',
          serving_quantity: 15,
          nutriments: {
            'energy-kcal_100g': 539,
            proteins_100g: 6.3,
            carbohydrates_100g: 57.5,
            fat_100g: 30.9,
          },
        },
      },
    });
  });
  await setUp(page, NUTELLA);

  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nutella' })).toBeVisible({ timeout: 15_000 });
  expect(asked).toEqual([expect.stringMatching(/^FitnessQuest\//)]);
  await page.getByRole('button', { name: /^1 serving \(15 g\)/ }).click();
  await page.getByRole('button', { name: 'Log it' }).click();
  await expect(page.locator('.entry', { hasText: 'Nutella (Ferrero)' })).toContainText('81');
});

test('an unknown barcode can be typed in from the label, and is cached for next time', async ({
  page,
}) => {
  let lookups = 0;
  await page.route('https://world.openfoodfacts.org/**', async (route) => {
    lookups++;
    await route.fulfill({ status: 404, json: { status: 0, status_verbose: 'product not found' } });
  });
  await setUp(page, UNKNOWN);

  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(`Barcode ${UNKNOWN} isn't in Open Food Facts yet.`)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Enter label values' }).click();
  await page.getByLabel('Name').fill('Protein bar');
  await page.getByText('Per serving').click();
  await page.getByLabel(/^Serving size/).fill('40');
  await page.getByLabel('Calories (kcal)').fill('200');
  await page.getByLabel('Protein (g)').fill('20');
  await page.getByRole('button', { name: 'Save food' }).click();

  // straight to the portion picker: 200 kcal per 40 g serving -> 500 kcal / 100 g
  await expect(page.getByRole('heading', { name: 'Protein bar' })).toBeVisible();
  await page.getByRole('button', { name: /^1 serving/ }).click();
  await page.getByRole('button', { name: 'Log it' }).click();
  await expect(page.locator('.entry', { hasText: 'Protein bar' })).toContainText('200');

  // scanning it again finds the saved food without asking Open Food Facts
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Protein bar' })).toBeVisible({ timeout: 15_000 });
  expect(lookups).toBe(1);
});

test('a barcode can be typed when the camera is refused', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.route('https://world.openfoodfacts.org/**', (route) =>
    route.fulfill({ status: 503, body: 'busy' }),
  );
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests

  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/Camera access was refused/)).toBeVisible();
  await page.getByLabel('Or type the barcode').fill(NUTELLA);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter label values' })).toBeVisible();
});
