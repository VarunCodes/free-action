import { test, expect, loadSheet, switchMode } from '../fixtures';

// Brakka at level 5 (proficiency +3), with six different ability modifiers, so a skill, save or
// roll that uses the wrong ability always shows a different number:
//   Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 8 (-1), Wis 18 (+4), Cha 7 (-2).
// Proficient in Strength and Constitution saves, Athletics and Perception; Expertise in Insight.
const brakka = {
  ...loadSheet('fighter-5'),
  ab: { str: 16, dex: 12, con: 14, int: 8, wis: 18, cha: 7 },
  sk: { Athletics: 1, Perception: 1, Insight: 2 },
};

// Names carry the number, so they must match exactly: a substring match would let "+12" pass for "+1".
const named = (name: string) => ({ name, exact: true });

test('Passive Perception includes Expertise in Perception', async ({ page, seedSheet }) => {
  await seedSheet({ ...brakka, sk: { ...brakka.sk, Perception: 2 } });
  await page.goto('/');
  // PHB 2024: 10 + Perception modifier. Wis +4, Expertise 2 x 3 = +10, so 20.
  await expect(page.getByRole('group', named('Passive Perception'))).toHaveText('Passive Perception20');
});

test.describe('Brakka with six different modifiers', () => {
  test.beforeEach(async ({ page, seedSheet }) => {
    await seedSheet(brakka);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brakka');
  });

  test('saving throws add proficiency only where the character is proficient', async ({ page }) => {
    // PHB 2024, Saving Throws: ability modifier, plus the proficiency bonus if proficient.
    const saves = {
      Strength: '+6', // +3, proficient +3
      Dexterity: '+1', // +1
      Constitution: '+5', // +2, proficient +3
      Intelligence: '-1', // -1
      Wisdom: '+4', // +4
      Charisma: '-2', // -2
    };
    for (const [ability, total] of Object.entries(saves)) {
      await expect(page.getByRole('button', named(`${ability} save ${total}`))).toBeVisible();
    }
  });

  test('every skill uses its ability, plus proficiency once or (Expertise) twice', async ({ page }) => {
    // PHB 2024: each skill belongs to one ability; proficiency adds +3, Expertise adds 2 x 3 = +6.
    const skills = {
      Acrobatics: '+1', // Dex
      'Animal Handling': '+4', // Wis
      Arcana: '-1', // Int
      Athletics: '+6', // Str +3, proficient +3
      Deception: '-2', // Cha
      History: '-1', // Int
      Insight: '+10', // Wis +4, Expertise +6
      Intimidation: '-2', // Cha
      Investigation: '-1', // Int
      Medicine: '+4', // Wis
      Nature: '-1', // Int
      Perception: '+7', // Wis +4, proficient +3
      Performance: '-2', // Cha
      Persuasion: '-2', // Cha
      Religion: '-1', // Int
      'Sleight of Hand': '+1', // Dex
      Stealth: '+1', // Dex
      Survival: '+4', // Wis
    };
    for (const [skill, total] of Object.entries(skills)) {
      await expect(page.getByRole('button', named(`${skill} ${total}`))).toBeVisible();
    }
  });

  test('Passive Perception is 10 plus the Perception modifier', async ({ page }) => {
    // PHB 2024, Passive Perception: 10 + Wisdom (Perception) check modifier = 10 + 7 = 17.
    await expect(page.getByRole('group', named('Passive Perception'))).toHaveText('Passive Perception17');
  });

  test('a roll uses the same bonus its button shows', async ({ page }) => {
    // The bonus shown and the bonus rolled are computed separately in the app, so they can drift.
    // The chat command shows the formula rolled (Foundry format: /r 1d20+N # label), whatever the dice.
    const command = page.getByLabel('Chat command');
    const rolls: [button: string, formula: string][] = [
      ['Insight +10', '/r 1d20+10 # Insight'], // Expertise: Wis +4, 2 x 3
      ['Athletics +6', '/r 1d20+6 # Athletics'], // proficient: Str +3, +3
      ['Arcana -1', '/r 1d20-1 # Arcana'], // negative: Int -1
      ['Strength save +6', '/r 1d20+6 # Strength save'], // proficient save
      ['Dexterity save +1', '/r 1d20+1 # Dexterity save'], // save without proficiency
      ['Charisma check -2', '/r 1d20-2 # Charisma check'], // ability check, Cha -2
      ['Initiative +1', '/r 1d20+1 # Initiative'], // Dex +1
    ];
    for (const [button, formula] of rolls) {
      await test.step(`roll ${button}`, async () => {
        // Checked first, so a wrong displayed bonus fails here quickly instead of timing out on click.
        await expect(page.getByRole('button', named(button))).toBeVisible();
        await page.getByRole('button', named(button)).click();
        await expect(command).toHaveValue(formula);
      });
    }
  });

  test('Initiative adds any Initiative bonus, both shown and rolled', async ({ page }) => {
    // PHB 2024, Initiative: a Dexterity check, so Dex +1; with a +2 bonus, +3.
    await expect(page.getByRole('button', named('Initiative +1'))).toBeVisible();

    await test.step('add a +2 Initiative bonus in Edit mode', async () => {
      await switchMode(page, 'Edit');
      const bonus = page.getByLabel('Init bonus');
      await bonus.fill('2');
      await bonus.blur();
      await switchMode(page, 'Play');
    });

    await test.step('roll it', async () => {
      await expect(page.getByRole('button', named('Initiative +3'))).toBeVisible();
      await page.getByRole('button', named('Initiative +3')).click();
      await expect(page.getByLabel('Chat command')).toHaveValue('/r 1d20+3 # Initiative');
    });
  });

  test('tapping a skill in Edit mode cycles none, proficient, Expertise and back to none', async ({ page }) => {
    // Stealth: Dex +1. Proficient adds +3, Expertise adds +6.
    await switchMode(page, 'Edit');
    const stealth = page.getByRole('button', named('Stealth proficiency'));
    const steps: [state: string, total: string][] = [
      ['Proficient', '+4'],
      ['Expertise', '+7'],
      ['Not proficient', '+1'],
    ];
    await expect(stealth).toHaveAttribute('aria-description', 'Not proficient');
    await expect(page.getByRole('button', named('Stealth +1'))).toBeVisible();

    for (const [state, total] of steps) {
      await test.step(`tap: ${state}`, async () => {
        await stealth.click();
        await expect(stealth).toHaveAttribute('aria-description', state);
        await expect(page.getByRole('button', named(`Stealth ${total}`))).toBeVisible();
      });
    }
  });
});
