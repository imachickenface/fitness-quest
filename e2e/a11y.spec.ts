import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** WCAG 2.2 A and AA, the level most accessibility laws ask for. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Scan what is on screen now; fail with each problem's rule, help text and where it is. */
async function scan(page: Page, screen: string) {
  // let sheets finish sliding in, so colours are measured at full opacity
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} (${v.impact}): ${v.help} at ${n.target.join(' ')}`),
  );
  expect.soft(problems, `accessibility problems on ${screen}`).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('every main screen and sheet passes the WCAG 2.2 AA checks', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
      await page.goto('./');
      await scan(page, 'the welcome form');

      await page.getByLabel('Birth year').fill('1995');
      await page.getByLabel('Height (cm)').fill('180');
      await page.getByLabel('Weight (kg)').fill('80');
      await page.getByRole('button', { name: 'Start the adventure' }).click();
      await scan(page, 'Quests');

      await page.getByRole('button', { name: 'Food', exact: true }).click();
      await scan(page, 'Food');
      await page.getByRole('button', { name: 'Search food' }).click();
      await scan(page, 'the food search');
      await page.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Train' }).click();
      await scan(page, 'Train');
      await page.getByRole('button', { name: 'Start chest & back' }).click();
      await page.getByLabel('Bench press set 1 reps').fill('5');
      await page.getByLabel('Bench press set 1 kg').fill('100');
      await page
        .getByLabel('Bench press: how hard was it?')
        .selectOption({ label: 'RPE 6-7 · RIR 3-4 · Challenging' });
      await scan(page, 'the workout form');
      await page.getByRole('button', { name: 'Show the chart' }).click();
      await scan(page, 'the effort chart');
      await page
        .getByRole('dialog', { name: 'Effort chart' })
        .getByRole('button', { name: 'Close' })
        .click();
      await page.getByRole('button', { name: 'Save workout' }).click();
      await page.getByRole('button', { name: 'Change' }).click();
      await scan(page, "the split's day picker");
      await page.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Follow a program built from your goal' }).click();
      await scan(page, 'the program form');
      await page.getByLabel('Goal').selectOption({ label: 'Build muscle' });
      await page.getByRole('button', { name: 'Start program' }).click();
      await scan(page, 'Train with a program');
      await page.getByRole('button', { name: 'Change' }).click();
      await scan(page, 'the week sheet');
      await page.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Friends' }).click();
      await scan(page, 'Friends, signed out');
    });
  });
}
