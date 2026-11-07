import { expect, test, type Page } from '@playwright/test';

// the stand-in second scene below is served through page.route, which a service worker would bypass
test.use({ serviceWorkers: 'block' });

async function setUp(page: Page) {
  await page.goto('./');
  await page.getByLabel('Birth year').fill('1995');
  await page.getByLabel('Height (cm)').fill('180');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Start the adventure' }).click();
}

/** Workout notes with one workout on each of the `n` days before today (20 XP each, one a day). */
function notes(n: number): string {
  const lines: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    lines.push(`${d.getDate()}/${d.getMonth() + 1} Push`, 'Bench press 60x8, 60x8', '');
  }
  return lines.join('\n');
}

async function importWorkouts(page: Page, n: number) {
  await page.getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Import from notes' }).click();
  await page.getByLabel('Workout notes').fill(notes(n));
  await page.getByRole('button', { name: `Import ${n} workouts` }).click();
  // (a level-up announcement can take the place of the "Imported" note, so wait for the sheet to close)
  await expect(page.getByLabel('Workout notes')).toBeHidden();
  await page.getByRole('button', { name: /^Quests/ }).click();
}

/** A second scene: the station again under another id, until the owner's next scene arrives. */
async function standInWorld(page: Page) {
  await page.route('**/scenes/world.json', (route) =>
    route.fulfill({ json: { v: 1, scenes: ['station', 'station-b'] } }),
  );
  await page.route('**/scenes/station-b/**', async (route) => {
    const url = route.request().url().replace('/scenes/station-b/', '/scenes/station/');
    const response = await route.fetch({ url });
    if (!url.endsWith('scene.json')) return route.fulfill({ response });
    const json = await response.json();
    return route.fulfill({ response, json: { ...json, id: 'station-b', name: 'Station B' } });
  });
}

test('the scene shows the character on the Quests screen, and a new choice persists', async ({
  page,
}) => {
  await setUp(page);
  const frame = page.locator('.scene-frame');
  await expect(frame).toHaveAttribute('data-state', 'ready');
  await expect(frame).toHaveAttribute('data-scene', 'station');
  await expect(frame).toHaveAttribute('data-stop', '0');
  await expect(frame).toHaveAttribute('data-character', 'jacket');
  await expect(page.getByText('Forest station, stop 1 of 5')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Ring the bell' })).toBeAttached();

  await page.getByRole('button', { name: 'Change character' }).click();
  await page.getByRole('button', { name: 'Hoodie' }).click();
  await expect(frame).toHaveAttribute('data-character', 'hoodie');

  await page.reload();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-character', 'hoodie');
  await page.getByRole('button', { name: 'Change character' }).click();
  await expect(page.getByRole('button', { name: 'Hoodie' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a level-up walks the character to the next stop', async ({ page }) => {
  await setUp(page);
  const frame = page.locator('.scene-frame');
  await expect(frame).toHaveAttribute('data-stop', '0');
  // 5 workouts = 100 XP (+5 for the first weigh-in): level 2
  await importWorkouts(page, 5);
  await expect(frame).toHaveAttribute('data-level', '2');
  await expect(frame).toHaveAttribute('data-stop', '1');
  await expect(page.getByText('Forest station, stop 2 of 5')).toBeAttached();
});

test('the level after a scene ends opens the next scene', async ({ page }) => {
  await standInWorld(page);
  await setUp(page);
  const frame = page.locator('.scene-frame');
  await expect(frame).toHaveAttribute('data-scene', 'station');
  // 50 workouts = 1000 XP: levels 1-5 cost 100 + 150 + 200 + 250 + 300, so this is level 6
  await importWorkouts(page, 50);
  await expect(frame).toHaveAttribute('data-level', '6');
  await expect(frame).toHaveAttribute('data-scene', 'station-b');
  await expect(frame).toHaveAttribute('data-stop', '0');
  await expect(page.getByText('Station B, stop 1 of 5')).toBeAttached();
});

test('a scene already reached can be picked again, and following the level comes back', async ({
  page,
}) => {
  await standInWorld(page);
  await setUp(page);
  await importWorkouts(page, 50); // level 6: the second scene
  const frame = page.locator('.scene-frame');
  await expect(frame).toHaveAttribute('data-scene', 'station-b');

  await page.getByRole('button', { name: 'Scenes' }).click();
  await expect(page.getByRole('button', { name: /^Station B Levels/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /^Forest station Levels/ }).click();
  // a finished scene shows with the character at its last stop
  await expect(frame).toHaveAttribute('data-scene', 'station');
  await expect(frame).toHaveAttribute('data-stop', '4');

  await page.reload();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-scene', 'station');
  await page.getByRole('button', { name: 'Back to level 6' }).click();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-scene', 'station-b');
  await expect(page.getByRole('button', { name: 'Back to level 6' })).toHaveCount(0);
});

test('parallax can be turned off, and stays off', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Scenes' }).click();
  const box = page.getByRole('checkbox', { name: /Move the scene when I tilt/ });
  await expect(box).toBeChecked();
  await box.uncheck();
  // the scene reads the stored setting back: wait for the save before reloading
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-parallax', 'false');
  await page.reload();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-parallax', 'false');
  await page.getByRole('button', { name: 'Scenes' }).click();
  await expect(
    page.getByRole('checkbox', { name: /Move the scene when I tilt/ }),
  ).not.toBeChecked();
});

test('the sky follows the clock and the weather follows the date', async ({ page }) => {
  // 6 November 2026 is a rainy day (core/sky.ts), and 9 pm is night
  await page.clock.setFixedTime(new Date(2026, 10, 6, 21, 0));
  await setUp(page);
  const frame = page.locator('.scene-frame');
  await expect(frame).toHaveAttribute('data-state', 'ready');
  await expect(frame).toHaveAttribute('data-sky', 'night');
  await expect(frame).toHaveAttribute('data-weather', 'rain');

  // the next morning is dry
  await page.clock.setFixedTime(new Date(2026, 10, 7, 10, 0));
  await page.reload();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-sky', 'day');
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-weather', 'clear');
});

test('a stop already reached can be picked, and stays picked until following the level again', async ({
  page,
}) => {
  await setUp(page);
  // 13 workouts = 260 XP (+5 for the first weigh-in): level 3, the third stop
  await importWorkouts(page, 13);
  const frame = page.locator('.scene-frame');
  await expect(frame).toHaveAttribute('data-level', '3');
  await expect(frame).toHaveAttribute('data-stop', '2');

  await page.getByRole('button', { name: 'Scenes' }).click();
  await expect(page.getByRole('button', { name: 'Forest station, stop 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Forest station, stop 4, not reached yet' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Forest station, stop 1' }).click();
  await expect(frame).toHaveAttribute('data-stop', '0');

  await page.reload();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-stop', '0');
  await page.getByRole('button', { name: 'Back to level 3' }).click();
  await expect(page.locator('.scene-frame')).toHaveAttribute('data-stop', '2');
  await expect(page.getByRole('button', { name: 'Back to level 3' })).toHaveCount(0);
});
