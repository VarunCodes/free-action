import { readFile } from 'node:fs/promises';
import { test, expect, loadSheet, answerConfirm } from '../fixtures';

// The browser holds the only copy of a character, so a backup has to bring back everything.
// Round trips compare the whole saved sheet, not just the name: partial data loss must fail.

test.beforeEach(async ({ page, seedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
});

test('Export then Import brings back the same character', async ({ page, context, browserName, savedSheet }) => {
  // Export also copies to the clipboard. A real click in a focused Chrome tab is allowed to;
  // headless Chromium isn't unless granted. (Without it, see issue #25 and the test below.)
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-write']);
  const backup = page.getByLabel('Backup JSON');
  let exported = '';
  let before: unknown;

  await test.step('export the character', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(backup).not.toHaveValue('');
    exported = await backup.inputValue();
    before = await savedSheet();
    expect(JSON.parse(exported)).toEqual(before);
  });

  await test.step('start a new character', async () => {
    answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'New character' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New Hero');
  });

  await test.step('import the exported JSON', async () => {
    const asked = answerConfirm(page, 'accept');
    await backup.fill(exported);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    expect(await asked).toContain('Replace "New Hero" with "Brakka"?');
  });

  await expect(page.getByRole('status')).toHaveText('Imported "Brakka".');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect.poll(savedSheet).toEqual(before);
});

test(
  'Export still works when the clipboard is unavailable',
  { annotation: { type: 'issue', description: 'https://github.com/VarunCodes/free-action/issues/25' } },
  async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium refuses the clipboard write here');
    test.fail(); // Known bug #25: the refused clipboard write is an uncaught error on the page.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByLabel('Backup JSON')).toHaveValue(/"name": "Brakka"/);
  },
);

test('Download backup then Open backup file brings back the same character', async ({ page, savedSheet }) => {
  let file = '';
  let before: unknown;

  await test.step('download a backup file', async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download backup' }).click();
    file = await (await download).path();
    expect((await download).suggestedFilename()).toBe('Brakka.json');
    before = await savedSheet();
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(before);
  });

  await test.step('start a new character', async () => {
    answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'New character' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New Hero');
  });

  await test.step('open the backup file', async () => {
    answerConfirm(page, 'accept');
    await page.getByLabel('Open backup file').setInputFiles(file);
  });

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect.poll(savedSheet).toEqual(before);
});

test('importing text that is not JSON shows an error and keeps the character', async ({ page, savedSheet }) => {
  await page.getByLabel('Backup JSON').fill('not json');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'That is not a valid exported sheet. Use a file from Download backup, or paste the full JSON from Export.',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect.poll(savedSheet).toMatchObject({ name: 'Brakka', level: 5 });
});

test('importing JSON that is not a character sheet shows an error and keeps the character', async ({ page }) => {
  await page.getByLabel('Backup JSON').fill('{"name": "Not a sheet"}');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('That is not a valid exported sheet.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
});

test('cancelling an import keeps the current character', async ({ page, savedSheet }) => {
  const other = { ...loadSheet('fighter-5'), name: 'Someone Else' };
  const asked = answerConfirm(page, 'cancel');
  await page.getByLabel('Backup JSON').fill(JSON.stringify(other));
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  expect(await asked).toContain('Replace "Brakka" with "Someone Else"?');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  await expect.poll(savedSheet).toMatchObject({ name: 'Brakka' });
});
