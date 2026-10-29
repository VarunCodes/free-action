import { test, expect, loadSheet, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Attack and damage rolls for weapons and spells, and critical hits. (The roll bar's modes, chat
// formats and custom rolls are in tests/e2e/roll-bar.spec.ts, which runs in every browser.)
// Brakka (fighter-5), level 5 (proficiency +3): Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 8 (-1), Wis 10 (+0).
const brakka = (more: Sheet = {}, ab: Sheet = {}) => {
  const base = loadSheet('fighter-5');
  return { ...base, ...more, ab: { ...(base.ab as object), ...ab } };
};
// A Charisma caster with Cha 18 (+4), a modifier none of Brakka's other abilities has.
const caster = (spells: Sheet[], level = 5) => brakka({ level, cast: 'cha', spells }, { cha: 18 });
const weapon = (n: string, w: Sheet, more: Sheet = {}) => ({ n, q: 1, eq: true, on: true, w: { b: 0, ...w }, ...more });
// SRD 5.2 weapons table.
const longsword = weapon('Longsword', { d: '1d8', t: 'slashing', v: '1d10', ab: 'str' });
const longbow = weapon('Longbow', { d: '1d8', t: 'piercing', ab: 'dex' });
const rapier = weapon('Rapier', { d: '1d8', t: 'piercing', ab: 'fin' });
// SRD 5.2 Fire Bolt: 1d10 fire; the damage rises by 1d10 at character levels 5, 11 and 17.
const fireBolt = { n: 'Fire Bolt', l: 0, p: true, d: '', r: { a: true, d: '1d10', b: '1d10', t: 'fire', by: 'char', up: [[5, '2d10', 0], [11, '3d10', 0], [17, '4d10', 0]] } };

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// Clicks a roll button and checks the chat command it produced.
async function roll(page: Page, name: string, formula: string) {
  await button(page, name).click();
  await expect(page.getByLabel('Chat command', { exact: true })).toHaveValue(formula);
}

test.describe('weapons', () => {
  // PHB 2024, Attack Rolls: d20 + ability modifier + proficiency bonus (proficient with the weapon).
  // Damage: the weapon's dice + the same ability modifier.
  test('a melee weapon uses Strength, and a Versatile one has a two-handed die', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [longsword] }));
    await page.goto('/');
    await roll(page, 'Hit +6', '/r 1d20+6 # Longsword attack'); // Str +3, proficiency +3
    await roll(page, '1d8+3 slashing', '/r 1d8+3 # Longsword damage');
    await roll(page, '1d10+3 two-handed', '/r 1d10+3 # Longsword damage (two-handed)');
  });

  test('a melee weapon uses Strength even when Dexterity is higher', async ({ page, seedSheet }) => {
    // Dex 18 (+4) beats Str +3, but a Longsword isn't Finesse: still +6 and +3.
    await seedSheet(brakka({ items: [longsword] }, { dex: 18 }));
    await page.goto('/');
    await expect(button(page, 'Hit +6')).toBeVisible();
    await expect(button(page, '1d8+3 slashing')).toBeVisible();
  });

  test('a negative modifier is subtracted', async ({ page, seedSheet }) => {
    // Str 8 (-1): attack -1 + 3 = +2; damage 1d8-1.
    await seedSheet(brakka({ items: [longsword] }, { str: 8 }));
    await page.goto('/');
    await roll(page, 'Hit +2', '/r 1d20+2 # Longsword attack');
    await roll(page, '1d8-1 slashing', '/r 1d8-1 # Longsword damage');
  });

  test('a ranged weapon uses Dexterity', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [longbow] }));
    await page.goto('/');
    await roll(page, 'Hit +4', '/r 1d20+4 # Longbow attack'); // Dex +1, proficiency +3
    await roll(page, '1d8+1 piercing', '/r 1d8+1 # Longbow damage');
  });

  test('a Finesse weapon uses Strength when it is higher', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [rapier] })); // Str +3 beats Dex +1
    await page.goto('/');
    await expect(button(page, 'Hit +6')).toBeVisible();
    await expect(button(page, '1d8+3 piercing')).toBeVisible();
  });

  test('a Finesse weapon uses Dexterity when it is higher', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [rapier] }, { dex: 18 })); // Dex +4 beats Str +3
    await page.goto('/');
    await roll(page, 'Hit +7', '/r 1d20+7 # Rapier attack');
    await roll(page, '1d8+4 piercing', '/r 1d8+4 # Rapier damage');
  });

  test('a +1 weapon adds 1 to attack and damage', async ({ page, seedSheet }) => {
    // SRD 5.2, Weapon, +1: no attunement needed.
    await seedSheet(brakka({ items: [weapon('Longsword, +1', { d: '1d8', t: 'slashing', ab: 'str', b: 1 })] }));
    await page.goto('/');
    await roll(page, 'Hit +7', '/r 1d20+7 # Longsword, +1 attack');
    await roll(page, '1d8+4 slashing', '/r 1d8+4 # Longsword, +1 damage');
  });

  test('a magic weapon that needs attunement adds its bonus only once attuned', async ({ page, seedSheet }) => {
    // A homebrew +1 blade that needs attunement.
    await seedSheet(brakka({ items: [weapon('Oathblade', { d: '1d8', t: 'slashing', ab: 'str', b: 1 }, { at: true, att: false })] }));
    await page.goto('/');
    await test.step('not attuned: no bonus', async () => {
      await expect(button(page, 'Hit +6')).toBeVisible();
      await expect(button(page, '1d8+3 slashing')).toBeVisible();
    });
    await test.step('attuned: +1 to both', async () => {
      await button(page, 'Attune Oathblade').click();
      await roll(page, 'Hit +7', '/r 1d20+7 # Oathblade attack');
      await roll(page, '1d8+4 slashing', '/r 1d8+4 # Oathblade damage');
    });
  });
});

