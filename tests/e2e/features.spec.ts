import { test, expect, loadSheet, switchMode, type Sheet } from './fixtures';

// The Features and feats and Racial features lists: showing a feature, opening it, and in Edit
// adding, describing and removing features, and picking the skills a feature lets you choose.
// What effects add up to is tested in rules/effects.spec.ts.

// Brakka (fighter-5): Int 8 (-1), level 5 (proficiency +3), no feats or racial features.
const brakka = (extra: Sheet = {}) => ({ ...loadSheet('fighter-5'), feats: [], race: [], ...extra });

test.describe('Play', () => {
  test('empty lists say there is nothing yet', async ({ page, seedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');

    await expect(page.getByText('None yet.')).toHaveCount(2);
  });

  test('a feature shows its type, and opens to its description when tapped', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ feats: [{ n: 'Second Wind', t: 'Class feature', d: 'Regain **hit points**.' }] }));
    await page.goto('/');

    await expect(page.getByText('Class feature', { exact: true })).toBeVisible();
    await expect(page.getByText('Regain hit points.')).toBeHidden();

    await page.getByText('Second Wind', { exact: true }).click();
    await expect(page.getByText('Regain hit points.')).toBeVisible();
  });

  test('an opened feature stays open when the page redraws', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ feats: [{ n: 'Second Wind', t: 'Class feature', d: 'Regain hit points.' }] }));
    await page.goto('/');

    await page.getByText('Second Wind', { exact: true }).click();
    // Rolling a skill redraws the whole sheet.
    await page.getByRole('button', { name: /^Athletics [+-]\d/ }).click();
    await expect(page.getByLabel('Roll total')).toBeVisible();

    await expect(page.getByText('Regain hit points.')).toBeVisible();
  });

  test('a feature without a description says so when opened', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ race: [{ n: 'Darkvision', d: '' }] }));
    await page.goto('/');

    await page.getByText('Darkvision', { exact: true }).click();
    await expect(page.getByText('No description.')).toBeVisible();
  });

  test('what a feature changes shows next to its name', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ feats: [{ n: 'Lucky Charm', t: 'Feat', d: '', fx: [['chk', '', 1]] }] }));
    await page.goto('/');

    await expect(page.getByText('+1 ability checks', { exact: true })).toBeVisible();
  });
});

test.describe('Edit', () => {
  test('adds a feat with its type, describes it, and removes it', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    await switchMode(page, 'Edit');

    await test.step('add Tough as a feat', async () => {
      await page.getByLabel('New feature name').fill('Tough');
      await page.getByLabel('New feature type').selectOption('Feat');
      await page.getByRole('button', { name: 'Add feature', exact: true }).click();
      await expect.poll(savedSheet).toMatchObject({ feats: [{ n: 'Tough', t: 'Feat' }] });
    });

    await test.step('describe it', async () => {
      await page.getByLabel('Tough description').fill('Your Hit Point maximum increases.');
      await page.getByLabel('Tough description').press('Tab');
      await expect.poll(savedSheet).toMatchObject({ feats: [{ n: 'Tough', d: 'Your Hit Point maximum increases.' }] });
    });

    await test.step('remove it', async () => {
      await page.getByRole('button', { name: 'Remove Tough' }).click();
      await expect.poll(savedSheet).toMatchObject({ feats: [] });
      await expect(page.getByText('None yet.')).toHaveCount(2);
    });
  });

  test('adds a racial feature, which has no type', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    await switchMode(page, 'Edit');

    // Only Features and feats asks for a type.
    await expect(page.getByLabel('New feature type')).toHaveCount(1);

    await page.getByLabel('New racial feature name').fill('Darkvision');
    await page.getByRole('button', { name: 'Add racial feature' }).click();
    await expect.poll(savedSheet).toMatchObject({ race: [{ n: 'Darkvision', t: '' }] });
  });

  test('a feature with several skill choices numbers them and keeps each pick', async ({ page, seedSheet, savedSheet }) => {
    // SRD 5.2, Skilled: proficiency in any combination of three skills (two here). Arcana is picked.
    const skilled = { n: 'Skilled', t: 'Feat', d: '', fx: [['sk', '?', 1], ['sk', '?', 1]], ch: ['Arcana', ''] };
    await seedSheet(brakka({ feats: [skilled] }));
    await page.goto('/');
    await switchMode(page, 'Edit');

    await expect(page.getByLabel('Skilled skill 1')).toHaveValue('Arcana');
    await expect(page.getByLabel('Skilled skill 2')).toHaveValue('');

    await page.getByLabel('Skilled skill 2').selectOption('History');
    await expect.poll(savedSheet).toMatchObject({ feats: [{ n: 'Skilled', ch: ['Arcana', 'History'] }] });

    // Proficient in History now: Int -1 + proficiency +3 = +2.
    await switchMode(page, 'Play');
    await expect(page.getByRole('button', { name: 'History +2' })).toBeVisible();
  });

  test('a choice from a list offers only those skills', async ({ page, seedSheet }) => {
    // SRD 5.2, Elf, Keen Senses: proficiency in Insight, Perception or Survival.
    const keenSenses = { n: 'Keen Senses', d: '', fx: [['sk', '?Insight|Perception|Survival', 1]] };
    await seedSheet(brakka({ race: [keenSenses] }));
    await page.goto('/');
    await switchMode(page, 'Edit');

    await expect(page.getByLabel('Keen Senses skill', { exact: true }).getByRole('option'))
      .toHaveText(['Choose a skill', 'Insight', 'Perception', 'Survival']);
  });
});
