import { test, expect, loadSheet, type Sheet } from '../fixtures';
import type { Page } from '@playwright/test';

// Hit Points, Temporary Hit Points, Hit Point Dice and rests, from the PHB 2024 rules glossary.
// Brakka (fighter-5): Fighter 5 (d10 Hit Dice), Con 14 (+2), 44 of 44 HP.
const brakka = (more: Sheet = {}) => ({ ...loadSheet('fighter-5'), ...more });
const hp = (cur: number, max = 44, temp = 0) => ({ hp: { cur, max, temp } });

// Types an amount into the HP box and presses Damage, Heal or Set temp.
async function hpAction(page: Page, button: 'Damage' | 'Heal' | 'Set temp', amount: number) {
  await page.getByLabel('Amount', { exact: true }).fill(String(amount));
  await page.getByRole('button', { name: button, exact: true }).click();
}

const hitDice = (page: Page) => page.getByText(/^Hit dice \d+ of \d+/);
const spend = (page: Page) => page.getByRole('button', { name: 'Spend a hit die', exact: true });

test.describe('damage and healing', () => {
  test('damage lowers current HP', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    await hpAction(page, 'Damage', 10);
    await expect.poll(savedSheet).toMatchObject(hp(34)); // 44 - 10
  });

  test('damage comes off Temporary Hit Points first', { tag: '@smoke' }, async ({ page, seedSheet, savedSheet }) => {
    // PHB 2024, Temporary Hit Points: damage reduces them first, and any left over carries to your HP.
    await seedSheet(brakka(hp(44, 44, 5)));
    await page.goto('/');
    await hpAction(page, 'Damage', 8);
    await expect.poll(savedSheet).toMatchObject(hp(41, 44, 0)); // 5 temp absorbed, 3 left over
  });

  test('damage that only dents Temporary Hit Points leaves HP alone', async ({ page, seedSheet, savedSheet }) => {
    await seedSheet(brakka(hp(44, 44, 5)));
    await page.goto('/');
    await hpAction(page, 'Damage', 3);
    await expect.poll(savedSheet).toMatchObject(hp(44, 44, 2));
    await expect(page.getByText('+2 temp', { exact: true })).toBeVisible();
  });

  test('HP never drops below 0', async ({ page, seedSheet, savedSheet }) => {
    // PHB 2024, Dropping to 0 Hit Points: damage beyond 0 doesn't make HP negative.
    await seedSheet(brakka(hp(10)));
    await page.goto('/');
    await hpAction(page, 'Damage', 25);
    await expect.poll(savedSheet).toMatchObject(hp(0));
  });

  test('healing raises current HP but never above the maximum', async ({ page, seedSheet, savedSheet }) => {
    // PHB 2024, Healing: you can't regain more HP than your Hit Point maximum.
    await seedSheet(brakka(hp(30)));
    await page.goto('/');
    await test.step('heal 5: 30 to 35', async () => {
      await hpAction(page, 'Heal', 5);
      await expect.poll(savedSheet).toMatchObject(hp(35));
    });
    await test.step('heal 20: stops at 44', async () => {
      await hpAction(page, 'Heal', 20);
      await expect.poll(savedSheet).toMatchObject(hp(44));
    });
  });

  test('Temporary Hit Points do not add together; the higher amount is kept', async ({ page, seedSheet, savedSheet }) => {
    // PHB 2024, Temporary Hit Points: they don't stack; you keep one amount or the other.
    // The sheet keeps the higher one.
    await seedSheet(brakka());
    await page.goto('/');
    await test.step('set 5', async () => {
      await hpAction(page, 'Set temp', 5);
      await expect.poll(savedSheet).toMatchObject(hp(44, 44, 5));
    });
    await test.step('set 3: 5 is higher, so 5 stays', async () => {
      await hpAction(page, 'Set temp', 3);
      await expect.poll(savedSheet).toMatchObject(hp(44, 44, 5));
    });
    await test.step('set 8: 8 replaces 5', async () => {
      await hpAction(page, 'Set temp', 8);
      await expect.poll(savedSheet).toMatchObject(hp(44, 44, 8));
    });
  });
});

