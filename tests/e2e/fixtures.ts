// Every spec imports test and expect from here, never from @playwright/test.
//
// Helpers a test asks for: seedSheet, seedPacks, savedSheet, open5e, plus answerConfirm, switchMode
// and loadSheet. Guards every test gets without asking: noInternet, fixedDice and noPageErrors.
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Sheet = Record<string, unknown>;
// A custom content pack entry, as the Library stores it: { kind, name, level, sub, desc, src, traits? }.
export type Pack = Record<string, unknown>;

// The Library's view of the Open5e API: the URLs it fetched, and a switch that makes one resource
// (spells, feats, species, classes, items, magicitems) answer with an HTTP error until it's healed.
export type Open5e = {
  requests: string[];
  fail: (resource: string, status?: number) => void;
  heal: (resource: string) => void;
};

type Fixtures = {
  seedSheet: (sheet: Sheet) => Promise<void>;
  seedPacks: (packs: Pack[]) => Promise<void>;
  savedSheet: () => Promise<Sheet | null>;
  open5e: Open5e;
  dice: number[];
  noInternet: void;
  fixedDice: void;
  noPageErrors: void;
};

/** A character from tests/e2e/data/sheets/<name>.json. */
export function loadSheet(name: string): Sheet {
  return JSON.parse(readFileSync(new URL(`./data/sheets/${name}.json`, import.meta.url), 'utf8'));
}

/**
 * Playwright cancels dialogs nobody handles, so a test that clicks something with a confirm() calls
 * this first. It resolves to the dialog's message, so the test can check what was asked.
 */
export function answerConfirm(page: Page, answer: 'accept' | 'cancel'): Promise<string> {
  return new Promise(resolve => {
    page.once('dialog', async dialog => {
      resolve(dialog.message());
      await (answer === 'accept' ? dialog.accept() : dialog.dismiss());
    });
  });
}

/** Switches the sheet to Play or Edit, and waits until it has: Edit is the mode with the Name field. */
export async function switchMode(page: Page, mode: 'Play' | 'Edit') {
  await page.getByRole('button', { name: mode, exact: true }).click();
  const nameField = page.getByLabel('Name', { exact: true });
  await (mode === 'Edit' ? expect(nameField).toBeVisible() : expect(nameField).toBeHidden());
}

function mustBeBeforeGoto(page: Page, helper: string) {
  if (page.url() !== 'about:blank') throw new Error(`Call ${helper}() before page.goto().`);
}

// URLs a test made fail on purpose with open5e.fail(). The browser logs "Failed to load resource" for
// each one, and noPageErrors lets that through for these URLs only.
const failedOnPurpose = new WeakMap<Page, Set<string>>();

function markFailedOnPurpose(page: Page, url: string) {
  const urls = failedOnPurpose.get(page) ?? new Set<string>();
  urls.add(url);
  failedOnPurpose.set(page, urls);
}

// The saved response for an Open5e URL. Items come in two pages: items-1.json links to items-2.json.
function savedResponseFile(url: URL): string {
  const resource = url.pathname.split('/')[2];
  const fileName = resource === 'items' ? `items-${url.searchParams.get('page') ?? '1'}.json` : `${resource}.json`;
  return fileURLToPath(new URL(`./data/open5e/${fileName}`, import.meta.url));
}

