import { expect, test, type Page } from '@playwright/test';

async function setUp(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await expect(page.getByText('Calories remaining')).toBeVisible();
}

test('a drink can be logged in ml, and the food remembers it', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Search food' }).click();
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('milk whole 3.25');
  await page
    .getByRole('dialog', { name: 'Find food' })
    .getByRole('button', { name: /^Milk, whole, 3.25% milkfat, with added vitamin D/ })
    .click();
  const sheet = page.getByRole('dialog', {
    name: /^Milk, whole, 3.25% milkfat, with added vitamin D/,
  });
  await sheet.getByText('ml', { exact: true }).click();
  await sheet.getByLabel('Amount (ml)').fill('250');
  await sheet.getByRole('button', { name: 'Log it' }).click();
  await expect(page.locator('.entry').first()).toContainText('250 ml');

  // the quick-log list and next time the food opens in ml
  await expect(page.getByRole('button', { name: /250 ml · 150 kcal/ })).toBeVisible();
  await page.getByRole('button', { name: 'Search food' }).click();
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('milk whole 3.25');
  await page
    .getByRole('dialog', { name: 'Find food' })
    .getByRole('button', { name: /^Milk, whole, 3.25% milkfat, with added vitamin D/ })
    .click();
  await expect(sheet.getByLabel('Amount (ml)')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '100 ml' })).toBeVisible();
});

test('the workout sheet switches kg and lb, converting what was typed', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Start chest & back' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log a workout' });
  await sheet.getByLabel('Bench press set 1 reps').fill('5');
  await sheet.getByLabel('Bench press set 1 kg').fill('100');
  await sheet.getByText('lb', { exact: true }).click();
  await expect(sheet.getByLabel('Bench press set 1 lb')).toHaveValue('220');
  await sheet.getByRole('button', { name: 'Save workout' }).click();
  // the choice sticks: the history and ranks now show pounds
  await expect(page.locator('.workout').first()).toContainText('220 lb');
  await page.getByRole('button', { name: 'Start shoulders & arms' }).click();
  await expect(sheet.getByRole('radio', { name: 'lb' })).toBeChecked();
});