test.describe('Hit Point Dice', () => {
  test('spending a hit die heals the roll plus the Constitution modifier', async ({ page, seedSheet, savedSheet }) => {
    // PHB 2024, Short Rest: roll the Hit Point Die and add your Con modifier; regain that many HP.
    // Brakka: d10, Con +2, so 1d10+2. The die is random, so the face is read from the roll.
    await seedSheet(brakka(hp(20)));
    await page.goto('/');
    await expect(hitDice(page)).toHaveText('Hit dice 5 of 5 (d10)');
    await spend(page).click();

    let face = 0;
    await test.step('the roll is 1d10+2, and heals what it shows', async () => {
      await expect(page.getByLabel('Chat command')).toHaveValue('/r 1d10+2 # Hit die (d10)');
      const roll = page.getByText(/^Hit die \(d10\) \[\d+\] \+ 2 · healed \d+$/);
      await expect(roll).toBeVisible();
      const [, f, healed] = /\[(\d+)\].*healed (\d+)/.exec((await roll.textContent())!)!;
      face = +f;
      expect(face).toBeGreaterThanOrEqual(1); // a d10, so 1 to 10
      expect(face).toBeLessThanOrEqual(10);
      expect(+healed).toBe(face + 2);
    });
    await expect.poll(savedSheet).toMatchObject({ ...hp(20 + face + 2), hd: 1 });
    await expect(hitDice(page)).toHaveText('Hit dice 4 of 5 (d10)');
  });

  test('a hit die always heals at least 1 HP', async ({ page, seedSheet, savedSheet }) => {
    // PHB 2024, Short Rest: a spent Hit Point Die heals the roll plus Con, minimum 1 HP.
    // Con 1 is -5, so 1d6-5 is below 1 on every face but 6. The roll must be 1 to 5, so that the
    // minimum is what makes it heal 1 (a 6 heals 1 without it).
    await seedSheet({ name: 'Frail', cls: 'Wizard', level: 1, ab: { con: 1 }, hp: { cur: 1, max: 5, temp: 0 } });
    await page.goto('/');
    await spend(page).click();
    await expect(page.getByText(/^Hit die \(d6\) \[[1-5]\] - 5 · healed 1$/)).toBeVisible();
    await expect.poll(savedSheet).toMatchObject({ hp: { cur: 2, max: 5 }, hd: 1 });
  });

  test('a hit die never heals above the maximum', async ({ page, seedSheet, savedSheet }) => {
    // 1d10+2 heals at least 3, but Brakka is only 1 below the maximum.
    await seedSheet(brakka(hp(43)));
    await page.goto('/');
    await spend(page).click();
    await expect(page.getByText(/· healed 1$/)).toBeVisible();
    await expect.poll(savedSheet).toMatchObject({ ...hp(44), hd: 1 });
  });

  test('no hit die can be spent at full HP', async ({ page, seedSheet }) => {
    await seedSheet(brakka());
    await page.goto('/');
    await expect(spend(page)).toBeDisabled();
  });

  test('no hit die can be spent once all are used', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ ...hp(20), hd: 5 }));
    await page.goto('/');
    await expect(hitDice(page)).toHaveText('Hit dice 0 of 5 (d10)');
    await expect(spend(page)).toBeDisabled();
  });

  test('a character has one hit die per level', async ({ page, seedSheet }) => {
    // PHB 2024, Hit Point Dice: you have a number of them equal to your level.
    await seedSheet(brakka({ level: 7 }));
    await page.goto('/');
    await expect(hitDice(page)).toHaveText('Hit dice 7 of 7 (d10)');
  });
});

