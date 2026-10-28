// Every spec imports test and expect from here. On top of Playwright's own, this adds:
//   seedSheet(sheet)  put a character in the browser before the page opens
//   savedSheet()      read the character the app has saved (for expect.poll)
//   answerConfirm()   accept or cancel the next confirm() dialog, and get its message
//   switchMode()      switch the sheet to Play or Edit, and wait until it has
// and, in every test without asking, three guards:
//   - nothing leaves the machine: Google Fonts gets an empty stylesheet, and any other outside
//     request (the Open5e API, until a spec mocks it) is blocked and fails the test
//   - the dice are fixed: Math.random follows the same sequence in every run
//   - any uncaught error or console error, in any tab the test opens, fails the test
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export type Sheet = Record<string, unknown>;

// A character from tests/e2e/data/sheets/<name>.json.
export const loadSheet = (name: string): Sheet =>
  JSON.parse(readFileSync(new URL(`./data/sheets/${name}.json`, import.meta.url), 'utf8'));

// Playwright cancels dialogs nobody handles, so a test that clicks something with a confirm()
// calls this first. It resolves to the dialog's message, so the test can check what was asked.
export const answerConfirm = (page: Page, answer: 'accept' | 'cancel') =>
  new Promise<string>(resolve => {
    page.once('dialog', async dialog => {
      resolve(dialog.message());
      await (answer === 'accept' ? dialog.accept() : dialog.dismiss());
    });
  });

// Edit mode is the one with the Name field, so the switch is confirmed before the test goes on.
export async function switchMode(page: Page, mode: 'Play' | 'Edit') {
  await page.getByRole('button', { name: mode, exact: true }).click();
  const name = page.getByLabel('Name', { exact: true });
  await (mode === 'Edit' ? expect(name).toBeVisible() : expect(name).toBeHidden());
}

type Fixtures = {
  seedSheet: (sheet: Sheet) => Promise<void>;
  savedSheet: () => Promise<Sheet | null>;
  noInternet: void;
  fixedDice: void;
  noPageErrors: void;
};

export const test = base.extend<Fixtures>({
  // Seeds only the first load, so a reload shows what the app saved, not the seed again.
  seedSheet: async ({ page }, use) => {
    await use(async sheet => {
      if (page.url() !== 'about:blank') throw new Error('Call seedSheet() before page.goto().');
      await page.addInitScript(json => {
        if (sessionStorage.getItem('e2e-seeded')) return;
        localStorage.setItem('sheet', json);
        sessionStorage.setItem('e2e-seeded', '1');
      }, JSON.stringify(sheet));
    });
  },

  savedSheet: async ({ page }, use) => {
    await use(() => page.evaluate(() => JSON.parse(localStorage.getItem('sheet') ?? 'null')));
  },

  noInternet: [
    async ({ context, baseURL }, use) => {
      const local = new URL(baseURL!).origin;
      const blocked: string[] = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === local) return route.continue();
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
        blocked.push(url.href);
        return route.abort('blockedbyclient');
      });
      await use();
      expect(blocked, 'requests to the internet (mock them in the spec)').toEqual([]);
    },
    { auto: true },
  ],

  fixedDice: [
    async ({ page }, use) => {
      // mulberry32: a small seeded random number generator, so every run rolls the same numbers.
      await page.addInitScript(() => {
        let seed = 20240101;
        Math.random = () => {
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      });
      await use();
    },
    { auto: true },
  ],

  noPageErrors: [
    // Watches every tab in the context, including ones a test opens later with context.newPage().
    // Tabs are numbered in the order they open, so "tab 2" is the first extra tab.
    async ({ context }, use) => {
      const errors: string[] = [];
      let tabs = 0;
      const watch = (page: Page) => {
        const tab = `tab ${++tabs}`;
        page.on('pageerror', e => errors.push(`${tab} (${page.url()}): ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`${tab} (${page.url()}): ${m.text()}`); });
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await use();
      expect(errors, 'errors on any tab').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
