import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // the 3D hero renders in software in headless browsers: more workers starve each other
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}/fitness-quest/`,
    trace: 'retain-on-failure',
  },
  // phone first: the owner uses an Android phone
  projects: [{ name: 'pixel-7', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/fitness-quest/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
