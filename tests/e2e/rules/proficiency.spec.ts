import { test, expect, loadSheet } from '../fixtures';

// PHB 2024, Proficiency Bonus by character level: +2 at levels 1-4, +3 at 5-8, +4 at 9-12,
// +5 at 13-16, +6 at 17-20. Both ends of every band are checked, so an off-by-one fails.
const bands: [level: number, bonus: string][] = [
  [1, '+2'], [4, '+2'],
  [5, '+3'], [8, '+3'],
  [9, '+4'], [12, '+4'],
  [13, '+5'], [16, '+5'],
  [17, '+6'], [20, '+6'],
];

for (const [level, bonus] of bands) {
  test(`a level ${level} character has a proficiency bonus of ${bonus}`, async ({ page, seedSheet }) => {
    await seedSheet({ ...loadSheet('fighter-5'), level });
    await page.goto('/');

    await expect(page.getByRole('group', { name: 'Proficiency' }).getByText(bonus, { exact: true })).toBeVisible();
  });
}

test('levelling up raises the proficiency bonus everywhere it is used', async ({ page, seedSheet }) => {
  // Brakka: Str 16 (+3), proficient in Athletics and Strength saves.
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
  // Level 5: proficiency +3. Athletics = +3 Str + 3 = +6.
  await expect(page.getByRole('button', { name: 'Athletics +6' })).toBeVisible();

  await test.step('change the level from 5 to 9 in Edit mode', async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const level = page.getByLabel('Level', { exact: true });
    await level.fill('9');
    await level.blur();
  });

  // Level 9: proficiency +4. Athletics = +3 Str + 4 = +7; Strength save = +3 + 4 = +7.
  await expect(page.getByRole('group', { name: 'Proficiency' }).getByText('+4', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Athletics +7' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Strength save +7' })).toBeVisible();
});