// Math.random as the app sees it in tests: the values a test asked for first, then a seeded sequence
// (the mulberry32 generator), so every run rolls the same numbers. It runs inside the page.
function seededMathRandom(firstValues: number[]) {
  let state = 20240101;
  Math.random = () => {
    if (firstValues.length) return firstValues.shift()!;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const isRandomValue = (value: number) => value >= 0 && value < 1;

export const test = base.extend<Fixtures>({
  // Puts a character in the browser before the page opens. Only the first load is seeded, so a reload
  // shows what the app saved, not the seed again.
  seedSheet: async ({ page }, use) => {
    await use(async sheet => {
      mustBeBeforeGoto(page, 'seedSheet');
      await page.addInitScript(sheetJson => {
        if (sessionStorage.getItem('e2e-seeded')) return;
        localStorage.setItem('sheet', sheetJson);
        sessionStorage.setItem('e2e-seeded', '1');
      }, JSON.stringify(sheet));
    });
  },

  // Puts custom packs in the Library store, as the app stores imported ones (IndexedDB "dnd-sheet",
  // key "packs"). They're written while the database is first created, and the app's own open waits
  // for that, so the app never sees it empty. Later loads find the database there and leave it alone,
  // which is why it's called once per test, with every pack.
  seedPacks: async ({ page }, use) => {
    let seeded = false;
    await use(async packs => {
      mustBeBeforeGoto(page, 'seedPacks');
      if (seeded) throw new Error('Call seedPacks() once, with every pack.');
      seeded = true;
      await page.addInitScript(packList => {
        const request = indexedDB.open('dnd-sheet', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv').put(packList, 'packs');
        // Closed, so the app opening a later version of the database isn't blocked.
        request.onsuccess = () => request.result.close();
        // Reported by noPageErrors.
        request.onerror = () => console.error('seedPacks failed:', request.error);
      }, packs);
    });
  },

  // The character the app has saved, for expect.poll(savedSheet).
  savedSheet: async ({ page }, use) => {
    await use(() => page.evaluate(() => JSON.parse(localStorage.getItem('sheet') ?? 'null')));
  },

  // Answers https://api.open5e.com/v2/... from tests/e2e/data/open5e/. A page route wins over
  // noInternet's context route, so anything else, the API over plain http included, still fails.
  open5e: async ({ page }, use) => {
    const requests: string[] = [];
    const failingStatus = new Map<string, number>();
    const headers = { 'access-control-allow-origin': '*' };
    await page.route('https://api.open5e.com/v2/**', route => {
      const url = new URL(route.request().url());
      const resource = url.pathname.split('/')[2];
      requests.push(url.href);
      if (!failingStatus.has(resource)) return route.fulfill({ headers, path: savedResponseFile(url) });
      markFailedOnPurpose(page, url.href);
      return route.fulfill({ status: failingStatus.get(resource), headers, body: '' });
    });
    await use({
      requests,
      fail: (resource, status = 500) => failingStatus.set(resource, status),
      heal: resource => failingStatus.delete(resource),
    });
  },

  // The first dice values for a test that needs a particular roll: test.use({ dice: [0.99] }). 0.99 rolls
  // the highest face of any die up to a d100 (a natural 20 on a d20), 0 the lowest. Every page load,
  // a reload too, starts again from the first value.
  dice: [[], { option: true }],

  // Nothing leaves the machine: Google Fonts gets an empty stylesheet, and any other outside request
  // is blocked and fails the test.
  noInternet: [
    async ({ context, baseURL }, use) => {
      const appOrigin = new URL(baseURL!).origin;
      const blocked: string[] = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === appOrigin) return route.continue();
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
    async ({ page, dice }, use) => {
      if (!dice.every(isRandomValue)) {
        throw new Error('dice values must be at least 0 and below 1, as Math.random returns.');
      }
      await page.addInitScript(seededMathRandom, dice);
      await use();
    },
    { auto: true },
  ],

  // Any uncaught error or console error fails the test, in every tab, including ones the test opens
  // later. Tabs are numbered in the order they open, so "tab 2" is the first extra tab.
  noPageErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      let tabCount = 0;
      const watch = (page: Page) => {
        const tab = `tab ${++tabCount}`;
        page.on('pageerror', error => errors.push(`${tab} (${page.url()}): ${error.message}`));
        page.on('console', message => {
          if (message.type() !== 'error') return;
          if (failedOnPurpose.get(page)?.has(message.location().url)) return;
          errors.push(`${tab} (${page.url()}): ${message.text()}`);
        });
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
