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
    // a separate test build against the fitness-quest-test project, in its own folder: the deployed dist/
    // is always a clean live build (see the workflow)
    command: `npx tsc -b && npx vite build --outDir dist-test && npx vite preview --outDir dist-test --port ${port} --strictPort`,
    env: { VITE_SUPABASE_PROJECT: 'test' },
    url: `http://localhost:${port}/fitness-quest/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
