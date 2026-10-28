import { test, expect, loadSheet, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// PHB 2024, Armor Class. Without armor: 10 + Dex modifier. Light armor: its AC + Dex modifier.
// Medium armor: its AC + Dex modifier, at most +2. Heavy armor: its AC, no Dex. A Shield adds +2.
// Armor values from the PHB 2024 Armor table: Leather 11, Scale Mail 14, Chain Mail 16.
// Magic items here are seeded without attunement to isolate their AC effect; attunement is tested in gear.spec.ts.

type Gear = { n: string; on?: boolean; ar: Record<string, unknown> };
const item = ({ n, on = true, ar }: Gear) => ({ n, q: 1, eq: true, on, ar: { str: 0, ...ar } });
const leather = { n: 'Leather Armor', ar: { k: 'light', ac: 11 } };
const scale = { n: 'Scale Mail', ar: { k: 'medium', ac: 14 } };
const chain = { n: 'Chain Mail', ar: { k: 'heavy', ac: 16 } };
const shield = { n: 'Shield', ar: { k: 'shield', ac: 2 } };
// PHB 2024, Robe of the Archmagi: base AC 15 + Dex modifier while not wearing armor.
const robe = { n: 'Robe of the Archmagi', ar: { k: 'unarm', ac: 15 } };

// Brakka (fighter-5) with a chosen Dexterity score and gear.
const brakka = (dex: number, gear: Gear[] = [], extra: Sheet = {}) => {
  const base = loadSheet('fighter-5');
  return { ...base, ab: { ...(base.ab as object), dex }, items: gear.map(item), ...extra };
};

const ac = (page: Page) => page.getByRole('group', { name: 'Armor class', exact: true });
const expectAC = (page: Page, value: number) => expect(ac(page).getByText(String(value), { exact: true })).toBeVisible();

const cases: [title: string, sheet: Sheet, expected: number][] = [
  ['no armor: 10 + Dex (+1)', brakka(12), 11],
  ['no armor: 10 + Dex (+4)', brakka(18), 14],
  ['light armor adds the full Dex modifier: Leather 11 + 4', brakka(18, [leather]), 15],
  ['medium armor caps Dex at +2: Scale Mail 14 + 2 (Dex +4)', brakka(18, [scale]), 16],
  ['medium armor adds a Dex of exactly +2: Scale Mail 14 + 2', brakka(14, [scale]), 16],
  ['medium armor subtracts a negative Dex: Scale Mail 14 - 1', brakka(8, [scale]), 13],
  ['heavy armor ignores a high Dex: Chain Mail 16', brakka(18, [chain]), 16],
  ['heavy armor ignores a negative Dex: Chain Mail 16', brakka(8, [chain]), 16],
  ['a Shield adds 2: Chain Mail 16 + 2', brakka(12, [chain, shield]), 18],
  // PHB 2024: you gain the benefit of only one Shield at a time.
  ['two Shields count once: Chain Mail 16 + 2', brakka(12, [chain, shield, { ...shield, n: 'Spare Shield' }]), 18],
  ['a Shield with no armor: 10 + Dex (+1) + 2', brakka(12, [shield]), 13],
  ['of two armors worn, the better counts: Scale Mail 16 beats Leather 15', brakka(18, [leather, scale]), 16],
  ['armor carried but not equipped does not count: 10 + Dex (+1)', brakka(12, [{ ...chain, on: false }]), 11],
  ['an AC bonus item adds on top: Chain Mail 16 + Ring of Protection 1', brakka(12, [chain, { n: 'Ring of Protection', ar: { k: 'bonus', ac: 1 } }]), 17],
  ['the sheet’s Other AC bonus adds on top: Chain Mail 16 + 1', brakka(12, [chain], { acb: 1 }), 17],
  ['a better unarmored base replaces 10: Robe 15 + Dex (+1)', brakka(12, [robe]), 16],
  ['an unarmored base does nothing under armor: Leather 11 + Dex (+1)', brakka(12, [robe, leather]), 12],
  ['an unarmored base still takes a Shield: Robe 15 + Dex (+1) + 2', brakka(12, [robe, shield]), 18],
];

for (const [title, sheet, expected] of cases) {
  const tag = title.startsWith('a Shield adds 2') ? { tag: '@smoke' } : {};
  test(`AC ${expected}: ${title}`, tag, async ({ page, seedSheet }) => {
    await seedSheet(sheet);
    await page.goto('/');
    await expectAC(page, expected);
  });
}

test.describe('a bonus that needs no armor and no Shield', () => {
  // PHB 2024, Bracers of Defense: +2 AC while you wear no armor and use no Shield.
  const bracers = { n: 'Bracers of Defense', ar: { k: 'bonus', ac: 2, nu: true } };
  const bracerCases: [title: string, gear: Gear[], expected: number][] = [
    ['applies with nothing else worn: 10 + Dex (+1) + 2', [bracers], 13],
    ['does not apply with armor: Leather 11 + Dex (+1)', [bracers, leather], 12],
    ['does not apply with a Shield: 10 + Dex (+1) + Shield 2', [bracers, shield], 13],
    // The Robe is not armor, so the Bracers still apply.
    ['applies with an unarmored base: Robe 15 + Dex (+1) + 2', [bracers, robe], 18],
  ];
  for (const [title, gear, expected] of bracerCases) {
    test(`AC ${expected}: ${title}`, async ({ page, seedSheet }) => {
      await seedSheet(brakka(12, gear));
      await page.goto('/');
      await expectAC(page, expected);
    });
  }
});

test('equipping armor in the inventory recalculates and saves AC', async ({ page, seedSheet, savedSheet }) => {
  await seedSheet(brakka(12, [{ ...chain, on: false }]));
  await page.goto('/');
  await expectAC(page, 11); // 10 + Dex +1
  const equipped = page.getByRole('checkbox', { name: 'Chain Mail equipped' });

  await test.step('equip the Chain Mail', async () => {
    await equipped.check();
    await expectAC(page, 16); // Chain Mail 16, no Dex
    await expect.poll(savedSheet).toMatchObject({ items: [{ n: 'Chain Mail', on: true }] });
  });

  await test.step('take it off again', async () => {
    await equipped.uncheck();
    await expectAC(page, 11);
    await expect.poll(savedSheet).toMatchObject({ items: [{ n: 'Chain Mail', on: false }] });
  });
});

test('a worse armor that is also equipped is marked as not counted', async ({ page, seedSheet }) => {
  await seedSheet(brakka(18, [leather, scale]));
  await page.goto('/');
  await expect(page.getByText('Leather Armor not counted, a better one is equipped')).toBeVisible();
  await expect(page.getByText(/Scale Mail\s+not counted/)).toHaveCount(0);
});
