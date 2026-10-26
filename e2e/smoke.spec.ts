import { expect, test } from '@playwright/test';

test('title screen loads with no console errors and is installable', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Fitness Quest' })).toBeVisible();

  // the manifest is linked and lists the icons Chrome needs for the install prompt
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await page.request.get(new URL(href!, page.url()).toString())).json();
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));

  // the service worker registers (needed for offline use and install)
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()));

  // no horizontal scroll at phone width
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
