import { test, expect, loadSheet, switchMode, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Effects: what items, feats and racial traits do to the numbers. Each is [type, target, value].
// Brakka (fighter-5), level 5 (proficiency +3): Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 8 (-1),
// Wis 10 (+0), Cha 13 (+1). Proficient in Strength and Constitution saves, Athletics and Perception.
const brakka = (more: Sheet = {}) => ({ ...loadSheet('fighter-5'), ...more });
const trait = (n: string, d: string, fx?: unknown[]) => ({ n, t: '', d, ...(fx ? { fx } : {}) });
// An equipped magic item that needs attunement.
const magic = (n: string, fx: unknown[], att = true) => ({ n, q: 1, eq: true, on: true, at: true, att, fx });

// SRD 5.2, Stone of Good Luck: +1 to ability checks and saving throws, requires attunement.
const luckstone = (n = 'Stone of Good Luck') => magic(n, [['chk', '', 1], ['sv', '', 1]]);
// SRD 5.2, Gauntlets of Ogre Power: your Strength is 19 (no effect if it's already 19 or more).
const gauntlets = (att = true) => magic('Gauntlets of Ogre Power', [['set', 'str', 19]], att);

// Names carry the number, so they must match exactly: a substring match would let "+12" pass for "+1".
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const passive = (page: Page) => page.getByRole('group', { name: 'Passive Perception', exact: true });

// Checks the button is there first, so a wrong number fails in seconds rather than at the click timeout.
async function rollFormula(page: Page, name: string, formula: string) {
  await expect(button(page, name)).toBeVisible();
  await button(page, name).click();
  await expect(page.getByLabel('Chat command')).toHaveValue(formula);
}

test.describe('ability scores', () => {
  test('a homebrew +2 Constitution trait raises the score, and every check and save that uses it', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ race: [trait('Stone Hide', '', [['ab', 'con', 2]])] }));
    await page.goto('/');
    // Con 14 + 2 = 16 (+3). Check +3; save +3, proficient +3 = +6.
    await expect(button(page, 'Constitution check +3')).toBeVisible();
    await expect(button(page, 'Constitution save +6')).toBeVisible();
  });

  test('a homebrew trait worded "your Constitution score increases by 2" works without an effect list', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ race: [trait('Hardy', 'Your Constitution score increases by 2.')] }));
    await page.goto('/');
    await expect(button(page, 'Constitution check +3')).toBeVisible();
  });

  test('a bonus never takes a score above 30', async ({ page, seedSheet }) => {
    // PHB 2024, Ability Scores: a score can be at most 30. 29 + 4 stops at 30 (+10); 33 would be +11.
    // (+2 wouldn't do: 31 is also +10.)
    await seedSheet(brakka({ ab: { ...brakka().ab as object, str: 29 }, race: [trait('Mighty', '', [['ab', 'str', 4]])] }));
    await page.goto('/');
    await expect(button(page, 'Strength check +10')).toBeVisible();
  });

  test('Gauntlets of Ogre Power make Strength 19 once attuned', async ({ page, seedSheet }) => {
    await test.step('not attuned: Strength stays 16 (+3)', async () => {
      await seedSheet(brakka({ items: [gauntlets(false)] }));
      await page.goto('/');
      await expect(button(page, 'Strength check +3')).toBeVisible();
    });
    await test.step('attuned: Strength 19 (+4); Athletics +4, proficient +3 = +7', async () => {
      await page.getByRole('button', { name: 'Attune Gauntlets of Ogre Power', exact: true }).click();
      await expect(button(page, 'Strength check +4')).toBeVisible();
      await expect(button(page, 'Athletics +7')).toBeVisible();
    });
  });

  test('Gauntlets of Ogre Power never lower a higher Strength', async ({ page, seedSheet }) => {
    // Str 18 with a +2 trait is 20, above the Gauntlets' 19: it stays 20 (+5).
    await seedSheet(brakka({ ab: { ...brakka().ab as object, str: 18 }, race: [trait('Mighty', '', [['ab', 'str', 2]])], items: [gauntlets()] }));
    await page.goto('/');
    await expect(button(page, 'Strength check +5')).toBeVisible();
  });
});

