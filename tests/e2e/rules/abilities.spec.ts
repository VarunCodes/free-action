import { test, expect, loadSheet } from '../fixtures';

// PHB 2024, Ability Modifiers: subtract 10 from the score, then divide by 2, rounding down.
// The scores cover odd and even values, both signs, and the 1 and 30 limits.
const cases: { scores: Record<string, number>; checks: Record<string, string> }[] = [
  {
    scores: { str: 1, dex: 3, con: 8, int: 9, wis: 10, cha: 11 },
    // (1-10)/2 = -4.5 -> -5; (3-10)/2 = -3.5 -> -4; 8 and 9 -> -1; 10 and 11 -> +0.
    checks: { Strength: '-5', Dexterity: '-4', Constitution: '-1', Intelligence: '-1', Wisdom: '+0', Charisma: '+0' },
  },
  {
    scores: { str: 12, dex: 15, con: 20, int: 29, wis: 30, cha: 13 },
    // 12 -> +1; 15 -> +2; 20 -> +5; (29-10)/2 = 9.5 -> +9; 30 -> +10; 13 -> +1.
    checks: { Strength: '+1', Dexterity: '+2', Constitution: '+5', Intelligence: '+9', Wisdom: '+10', Charisma: '+1' },
  },
];

for (const { scores, checks } of cases) {
  const list = Object.values(scores).join(', ');
  test(`ability modifiers are right for scores ${list}`, async ({ page, seedSheet }) => {
    await seedSheet({ ...loadSheet('fighter-5'), ab: scores });
    await page.goto('/');

    for (const [ability, modifier] of Object.entries(checks)) {
      await expect(page.getByRole('button', { name: `${ability} check ${modifier}`, exact: true })).toBeVisible();
    }
  });
}

test('a zero or negative modifier is rolled as written', async ({ page, seedSheet }) => {
  await seedSheet({ ...loadSheet('fighter-5'), ab: cases[0].scores });
  await page.goto('/');
  const command = page.getByLabel('Chat command');

  await test.step('roll Strength (score 1, modifier -5)', async () => {
    await expect(page.getByRole('button', { name: 'Strength check -5', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Strength check -5', exact: true }).click();
    await expect(command).toHaveValue('/r 1d20-5 # Strength check');
  });

  await test.step('roll Wisdom (score 10, modifier +0)', async () => {
    await expect(page.getByRole('button', { name: 'Wisdom check +0', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Wisdom check +0', exact: true }).click();
    // App convention, not a rule: a +0 bonus is left out of the formula.
    await expect(command).toHaveValue('/r 1d20 # Wisdom check');
  });
});
