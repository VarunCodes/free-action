// What the roll buttons do: checks, saves and attacks with a d20, damage and healing dice, hit dice,
// custom rolls, and the roll bar's own buttons. Each roll shows on the roll bar, and its chat command
// is copied for pasting into a virtual tabletop.
import { abilityMod, signed, profBonus, effectTotal, score, hitDie, hitDiceLeft } from '../rules.js';
import {
    rollMode, rollD20, rollDice, customRollError, chatCommand, spellDice, weaponMod, withMod,
} from '../rolls.js';
import { writeKey } from '../storage.js';

const NATURAL_20 = 'Natural 20';

/**
 * A check, save or initiative roll: a button with data-roll-label and data-roll-bonus, and data-advantage or
 * data-disadvantage set to '1' when a feature or item gives it.
 */
export function rollCheck(sheet, ui, button) {
    const { rollLabel, rollBonus, disadvantage, advantage } = button.dataset;
    rollD20Plus(ui.roll, rollLabel, Number(rollBonus), disadvantage === '1', advantage === '1');
    ui.roll.criticalHit = null;
    copyCommand(sheet, ui.roll);
}

export function rollSpellAttack(sheet, ui, index) {
    const spell = sheet.spells[index];
    const castingModifier = sheet.cast ? abilityMod(score(sheet, sheet.cast)) : 0;
    const bonus = profBonus(sheet) + castingModifier + effectTotal(sheet, 'sa');
    rollD20Plus(ui.roll, `${spell.n} attack`, bonus);
    ui.roll.criticalHit = ui.roll.last.crit === NATURAL_20 ? `s${index}` : null;
    copyCommand(sheet, ui.roll);
}

export function rollSpellEffect(sheet, ui, index) {
    const spell = sheet.spells[index];
    const slotLevel = ui.spellSlotLevels[index] ?? spell.l;
    const { dice } = spellDice(sheet, spell, slotLevel);
    const label = spell.n + (spell.r.h ? ' healing' : ' damage');
    const rolled = rollDiceAndShow(ui.roll, label, dice, ui.roll.criticalHit === `s${index}`);
    if (rolled) copyCommand(sheet, ui.roll);
    else showRollError(ui.roll, `${spell.n} has no valid dice. Use dice like 1d10 or 2d6+3; fix them in Edit.`);
    ui.roll.criticalHit = null;
}

export function rollWeaponAttack(sheet, ui, index) {
    const item = sheet.items[index];
    rollD20Plus(ui.roll, `${item.n} attack`, profBonus(sheet) + weaponMod(sheet, item));
    ui.roll.criticalHit = ui.roll.last.crit === NATURAL_20 ? `i${index}` : null;
    copyCommand(sheet, ui.roll);
}

export function rollWeaponDamage(sheet, ui, index, twoHanded) {
    const item = sheet.items[index];
    const label = item.n + ' damage' + (twoHanded ? ' (two-handed)' : '');
    const dice = withMod(twoHanded ? item.w.v : item.w.d, weaponMod(sheet, item));
    const rolled = rollDiceAndShow(ui.roll, label, dice, ui.roll.criticalHit === `i${index}`);
    if (rolled) copyCommand(sheet, ui.roll);
    else showRollError(ui.roll, `${item.n} has no valid damage dice.`);
    ui.roll.criticalHit = null;
}

/** Spends a hit die: heals its roll plus the Constitution modifier, at least 1 HP. */
export function spendHitDie(sheet, ui) {
    const sides = hitDie(sheet);
    if (!sides || !hitDiceLeft(sheet)) return;
    const dice = `1d${sides}${signed(abilityMod(score(sheet, 'con')))}`;
    if (!rollDiceAndShow(ui.roll, `Hit die (d${sides})`, dice, false, true)) return;
    const roll = ui.roll.last;
    roll.total = Math.max(1, roll.total);
    roll.detail += ` · healed ${Math.min(roll.total, sheet.hp.max - sheet.hp.cur)}`;
    sheet.hp.cur = Math.min(sheet.hp.max, sheet.hp.cur + roll.total);
    sheet.hd++;
    ui.roll.criticalHit = null;
    copyCommand(sheet, ui.roll);
}

/** A roll typed into the Custom dice box, like 2d6+3 or 1d20+1d4-1. */
export function rollCustomDice(sheet, ui, text) {
    ui.roll.customDice = text;
    const error = customRollError(text);
    if (error) showRollError(ui.roll, error);
    else rollDiceAndShow(ui.roll, 'Roll', text.replace(/\s/g, ''), false, true);
    ui.roll.criticalHit = null;
    if (ui.roll.last) copyCommand(sheet, ui.roll);
}

export function copyLastRoll(sheet, ui) {
    if (ui.roll.last) copyCommand(sheet, ui.roll);
}

export function setRollMode(ui, mode) {
    ui.roll.mode = mode;
}

export function toggleRollOptions(ui) {
    ui.roll.minimized = !ui.roll.minimized;
    writeKey('roll-min', ui.roll.minimized ? '1' : '0');
}

// The roll's own Disadvantage or Advantage is added to the mode picked on the roll bar.
function rollD20Plus(roll, label, bonus, disadvantage = false, advantage = false) {
    roll.error = '';
    roll.last = rollD20(label, bonus, rollMode(roll.mode, disadvantage, advantage));
}

// Returns false, changing nothing, if the dice can't be read.
function rollDiceAndShow(roll, label, dice, criticalHit, asTyped = false) {
    const result = rollDice(label, dice, criticalHit, asTyped);
    if (!result) return false;
    roll.error = '';
    roll.last = result;
    return true;
}

// A roll that can't be made clears the last one, so its chat command can't be pasted by mistake.
function showRollError(roll, message) {
    roll.last = null;
    roll.error = message;
    roll.copied = false;
}

function copyCommand(sheet, roll) {
    roll.copied = copyText(chatCommand(roll.last, sheet.vtt));
}

// The clipboard API where the browser allows it, otherwise the older copy command. True if it was copied.
function copyText(text) {
    try {
        navigator.clipboard.writeText(text).catch(() => {});
        return true;
    } catch {
        return copyWithTextArea(text);
    }
}

function copyWithTextArea(text) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        return copied;
    } catch {
        return false;
    }
}