test.describe('critical hits', () => {
  // PHB 2024, Critical Hits: a natural 20 on the attack roll; roll the attack's damage dice twice
  // and add them together, then add any modifiers as normal.
  const natural20 = (page: Page) => expect(page.getByText('Natural 20', { exact: true })).toBeVisible();

  test.describe('the attack is a natural 20, then every die rolls its highest face', () => {
    test.use({ dice: [0.99, 0.99, 0.99] });

    test('a weapon crit doubles the dice of the next damage roll, not the modifier', { tag: '@smoke' }, async ({ page, seedSheet }) => {
      await seedSheet(brakka({ items: [longsword] }));
      await page.goto('/');
      await roll(page, 'Hit +6', '/r 1d20+6 # Longsword attack');
      await natural20(page);
      await roll(page, '1d8+3 slashing', '/r 2d8+3 # Longsword damage');
      // Two d8s, both 8, then +3 once.
      await expect(page.getByText('Longsword damage [8, 8] + 3', { exact: true })).toBeVisible();
      await test.step('the crit is used up: the next damage roll is normal', async () => {
        await roll(page, '1d8+3 slashing', '/r 1d8+3 # Longsword damage');
      });
    });

    test('another roll between the attack and the damage cancels the crit', async ({ page, seedSheet }) => {
      await seedSheet(brakka({ items: [longsword] }));
      await page.goto('/');
      await roll(page, 'Hit +6', '/r 1d20+6 # Longsword attack');
      await natural20(page);
      await roll(page, 'Athletics +6', '/r 1d20+6 # Athletics');
      await roll(page, '1d8+3 slashing', '/r 1d8+3 # Longsword damage');
    });

    test("a crit with one weapon doesn't double another weapon's damage", async ({ page, seedSheet }) => {
      await seedSheet(brakka({ items: [longsword, longbow] }));
      await page.goto('/');
      await roll(page, 'Hit +6', '/r 1d20+6 # Longsword attack');
      await natural20(page);
      await roll(page, '1d8+1 piercing', '/r 1d8+1 # Longbow damage');
    });

    test('a spell attack crit doubles the spell damage dice', async ({ page, seedSheet }) => {
      // Level 5 Fire Bolt is 2d10; doubled, 4d10. Attack: Cha +4, proficiency +3.
      await seedSheet(caster([fireBolt]));
      await page.goto('/');
      await roll(page, 'Hit +7', '/r 1d20+7 # Fire Bolt attack');
      await natural20(page);
      await roll(page, '2d10 fire', '/r 4d10 # Fire Bolt damage');
    });
  });

  test.describe('with Advantage, the d20s are 1 then 20', () => {
    test.use({ dice: [0, 0.99] });

    test('a crit counts when the higher die kept is the 20', async ({ page, seedSheet }) => {
      // PHB 2024, Advantage: use the higher d20. It's the second one here, a 20.
      await seedSheet(brakka({ items: [longsword] }));
      await page.goto('/');
      await page.getByRole('group', { name: 'Roll mode', exact: true }).getByRole('button', { name: 'Adv', exact: true }).click();
      await roll(page, 'Hit +6', '/r 2d20kh1+6 # Longsword attack');
      await natural20(page);
      await roll(page, '1d8+3 slashing', '/r 2d8+3 # Longsword damage');
    });

    test('a natural 1 kept with Disadvantage is no crit', async ({ page, seedSheet }) => {
      // PHB 2024, Disadvantage: use the lower d20, the 1. A natural 1 always misses; no crit follows.
      await seedSheet(brakka({ items: [longsword] }));
      await page.goto('/');
      await page.getByRole('group', { name: 'Roll mode', exact: true }).getByRole('button', { name: 'Dis', exact: true }).click();
      await roll(page, 'Hit +6', '/r 2d20kl1+6 # Longsword attack');
      await expect(page.getByText('Natural 1', { exact: true })).toBeVisible();
      await roll(page, '1d8+3 slashing', '/r 1d8+3 # Longsword damage');
    });
  });
});

