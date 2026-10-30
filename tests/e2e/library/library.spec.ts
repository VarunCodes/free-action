import { test, expect, loadSheet, answerConfirm, switchMode, type Sheet } from '../fixtures';
import type { Locator, Page } from '@playwright/test';

// The Library: downloading the 2024 SRD from Open5e (replayed from tests/e2e/data/open5e/), keeping a
// saved copy, and adding spells, items, species, class features and feats to the sheet. Outside rules/,
// because it uses a modal dialog and IndexedDB, which can differ by browser.
// Brakka (fighter-5): Fighter 5 (proficiency +3), Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 8 (-1).
const brakka = (more: Sheet = {}) => ({ ...loadSheet('fighter-5'), species: '', ...more });
const RESOURCES = ['spells', 'feats', 'species', 'classes', 'items', 'magicitems'];

const library = (page: Page) => page.getByRole('dialog', { name: 'Library' });
// A Library row is a button whose name starts with the entry's name, then its subtitle.
const row = (lib: Locator, name: string) => lib.getByRole('button', { name: new RegExp(`^${name}\\b`) });

async function openLibrary(page: Page) {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(library(page)).toBeVisible();
  return library(page);
}

// Opens a tab and searches it, so a single row (and a single Add button) is left.
async function find(lib: Locator, tab: string, query: string) {
  await lib.getByRole('tab', { name: tab, exact: true }).click();
  await lib.getByRole('searchbox', { name: 'Search' }).fill(query);
}

// Every test here opens the Library, so this turns the replayed API on for each, used or not.
test.beforeEach(async ({ open5e }) => {
  void open5e;
});

