import { expect, test, type Page } from '@playwright/test';

async function setUp(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Train' }).click();
}

const NOTES = `20/10 Chest & back
Bench press 80x8, 80x8, 85x6
Pull ups 3x8
Barbell row 70kg 4x8

21/10 Arms
Curls 30 x 10 x 3
Calves ??? 4 sets maybe`;

test('importing notes adds workouts and gives the lifts ranks', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Import from notes' }).click();
  await page.getByLabel('Workout notes').fill(NOTES);
  await expect(page.getByText('2 workouts found')).toBeVisible();
  await expect(page.getByText("1 line couldn't be read")).toBeVisible();
  await expect(page.getByText('Line 8:')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 workouts' }).click();
  await expect(page.getByText('Imported 2 workouts')).toBeVisible();

  const ranks = page.getByRole('region', { name: 'Strength ranks' });
  for (const lift of ['Bench press', 'Pull-up', 'Barbell row', 'Barbell curl']) {
    await expect(ranks.getByText(lift, { exact: true })).toBeVisible();
  }
  // 85 x 6 at 80 kg bodyweight -> e1RM 102, ratio 1.275 of 2.0 -> 698: Diamond
  await expect(ranks.locator('.rank', { hasText: 'Bench press' })).toContainText('Diamond');
  await expect(page.locator('.workout')).toHaveCount(2);

  // importing the same notes again replaces them rather than doubling up
  await page.getByRole('button', { name: 'Import from notes' }).click();
  await page.getByLabel('Workout notes').fill(NOTES);
  await page.getByRole('button', { name: 'Import 2 workouts' }).click();
  await expect(page.locator('.workout')).toHaveCount(2);
});

test('the Arnold split suggests the next day, pre-filled', async ({ page }) => {
  await setUp(page);
  const next = page.getByRole('region', { name: 'Chest & back' });
  await expect(next).toContainText('Next up · Arnold split');
  await page.getByRole('button', { name: 'Start chest & back' }).click();
  await expect(page.getByRole('group', { name: 'Bench press' })).toBeVisible();
  await page.getByLabel('Bench press set 1 reps').fill('8');
  await page.getByLabel('Bench press set 1 kg').fill('80');
  await page.getByLabel('Barbell row set 1 reps').fill('8');
  await page.getByLabel('Barbell row set 1 kg').fill('70');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByText(/^New rank: /)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shoulders & arms' })).toBeVisible();
});
