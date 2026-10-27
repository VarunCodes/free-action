import { test, expect, loadSheet, answerConfirm } from '../fixtures';

// "New character" replaces the sheet, so the old one must stay recoverable from
// "Restore an earlier version", which keeps the last few versions in this browser.

test.beforeEach(async ({ page, seedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
});

test('New character starts a blank sheet, and the old one can be restored', async ({ page, savedSheet }) => {
  await test.step('start a new character', async () => {
    const asked = answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'New character' }).click();
    expect(await asked).toContain('"Restore an earlier version"');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New Hero');
    await expect.poll(savedSheet).toMatchObject({ name: 'New Hero', level: 1, cls: '' });
  });

  await test.step('restore the latest version of the old character', async () => {
    // The app skips a snapshot identical to the newest one, so the old character may be listed
    // as "(opened)" rather than "(before new character)". Either way it must be in the list.
    const versions = page.getByLabel('Earlier version');
    const before = versions.getByRole('option', { name: /: Brakka( \(|$)/ }).first();
    await versions.selectOption((await before.getAttribute('value'))!);
    const asked = answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'Restore an earlier version' }).click();
    expect(await asked).toContain('Restore "Brakka"');
  });

  const original = loadSheet('fighter-5');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect(page.getByText('Dwarf, Fighter, Level 5')).toBeVisible();
  await expect.poll(savedSheet).toMatchObject({ name: 'Brakka', cls: 'Fighter', level: 5, ab: original.ab, sk: original.sk, hp: original.hp });
});

test('cancelling New character keeps the current character', async ({ page, savedSheet }) => {
  answerConfirm(page, 'cancel');
  await page.getByRole('button', { name: 'New character' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect.poll(savedSheet).toMatchObject({ name: 'Brakka', level: 5 });
});

test('a change saved in one tab shows up in another open tab', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Brakka');

  await test.step('rename the character in the first tab', async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Brakka Stonefist');
    await name.blur();
  });

  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Brakka Stonefist');
});
