import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function setUp(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
}

async function quickAdd(page: Page, kcal: string) {
  await page.getByRole('button', { name: '+ kcal' }).click();
  await page.getByLabel('Calories (kcal)').fill(kcal);
  await page.getByRole('button', { name: 'Log it' }).click();
}

test('a backup saves everything and restores it after a change', async ({ page }) => {
  await setUp(page);
  await quickAdd(page, '512');
  await expect(page.getByText('512', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Profile and targets' }).click();
  await expect(page.getByText('No backup yet.')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save a backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fitness-quest-backup-\d{4}-\d\d-\d\d\.json$/);
  const file = await download.path();
  const saved = JSON.parse(await readFile(file, 'utf8')) as {
    tables: { foodEntries: { nutrition: { kcal: number } }[] };
  };
  expect(saved.tables.foodEntries.map((e) => e.nutrition.kcal)).toEqual([512]);
  await expect(page.getByText('Last backup: today.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // a second entry after the backup is gone once the backup is restored
  await quickAdd(page, '300');
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(2);
  await page.getByRole('button', { name: 'Profile and targets' }).click();
  await page.getByLabel('Backup file').setInputFiles(file);
  const confirm = page.getByRole('alertdialog', { name: 'Restore this backup?' });
  await expect(confirm).toContainText('1 food entry, 0 workouts, 1 weigh-in');
  await confirm.getByRole('button', { name: 'Replace my data' }).click();
  await expect(page.getByText('Backup restored')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(1);
});

test('a file that is not a backup is refused', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Profile and targets' }).click();
  await page.getByLabel('Backup file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": 1}'),
  });
  await expect(page.getByText("This isn't a Fitness Quest backup file.")).toBeVisible();
});

test('after a week without a backup, Food reminds you', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T09:00:00'));
  await setUp(page);
  await expect(page.getByRole('region', { name: 'Backup reminder' })).toHaveCount(0);

  await page.clock.setFixedTime(new Date('2026-11-09T09:00:00'));
  await page.reload();
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  const reminder = page.getByRole('region', { name: 'Backup reminder' });
  await expect(reminder).toContainText('Your data is only on this phone.');
  await reminder.getByRole('button', { name: 'Save a backup' }).click();
  await expect(page.getByText('Backup saved')).toBeVisible();
  await expect(reminder).toHaveCount(0);
});