test.describe('spell damage', () => {
  // SRD 5.2 Fire Bolt: 1d10 below level 5, 2d10 from 5, 3d10 from 11, 4d10 from 17. No modifier.
  for (const [level, dice] of [[4, '1d10'], [5, '2d10'], [11, '3d10'], [17, '4d10']] as const) {
    test(`Fire Bolt at character level ${level} deals ${dice}`, async ({ page, seedSheet }) => {
      await seedSheet(caster([fireBolt], level));
      await page.goto('/');
      await expect(button(page, `${dice} fire`)).toBeVisible();
    });
  }

  test('damage dice changed by hand do not scale', async ({ page, seedSheet }) => {
    // The Library gave 1d10 (b); the player typed 1d12 (d). At level 5 it stays 1d12.
    await seedSheet(caster([{ ...fireBolt, r: { ...fireBolt.r, d: '1d12' } }]));
    await page.goto('/');
    await expect(button(page, '1d12 fire')).toBeVisible();
  });

  test('a healing spell cast with a higher slot rolls more dice, plus the spellcasting modifier', async ({ page, seedSheet }) => {
    // SRD 5.2 Cure Wounds: 2d8 + spellcasting modifier; +2d8 for each slot level above 1.
    // Cha +4. Slot 3: 6d8+4.
    const cure = { n: 'Cure Wounds', l: 1, p: true, d: '', r: { d: '2d8', b: '2d8', h: true, m: true, by: 'slot', up: [[2, '4d8', 0], [3, '6d8', 0], [4, '8d8', 0]] } };
    await seedSheet(caster([cure]));
    await page.goto('/');
    await expect(button(page, '2d8+4 healing')).toBeVisible();
    await page.getByLabel('Cure Wounds slot level', { exact: true }).selectOption('Slot 3');
    await roll(page, '6d8+4 healing', '/r 6d8+4 # Cure Wounds healing');
  });
});
