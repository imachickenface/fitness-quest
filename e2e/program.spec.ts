import { expect, test, type Page } from '@playwright/test';

async function setUp(page: Page, day: string) {
  await page.clock.setFixedTime(new Date(`${day}T09:00:00`));
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Train' }).click();
}

async function startProgram(page: Page, goal: string, days?: string) {
  await page.getByRole('button', { name: 'Follow a program built from your goal' }).click();
  await page.getByLabel('Goal').selectOption({ label: goal });
  if (days) await page.getByRole('radio', { name: days }).check();
  await page.getByRole('button', { name: 'Start program' }).click();
}

test("a lifting program plans the week and today's session is a quest", async ({ page }) => {
  await setUp(page, '2026-11-02'); // a Monday
  await startProgram(page, 'Build muscle', '3');
  await expect(page.getByText('Program started: 12 weeks')).toBeVisible();

  const card = page.getByRole('region', { name: /^Today: Chest & back/ });
  await expect(card).toContainText('Build muscle · week 1 of 12');
  const week = page.getByRole('list', { name: 'This week' });
  await expect(week.getByRole('listitem')).toHaveCount(7);
  await expect(week.getByLabel('Today: Chest & back, planned')).toBeVisible();

  await page.getByRole('button', { name: /^Quests/ }).click();
  const quest = page.getByRole('listitem', { name: /^Today's session: Chest & back/ });
  await expect(quest).toBeVisible();

  await page.getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Start chest & back' }).click();
  await expect(page.getByLabel('Bench press set 3 reps')).toHaveValue('10');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(card).toContainText('Done. Nice work!');
  await expect(week.getByLabel('Today: Chest & back, done')).toBeVisible();

  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(quest).toHaveAccessibleName(/complete$/);
});

test('a running program shows the plan when logging the run', async ({ page }) => {
  await setUp(page, '2026-11-03'); // a Tuesday: the 5K plan's first run day
  await startProgram(page, 'Run a 5K'); // always 3 runs a week
  await expect(page.getByText('Program started: 9 weeks')).toBeVisible();
  await page.getByRole('button', { name: 'Start week 1 · run 1' }).click();
  await expect(page.getByText(/^Today's plan: \d+ × run \d+:\d\d \/ walk \d+:\d\d/)).toBeVisible();
  await page.getByLabel('Distance (km)').fill('3');
  await page.getByRole('button', { name: 'Save run' }).click();
  await expect(page.getByText('Done. Nice work!')).toBeVisible();
});
