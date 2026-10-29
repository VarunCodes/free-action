import { test, expect, loadSheet, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Gear rules besides AC: Strength requirements, Stealth Disadvantage, and attunement.
// Chain Mail, from the PHB 2024 Armor table: AC 16, Strength 13, Disadvantage on Stealth.
const chain = { n: 'Chain Mail', q: 1, eq: true, on: true, ar: { k: 'heavy', ac: 16, str: 13, stl: true } };
// PHB 2024, Ring of Protection: +1 to AC and saving throws, requires attunement.
const ring = (n: string, att: boolean) => ({ n, q: 1, eq: true, on: true, at: true, att, ar: { k: 'bonus', ac: 1, str: 0, sb: 1 } });

// Brakka (fighter-5): Str set per test, Dex 12 (+1), proficient in Strength saves, not in Stealth.
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

  test('armor that is carried but not worn costs no Speed', async ({ page, seedSheet }) => {
    await seedSheet(brakka(12, [{ ...chain, on: false }]));
    await page.goto('/');

    await expect(speed(page).getByText('30', { exact: true })).toBeVisible();
  });
});

test.describe('Stealth Disadvantage', () => {
  // PHB 2024: Chain Mail gives Disadvantage on Dexterity (Stealth) checks. Brakka's Stealth is
  // Dex +1, so with the armor on, the roll is two d20s keeping the lower, plus 1.
  const roll = async (page: Page, button: string, formula: string) => {
    await expect(page.getByRole('button', { name: button, exact: true })).toBeVisible();
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByLabel('Chat command')).toHaveValue(formula);
  };

  test('worn armor with Stealth Disadvantage rolls Stealth with Disadvantage, and only Stealth', async ({ page, seedSheet }) => {
    await seedSheet(brakka(16, [chain]));
    await page.goto('/');

    await test.step('Stealth: Disadvantage', () => roll(page, 'Stealth +1', '/r 2d20kl1+1 # Stealth'));
    await test.step('Athletics: a normal roll', () => roll(page, 'Athletics +6', '/r 1d20+6 # Athletics'));
  });

  test('the same armor carried but not worn gives no Disadvantage', async ({ page, seedSheet }) => {
    await seedSheet(brakka(16, [{ ...chain, on: false }]));
    await page.goto('/');

    await roll(page, 'Stealth +1', '/r 1d20+1 # Stealth');
  });
});

