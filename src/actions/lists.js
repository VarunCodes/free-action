// Adding to and removing from the sheet's lists: spells, items and their effects, features and feats.
// Also the proficiency marks and spell slot pips, which edit the sheet in place.
import { activeGear, MAX_ATTUNED_ITEMS, MAX_ABILITY_SCORE, skillGranted, skillProficiency } from '../rules.js';
import { forgetListPlaces } from '../ui.js';

// Skill proficiency levels: none, proficient, Expertise.
const PROFICIENCY_LEVELS = 3;
// A 'set' effect left empty sets the score to 19, as Gauntlets of Ogre Power and the Headband of Intellect do.
const DEFAULT_SET_SCORE = 19;

/** The proficiency mark in front of a save turns its proficiency on or off. */
export function toggleSaveProficiency(sheet, ability) {
    sheet.sv[ability] = !sheet.sv[ability];
}

/**
 * The mark in front of a skill cycles: none, proficient, Expertise. A skill a trait grants cycles between its
 * granted level and Expertise. Only what the player adds on top is stored, so changing species never leaves
 * behind a proficiency the player didn't pick.
 */
export function cycleSkillProficiency(sheet, skill) {
    const granted = skillGranted(sheet, skill);
    const next = (skillProficiency(sheet, skill) + 1) % PROFICIENCY_LEVELS;
    sheet.sk[skill] = next > granted ? next : 0;
}

/**
 * Tapping a spell slot pip: an unused pip marks the slots up to and including it as used, and a used pip
 * frees itself and every pip after it.
 */
export function toggleSpellSlot(sheet, slotIndex, pipIndex) {
    const slotLevel = sheet.slots[slotIndex];
    slotLevel.u = pipIndex < slotLevel.u ? pipIndex : pipIndex + 1;
}

/** Returns false if there's no name, so nothing is added. */
export function addSpell(sheet, name, level) {
    if (!name) return false;
    sheet.spells.push({ n: name, l: level, p: false });
    return true;
}

/** The spells after it move up a place, so what was open or picked by place is forgotten. */
export function removeSpell(sheet, ui, index) {
    sheet.spells.splice(index, 1);
    closeSectionsStartingWith(ui, 'spell-');
    forgetListPlaces(ui);
}

/** Returns false if there's no name, so nothing is added. A missing quantity counts as 1. */
export function addItem(sheet, name, quantity) {
    if (!name) return false;
    sheet.items.push({ n: name, q: quantity || 1 });
    return true;
}

/** The items after it move up a place, so open descriptions and a pending critical hit are forgotten. */
export function removeItem(sheet, ui, index) {
    sheet.items.splice(index, 1);
    closeSectionsStartingWith(ui, 'item-');
    ui.roll.criticalHit = null;
}

/**
 * Adds an effect to an item, replacing one of the same kind on the same target. The choice is 'type|target',
 * such as 'ab|str' (a bonus to Strength). A 'set' effect sets an ability score, from 1 to 30 (19 if left
 * empty), and an 'adv' effect (Advantage) has no number.
 */
export function addItemEffect(item, choice, typedValue) {
    const [type, target] = choice.split('|');
    let value = typedValue || 0;
    if (type === 'set') value = Math.min(MAX_ABILITY_SCORE, Math.max(1, value || DEFAULT_SET_SCORE));
    if (type === 'adv') value = 0;
    const others = (item.fx || []).filter(([otherType, otherTarget]) => otherType !== type || otherTarget !== target);
    item.fx = [...others, [type, target, value]];
}

export function removeItemEffect(item, effectIndex) {
    item.fx.splice(effectIndex, 1);
}

/** At most three items can be attuned at once. Returns false if that limit refuses a new one. */
export function toggleAttunement(sheet, index) {
    const item = sheet.items[index];
    if (!item.att && activeGear(sheet).attunedCount >= MAX_ATTUNED_ITEMS) return false;
    item.att = !item.att;
    return true;
}

/**
 * Adds a feature to a list: 'feats', 'features' or 'race' (racial features). Feats and racial features have
 * no type. Returns false if there's no name, so nothing is added.
 */
export function addFeature(sheet, listKey, name, type) {
    if (!name) return false;
    sheet[listKey].push({ n: name, t: type, d: '' });
    return true;
}

export function removeFeature(sheet, ui, listKey, index) {
    sheet[listKey].splice(index, 1);
    ui.openSections.clear();
}

function closeSectionsStartingWith(ui, prefix) {
    for (const id of [...ui.openSections]) {
        if (id.startsWith(prefix)) ui.openSections.delete(id);
    }
}
