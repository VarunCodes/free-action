// Every spec imports test and expect from here. On top of Playwright's own, this adds:
//   seedSheet(sheet)  put a character in the browser before the page opens
//   savedSheet()      read the character the app has saved (for expect.poll)
// and, in every test without asking, three guards:
//   - nothing leaves the machine: Google Fonts gets an empty stylesheet, and any other outside
//     request (the Open5e API, until a spec mocks it) is blocked and fails the test
//   - the dice are fixed: Math.random follows the same sequence in every run
//   - any uncaught error or console error on the page fails the test
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export type Sheet = Record<string, unknown>;

// A character from tests/e2e/data/sheets/<name>.json.
export const loadSheet = (name: string): Sheet =>
  JSON.parse(readFileSync(new URL(`./data/sheets/${name}.json`, import.meta.url), 'utf8'));

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
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await use();
      expect(errors, 'errors on the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
