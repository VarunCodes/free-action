import { test, expect, loadSheet, type Sheet } from './fixtures';

// The top of the sheet: the name and one-line summary, the Play/Edit switch, and in Edit the Class and
// Species pickers with their Custom… boxes. What picking a class or species does to the numbers is
// tested in rules/classes.spec.ts and library/species.spec.ts.

const brakka = (extra: Sheet = {}) => ({ ...loadSheet('fighter-5'), ...extra });

test.describe('Play', () => {
  test('the summary reads species, class with subclass, and level', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'play', species: 'Dwarf', cls: 'Fighter', sub: 'Champion', level: 5 }));
    await page.goto('/');

    await expect(page.getByText('Dwarf, Fighter (Champion), Level 5')).toBeVisible();
  });

  test('a character without a name, species or class shows "Unnamed" and only the level', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'play', name: '', species: '', cls: '', sub: '', level: 3 }));
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unnamed');
    await expect(page.getByText('Level 3', { exact: true })).toBeVisible();
  });

  test("the current mode's button is marked", async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'play' }));
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveClass(/\bon\b/);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).not.toHaveClass(/\bon\b/);
  });
});

test.describe('Edit', () => {
  test('a homebrew class shows its name and hit die in the Custom boxes', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'edit', cls: 'Blood Hunter', hdie: 10 }));
    await page.goto('/');

    await expect(page.getByLabel('Class', { exact: true })).toHaveValue('*');
    await expect(page.getByLabel('Custom class', { exact: true })).toHaveValue('Blood Hunter');
    await expect(page.getByLabel('Custom class hit die')).toHaveValue('10');
  });

  test('a custom class can have any of the d6, d8, d10 and d12 hit dice', async ({ page, seedSheet }) => {
    // PHB 2024: every class's Hit Point Die is one of these.
    await seedSheet(brakka({ mode: 'edit', cls: 'Blood Hunter', hdie: 0 }));
    await page.goto('/');

    await expect(page.getByLabel('Custom class hit die').getByRole('option'))
      .toHaveText(['Hit die: not set', 'Hit die: d6', 'Hit die: d8', 'Hit die: d10', 'Hit die: d12']);
  });

  test('a homebrew species shows its name in the Custom box', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'edit', species: 'Kobold' }));
    await page.goto('/');

    await expect(page.getByLabel('Species', { exact: true })).toHaveValue('*');
    await expect(page.getByLabel('Custom species')).toHaveValue('Kobold');
  });

  test('a class or species typed in any case and spacing is picked from the list', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'edit', cls: ' fighter ', species: ' elf ' }));
    await page.goto('/');

    await expect(page.getByLabel('Class', { exact: true })).toHaveValue('Fighter');
    await expect(page.getByLabel('Species', { exact: true })).toHaveValue('Elf');
    await expect(page.getByLabel('Custom species')).toHaveCount(0);
  });

  test("the Library's species are offered in alphabetical order, each once", async ({ page, seedSheet, seedPacks }) => {
    const species = (name: string, sub: string) => ({
      kind: 'race', name, level: 0, sub, desc: '', src: 'Custom', traits: [],
    });
    await seedPacks([species('Windkin', 'Custom'), species('Aasimar', 'Custom'), species('Windkin', 'Homebrew')]);
    await seedSheet(brakka({ mode: 'edit', species: '' }));
    await page.goto('/');

    await expect(page.getByLabel('Species', { exact: true }).getByRole('option'))
      .toHaveText(['Choose a species', 'Aasimar', 'Windkin', 'Custom…']);
  });
});
