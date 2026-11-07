import { test, expect, loadSheet } from './fixtures';
import type { Page } from '@playwright/test';

// The roll bar: Advantage and Disadvantage modes, chat formats for virtual tabletops, and custom rolls.
// Outside rules/, because the options panel and saved format can behave differently by browser.
// Brakka (fighter-5): Str 16 (+3), level 5 (proficiency +3), proficient in Athletics (+6).
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const command = (page: Page) => page.getByLabel('Chat command', { exact: true });

async function roll(page: Page, name: string, formula: string) {
  await button(page, name).click();
  await expect(command(page)).toHaveValue(formula);
}

// Opens "VTT format and custom roll". The app remembers the panel is open in a toggle event handler,
// and the browser fires that event a moment after the click; a re-render before then draws the panel
// closed. So this waits for the event (the app's own handler, registered first, has run by then).
async function openRollOptions(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { e2eToggled: Promise<unknown> }).e2eToggled =
      new Promise(r => document.addEventListener('toggle', r, { capture: true, once: true }));
  });
  await page.getByText('VTT format and custom roll', { exact: true }).click();
  await page.evaluate(() => (window as unknown as { e2eToggled: Promise<unknown> }).e2eToggled);
}

test.beforeEach(async ({ page, seedSheet }) => {
  await seedSheet(loadSheet('fighter-5'));
  await page.goto('/');
});

test('Advantage and Disadvantage modes roll two d20s until set back to Normal', async ({ page }) => {
  // PHB 2024, Advantage/Disadvantage: roll two d20s and use the higher (Advantage) or lower one.
  const mode = page.getByRole('group', { name: 'Roll mode', exact: true });
  await test.step('Advantage, for every roll until changed', async () => {
    await mode.getByRole('button', { name: 'Adv', exact: true }).click();
    await roll(page, 'Athletics +6', '/r 2d20kh1+6 # Athletics');
    await roll(page, 'Strength check +3', '/r 2d20kh1+3 # Strength check');
  });
  await test.step('Disadvantage', async () => {
    await mode.getByRole('button', { name: 'Dis', exact: true }).click();
    await roll(page, 'Athletics +6', '/r 2d20kl1+6 # Athletics');
  });
  await test.step('Normal', async () => {
    await mode.getByRole('button', { name: 'Normal', exact: true }).click();
    await roll(page, 'Athletics +6', '/r 1d20+6 # Athletics');
  });
});

test('the chat command follows the chosen virtual tabletop format, which is saved', async ({ page, savedSheet }) => {
  await roll(page, 'Athletics +6', '/r 1d20+6 # Athletics'); // Foundry, the default
  await openRollOptions(page);
  const format = page.getByLabel('Chat format', { exact: true });
  await test.step('Roll20 (/roll)', async () => {
    await format.selectOption('Roll20 (/roll)');
    await expect(command(page)).toHaveValue('/roll 1d20+6');
  });
  await test.step('Roll20 template', async () => {
    await format.selectOption('Roll20 template');
    await expect(command(page)).toHaveValue('&{template:default} {{name=Athletics}} {{Roll=[[1d20+6]]}}');
    await expect.poll(savedSheet).toMatchObject({ vtt: 'roll20t' });
  });
});

test('a custom roll accepts dice and numbers, and refuses anything else', async ({ page }) => {
  await openRollOptions(page);
  const custom = page.getByLabel('Custom dice', { exact: true });
  const go = button(page, 'Roll');
  const customRoll = async (text: string) => {
    await custom.fill(text);
    await go.click();
  };
  // Each refused roll comes after a good one, so the test shows the old command is cleared each time.
  const refused = async (text: string, error: string) => {
    await test.step(`"${text}" is refused`, async () => {
      await customRoll('1d4');
      await expect(command(page)).toHaveValue('/r 1d4 # Roll');
      await customRoll(text);
      await expect(page.getByRole('alert')).toHaveText(error);
      await expect(command(page)).toHaveValue('');
    });
  };

  await test.step('2d6 + 1d4 - 1 is accepted', async () => {
    await customRoll('2d6 + 1d4 - 1');
    await expect(command(page)).toHaveValue('/r 2d6+1d4-1 # Roll');
  });
  await test.step('100 dice, the most allowed, is accepted', async () => {
    await customRoll('100d6');
    await expect(command(page)).toHaveValue('/r 100d6 # Roll');
  });
  await refused('fireball', '"fireball" is not a roll. Use dice like 2d6+3 or 1d20+1d4.');
  await refused('101d6', 'That roll is too big. Use up to 100 dice, each with up to 1000 sides.');
  await refused('1d1001', 'That roll is too big. Use up to 100 dice, each with up to 1000 sides.');
  await refused('', 'Type a roll first, like 2d6+3.');
});
