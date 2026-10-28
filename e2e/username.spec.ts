import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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

test('a new account must pick a unique username before it syncs', async ({ page }) => {
  // the test user already has a name on the server: answer as if it were a brand-new account
  const posts: string[] = [];
  let synced = false;
  await page.route('**/rest/v1/records*', async (route) => {
    synced = true;
    await route.continue();
  });
  await page.route('**/rest/v1/usernames*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: [] });
    posts.push((req.postDataJSON() as { username: string }).username);
    return posts.length === 1
      ? route.fulfill({
          status: 409,
          json: { code: '23505', message: 'duplicate key value violates unique constraint' },
        })
      : route.fulfill({ status: 201, body: '' });
  });

  await page.goto('./');
  const form = page.getByRole('form', { name: 'Test sign-in' });
  await form.getByLabel('Test email').fill(user!.email);
  await form.getByLabel('Test password').fill(user!.password);
  await form.getByRole('button', { name: 'Test sign-in' }).click();

  const sheet = page.getByRole('dialog', { name: 'Pick a username' });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  // it can't be closed without a name: no close button, Escape does nothing
  await expect(sheet.getByRole('button', { name: 'Close' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  expect(synced).toBe(false);

  const name = sheet.getByLabel('Username');
  await name.fill('ab');
  await sheet.getByRole('button', { name: 'Save username' }).click();
  await expect(sheet.getByText('Use at least 3 characters.')).toBeVisible();
  expect(posts).toEqual([]); // checked here first, nothing sent

  await name.fill('Taken_Name');
  await sheet.getByRole('button', { name: 'Save username' }).click();
  await expect(sheet.getByText('That username is taken. Try another.')).toBeVisible();

  await name.fill('Quest_Hero');
  await sheet.getByRole('button', { name: 'Save username' }).click();
  await expect(sheet).toHaveCount(0);
  expect(posts).toEqual(['Taken_Name', 'Quest_Hero']);
  await expect(page.getByText(/Signed in as Quest_Hero/).first()).toBeVisible();
  await expect.poll(() => synced, { timeout: 20_000 }).toBe(true);
});