test.describe('bonuses to checks and saves', () => {
  test('a Stone of Good Luck adds 1 to every ability check and saving throw', { tag: '@smoke' }, async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [luckstone()] }));
    await page.goto('/');
    await expect(button(page, 'Strength check +4')).toBeVisible(); // +3, +1
    await expect(button(page, 'Athletics +7')).toBeVisible(); // +3, proficient +3, +1
    // PHB 2024, Initiative: a Dexterity check, so the bonus counts. +1, +1.
    await expect(button(page, 'Initiative +2')).toBeVisible();
    // PHB 2024, Passive Perception: 10 + the Perception check's modifier. 10 + 0 + 3 + 1.
    await expect(passive(page)).toHaveText('Passive Perception14');
    await expect(button(page, 'Strength save +7')).toBeVisible(); // +3, proficient +3, +1
    await expect(button(page, 'Dexterity save +2')).toBeVisible(); // +1, +1
  });

  test('bonuses from differently named sources add up', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [luckstone()], feats: [{ n: 'Blessed', t: 'Feat', d: '', fx: [['chk', '', 1]] }] }));
    await page.goto('/');
    await expect(button(page, 'Strength check +5')).toBeVisible(); // +3, +1, +1
  });

  test(
    'two of the same item do not add up',
    { annotation: { type: 'issue', description: 'https://github.com/VarunCodes/free-action/issues/38' } },
    async ({ page, seedSheet }) => {
      // Known bug: the sheet adds both, so the check shows +5 and the save +8.
      test.fail();
      // SRD 5.2, Magic Items, Attunement: a creature can't attune to more than one copy of a magic item.
      // So only one of two Stones of Good Luck works: +1, not +2.
      await seedSheet(brakka({ items: [luckstone(), luckstone()] }));
      await page.goto('/');
      await expect(button(page, 'Strength check +4')).toBeVisible();
      await expect(button(page, 'Strength save +7')).toBeVisible();
    },
  );

  test('spell attack and save DC bonuses count everywhere they are shown', async ({ page, seedSheet }) => {
    // Charisma caster, Cha 13 (+1), proficiency +3.
    // PHB 2024, Spellcasting: save DC = 8 + modifier + proficiency = 12; attack = modifier + proficiency = +4.
    // A homebrew +1 focus to both: DC 13, attack +5. A spell with an attack and a Wisdom save shows them too.
    const focus = magic('Spellcasting Focus, +1', [['sa', '', 1], ['dc', '', 1]]);
    const spell = { n: 'Test Bolt', l: 1, p: true, d: '', r: { a: true, s: 'wis', d: '' } };
    await seedSheet(brakka({ cast: 'cha', items: [focus], spells: [spell] }));
    await page.goto('/');
    await test.step('the Spellcasting summary', async () => {
      await expect(page.getByText(/^Save DC \d+$/)).toHaveText('Save DC 13');
      await expect(page.getByText(/^Attack [+-]\d+$/)).toHaveText('Attack +5');
    });
    await test.step("the spell's own attack and DC", async () => {
      await expect(page.getByText('DC 13 Wis', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Hit +5', exact: true }).click();
      await expect(page.getByLabel('Chat command')).toHaveValue('/r 1d20+5 # Test Bolt attack');
    });
  });
});

