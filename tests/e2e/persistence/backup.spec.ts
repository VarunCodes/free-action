import { readFile } from 'node:fs/promises';
import { test, expect, loadSheet, answerConfirm } from '../fixtures';

// The browser holds the only copy of a character, so a backup has to bring back everything.
// Round trips use a sheet with every kind of data (spells, gear with effects, feats with skill
// picks, racial traits, slots, notes) and compare the whole saved sheet: partial loss must fail.

test.describe('round trips', () => {
  test.beforeEach(async ({ page, seedSheet }) => {
    await seedSheet(loadSheet('wizard-full'));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilsa Vane');
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
      expect(await asked).toContain('Replace "New Hero" with "Ilsa Vane"?');
    });

    await expect(page.getByRole('status')).toHaveText('Imported "Ilsa Vane".');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilsa Vane');
    await expect.poll(savedSheet).toEqual(before);
  });

  test('Download backup then Open backup file brings back the same character', async ({ page, savedSheet }) => {
    let file = '';
    let before: unknown;

    await test.step('download a backup file', async () => {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download backup' }).click();
      file = await (await download).path();
      expect((await download).suggestedFilename()).toBe('Ilsa-Vane.json');
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

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilsa Vane');
    await expect.poll(savedSheet).toEqual(before);
  });
});

test.describe('problems', () => {
  const notASheet =
    'That is not a valid exported sheet. Use a file from Download backup, or paste the full JSON from Export.';

  test.beforeEach(async ({ page, seedSheet }) => {
    await seedSheet(loadSheet('fighter-5'));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  });

  test(
    'Export still works when the clipboard is unavailable',
    { annotation: { type: 'issue', description: 'https://github.com/VarunCodes/free-action/issues/25' } },
    async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Only Chromium refuses the clipboard write here');
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(page.getByLabel('Backup JSON')).toHaveValue(/"name": "Brakka"/);
    },
  );

  test('importing text that is not JSON shows an error and keeps the character', async ({ page, savedSheet }) => {
    await page.getByLabel('Backup JSON').fill('not json');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText(notASheet);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
    await expect.poll(savedSheet).toMatchObject({ name: 'Brakka', level: 5 });
  });

  test('importing JSON that is not a character sheet shows an error and keeps the character', async ({ page, savedSheet }) => {
    await page.getByLabel('Backup JSON').fill('{"name": "Not a sheet"}');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText(notASheet);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
    await expect.poll(savedSheet).toMatchObject({ name: 'Brakka', level: 5 });
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
});

test.describe('last backup', () => {
  test.beforeEach(async ({ page, seedSheet }) => {
    await seedSheet(loadSheet('fighter-5'));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  });

  // Export records the time through its own call, so this test uses Download backup only.
  test('Download backup records when the last backup was made, and it survives a reload', async ({ page }) => {
    await expect(page.getByText('No backup downloaded yet.')).toBeVisible();

    const before = Date.now();
    await test.step('download a backup file', async () => {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download backup' }).click();
      expect((await download).suggestedFilename()).toBe('Brakka.json');
    });
    await expect(page.getByText('Last backup today.')).toBeVisible();
    // "today" would also show for a wrong time (one in the future, or in seconds), so check the saved
    // time too. It must be in localStorage: sessionStorage survives a reload but not closing the tab.
    const saved = await page.evaluate(() => Number(localStorage.getItem('sheet-exported')));
    expect(saved).toBeGreaterThanOrEqual(before);
    expect(saved).toBeLessThanOrEqual(Date.now());
    await expect(page.getByText('No backup downloaded yet.')).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
    await expect(page.getByText('Last backup today.')).toBeVisible();
  });
});

test.describe('how long ago the last backup was', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  const HOUR = 60 * 60 * 1000;
  // Whole days since the backup, rounded down: under one day is today, one day is yesterday.
  const cases: [hoursAgo: number, expected: string][] = [
    [23, 'Last backup today.'],
    [25, 'Last backup yesterday.'],
    [47, 'Last backup yesterday.'],
    [12 * 24, 'Last backup 12 days ago.'],
  ];

  for (const [hoursAgo, expected] of cases) {
    test(`a backup made ${hoursAgo} hours ago says "${expected}"`, async ({ page, seedSheet }) => {
      const backedUpAt = now.getTime() - hoursAgo * HOUR;
      await page.clock.setFixedTime(now);
      await page.addInitScript(time => localStorage.setItem('sheet-exported', String(time)), backedUpAt);
      await seedSheet(loadSheet('fighter-5'));
      await page.goto('/');

      await expect(page.getByText(expected, { exact: true })).toBeVisible();
    });
  }
});