test('a long rest restores HP, hit dice and spell slots, and ends Temporary Hit Points', async ({ page, seedSheet, savedSheet }) => {
  // PHB 2024, Long Rest: regain all lost HP and all spent Hit Point Dice, and spell slots come back.
  // Temporary Hit Points last until a Long Rest ends.
  const slots = Array.from({ length: 9 }, (_, i) => (i < 2 ? { m: 3, u: 2 } : { m: 0, u: 0 }));
  await seedSheet(brakka({ ...hp(10, 44, 5), hd: 3, slots }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Long rest', exact: true }).click();

  const unused = Array.from({ length: 9 }, () => ({ u: 0 }));
  await expect.poll(savedSheet).toMatchObject({ ...hp(44, 44, 0), hd: 0, slots: unused });
  await expect(hitDice(page)).toHaveText('Hit dice 5 of 5 (d10)');
});

test.describe('average maximum HP', () => {
  // PHB 2024, Hit Points: at level 1, the highest roll of the Hit Point Die plus the Con modifier;
  // at each later level, the fixed value (d6: 4, d8: 5, d10: 6, d12: 7) plus the Con modifier.
  const average = (page: Page) => page.getByText(/^Average max HP for level/);
  const cases = [
    { cls: 'Wizard', level: 4, con: 12, avg: 22, why: 'd6, Con +1: (6 + 1) + 3 x (4 + 1)' },
    { cls: 'Cleric', level: 3, con: 14, avg: 24, why: 'd8, Con +2: (8 + 2) + 2 x (5 + 2)' },
    { cls: 'Fighter', level: 5, con: 14, avg: 44, why: 'd10, Con +2: (10 + 2) + 4 x (6 + 2)' },
    { cls: 'Barbarian', level: 6, con: 16, avg: 65, why: 'd12, Con +3: (12 + 3) + 5 x (7 + 3)' },
  ];
  for (const c of cases) {
    test(`a level ${c.level} ${c.cls} with Con ${c.con} averages ${c.avg} HP`, async ({ page, seedSheet }) => {
      // c.why shows the working.
      await seedSheet({ name: 'Avg', mode: 'edit', cls: c.cls, level: c.level, ab: { con: c.con } });
      await page.goto('/');
      await expect(average(page)).toHaveText(new RegExp(`: ${c.avg} Use ${c.avg}$`));
    });
  }

  test('each level gives at least 1 HP, however low Constitution is', async ({ page, seedSheet }) => {
    // The sheet's own rule: a negative Con modifier never makes a level cost HP.
    // Con 1 is -5. Level 1: 6 - 5 = 1. Each later level: 4 - 5 = -1, raised to 1. Level 5: 5.
    await seedSheet({ name: 'Frail', mode: 'edit', cls: 'Wizard', level: 5, ab: { con: 1 } });
    await page.goto('/');
    await expect(average(page)).toHaveText(/: 5 Use 5$/);
  });

  test('Dwarven Toughness adds 1 HP per level', async ({ page, seedSheet }) => {
    // SRD 5.2, Dwarf: Dwarven Toughness raises the HP maximum by 1, and by 1 again every level.
    // Brakka at level 5: 44 + 5.
    const trait = { n: 'Dwarven Toughness', t: '', d: 'Your Hit Point maximum increases by 1.' };
    await seedSheet(brakka({ mode: 'edit', race: [trait] }));
    await page.goto('/');
    await expect(average(page)).toHaveText(/: 49 Use 49$/);
  });

  test('with max HP already at the average, there is nothing to apply', async ({ page, seedSheet }) => {
    await seedSheet(brakka({ mode: 'edit' }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Use 44', exact: true })).toBeDisabled();
  });

  test('applying the average after levelling up adds the HP gained to current HP too', async ({ page, seedSheet, savedSheet }) => {
    // Brakka has just reached level 6, still with level 5's 44 max HP.
    // Level 6 adds 6 + 2 = 8: max 44 to 52, and current HP 30 to 38.
    await seedSheet(brakka({ mode: 'edit', level: 6, ...hp(30) }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Use 52', exact: true }).click();
    await expect.poll(savedSheet).toMatchObject(hp(38, 52));
    await expect(page.getByLabel('Max HP', { exact: true })).toHaveValue('52');
    await expect(page.getByLabel('Current HP', { exact: true })).toHaveValue('38');
  });

  test('applying a lower average brings current HP down to the new maximum', async ({ page, seedSheet, savedSheet }) => {
    // Brakka set back to level 3, still with 44 of 44 HP. Level 3: (10 + 2) + 2 x (6 + 2) = 28.
    await seedSheet(brakka({ mode: 'edit', level: 3 }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Use 28', exact: true }).click();
    await expect.poll(savedSheet).toMatchObject(hp(28, 28));
    await expect(page.getByLabel('Max HP', { exact: true })).toHaveValue('28');
    await expect(page.getByLabel('Current HP', { exact: true })).toHaveValue('28');
  });
});
