import { test, expect, loadSheet, answerConfirm } from '../fixtures';

// "New character" replaces the sheet, so the old one must stay recoverable from
// "Restore an earlier version", which keeps the last few versions in this browser.

test.beforeEach(async ({ page, seedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
});

test('New character starts a blank sheet, and the old one can be restored', async ({ page, savedSheet }) => {
  let before: unknown;

  // The app skips a snapshot identical to the newest one, and the newest is taken when the page
  // opens. An edit after opening means the "before new character" snapshot is the only copy of it.
  await test.step('take 14 damage, so the sheet differs from when the page opened', async () => {
    await page.getByLabel('Amount').fill('14');
    await page.getByRole('button', { name: 'Damage' }).click();
    await expect.poll(savedSheet).toMatchObject({ hp: { cur: 30, max: 44 } });
    before = await savedSheet();
  });

  await test.step('start a new character', async () => {
    const asked = answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'New character' }).click();
    expect(await asked).toContain('"Restore an earlier version"');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New Hero');
    await expect.poll(savedSheet).toMatchObject({ name: 'New Hero', level: 1, cls: '' });
  });

  await test.step('restore the version saved before the new character', async () => {
    const versions = page.getByLabel('Earlier version');
    const snapshot = versions.getByRole('option', { name: /: Brakka \(before new character\)$/ });
    await versions.selectOption((await snapshot.getAttribute('value'))!);
    const asked = answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'Restore an earlier version' }).click();
    expect(await asked).toContain('Restore "Brakka"');
  });

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect(page.getByText('Dwarf, Fighter, Level 5')).toBeVisible();
  await expect.poll(savedSheet).toEqual(before);
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
