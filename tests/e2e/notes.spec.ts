import { test, expect, loadSheet } from './fixtures';

// Notes is one free-text box, there in Play and Edit. It saves like any field: when it loses focus.
test('notes are saved and survive a reload', async ({ page, seedSheet, savedSheet }) => {
  const text = 'Owes Gundren 10 gp.\nAsk about the map.';
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');

  const notes = page.getByLabel('Notes', { exact: true });
  await notes.fill(text);
  await notes.blur();

  await expect.poll(savedSheet).toMatchObject({ notes: text });
  await page.reload();
  await expect(notes).toHaveValue(text);
});
