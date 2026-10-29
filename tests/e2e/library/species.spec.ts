import { test, expect, loadSheet, answerConfirm, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Picking a species from the Species drop-down puts its traits (and what they do) on the sheet, and
// changing species swaps them. The species come from a custom pack in the Library store, so no download
// is needed. Outside rules/, because it depends on the browser's storage (IndexedDB).
const pack = [
  {
    kind: 'race', name: 'Stoneborn', level: 0, sub: 'Custom', desc: '', src: 'Custom',
    traits: [
      { n: 'Speed', d: 'Your Speed is 25 feet.' },
      { n: 'Darkvision', d: 'You can see in dim light within 120 feet.' },
      { n: 'Stone Hide', d: 'Your skin is stone.', fx: [['ab', 'con', 2]] },
    ],
  },
  {
    kind: 'race', name: 'Windkin', level: 0, sub: 'Custom', desc: '', src: 'Custom',
    traits: [
      { n: 'Speed', d: 'Your Speed is 35 feet.' },
      { n: 'Darkvision', d: 'You can see in dim light within 60 feet.' },
      { n: 'Light Step', d: 'You move without a sound.', fx: [['sk', 'Stealth', 1]] },
    ],
  },
];
const stoneborn = pack[0].traits.map(t => ({ n: t.n, t: '', d: t.d, ...(t.fx ? { fx: t.fx } : {}) }));

// Brakka (fighter-5): Con 14 (+2), proficient in Constitution saves (+3), Dex 12 (+1), Speed 30.
const brakka = (more: Sheet = {}) => ({ ...loadSheet('fighter-5'), mode: 'edit', species: '', ...more });
const speciesBox = (page: Page) => page.getByLabel('Species', { exact: true });
const traitNames = async (savedSheet: () => Promise<Sheet | null>) =>
  ((await savedSheet())!.race as { n: string }[]).map(x => x.n);

test.beforeEach(async ({ seedPacks }) => {
  await seedPacks(pack);
});

test('picking a species adds its traits, their effects and its Speed', { tag: '@smoke' }, async ({ page, seedSheet, savedSheet }) => {
  await seedSheet(brakka());
  await page.goto('/');
  await speciesBox(page).selectOption('Stoneborn');

  await expect(page.getByRole('status')).toHaveText('Added 3 Stoneborn traits to Racial features. Speed set to 25 ft.');
  await expect.poll(() => traitNames(savedSheet)).toEqual(['Speed', 'Darkvision', 'Stone Hide']);
  await expect.poll(savedSheet).toMatchObject({ species: 'Stoneborn', speed: 25 });
  // Stone Hide: Con 14 + 2 = 16 (+3); proficient +3, so the save is +6.
  await expect(page.getByRole('button', { name: 'Constitution save +6', exact: true })).toBeVisible();
});

test("changing species swaps the old species' traits for the new one's", async ({ page, seedSheet, savedSheet }) => {
  await seedSheet(brakka({ species: 'Stoneborn', speed: 25, race: stoneborn }));
  await page.goto('/');
  await expect(speciesBox(page)).toHaveValue('Stoneborn');
  await speciesBox(page).selectOption('Windkin');

  await expect(page.getByRole('status')).toHaveText('Swapped 3 Stoneborn traits for 3 Windkin traits in Racial features. Speed set to 35 ft.');
  await expect.poll(() => traitNames(savedSheet)).toEqual(['Speed', 'Darkvision', 'Light Step']);
  // The shared Darkvision now has Windkin's wording.
  await expect.poll(savedSheet).toMatchObject({ species: 'Windkin', speed: 35, race: [{}, { d: 'You can see in dim light within 60 feet.' }, {}] });
  // Stone Hide's +2 Con is gone (save back to +5); Light Step's Stealth proficiency is on (+1, +3).
  await expect(page.getByRole('button', { name: 'Constitution save +5', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stealth +4', exact: true })).toBeVisible();
});

test("a trait already on the sheet under the same name is replaced by the species' own, not doubled", async ({ page, seedSheet, savedSheet }) => {
  // A Darkvision typed in by hand (say, from a custom species the Library doesn't know).
  await seedSheet(brakka({ race: [{ n: 'Darkvision', t: '', d: 'Typed by hand.' }] }));
  await page.goto('/');
  await speciesBox(page).selectOption('Windkin');

  await expect.poll(() => traitNames(savedSheet)).toEqual(['Darkvision', 'Speed', 'Light Step']);
  await expect.poll(savedSheet).toMatchObject({ race: [{ d: 'You can see in dim light within 60 feet.' }, {}, {}] });
});

test('a Speed typed by hand is kept when the species changes', async ({ page, seedSheet, savedSheet }) => {
  // 40 is neither the default 30 nor Stoneborn's 25, so it was set on purpose (a Monk, say).
  await seedSheet(brakka({ species: 'Stoneborn', speed: 40, race: stoneborn }));
  await page.goto('/');
  await speciesBox(page).selectOption('Windkin');
  await expect(page.getByRole('status')).toHaveText('Swapped 3 Stoneborn traits for 3 Windkin traits in Racial features.');
  await expect.poll(savedSheet).toMatchObject({ species: 'Windkin', speed: 40 });
});

test('clearing the species removes its traits and puts Speed back to 30', async ({ page, seedSheet, savedSheet }) => {
  const own = { n: 'Lucky Find', t: '', d: 'Not from a species.' };
  await seedSheet(brakka({ species: 'Stoneborn', speed: 25, race: [...stoneborn, own] }));
  await page.goto('/');
  // Wait until the species list has loaded from the Library store; before that the app can't tell
  // which traits are Stoneborn's.
  await expect(speciesBox(page)).toHaveValue('Stoneborn');
  await speciesBox(page).selectOption('Choose a species');

  await expect(page.getByRole('status')).toHaveText('Removed 3 Stoneborn traits from Racial features. Speed set to 30 ft.');
  await expect.poll(() => traitNames(savedSheet)).toEqual(['Lucky Find']);
  await expect.poll(savedSheet).toMatchObject({ species: '', speed: 30 });
});

test('the sheet from before a species change can be restored', async ({ page, seedSheet, savedSheet }) => {
  // The page keeps a version when it opens. An edit first makes the sheet differ from that one, since
  // the app doesn't keep a version identical to the newest.
  await seedSheet(brakka({ species: 'Stoneborn', speed: 25, race: stoneborn }));
  await page.goto('/');

  await test.step('edit the Background, then change species', async () => {
    const bg = page.getByLabel('Background', { exact: true });
    await bg.fill('Sailor');
    await bg.blur();
    await speciesBox(page).selectOption('Windkin');
    await expect.poll(savedSheet).toMatchObject({ species: 'Windkin', bg: 'Sailor' });
  });

  await test.step('restore the version saved before the change', async () => {
    const versions = page.getByLabel('Earlier version', { exact: true });
    const snapshot = versions.getByRole('option', { name: /: Brakka \(before species change\)$/ });
    await versions.selectOption((await snapshot.getAttribute('value'))!);
    const asked = answerConfirm(page, 'accept');
    await page.getByRole('button', { name: 'Restore an earlier version' }).click();
    expect(await asked).toMatch(/^Restore "Brakka" from .+\? The current version is kept in the list\.$/);
  });

  // The Background edit is kept; the species change is undone.
  await expect.poll(savedSheet).toMatchObject({ species: 'Stoneborn', speed: 25, bg: 'Sailor' });
  await expect.poll(() => traitNames(savedSheet)).toEqual(['Speed', 'Darkvision', 'Stone Hide']);
});
