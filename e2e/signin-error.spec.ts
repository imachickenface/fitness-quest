import { expect, test } from '@playwright/test';

test('a failed Google sign-in says why instead of doing nothing', async ({ page }) => {
  await page.goto(
    './?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code%3A+4%2F0Axyz',
  );
  await expect(page.getByText("Couldn't sign in: Unable to exchange external code")).toBeVisible();
  // the error is dropped from the address bar, so a reload starts clean
  await expect(page).not.toHaveURL(/error/);
  await page.reload();
  await expect(page.getByText("Couldn't sign in")).toHaveCount(0);
});
