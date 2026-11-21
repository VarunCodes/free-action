import { test, expect, loadSheet, switchMode, type Sheet } from './fixtures';
import type { Page } from '@playwright/test';

// The Inventory's own tools: collapsing it, the equipped and attuned counts, opening a description,
// and in Edit adding, changing and removing items, their AC settings and their effects.
// The armor and attunement rules themselves are in rules/armor.spec.ts and rules/gear.spec.ts.

const longsword = {
  n: 'Longsword', q: 1, eq: true, on: true, w: { d: '1d8', t: 'slashing', v: '1d10', b: 0, ab: 'str' },
};
const shield = { n: 'Shield', q: 1, eq: true, on: false, ar: { k: 'shield', ac: 2, str: 0 } };
const rope = { n: 'Rope', q: 1, d: '50 feet of **hempen** rope.' };
// PHB 2024, Ring of Protection: +1 to AC and saving throws, requires attunement.
const ring = (name: string, att: boolean) => ({
  n: name, q: 1, eq: true, on: true, at: true, att, ar: { k: 'bonus', ac: 1, str: 0, sb: 1 },
});

// Brakka (fighter-5): Str 16, Dex 12 (+1), Int 8 (-1), proficient in Strength saves, level 5 (+3).
const brakka = (items: Sheet[], extra: Sheet = {}) => ({ ...loadSheet('fighter-5'), items, ...extra });

const ac = (page: Page) => page.getByRole('group', { name: 'Armor class', exact: true });
async function expectAC(page: Page, value: number) {
  await expect(ac(page).getByText(String(value), { exact: true })).toBeVisible();
}

// Number fields save when they lose focus, as when the player moves to the next field.
async function setNumber(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).fill(String(value));
  await page.getByLabel(label, { exact: true }).press('Tab');
}

test.describe('Play', () => {
  test('collapsing the Inventory keeps only what is equipped, and stays collapsed after a reload', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka([longsword, shield, rope]));
    await page.goto('/');

    await page.getByRole('button', { name: 'Inventory' }).click();

    await expect(page.getByRole('button', { name: 'Inventory' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('3 items, 1 equipped')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Longsword equipped' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Shield equipped' })).toHaveCount(0);
    await expect(page.getByText('Rope', { exact: true })).toHaveCount(0);
    await expect.poll(savedSheet).toMatchObject({ inc: true });

    await page.reload();
    await expect(page.getByText('3 items, 1 equipped')).toBeVisible();
  });

  test('collapsed with nothing equipped says so', async ({ page, seedSheet }) => {
    await seedSheet(brakka([rope], { inc: true }));
    await page.goto('/');

    await expect(page.getByText('Nothing equipped.')).toBeVisible();
  });

  test('an empty inventory says nothing is carried', async ({ page, seedSheet }) => {
    await seedSheet(brakka([]));
    await page.goto('/');

    await expect(page.getByText('Nothing carried.')).toBeVisible();
  });

  test('the summary counts equipped and attuned items', async ({ page, seedSheet }) => {
    // Equippable: Longsword, Shield and both rings. Equipped: all but the Shield. Attuned: Ring A only.
    await seedSheet(brakka([longsword, shield, ring('Ring A', true), ring('Ring B', false)]));
    await page.goto('/');

    await expect(page.getByText('Equipped 3 of 4 equippable items.', { exact: false })).toBeVisible();
    await expect(page.getByText(/^Attuned 1 of 3\. /)).toBeVisible();
  });

  test('more than three attuned items shows 3 of 3 and how many are over', async ({ page, seedSheet }) => {
    // Only reachable by importing or hand-editing a sheet: the first three count, the rest are flagged.
    await seedSheet(brakka(['A', 'B', 'C', 'D'].map(letter => ring(`Ring ${letter}`, true))));
    await page.goto('/');

    await expect(page.getByText(/^Attuned 3 of 3 1 more than you can attune to\. /)).toBeVisible();
  });

  test('tapping the name of an item with a description opens it', async ({ page, seedSheet }) => {
    await seedSheet(brakka([rope]));
    await page.goto('/');

    await page.getByRole('button', { name: 'Rope' }).click();

    await expect(page.getByRole('button', { name: 'Rope' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('50 feet of hempen rope.')).toBeVisible();
  });
});

