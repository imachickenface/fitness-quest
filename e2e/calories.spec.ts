import { expect, test, type Locator, type Page } from '@playwright/test';

/** Counts taps so the "logging is fast" targets from the plan are checked, not assumed. */
function tapCounter() {
  let taps = 0;
  return {
    tap: async (target: Locator) => {
      taps++;
      await target.click();
    },
    reset: () => {
      taps = 0;
    },
    get count() {
      return taps;
    },
  };
}

async function setUpProfile(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await expect(page.getByText(/kcal left/)).toBeVisible();
}

function entries(page: Page) {
  return page.locator('.entry');
}

test('search and log a food in at most 4 taps, repeat it in 1', async ({ page }) => {
  await setUpProfile(page);
  const t = tapCounter();

  await t.tap(page.getByRole('button', { name: 'Search food' }));
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg whole raw');
  await t.tap(page.getByRole('button', { name: /^Egg, whole, raw, fresh/ }));
  await t.tap(page.getByRole('button', { name: 'Log it' }));

  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('Egg, whole, raw, fresh');
  expect(t.count).toBeLessThanOrEqual(4);

  // the food is now one tap away in Quick log
  t.reset();
  await t.tap(page.getByRole('button', { name: /^Egg, whole, raw, fresh/ }));
  await expect(entries(page)).toHaveCount(2);
  expect(t.count).toBe(1);
});

test('quick add, remove with undo, and data survives a reload', async ({ page }) => {
  await setUpProfile(page);

  await page.getByRole('button', { name: '+ kcal' }).click();
  await page.getByLabel('Calories (kcal)').fill('650');
  await page.getByLabel('What was it? (optional)').fill('Lunch out');
  await page.getByRole('button', { name: 'Log it' }).click();
  await expect(entries(page)).toHaveCount(1);
  await expect(page.getByText('650 eaten of')).toBeVisible();

  await page.getByRole('button', { name: 'Remove Lunch out' }).click();
  await expect(entries(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(entries(page)).toHaveCount(1);

  await page.reload();
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('Lunch out');
});

test('a saved meal logs several foods with one tap', async ({ page }) => {
  await setUpProfile(page);
  for (const [query, name] of [
    ['egg whole raw', /^Egg, whole, raw, fresh/],
    ['bread white commercially', /^Bread, white, commercially prepared \(includes/],
  ] as const) {
    await page.getByRole('button', { name: 'Search food' }).click();
    await page.getByRole('searchbox', { name: 'Search foods' }).fill(query);
    await page.getByRole('button', { name }).first().click();
    await page.getByRole('radio', { name: 'Breakfast' }).check({ force: true });
    await page.getByRole('button', { name: 'Log it' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Save as a meal' }).click();
  await page.getByLabel('Meal name').fill('Egg on toast');
  await page.getByRole('button', { name: 'Save meal' }).click();

  await page.getByRole('button', { name: /^Egg on toast/ }).click();
  await expect(entries(page)).toHaveCount(4);
});

test('no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setUpProfile(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