test.describe('downloading', () => {
  test('the first open downloads every part of the 2024 SRD once; later opens use the saved copy', { tag: '@smoke' }, async ({ page, seedSheet, open5e }) => {
    await seedSheet(brakka());
    await page.goto('/');
    let lib = await openLibrary(page);

    await test.step('first open: one request per part, and both pages of items', async () => {
      await expect(row(lib, 'Fire Bolt')).toBeVisible();
      await expect(lib.getByText(/^SRD data saved /)).toBeVisible();
      const paths = open5e.requests.map(u => new URL(u).pathname.split('/')[2]).sort();
      expect(paths).toEqual([...RESOURCES, 'items'].sort());
      // Open5e's "next" link is plain http; the app must follow it over https (or noInternet fails the test).
      expect(open5e.requests.filter(u => u.includes('page=2'))).toHaveLength(1);
    });

    const loading = lib.getByText('Loading the 2024 SRD…', { exact: true });
    await test.step('after a reload: the saved copy, no requests', async () => {
      await page.reload();
      lib = await openLibrary(page);
      await expect(row(lib, 'Fire Bolt')).toBeVisible();
      await expect(loading).toBeHidden();
      expect(open5e.requests).toHaveLength(7);
    });

    await test.step('Re-download asks for everything again, and saves the new copy', async () => {
      await lib.getByRole('button', { name: 'Re-download', exact: true }).click();
      await expect.poll(() => open5e.requests.length).toBe(14);
      await expect(loading).toBeHidden();
      await expect(row(lib, 'Fire Bolt')).toBeVisible();
      await page.reload();
      await expect(row(await openLibrary(page), 'Fire Bolt')).toBeVisible();
      expect(open5e.requests).toHaveLength(14);
    });
  });

  test('a part that fails to load shows an error with Retry, and the rest still loads', async ({ page, seedSheet, open5e }) => {
    open5e.fail('spells');
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);

    await expect(lib.getByText(/^Could not load/)).toHaveText('Could not load: spells: HTTP 500. Check your connection, then Retry');
    await lib.getByRole('tab', { name: 'Feats', exact: true }).click();
    await expect(row(lib, 'Alert')).toBeVisible();

    await test.step('Retry fetches only what failed', async () => {
      open5e.heal('spells');
      await lib.getByRole('button', { name: 'Retry', exact: true }).click();
      await lib.getByRole('tab', { name: 'Spells', exact: true }).click();
      await expect(row(lib, 'Fire Bolt')).toBeVisible();
      await expect(lib.getByText(/^Could not load/)).toHaveCount(0);
      expect(open5e.requests.filter(u => u.includes('/v2/spells/'))).toHaveLength(2);
      expect(open5e.requests.filter(u => u.includes('/v2/feats/'))).toHaveLength(1);
    });
  });

  test('the 2014 copies Open5e sends alongside the 2024 items are left out', async ({ page, seedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Items', 'longsword');
    await expect(row(lib, 'Longsword')).toHaveCount(1);
    // The one kept is the 2024 copy: Sap is a 2024 Weapon Mastery property, missing from the 2014 one.
    await row(lib, 'Longsword').click();
    await expect(lib.getByText(/Properties: Sap, Versatile \(1d10\)/)).toBeVisible();
    await find(lib, 'Items', 'ring of protection');
    await expect(row(lib, 'Ring of Protection')).toHaveCount(1);
  });

  test('search narrows the list, and says when nothing matches', async ({ page, seedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Spells', 'fire');
    await expect(row(lib, 'Fire Bolt')).toBeVisible();
    await expect(row(lib, 'Bless')).toHaveCount(0);
    await find(lib, 'Spells', 'zzz');
    await expect(lib.getByText('No matches. Try a shorter search.', { exact: true })).toBeVisible();
  });
});

test.describe('adding to the sheet', () => {
  test('Fire Bolt arrives as a working spell attack whose damage scales with level', async ({ page, seedSheet, savedSheet }) => {
    // SRD 5.2 Fire Bolt: ranged spell attack, 1d10 fire, 2d10 from character level 5.
    // Brakka casts with Int 8 (-1): attack -1 + 3 = +2.
    await seedSheet(brakka({ cast: 'int' }));
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Spells', 'fire bolt');
    await lib.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(lib.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await lib.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Hit +2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '2d10 fire', exact: true })).toBeVisible();
    await expect.poll(savedSheet).toMatchObject({ spells: [{ n: 'Fire Bolt', l: 0, r: { a: true, d: '1d10', t: 'fire', by: 'char' } }] });
  });

  test('Cure Wounds arrives as healing that adds the spellcasting modifier and grows with the slot', async ({ page, seedSheet, savedSheet }) => {
    // SRD 5.2 Cure Wounds: 2d8 + spellcasting modifier; +2d8 per slot level above 1.
    await seedSheet(brakka({ cast: 'int' }));
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Spells', 'cure wounds');
    await lib.getByRole('button', { name: 'Add', exact: true }).click();
    await lib.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(page.getByRole('button', { name: '2d8-1 healing', exact: true })).toBeVisible(); // Int -1
    await expect.poll(savedSheet).toMatchObject({ spells: [{ n: 'Cure Wounds', l: 1, r: { a: false, d: '2d8', h: true, m: true, by: 'slot' } }] });
    await page.getByLabel('Cure Wounds slot level', { exact: true }).selectOption('Slot 3');
    await expect(page.getByRole('button', { name: '6d8-1 healing', exact: true })).toBeVisible();
  });

  test('a Longsword arrives with its attack and damage, and a second one raises the quantity', async ({ page, seedSheet, savedSheet }) => {
    // SRD 5.2 Longsword: 1d8 slashing, Versatile (1d10). Str +3, proficiency +3.
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Items', 'longsword');
    await lib.getByRole('button', { name: 'Add', exact: true }).click();
    await lib.getByRole('button', { name: 'Add (have 1)', exact: true }).click();
    // The 2024 copy (with Sap), not the 2014 one.
    await expect.poll(savedSheet).toMatchObject({ items: [{ n: 'Longsword', q: 2, d: expect.stringContaining('Sap'), w: { d: '1d8', t: 'slashing', v: '1d10', ab: 'str' } }] });
    await lib.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Hit +6', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '1d8+3 slashing', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '1d10+3 two-handed', exact: true })).toBeVisible();
  });

  test('armor and magic items arrive with what they do to the numbers', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    for (const query of ['rapier', 'chain mail', 'shield', 'ring of protection', 'stone of good luck', 'gauntlets of ogre power']) {
      await test.step(`add ${query}`, async () => {
        await find(lib, 'Items', query);
        await lib.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(lib.getByRole('button', { name: 'Add (have 1)', exact: true })).toBeVisible();
      });
    }
    await expect.poll(savedSheet).toMatchObject({
      items: [
        // SRD 5.2 Rapier: 1d8 piercing, Finesse (the better of Str and Dex).
        { n: 'Rapier', w: { d: '1d8', t: 'piercing', ab: 'fin' } },
        // SRD 5.2 Chain Mail: heavy, AC 16, Strength 13, Disadvantage on Stealth.
        { n: 'Chain Mail', ar: { k: 'heavy', ac: 16, str: 13, stl: true, sb: 0 } },
        // SRD 5.2 Shield: +2 AC.
        { n: 'Shield', ar: { k: 'shield', ac: 2 } },
        // Ring of Protection: +1 to AC and saving throws, attunement, and it works with armor (nu false).
        { n: 'Ring of Protection', at: true, ar: { k: 'bonus', ac: 1, sb: 1, nu: false } },
        // Stone of Good Luck: +1 to ability checks and saving throws, attunement.
        { n: 'Stone of Good Luck (Luckstone)', at: true, fx: [['chk', '', 1], ['sv', '', 1]] },
        // Gauntlets of Ogre Power: Strength 19, attunement.
        { n: 'Gauntlets of Ogre Power', at: true, fx: [['set', 'str', 19]] },
      ],
    });
  });

  test('a species arrives with its traits, and Dwarven Toughness counts toward max HP', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Species', 'dwarf');
    await lib.getByRole('button', { name: 'Add species', exact: true }).click();
    await expect.poll(savedSheet).toMatchObject({
      species: 'Dwarf',
      race: ['Size', 'Speed', 'Darkvision', 'Dwarven Resilience', 'Dwarven Toughness', 'Stonecunning'].map(n => ({ n })),
    });
    await lib.getByRole('button', { name: 'Close', exact: true }).click();

    // PHB 2024 fixed HP for Fighter 5, Con +2: (10 + 2) + 4 x (6 + 2) = 44; Dwarven Toughness +1 per level: 49.
    await switchMode(page, 'Edit');
    await expect(page.getByText(/^Average max HP/)).toHaveText('Average max HP for level 5 (d10, Con +2, Dwarven Toughness +1/level): 49 Use 49');
  });

  test('class features open on your class, and are added under it', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    await lib.getByRole('tab', { name: 'Class features', exact: true }).click();
    await expect(lib.getByRole('button', { name: 'Fighter (your class)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // PHB 2024 Fighter: Action Surge at level 2 (a second use at 17), listed under the level it starts.
    await find(lib, 'Class features', 'action surge');
    await expect(row(lib, 'Action Surge')).toHaveAccessibleName(/^Action Surge\s*Fighter, level 2$/);
    await find(lib, 'Class features', 'second wind');
    // PHB 2024 Fighter: Second Wind at level 1.
    await expect(row(lib, 'Second Wind')).toHaveAccessibleName(/^Second Wind\s*Fighter, level 1$/);
    await lib.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(savedSheet).toMatchObject({ feats: [{ n: 'Second Wind', t: 'Fighter' }] });
  });

  test('a feat is added as a Feat', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    const lib = await openLibrary(page);
    await find(lib, 'Feats', 'alert');
    // PHB 2024: Alert is an Origin feat.
    await expect(row(lib, 'Alert')).toHaveAccessibleName(/^Alert\s*Origin feat$/);
    await lib.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(savedSheet).toMatchObject({ feats: [{ n: 'Alert', t: 'Feat' }] });
  });
});

