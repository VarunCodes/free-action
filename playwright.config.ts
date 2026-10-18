import { defineConfig, devices } from '@playwright/test';

// CI tests the built site (what GitHub Pages serves). Locally, tests reuse a running `npm run dev`,
// or start one; `CI=1 npx playwright test` tests the build locally too.
const CI = !!process.env.CI;
const baseURL = CI ? 'http://localhost:4173/' : 'http://localhost:5173/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  // No retries: a test that only passes on a second try is a bug to fix, not to hide.
  retries: 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: CI ? 'npm run serve' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !CI,
  },
});
