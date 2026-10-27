import { expect, test, type Page } from '@playwright/test';

async function setUpProfile(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
  await page.getByRole('button', { name: 'Food', exact: true }).click(); // the app opens on Quests
  await expect(page.getByText('Calories remaining')).toBeVisible();
}

async function addExercise(page: Page, name: string, sets: [string, string][]) {
  const sheet = page.getByRole('dialog', { name: 'Log a workout' });
  await sheet.getByRole('button', { name: '+ Add an exercise' }).click();
  const picker = page.getByRole('dialog', { name: 'Add an exercise' });
  await picker.getByLabel('Search exercises').fill(name);
  await picker.getByRole('button', { name: `Add “${name}” as your own exercise` }).click();
  for (const [i, [reps, kg]] of sets.entries()) {
    if (i > 0) {
      await sheet.getByRole('group', { name }).getByRole('button', { name: '+ Set' }).click();
    }
    await sheet.getByLabel(`${name} set ${i + 1} reps`).fill(reps);
    await sheet.getByLabel(`${name} set ${i + 1} kg`).fill(kg);
  }
}

test('log a 3-exercise workout, then repeat an exercise with last time’s sets', async ({
  page,
}) => {
  await setUpProfile(page);
  await page.getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Log workout' }).click();
  await addExercise(page, 'Squat', [
    ['5', '100'],
    ['5', '105'],
  ]);
  await addExercise(page, 'Bench Press', [['8', '60']]);
  await addExercise(page, 'Row', [['10', '50']]);
  await page.getByRole('button', { name: 'Save workout' }).click();

  const item = page.locator('.workout', { hasText: 'Squat, Bench Press, Row' });
  await expect(item).toBeVisible();
  await expect(item).toContainText('Squat 2× 105 kg');

  await page.getByRole('button', { name: 'Log workout' }).click();
  await page.getByRole('button', { name: '+ Squat' }).click();
  await expect(page.getByLabel('Squat set 2 kg')).toHaveValue('105');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.locator('.workout')).toHaveCount(2);
});

test('log a run with a pace', async ({ page }) => {
  await setUpProfile(page);
  await page.getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Log run' }).click();
  await page.getByLabel('Distance (km)').fill('5');
  await page.getByLabel('Time (optional)').fill('27:30');
  await expect(page.getByText('Pace 5:30 /km')).toBeVisible();
  await page.getByRole('button', { name: 'Save run' }).click();
  await expect(page.locator('.workout', { hasText: '5 km run' })).toContainText('5:30 /km');
});

test('logging food completes a daily quest and earns XP', async ({ page }) => {
  await setUpProfile(page);
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.getByText('Level', { exact: true })).toBeVisible();
  const meals = page.getByRole('listitem', { name: /^Log 2 meals/ });
  await expect(meals).toContainText('0 / 2 meals');
  // the profile's weigh-in: 5 XP, and it completes today's "Step on the scale" quest: 10 XP
  await expect(page.getByText('15 / 100 XP to level 2')).toBeVisible();

  await page.getByRole('button', { name: 'Food' }).click();
  for (const kcal of ['400', '600']) {
    await page.getByRole('button', { name: '+ kcal' }).click();
    await page.getByLabel('Calories (kcal)').fill(kcal);
    await page.getByRole('button', { name: 'Log it' }).click();
  }
  await expect(page.getByText('Quest complete: Log 2 meals +20 XP')).toBeVisible();

  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(meals).toHaveAccessibleName(/complete/);
  // + 2 entries x 2 XP + 20 quest XP
  await expect(page.getByText('39 / 100 XP to level 2')).toBeVisible();
  await expect(page.getByLabel('1-day streak')).toBeVisible();
});