test.describe('attunement', () => {
  // PHB 2024: a magic item that needs attunement works only while you're attuned to it, and you
  // can be attuned to at most three items.

  test('an item needing attunement does nothing until attuned', { tag: '@smoke' }, async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka(16, [chain, ring('Ring of Protection', false)]));
    await page.goto('/');
    const attune = page.getByRole('button', { name: 'Attune Ring of Protection' });

    await test.step('not attuned: AC 16, Strength save +6, Dexterity save +1', async () => {
      await expect(ac(page).getByText('16', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Strength save +6', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Dexterity save +1', exact: true })).toBeVisible();
      await expect(page.getByText('not attuned, no effect')).toBeVisible();
    });

    // +1 to every save, proficient or not: Strength +6 + 1, Dexterity +1 + 1.
    await test.step('attune: AC 17, Strength save +7, Dexterity save +2, and it is saved', async () => {
      await attune.click();
      await expect(attune).toHaveAttribute('aria-pressed', 'true');
      await expect(ac(page).getByText('17', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Strength save +7', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Dexterity save +2', exact: true })).toBeVisible();
      await expect(page.getByText('not attuned, no effect')).toHaveCount(0);
      await expect.poll(savedSheet).toMatchObject({ items: [{ n: 'Chain Mail' }, { n: 'Ring of Protection', att: true }] });
    });
  });

  test('a fourth item cannot be attuned until one of the three is ended', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka(16, [ring('Ring A', true), ring('Ring B', true), ring('Ring C', true), ring('Ring D', false)]));
    await page.goto('/');
    const ringA = page.getByRole('button', { name: 'Attune Ring A' });
    const ringD = page.getByRole('button', { name: 'Attune Ring D' });

    await test.step('try to attune a fourth', async () => {
      await ringD.click();
      await expect(page.getByRole('alert')).toHaveText('Already attuned to 3 items. End attunement to one first.');
      await expect(ringD).toHaveAttribute('aria-pressed', 'false');
    });

    await test.step('end attunement to one, then attune the fourth', async () => {
      await ringA.click();
      await expect(ringA).toHaveAttribute('aria-pressed', 'false');
      await ringD.click();
      await expect(ringD).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(savedSheet).toMatchObject({
        items: [{ n: 'Ring A', att: false }, { n: 'Ring B', att: true }, { n: 'Ring C', att: true }, { n: 'Ring D', att: true }],
      });
    });
  });

  // SRD 5.2, Magic Items, Attunement: a creature can't attune to more than one copy of a magic item.
  // Brakka in Chain Mail: AC 16, Strength save +6 (+3, proficient +3), Dexterity save +1.
  test('a second attuned Ring of Protection adds nothing to AC or saves', async ({ page, seedSheet }) => {
    await seedSheet(brakka(16, [chain, ring('Ring of Protection', true), ring('ring of protection', true)]));
    await page.goto('/');

    // One ring counts, whatever the capitalisation: AC 16 + 1, saves + 1.
    await expect(ac(page).getByText('17', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Strength save +7', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dexterity save +2', exact: true })).toBeVisible();
    await expect(page.getByText(/^ring of protection.*Already attuned to another copy, no effect/)).toBeVisible();
    await expect(page.getByText('Already attuned to another copy, no effect')).toHaveCount(1);
  });

  test('two differently named rings both apply', async ({ page, seedSheet }) => {
    await seedSheet(brakka(16, [chain, ring('Ring of Protection', true), ring('Ring of Warding', true)]));
    await page.goto('/');

    // Two different items, +1 each: AC 16 + 2, Strength save +6 + 2, Dexterity save +1 + 2.
    await expect(ac(page).getByText('18', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Strength save +8', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dexterity save +3', exact: true })).toBeVisible();
    await expect(page.getByText('Already attuned to another copy, no effect')).toHaveCount(0);
  });

  test('a duplicate copy does not use up one of the three attunement slots', async ({ page, seedSheet }) => {
    // Three items are marked attuned, but the second Ring A can't be, so only two slots are used
    // and Ring C can still be attuned as the third.
    await seedSheet(brakka(16, [chain, ring('Ring A', true), ring('Ring A', true), ring('Ring B', true), ring('Ring C', false)]));
    await page.goto('/');
    const ringC = page.getByRole('button', { name: 'Attune Ring C' });

    await ringC.click();
    await expect(ringC).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('alert')).toHaveCount(0);
    // Ring A once, Ring B, Ring C: AC 16 + 3.
    await expect(ac(page).getByText('19', { exact: true })).toBeVisible();
    await expect(page.getByText('Over the 3-item attunement limit')).toHaveCount(0);
  });

  test('a sheet imported with four items attuned applies only three', async ({ page, seedSheet }) => {
    // Only reachable by importing or hand-editing a sheet. The app's policy: the first three count,
    // and the rest are flagged. With Chain Mail 16, three +1 rings: 16 + 3 = 19.
    await seedSheet(brakka(16, [chain, ring('Ring A', true), ring('Ring B', true), ring('Ring C', true), ring('Ring D', true)]));
    await page.goto('/');

    await expect(ac(page).getByText('19', { exact: true })).toBeVisible();
    await expect(page.getByText('Over the 3-item attunement limit')).toHaveCount(1);
    await expect(page.getByText(/^Ring D.*Over the 3-item attunement limit/)).toBeVisible();
  });
});
