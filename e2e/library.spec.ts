import { expect, test, type Page } from '@playwright/test';

async function setUp(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await page.getByRole('button', { name: 'Train' }).click();
}

test('exercises come from the library: search, filter, read the how-to, add', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Log workout' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log a workout' });

  await sheet.getByRole('button', { name: '+ Add an exercise' }).click();
  let picker = page.getByRole('dialog', { name: 'Add an exercise' });
  await expect(picker.getByText(/^Showing 60 of 8\d\d\./)).toBeVisible();
  await picker.getByLabel('Search exercises').fill('incline dumb');
  // the ranked lift is listed under the app's own name, first
  await picker.locator('.picker-pick').first().click();
  await expect(sheet.getByRole('group', { name: 'Incline dumbbell press' })).toBeVisible();

  await sheet.getByRole('button', { name: '+ Add an exercise' }).click();
  picker = page.getByRole('dialog', { name: 'Add an exercise' });
  await picker.getByRole('button', { name: 'Back', exact: true }).click();
  await picker.getByLabel('Equipment').selectOption({ label: 'Cable' });
  await picker.getByRole('button', { name: 'How to do Seated cable row' }).click();
  const detail = page.getByRole('dialog', { name: 'Seated cable row' });
  await expect(detail.getByRole('listitem').first()).toBeVisible();
  await detail.getByRole('button', { name: 'Add to workout' }).click();
  await expect(sheet.getByRole('group', { name: 'Seated cable row' })).toBeVisible();

  await sheet.getByLabel('Incline dumbbell press set 1 reps').fill('8');
  await sheet.getByLabel('Incline dumbbell press set 1 kg').fill('27.5');
  await sheet.getByLabel('Seated cable row set 1 reps').fill('10');
  await sheet.getByLabel('Seated cable row set 1 kg').fill('60');
  await sheet.getByRole('button', { name: 'Save workout' }).click();
  // logged under the ranked names, so both lifts get ranks
  const ranks = page.getByRole('region', { name: 'Strength ranks' });
  await expect(ranks.getByText('Incline dumbbell press', { exact: true })).toBeVisible();
  await expect(ranks.getByText('Seated cable row', { exact: true })).toBeVisible();
});

test('a run can be logged as a type from the list', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Log run' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log a run' });
  await sheet.getByText('8 × 400 m').click();
  await expect(sheet.getByText(/8 × 400 m at about 5K race pace/)).toBeVisible();
  await sheet.getByLabel('Distance (km)').fill('6');
  await sheet.getByLabel('Time (optional)').fill('33:00');
  await sheet.getByRole('button', { name: 'Save run' }).click();
  await expect(page.locator('.workout', { hasText: 'Intervals: 8 × 400 m' })).toContainText(
    '6 km · 5:30 /km',
  );
});
