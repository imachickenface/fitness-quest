import { expect, test, type Page } from '@playwright/test';

async function setUp(page: Page, day: string) {
  await page.clock.setFixedTime(new Date(`${day}T09:00:00`));
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await page.getByRole('button', { name: 'Train' }).click();
}

test('an effort from the chart sets the next weight, and today shows what it burned', async ({
  page,
}) => {
  await setUp(page, '2026-11-02');
  await page.getByRole('button', { name: 'Start chest & back' }).click();
  await expect(page.getByText(/^Aim for RPE 8\.5 · RIR 1-2/)).toBeVisible();
  await page.getByLabel('Bench press set 1 reps').fill('5');
  await page.getByLabel('Bench press set 1 kg').fill('100');
  await page
    .getByLabel('Bench press: how hard was it?')
    .selectOption({ label: 'RPE 6-7 · RIR 3-4 · Challenging' });
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.locator('.workout-detail').first()).toContainText(
    'Bench press 1× 100 kg @ RPE 6-7',
  );

  // the split moved on; pick chest & back again
  await expect(page.getByRole('region', { name: 'Shoulders & arms' })).toBeVisible();
  await page.getByRole('button', { name: 'Change' }).click();
  const sheet = page.getByRole('dialog', { name: "Pick today's workout" });
  await expect(sheet).toContainText('Shoulders & arms (next in the split)');
  await sheet
    .getByRole('listitem')
    .filter({ hasText: 'Chest & back' })
    .getByRole('button', { name: 'Do it today' })
    .click();
  await page.getByRole('button', { name: 'Start chest & back' }).click();
  // 100 x 5 at RIR 3-4 (75%) -> e1RM 133.3; 5 reps at RPE 8.5 (80%) -> 106.7 -> 107.5
  await expect(page.getByLabel('Bench press set 1 kg')).toHaveValue('107.5');
  await expect(page.getByLabel('Bench press set 1 reps')).toHaveValue('5');
  await page.getByRole('button', { name: 'Close' }).click();

  // 1 set = 3 min of lifting at 3.5 MET for 80 kg: 2.5 x 80 x 0.05 = 10 kcal
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  const burn = page.getByRole('region', { name: 'Burned by exercise' });
  await expect(burn).toContainText('about 10 kcal');
  await expect(burn).toContainText('Chest & back');
});

test('picking another session swaps the days in the calendar', async ({ page }) => {
  await setUp(page, '2026-11-02'); // a Monday
  await page.getByRole('button', { name: 'Follow a program built from your goal' }).click();
  await page.getByLabel('Goal').selectOption({ label: 'Build muscle' });
  await page.getByRole('radio', { name: '3' }).check();
  await page.getByRole('button', { name: 'Start program' }).click();
  await expect(page.getByRole('region', { name: /^Today: Chest & back/ })).toBeVisible();

  await page.getByRole('button', { name: 'Change' }).click();
  const sheet = page.getByRole('dialog', { name: 'This week' });
  const later = sheet
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Do it today' }) })
    .first();
  const title = (await later.locator('b').innerText()).split(': ')[1]!;
  await later.getByRole('button', { name: 'Do it today' }).click();
  await expect(page.getByText(`${title} moved to today`)).toBeVisible();

  const card = page.getByRole('region', { name: `Today: ${title}` });
  await expect(card).toBeVisible();
  const week = page.getByRole('list', { name: 'This week' });
  await expect(week.getByLabel(`Today: ${title}, planned`)).toBeVisible();
  await expect(week.getByLabel(/Chest & back, planned/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Train' }).click();
  await expect(page.getByRole('region', { name: `Today: ${title}` })).toBeVisible();
});
