import { test, expect, loadSheet, switchMode } from './fixtures';

const smoke = { tag: '@smoke' };

test('a first visit opens a blank character', smoke, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New Hero');
  await expect(page).toHaveTitle('New Hero · Character Sheet');
});

test('a saved character opens with its name, species, class and level', smoke, async ({ page, seedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect(page.getByText('Dwarf, Fighter, Level 5')).toBeVisible();
});

test('an edit is saved and survives a reload', smoke, async ({ page, seedSheet, savedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');

  await test.step('rename the character in Edit mode', async () => {
    await switchMode(page, 'Edit');
    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Brakka Stonefist');
    await name.blur();
  });

  await expect.poll(savedSheet).toMatchObject({ name: 'Brakka Stonefist' });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka Stonefist');
});

test('the sheet fits the screen without sideways scrolling', smoke, async ({ page, seedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
});
