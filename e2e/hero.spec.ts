import { expect, test } from '@playwright/test';

test('the hero shows on the Quests screen, and a new choice persists', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await page.getByRole('button', { name: /^Quests/ }).click();

  const view = page.locator('.hero-view');
  await expect(view).toHaveAttribute('data-hero', 'male-a');
  // the 3D model loads (or, without WebGL, the still picture stays): either way it settles
  await expect(view).toHaveAttribute('data-state', /ready|failed/, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Change hero' }).click();
  await page.getByRole('button', { name: 'Police officer' }).click();
  await expect(page.locator('.hero-view')).toHaveAttribute('data-hero', 'male-c');

  await page.reload();
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.locator('.hero-view')).toHaveAttribute('data-hero', 'male-c');
  await page.getByRole('button', { name: 'Change hero' }).click();
  await expect(page.getByRole('button', { name: 'Police officer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('completing quests moves the hero along the map', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await page.getByRole('button', { name: /^Quests/ }).click();
  // setting up records a weigh-in, which completes today's "Step on the scale"
  await expect(page.locator('.hero-view')).toHaveAttribute('data-node', '1');

  await page.getByRole('button', { name: 'Food' }).click();
  for (const kcal of ['400', '500']) {
    await page.getByRole('button', { name: '+ kcal' }).click();
    await page.getByLabel('Calories (kcal)').fill(kcal);
    await page.getByRole('button', { name: 'Log it' }).click();
  }
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.locator('.hero-view')).toHaveAttribute('data-node', '2');
});

test('customising the hero: another head and a colour, kept after a reload', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.locator('.hero-view')).toHaveAttribute('data-state', /ready|failed/, {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Customise' }).click();
  await page.getByRole('button', { name: 'Head: Police officer' }).click();
  await expect(page.locator('.hero-view')).toHaveAttribute('data-head', 'male-c');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.locator('.hero-view')).toHaveAttribute('data-head', 'male-c');
  await expect(page.locator('.hero-view')).toHaveAttribute('data-hero', 'male-a');
});
