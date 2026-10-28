import { test, expect, loadSheet, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Picking a class sets its saving throw proficiencies, spellcasting ability and Hit Point Die.
// The expected values are each class's Core Traits table in the PHB 2024.
const CLASSES = [
  { cls: 'Barbarian', sv: ['str', 'con'], cast: '', hd: 12 },
  { cls: 'Bard', sv: ['dex', 'cha'], cast: 'cha', hd: 8 },
  { cls: 'Cleric', sv: ['wis', 'cha'], cast: 'wis', hd: 8 },
  { cls: 'Druid', sv: ['int', 'wis'], cast: 'wis', hd: 8 },
  { cls: 'Fighter', sv: ['str', 'con'], cast: '', hd: 10 },
  { cls: 'Monk', sv: ['str', 'dex'], cast: '', hd: 8 },
  { cls: 'Paladin', sv: ['wis', 'cha'], cast: 'cha', hd: 10 },
  { cls: 'Ranger', sv: ['str', 'dex'], cast: 'wis', hd: 10 },
  { cls: 'Rogue', sv: ['dex', 'int'], cast: '', hd: 8 },
  { cls: 'Sorcerer', sv: ['con', 'cha'], cast: 'cha', hd: 6 },
  { cls: 'Warlock', sv: ['wis', 'cha'], cast: 'cha', hd: 8 },
  { cls: 'Wizard', sv: ['int', 'wis'], cast: 'int', hd: 6 },
];

const saves = (...abilities: string[]) => Object.fromEntries(abilities.map(a => [a, true]));
const classBox = (page: Page) => page.getByLabel('Class', { exact: true });
const hitDice = (page: Page) => page.getByText(/^Hit dice \d+ of \d+/);

// What the sheet saved for the fields a class sets.
const classPart = async (savedSheet: () => Promise<Sheet | null>) => {
  const s = (await savedSheet())!;
  return { cls: s.cls, sv: s.sv, cast: s.cast };
};

test.describe('a new level 1 character picks a class', () => {
  for (const c of CLASSES) {
    test(`${c.cls}: ${c.sv.join(' and ')} saves, ${c.cast || 'no'} spellcasting, d${c.hd} Hit Dice`, async ({ page, seedSheet, savedSheet }) => {
      await seedSheet({ name: 'Nova', mode: 'edit' });
      await page.goto('/');
      await classBox(page).selectOption(c.cls);

      await expect.poll(() => classPart(savedSheet)).toEqual({ cls: c.cls, sv: saves(...c.sv), cast: c.cast });
      await expect(hitDice(page)).toHaveText(`Hit dice 1 of 1 (d${c.hd})`);
    });
  }
});

test.describe('changing class', () => {
  // Brakka (fighter-5) starts as a Fighter: Strength and Constitution saves, no spellcasting.
  test.beforeEach(async ({ page, seedSheet }) => {
    await seedSheet({ ...loadSheet('fighter-5'), mode: 'edit' });
    await page.goto('/');
    await expect(classBox(page)).toHaveValue('Fighter');
  });

  test("swaps the old class's saves for the new one's, and keeps a save added by hand", async ({ page, savedSheet }) => {
    await test.step('add a Dexterity save by hand', async () => {
      await page.getByRole('button', { name: 'Dexterity save proficiency', exact: true }).click();
      await expect.poll(() => classPart(savedSheet)).toMatchObject({ sv: saves('str', 'con', 'dex') });
    });

    await classBox(page).selectOption('Wizard');
    // Fighter's Strength and Constitution go, Wizard's Intelligence and Wisdom come, Dexterity stays.
    await expect.poll(() => classPart(savedSheet)).toEqual({ cls: 'Wizard', sv: saves('dex', 'int', 'wis'), cast: 'int' });
  });

  test('a spellcasting ability picked by hand stays', async ({ page, savedSheet }) => {
    // A Fighter has no spellcasting ability, so Charisma can only have been picked by hand.
    await page.getByLabel('Spellcasting ability', { exact: true }).selectOption('Charisma');
    await classBox(page).selectOption('Wizard');
    await expect.poll(() => classPart(savedSheet)).toMatchObject({ cls: 'Wizard', cast: 'cha' });
    await expect(page.getByRole('status')).toHaveText(
      'Wizard: proficient in Intelligence and Wisdom saving throws, spellcasting stays Charisma (Wizards usually use Intelligence). You can change these below.',
    );
  });

  test("the class's own spellcasting ability follows the class", async ({ page, savedSheet }) => {
    await test.step('Fighter to Wizard: Intelligence', async () => {
      await classBox(page).selectOption('Wizard');
      await expect.poll(() => classPart(savedSheet)).toMatchObject({ cast: 'int' });
    });
    await test.step('Wizard to Sorcerer: Charisma', async () => {
      await classBox(page).selectOption('Sorcerer');
      await expect.poll(() => classPart(savedSheet)).toEqual({ cls: 'Sorcerer', sv: saves('con', 'cha'), cast: 'cha' });
    });
  });

  test('the Hit Dice follow the class', async ({ page }) => {
    await expect(hitDice(page)).toHaveText('Hit dice 5 of 5 (d10)');
    await classBox(page).selectOption('Barbarian');
    await expect(hitDice(page)).toHaveText('Hit dice 5 of 5 (d12)');
  });
});

test.describe('custom class', () => {
  test.beforeEach(async ({ page, seedSheet }) => {
    await seedSheet({ name: 'Nova', mode: 'edit' });
    await page.goto('/');
    await classBox(page).selectOption('Custom…');
  });

  test('typing the name of a standard class picks that class', async ({ page, savedSheet }) => {
    const name = page.getByLabel('Custom class', { exact: true });
    await name.fill('wizard');
    await name.blur();
    await expect(classBox(page)).toHaveValue('Wizard');
    await expect.poll(() => classPart(savedSheet)).toEqual({ cls: 'Wizard', sv: saves('int', 'wis'), cast: 'int' });
  });

  test('without a hit die there are no Hit Dice or average HP; with one, there are', async ({ page, savedSheet }) => {
    await test.step('name a custom class: no hit die yet', async () => {
      const name = page.getByLabel('Custom class', { exact: true });
      await name.fill('Blood Hunter');
      await name.blur();
      await expect(hitDice(page)).toHaveCount(0);
      await expect(page.getByText(/^Average max HP/)).toHaveCount(0);
    });

    await test.step('pick a d10', async () => {
      await page.getByLabel('Custom class hit die', { exact: true }).selectOption('Hit die: d10');
      await expect.poll(savedSheet).toMatchObject({ cls: 'Blood Hunter', hdie: 10 });
      await expect(hitDice(page)).toHaveText('Hit dice 1 of 1 (d10)');
      // Level 1 with Con 10 (+0): the full d10, so 10.
      await expect(page.getByText(/^Average max HP/)).toHaveText(/: 10 Use 10$/);
    });
  });
});
