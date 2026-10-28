import { test, expect, loadSheet, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Gear rules besides AC: Strength requirements, Stealth Disadvantage, and attunement.
// Chain Mail, from the PHB 2024 Armor table: AC 16, Strength 13, Disadvantage on Stealth.
const chain = { n: 'Chain Mail', q: 1, eq: true, on: true, ar: { k: 'heavy', ac: 16, str: 13, stl: true } };
const ring = (n: string, att: boolean) => ({ n, q: 1, eq: true, on: true, at: true, att, ar: { k: 'bonus', ac: 1, str: 0, sb: 1 } });

const brakka = (str: number, items: Sheet[]) => {
  const base = loadSheet('fighter-5');
  return { ...base, ab: { ...(base.ab as object), str }, items };
};

const speed = (page: Page) => page.getByRole('group', { name: 'Speed', exact: true });
const ac = (page: Page) => page.getByRole('group', { name: 'Armor class', exact: true });

test.describe('Strength requirement', () => {
  // PHB 2024: wearing armor whose Strength requirement you don't meet reduces your Speed by 10 feet.
  test('below the requirement, Speed drops by 10 feet', async ({ page, seedSheet }) => {
    await seedSheet(brakka(12, [chain]));
    await page.goto('/');

    await expect(speed(page).getByText('20', { exact: true })).toBeVisible(); // 30 - 10
    await expect(page.getByText('Needs Str 13 (you have 12): Speed −10 ft')).toBeVisible();
  });

  test('meeting the requirement exactly keeps full Speed', async ({ page, seedSheet }) => {
    await seedSheet(brakka(13, [chain]));
    await page.goto('/');

    await expect(speed(page).getByText('30', { exact: true })).toBeVisible();
    await expect(page.getByText(/Needs Str 13/)).toHaveCount(0);
  });
});

test('armor with Stealth Disadvantage makes Stealth rolls use Disadvantage', async ({ page, seedSheet }) => {
  // PHB 2024: Chain Mail gives Disadvantage on Dexterity (Stealth) checks. Stealth is Dex +1 for
  // Brakka, so the roll is two d20s keeping the lower, plus 1.
  await seedSheet(brakka(16, [chain]));
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Stealth +1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stealth +1', exact: true }).click();
  await expect(page.getByLabel('Chat command')).toHaveValue('/r 2d20kl1+1 # Stealth');
});

test.describe('attunement', () => {
  // PHB 2024: a magic item that needs attunement works only while you're attuned to it, and you
  // can be attuned to at most three items. Ring of Protection: +1 to AC and saving throws.

  test('an item needing attunement does nothing until attuned', async ({ page, seedSheet }) => {
    await seedSheet(brakka(16, [chain, ring('Ring of Protection', false)]));
    await page.goto('/');

    await test.step('not attuned: Chain Mail 16, Strength save +6', async () => {
      await expect(ac(page).getByText('16', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Strength save +6', exact: true })).toBeVisible();
      await expect(page.getByText('not attuned, no effect')).toBeVisible();
    });

    await test.step('attune: AC 16 + 1, Strength save +6 + 1', async () => {
      await page.getByRole('button', { name: 'Attune Ring of Protection' }).click();
      await expect(page.getByRole('button', { name: 'Attune Ring of Protection' })).toHaveAttribute('aria-pressed', 'true');
      await expect(ac(page).getByText('17', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Strength save +7', exact: true })).toBeVisible();
    });
  });

  test('a fourth item cannot be attuned until one of the three is ended', async ({ page, seedSheet }) => {
    await seedSheet(brakka(16, [ring('Ring A', true), ring('Ring B', true), ring('Ring C', true), ring('Ring D', false)]));
    await page.goto('/');
    const ringD = page.getByRole('button', { name: 'Attune Ring D' });

    await test.step('try to attune a fourth', async () => {
      await ringD.click();
      await expect(page.getByRole('alert')).toHaveText('Already attuned to 3 items. End attunement to one first.');
      await expect(ringD).toHaveAttribute('aria-pressed', 'false');
    });

    await test.step('end attunement to one, then attune the fourth', async () => {
      await page.getByRole('button', { name: 'Attune Ring A' }).click();
      await expect(page.getByRole('button', { name: 'Attune Ring A' })).toHaveAttribute('aria-pressed', 'false');
      await ringD.click();
      await expect(ringD).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
