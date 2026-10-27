import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

/** Test user A of the fitness-quest-test project, from .env.test.local (skipped without it). */
function testUser(): { email: string; password: string } | null {
  try {
    const env = Object.fromEntries(
      readFileSync('.env.test.local', 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    );
    const email = env.SUPABASE_TEST_USER_A_EMAIL;
    const password = env.SUPABASE_TEST_USER_A_PASSWORD;
    return email && password && password !== 'replace-me' ? { email, password } : null;
  } catch {
    return null;
  }
}

const user = testUser();
test.skip(!user, 'needs .env.test.local with the test users');

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.goto('./');
  return page;
}

async function signIn(page: Page) {
  const form = page.getByRole('form', { name: 'Test sign-in' });
  await form.getByLabel('Test email').fill(user!.email);
  await form.getByLabel('Test password').fill(user!.password);
  await form.getByRole('button', { name: 'Test sign-in' }).click();
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/^Synced (just now|\d+ min ago)\.$/)).toBeVisible({
    timeout: 20_000,
  });
}

test('sign in on two phones: data moves between them, deletes too', async ({ browser }) => {
  test.setTimeout(120_000);

  // Phone 1: set up, add a food, sign in; this phone's data becomes the account's
  const one = await newPhone(browser);
  await one.getByLabel('Birth year').fill('1990');
  await one.getByLabel('Height (cm)').fill('175');
  await one.getByLabel('Weight (kg)').fill('70');
  await one.getByRole('button', { name: 'Start the adventure' }).click();
  await one.getByRole('button', { name: 'Food', exact: true }).click();
  await one.getByRole('button', { name: '+ kcal' }).click();
  await one.getByLabel('Calories (kcal)').fill('431');
  await one.getByRole('button', { name: 'Log it' }).click();
  await one.getByRole('button', { name: 'Profile and targets' }).click();
  await signIn(one);
  // the account may hold data from earlier runs: replace it with this phone's
  const choose = one.getByRole('dialog', { name: 'This phone and your account both have data' });
  const synced = one.getByText(/^Synced just now\.$/);
  await expect(choose.or(synced)).toBeVisible({ timeout: 20_000 });
  if (await choose.isVisible())
    await choose.getByRole('button', { name: "Use this phone's data" }).click();
  await expect(synced).toBeVisible({ timeout: 20_000 });

  // Phone 2: a new phone signs in on the welcome screen and gets everything
  const two = await newPhone(browser);
  await signIn(two);
  await two.getByRole('button', { name: 'Food', exact: true }).click({ timeout: 20_000 });
  await expect(two.locator('.entry', { hasText: '431' })).toBeVisible();

  // delete on phone 2, and phone 1 loses it too
  await two
    .locator('.entry', { hasText: '431' })
    .getByRole('button', { name: /^Remove / })
    .click();
  await two.getByRole('button', { name: 'Profile and targets' }).click();
  await syncNow(two);
  await syncNow(one);
  await one.getByRole('button', { name: 'Close' }).click();
  await expect(one.locator('.entry', { hasText: '431' })).toHaveCount(0);
});
