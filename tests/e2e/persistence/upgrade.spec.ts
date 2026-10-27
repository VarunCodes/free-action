import { test, expect, loadSheet } from '../fixtures';

// Every sheet passes through cleanSheet() on load. Sheets saved by older versions of the app,
// or edited by hand, must still open, with impossible values brought back within the rules.

test('a sheet from before AC was calculated keeps its hand-typed AC', async ({ page, seedSheet }) => {
  // Older sheets have no acAuto. A typed AC other than the old default (10) means the player set it.
  await seedSheet({ ...loadSheet('fighter-5'), ac: 17 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  await expect(page.getByRole('checkbox', { name: 'Calculate AC from equipped gear' })).not.toBeChecked();
  await expect(page.getByLabel('AC', { exact: true })).toHaveValue('17');
});

test('a sheet from before AC was calculated, still on the default AC, switches to calculated AC', async ({ page, seedSheet }) => {
  await seedSheet({ ...loadSheet('fighter-5'), ac: 10 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  await expect(page.getByRole('checkbox', { name: 'Calculate AC from equipped gear' })).toBeChecked();
});

test('impossible values are brought back within the rules', async ({ page, seedSheet }) => {
  // PHB 2024: an ability score can't exceed 30, and Hit Points can't exceed the Hit Point maximum.
  await seedSheet({ ...loadSheet('fighter-5'), ab: { str: 99, dex: 12, con: 14, int: 8, wis: 10, cha: 13 }, hp: { cur: 50, max: 44, temp: 0 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  await expect(page.getByLabel('Strength score')).toHaveValue('30');
  await expect(page.getByLabel('Current HP')).toHaveValue('44');
});

test('gear from before Equipped and Attuned were separate keeps working', async ({ page, seedSheet }) => {
  // Older sheets: a weapon had no Equipped flag (it becomes equippable), and an equipped item that
  // needs attunement had no Attuned flag (it counts as attuned if it was equipped).
  await seedSheet({
    ...loadSheet('fighter-5'),
    items: [
      { n: 'Longsword', q: 1, w: { d: '1d8', t: 'slashing', v: '1d10', b: 0, ab: 'str' } },
      { n: 'Ring of Protection', q: 1, eq: true, on: true, at: true, ar: { k: 'bonus', ac: 1, str: 0, sb: 1 } },
    ],
  });
  await page.goto('/');

  await expect(page.getByRole('checkbox', { name: 'Longsword equipped' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attune Ring of Protection' })).toHaveAttribute('aria-pressed', 'true');
});
