import { test, expect, loadSheet } from '../fixtures';

// Brakka, level 5 (proficiency +3): Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 8 (-1),
// Wis 10 (+0), Cha 13 (+1). Proficient in Strength and Constitution saves, Athletics and
// Perception; this file adds Expertise in Insight.
const brakka = { ...loadSheet('fighter-5'), sk: { Athletics: 1, Perception: 1, Insight: 2 } };

test.beforeEach(async ({ page, seedSheet }) => {
  await seedSheet(brakka);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
});

test('saving throws add proficiency only where the character is proficient', async ({ page }) => {
  // PHB 2024, Saving Throws: ability modifier, plus the proficiency bonus if proficient.
  const saves = {
    Strength: '+6', // +3 + 3
    Dexterity: '+1', // +1
    Constitution: '+5', // +2 + 3
    Intelligence: '-1', // -1
    Wisdom: '+0', // +0
    Charisma: '+1', // +1
  };
  for (const [ability, total] of Object.entries(saves)) {
    await expect(page.getByRole('button', { name: `${ability} save ${total}` })).toBeVisible();
  }
});

test('skills add proficiency, Expertise adds it twice, and other skills use the bare modifier', async ({ page }) => {
  // PHB 2024: a skill check adds the proficiency bonus if proficient; Expertise doubles it.
  await expect(page.getByRole('button', { name: 'Athletics +6' })).toBeVisible(); // Str +3, proficient +3
  await expect(page.getByRole('button', { name: 'Perception +3' })).toBeVisible(); // Wis +0, proficient +3
  await expect(page.getByRole('button', { name: 'Insight +6' })).toBeVisible(); // Wis +0, Expertise 2 x 3
  await expect(page.getByRole('button', { name: 'Stealth +1' })).toBeVisible(); // Dex +1, not proficient
  await expect(page.getByRole('button', { name: 'Arcana -1' })).toBeVisible(); // Int -1, not proficient
});

test('Passive Perception is 10 plus the Perception modifier', async ({ page }) => {
  // PHB 2024, Passive Perception: 10 + Wisdom (Perception) check modifier = 10 + 3 = 13.
  await expect(page.getByRole('group', { name: 'Passive Perception' })).toHaveText('Passive Perception13');
});

test('Initiative is the Dexterity modifier plus any Initiative bonus', async ({ page }) => {
  // PHB 2024, Initiative: a Dexterity check, so Dex +1.
  await expect(page.getByRole('button', { name: 'Initiative +1' })).toBeVisible();

  await test.step('add a +2 Initiative bonus in Edit mode', async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const bonus = page.getByLabel('Init bonus');
    await bonus.fill('2');
    await bonus.blur();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  });

  // Dex +1, bonus +2 = +3.
  await expect(page.getByRole('button', { name: 'Initiative +3' })).toBeVisible();
});

test('a roll uses the same bonus its button shows', async ({ page }) => {
  // The bonus shown and the bonus rolled are computed separately in the app, so they can drift.
  // The chat command shows the formula rolled (Foundry format: /r 1d20+N # label), whatever the dice.
  const command = page.getByLabel('Chat command');
  const rolls: [button: string, formula: string][] = [
    ['Insight +6', '/r 1d20+6 # Insight'], // Expertise: Wis +0, 2 x 3
    ['Athletics +6', '/r 1d20+6 # Athletics'], // proficient: Str +3, +3
    ['Strength save +6', '/r 1d20+6 # Strength save'], // proficient: +3 + 3
    ['Charisma check +1', '/r 1d20+1 # Charisma check'], // Cha +1
    ['Initiative +1', '/r 1d20+1 # Initiative'], // Dex +1
  ];
  for (const [button, formula] of rolls) {
    await test.step(`roll ${button}`, async () => {
      // Checked first, so a wrong displayed bonus fails here quickly instead of timing out on click.
      await expect(page.getByRole('button', { name: button })).toBeVisible();
      await page.getByRole('button', { name: button }).click();
      await expect(command).toHaveValue(formula);
    });
  }
});

test('an Initiative bonus is rolled as well as shown', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const bonus = page.getByLabel('Init bonus');
  await bonus.fill('2');
  await bonus.blur();
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  // Dex +1, bonus +2 = +3.
  await expect(page.getByRole('button', { name: 'Initiative +3' })).toBeVisible();
  await page.getByRole('button', { name: 'Initiative +3' }).click();
  await expect(page.getByLabel('Chat command')).toHaveValue('/r 1d20+3 # Initiative');
});

test('tapping a skill in Edit mode cycles none, proficient, Expertise and back to none', async ({ page }) => {
  // Stealth: Dex +1. Proficient adds +3, Expertise adds +6.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const stealth = page.getByRole('button', { name: 'Stealth proficiency' });
  await expect(stealth).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Stealth +1' })).toBeVisible();

  await stealth.click();
  await expect(stealth).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stealth +4' })).toBeVisible();

  await stealth.click();
  await expect(page.getByRole('button', { name: 'Stealth +7' })).toBeVisible();

  await stealth.click();
  await expect(stealth).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Stealth +1' })).toBeVisible();
});