test.describe('Advantage', () => {
  test('Advantage on Initiative rolls two d20s and keeps the higher', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ items: [magic('Weapon of Warning', [['adv', 'init', 0]])] }));
    await page.goto('/');
    await rollFormula(page, 'Initiative +1', '/r 2d20kh1+1 # Initiative');
  });

  test('Advantage on Perception adds 5 to Passive Perception', async ({ page, seedSheet }) => {
    // PHB 2024, Passive Perception: +5 with Advantage. 10 + 0 + 3 + 5.
    await seedSheet(brakka({ race: [trait('Keen Eyes', '', [['adv', 'Perception', 0]])] }));
    await page.goto('/');
    await expect(passive(page)).toHaveText('Passive Perception18');
  });

  test('Advantage and Disadvantage on Stealth cancel out', async ({ page, seedSheet }) => {
    // PHB 2024, Advantage/Disadvantage: with both, you have neither. Chain Mail gives Disadvantage on
    // Stealth; the Cloak of Elvenkind gives Advantage. One d20, Dex +1.
    const chain = { n: 'Chain Mail', q: 1, eq: true, on: true, ar: { k: 'heavy', ac: 16, str: 13, stl: true } };
    await seedSheet(brakka({ items: [chain, magic('Cloak of Elvenkind', [['adv', 'Stealth', 0]])] }));
    await page.goto('/');
    // Both sources are seen (the Stealth row shows both pills), and the roll is a single d20.
    await expect(page.getByTitle('Disadvantage from Chain Mail', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Advantage from Cloak of Elvenkind', { exact: true })).toBeVisible();
    await rollFormula(page, 'Stealth +1', '/r 1d20+1 # Stealth');
  });
});

test.describe('skill proficiency', () => {
  test('a trait that grants Stealth proficiency adds the proficiency bonus', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ race: [trait('Sneaky', '', [['sk', 'Stealth', 1]])] }));
    await page.goto('/');
    await expect(button(page, 'Stealth +4')).toBeVisible(); // Dex +1, proficient +3
  });

  test('a trait that grants Stealth Expertise doubles it', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ race: [trait('Very Sneaky', '', [['sk', 'Stealth', 2]])] }));
    await page.goto('/');
    await expect(button(page, 'Stealth +7')).toBeVisible(); // Dex +1, Expertise 2 x 3
  });

  test('a trait worded "proficiency in the Stealth skill" works without an effect list', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ race: [trait('Shadowborn', 'You have proficiency in the Stealth skill.')] }));
    await page.goto('/');
    await expect(button(page, 'Stealth +4')).toBeVisible();
  });

  test('Keen Senses counts once a skill is picked for it', async ({ page, seedSheet, savedSheet }) => {
    // SRD 5.2, Elf, Keen Senses: proficiency in Insight, Perception or Survival.
    await seedSheet(brakka({ race: [trait('Keen Senses', 'You have proficiency in the Insight, Perception, or Survival skill.')] }));
    await page.goto('/');
    await expect(button(page, 'Insight +0')).toBeVisible(); // nothing picked yet

    await test.step('pick Insight in Edit mode', async () => {
      await switchMode(page, 'Edit');
      await page.getByLabel('Keen Senses skill', { exact: true }).selectOption('Insight');
      await expect.poll(savedSheet).toMatchObject({ race: [{ n: 'Keen Senses', ch: ['Insight'] }] });
      await switchMode(page, 'Play');
    });
    await expect(button(page, 'Insight +3')).toBeVisible(); // Wis +0, proficient +3
  });
});

test('a trait worded "Hit Point maximum increases by 2… again whenever you gain a level" adds 2 HP per level', async ({ page, seedSheet }) => {
  // Brakka at level 5: (10 + 2) + 4 x (6 + 2) = 44, plus 2 x 5 = 54.
  const d = 'Your Hit Point maximum increases by 2, and it increases by 2 again whenever you gain a level.';
  await seedSheet(brakka({ mode: 'edit', race: [trait('Tough Hide', d)] }));
  await page.goto('/');
  await expect(page.getByText(/^Average max HP/)).toHaveText('Average max HP for level 5 (d10, Con +2, Tough Hide +2/level): 54 Use 54');
});
