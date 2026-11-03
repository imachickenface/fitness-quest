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

test('logging food completes a daily quest; its XP waits for the Claim button', async ({
  page,
}) => {
  await setUpProfile(page);
  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.getByText('Level', { exact: true })).toBeVisible();
  const meals = page.getByRole('listitem', { name: /^Log 2 meals or snacks/ });
  await expect(meals).toContainText('0 / 2 meals or snacks');
  // the profile's weigh-in: 5 XP; it also completes "Step on the scale", whose 10 XP waits to be claimed
  await expect(page.getByText('5 / 100 XP to level 2')).toBeVisible();
  const scale = page.getByRole('listitem', { name: /^Step on the scale/ });
  await expect(scale).toHaveAccessibleName(/complete, 10 XP to claim/);
  await scale.getByRole('button', { name: /Claim/ }).click();
  await expect(page.getByText('15 / 100 XP to level 2')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Claimed 10 XP' })).toBeAttached();
  await expect(scale.getByRole('button', { name: /Claim/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Food' }).click();
  for (const kcal of ['400', '600']) {
    await page.getByRole('button', { name: '+ kcal' }).click();
    await page.getByLabel('Calories (kcal)').fill(kcal);
    await page.getByRole('button', { name: 'Log it' }).click();
  }
  // the banner at the top: quest name, a filling bar and a chest; tapping it opens Quests
  const banner = page.getByRole('button', { name: /^Quest complete Log 2 meals or snacks/ });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('+20 XP');
  await banner.click();
  await expect(page.getByRole('heading', { name: 'Quests', exact: true })).toBeVisible();
  await expect(banner).toHaveCount(0);

  await expect(meals).toHaveAccessibleName(/complete, 20 XP to claim/);
  // + 2 entries x 2 XP; the quest's 20 XP is not in yet
  await expect(page.getByText('19 / 100 XP to level 2')).toBeVisible();
  await meals.getByRole('button', { name: /Claim/ }).click();
  await expect(page.getByText('39 / 100 XP to level 2')).toBeVisible();
  await expect(page.getByLabel('1-day streak')).toBeVisible();

  // the claim is stored with the quest
  await page.reload();
  await expect(page.getByText('39 / 100 XP to level 2')).toBeVisible();
  await expect(meals).toHaveAccessibleName(/: complete$/);
});

test('with reduced motion, a claim lands at once and the banner just appears', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setUpProfile(page);
  // the weigh-in from the profile finished "Step on the scale"; its banner goes away by itself
  const first = page.getByRole('button', { name: /^Quest complete Step on the scale/ });
  await expect(first).toBeVisible();
  expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expect(first).toHaveCount(0, { timeout: 8000 });
  for (const kcal of ['400', '600']) {
    await page.getByRole('button', { name: '+ kcal' }).click();
    await page.getByLabel('Calories (kcal)').fill(kcal);
    await page.getByRole('button', { name: 'Log it' }).click();
  }
  const banner = page.getByRole('button', { name: /^Quest complete Log 2 meals or snacks/ });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveCount(0, { timeout: 8000 });

  await page.getByRole('button', { name: /^Quests/ }).click();
  await expect(page.getByText('9 / 100 XP to level 2')).toBeVisible();
  await page
    .getByRole('listitem', { name: /^Log 2 meals or snacks/ })
    .getByRole('button', { name: /Claim/ })
    .click();
  await expect(page.getByText('29 / 100 XP to level 2')).toBeVisible();
  await expect(page.locator('.xp-fly')).toHaveCount(0);
});
