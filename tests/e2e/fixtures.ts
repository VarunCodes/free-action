// Every spec imports test and expect from here. On top of Playwright's own, this adds:
//   seedSheet(sheet)  put a character in the browser before the page opens
//   seedPacks(packs)  put custom content packs (species, feats…) in the browser's Library store
//   open5e            answer the Open5e API with saved responses; see what was asked, or make a part fail
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
import { fileURLToPath } from 'node:url';

export type Sheet = Record<string, unknown>;
// A custom content pack entry, as the Library stores it: { kind, name, level, sub, desc, src, traits? }.
export type Pack = Record<string, unknown>;

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

// The Library's view of the Open5e API: the URLs it fetched, and a switch to make one resource
// (spells, feats, species, classes, items, magicitems) answer with an HTTP error until healed.
export type Open5e = { requests: string[]; fail: (resource: string, status?: number) => void; heal: (resource: string) => void };

// Edit mode is the one with the Name field, so the switch is confirmed before the test goes on.
export async function switchMode(page: Page, mode: 'Play' | 'Edit') {
  await page.getByRole('button', { name: mode, exact: true }).click();
  const name = page.getByLabel('Name', { exact: true });
  await (mode === 'Edit' ? expect(name).toBeVisible() : expect(name).toBeHidden());
}

// URLs a test made fail on purpose (open5e.fail). The browser logs "Failed to load resource" for each,
// which noPageErrors lets through for these URLs only.
const failedOnPurpose = new WeakMap<Page, Set<string>>();

type Fixtures = {
  seedSheet: (sheet: Sheet) => Promise<void>;
  seedPacks: (packs: Pack[]) => Promise<void>;
  open5e: Open5e;
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

  // Packs are stored as the app stores imported ones (IndexedDB dnd-sheet, key "packs"). They're written
  // while the database is first created, and the app's own open waits for that, so the app never sees
  // it empty. Later loads find the database already there and leave it alone. Call it once per test, with
  // every pack: a second call would never run, since the database exists by then.
  seedPacks: async ({ page }, use) => {
    let seeded = false;
    await use(async packs => {
      if (page.url() !== 'about:blank') throw new Error('Call seedPacks() before page.goto().');
      if (seeded) throw new Error('Call seedPacks() once, with every pack.');
      seeded = true;
      await page.addInitScript(list => {
        const r = indexedDB.open('dnd-sheet', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv').put(list, 'packs');
        r.onsuccess = () => r.result.close(); // so a later version of the app's database isn't blocked
        r.onerror = () => console.error('seedPacks failed:', r.error); // reported by noPageErrors
      }, packs);
    });
  },

  // Answers https://api.open5e.com/v2/... from tests/e2e/data/open5e/<resource>.json (items come in two
  // pages: items-1.json links to items-2.json). A page route wins over noInternet's context route, so
  // anything else still fails the test, including the API over plain http.
  open5e: async ({ page }, use) => {
    const requests: string[] = [];
    const failing = new Map<string, number>();
    await page.route('https://api.open5e.com/v2/**', route => {
      const url = new URL(route.request().url());
      const resource = url.pathname.split('/')[2];
      requests.push(url.href);
      const headers = { 'access-control-allow-origin': '*' };
      if (failing.has(resource)) {
        if (!failedOnPurpose.has(page)) failedOnPurpose.set(page, new Set());
        failedOnPurpose.get(page)!.add(url.href);
        return route.fulfill({ status: failing.get(resource), headers, body: '' });
      }
      const file = resource === 'items' ? `items-${url.searchParams.get('page') ?? '1'}.json` : `${resource}.json`;
      return route.fulfill({ headers, path: fileURLToPath(new URL(`./data/open5e/${file}`, import.meta.url)) });
    });
    await use({ requests, fail: (r, status = 500) => failing.set(r, status), heal: r => failing.delete(r) });
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
        page.on('console', m => {
          if (m.type() !== 'error' || failedOnPurpose.get(page)?.has(m.location().url)) return;
          errors.push(`${tab} (${page.url()}): ${m.text()}`);
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
