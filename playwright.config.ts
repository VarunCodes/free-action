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
  // GitHub's ubuntu-latest runner has 4 CPU cores; Playwright's default would use only 2 of them.
  // Locally, keep the default (half of this machine's cores).
  workers: CI ? 4 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  // The rules specs check the app's arithmetic, which doesn't change between browsers, so they run
  // in Chromium only. Everything that can differ by browser or screen (loading, storage, downloads,
  // file pickers, dialogs, layout) runs in all three.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: '**/rules/**' },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: '**/rules/**' },
  ],
  webServer: {
    command: CI ? 'npm run serve' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !CI,
  },
});