test.describe('custom content', () => {
  // Opens "Custom content". The dialog remembers it's open in a toggle event handler, which the browser
  // fires a moment after the click; a redraw before then would draw it closed. So this waits for it.
  async function openCustom(page: Page, lib: Locator) {
    await page.evaluate(() => {
      (window as unknown as { e2eToggled: Promise<unknown> }).e2eToggled = new Promise(r => {
        const done = (e: Event) => {
          if (!(e.target as Element).classList.contains('pack')) return;
          document.removeEventListener('toggle', done, true);
          r(null);
        };
        document.addEventListener('toggle', done, true);
      });
    });
    await lib.getByText(/^Custom content/).click();
    await page.evaluate(() => (window as unknown as { e2eToggled: Promise<unknown> }).e2eToggled);
  }

  test('pasted JSON is imported, kept in the browser, refused when invalid, and can all be removed', async ({ page, seedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    let lib = await openLibrary(page);
    await expect(row(lib, 'Fire Bolt')).toBeVisible();
    await openCustom(page, lib);
    // The textarea has no accessible name (the dialog's only textbox; search is a searchbox).
    const box = lib.getByRole('textbox');
    const importIt = lib.getByRole('button', { name: 'Import', exact: true });

    await test.step('not JSON: refused', async () => {
      await box.fill('not json');
      await importIt.click();
      await expect(lib.getByRole('status')).toHaveText('That is not valid JSON.');
    });
    await test.step('a homebrew feat: imported and found by search, marked custom', async () => {
      await box.fill('[{"kind":"feat","name":"Iron Grit","sub":"General feat","desc":"You shrug things off."}]');
      await importIt.click();
      await expect(lib.getByRole('status')).toHaveText('Imported 1 entries.');
      await find(lib, 'Feats', 'grit');
      await expect(row(lib, 'Iron Grit')).toContainText('(custom)');
    });
    await test.step('still there after a reload', async () => {
      await page.reload();
      lib = await openLibrary(page);
      await expect(lib.getByText(/^Custom content/)).toHaveText('Custom content (1 saved)');
      await find(lib, 'Feats', 'grit');
      await expect(row(lib, 'Iron Grit')).toBeVisible();
      await openCustom(page, lib);
    });
    await test.step('Remove all custom content', async () => {
      const asked = answerConfirm(page, 'accept');
      await lib.getByRole('button', { name: 'Remove all custom content', exact: true }).click();
      expect(await asked).toBe('Remove all custom content from the library? Entries already on your sheet stay.');
      await expect(lib.getByRole('status')).toHaveText('Custom content removed.');
    });
    await test.step('gone after a reload too', async () => {
      await page.reload();
      lib = await openLibrary(page);
      await find(lib, 'Feats', 'grit');
      await expect(lib.getByText('No matches. Try a shorter search.', { exact: true })).toBeVisible();
    });
  });
});