test.describe('Edit', () => {
  test('adds an item with its quantity, changes the quantity, and removes it', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka([]));
    await page.goto('/');
    await switchMode(page, 'Edit');

    await test.step('add five torches', async () => {
      await page.getByLabel('New item name').fill('Torch');
      await page.getByLabel('New item quantity').fill('5');
      await page.getByRole('button', { name: 'Add item' }).click();
      await expect(page.getByLabel('Torch quantity')).toHaveValue('5');
      await expect.poll(savedSheet).toMatchObject({ items: [{ n: 'Torch', q: 5 }] });
    });

    await test.step('change the quantity', async () => {
      await setNumber(page, 'Torch quantity', 10);
      await expect.poll(savedSheet).toMatchObject({ items: [{ n: 'Torch', q: 10 }] });
    });

    await test.step('remove it', async () => {
      await page.getByRole('button', { name: 'Remove Torch' }).click();
      await expect(page.getByText('Nothing carried.')).toBeVisible();
      await expect.poll(savedSheet).toMatchObject({ items: [] });
    });
  });

  test('turns a carried item into worn armor that counts toward AC', async ({ page, seedSheet }) => {
    // PHB 2024, Breastplate: medium armor, AC 14 + Dex modifier (max 2). Dex 12 adds +1: AC 15.
    await seedSheet(brakka([{ n: 'Breastplate', q: 1 }]));
    await page.goto('/');
    await switchMode(page, 'Edit');

    await page.getByRole('checkbox', { name: 'Breastplate equippable' }).check();
    await page.getByLabel('Breastplate armor class effect').selectOption({ label: 'Medium armor (+ Dex, max 2)' });
    await setNumber(page, 'Breastplate AC value', 14);
    await page.getByRole('checkbox', { name: 'Breastplate equipped' }).check();
    await switchMode(page, 'Play');

    await expectAC(page, 15);

    await page.reload();
    await switchMode(page, 'Edit');
    await expect(page.getByLabel('Breastplate armor class effect')).toHaveValue('medium');
    await expect(page.getByLabel('Breastplate AC value')).toHaveValue('14');
  });

  test('gives an item an AC bonus and a saving throw bonus', async ({ page, seedSheet }) => {
    // SRD 5.2, Cloak of Protection: +1 to AC and saving throws. Unarmored AC 10 + Dex 1 + 1 = 12.
    // Strength save: Str 16 (+3) + proficiency (+3) + 1 = +7.
    await seedSheet(brakka([{ n: 'Cloak of Protection', q: 1, eq: true, on: true }]));
    await page.goto('/');
    await switchMode(page, 'Edit');

    await page.getByLabel('Cloak of Protection armor class effect').selectOption({ label: 'AC bonus (adds AC)' });
    await setNumber(page, 'Cloak of Protection AC value', 1);
    await setNumber(page, 'Cloak of Protection saving throw bonus', 1);
    await switchMode(page, 'Play');

    await expectAC(page, 12);
    await expect(page.getByRole('button', { name: 'Strength save +7' })).toBeVisible();
  });

  test('adds an effect to an item, Play lists it, and it can be removed', async ({ page, seedSheet }) => {
    // SRD 5.2, Headband of Intellect: Intelligence becomes 19 (+4). Brakka's own Int is 8 (-1).
    const headband = 'Headband of Intellect';
    await seedSheet(brakka([{ n: headband, q: 1, eq: true, on: true }]));
    await page.goto('/');
    await switchMode(page, 'Edit');

    await test.step('add the effect', async () => {
      const effectBox = page.getByLabel(`${headband} effect`, { exact: true });
      await effectBox.selectOption({ label: 'Set Intelligence to (value)' });
      await page.getByLabel(`${headband} effect value`).fill('19');
      await page.getByRole('button', { name: `Add effect to ${headband}` }).click();
      await expect(page.getByRole('button', { name: `Remove Intelligence becomes 19 from ${headband}` })).toBeVisible();
    });

    await test.step('Play lists it and uses it', async () => {
      await switchMode(page, 'Play');
      await expect(page.getByText('Intelligence becomes 19', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Intelligence check +4' })).toBeVisible();
    });

    await test.step('remove it', async () => {
      await switchMode(page, 'Edit');
      await page.getByRole('button', { name: `Remove Intelligence becomes 19 from ${headband}` }).click();
      await switchMode(page, 'Play');
      await expect(page.getByText('Intelligence becomes 19', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Intelligence check -1' })).toBeVisible();
    });
  });
});
