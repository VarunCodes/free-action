// What picking a class or a species changes on the sheet. Each change leaves a note under the header
// (ui.headerMessage) that says what it did, so nothing on the sheet changes without the player seeing it.
import { ABILITY_NAMES, STANDARD_CLASSES, newSheet } from '../sheet.js';
import { knownClass } from '../rules.js';
import { swapSpecies } from '../libraryui.js';
import { snapshots, snapshot } from '../storage.js';

const DEFAULT_SPEED = newSheet().speed;
const BEFORE_SPECIES_CHANGE = 'before species change';

/**
 * Picking a standard class swaps the old class's saving throw proficiencies and spellcasting ability for the
 * new one's. Other saves, and an ability chosen by hand, stay. The sheet can't tell a hand-ticked save from one
 * the old class gave, so those go with the old class. The Spellcasting drop-down can always override the pick.
 */
export function setClass(sheet, ui, className) {
    const oldClass = STANDARD_CLASSES[knownClass(sheet.cls)];
    const newClass = STANDARD_CLASSES[className];
    const hadCastingAbility = Boolean(ABILITY_NAMES[sheet.cast]);
    sheet.cls = className;
    if (!newClass) return;

    swapSaveProficiencies(sheet, oldClass, newClass);
    const castingAbilityCameFromOldClass = oldClass && sheet.cast === oldClass.spellcasting;
    if (!sheet.cast || castingAbilityCameFromOldClass) sheet.cast = newClass.spellcasting;
    ui.headerMessage = classMessage(sheet, className, newClass, hadCastingAbility);
}

function swapSaveProficiencies(sheet, oldClass, newClass) {
    const oldSaves = oldClass ? oldClass.saves : [];
    for (const ability of oldSaves) {
        if (!newClass.saves.includes(ability)) delete sheet.sv[ability];
    }
    for (const ability of newClass.saves) sheet.sv[ability] = true;
}

// "Wizard: proficient in Intelligence and Wisdom saving throws, Intelligence for spellcasting. You can change…"
function classMessage(sheet, className, newClass, hadCastingAbility) {
    const saves = newClass.saves.map(ability => ABILITY_NAMES[ability]).join(' and ');
    const castingNote = classCastingNote(sheet, className, newClass, hadCastingAbility);
    const castingPart = castingNote ? `, ${castingNote}` : '';
    return `${className}: proficient in ${saves} saving throws${castingPart}. You can change these below.`;
}

function classCastingNote(sheet, className, newClass, hadCastingAbility) {
    const usualAbility = newClass.spellcasting;
    if (sheet.cast !== usualAbility) {
        const kept = `spellcasting stays ${ABILITY_NAMES[sheet.cast]}`;
        return usualAbility ? `${kept} (${className}s usually use ${ABILITY_NAMES[usualAbility]})` : kept;
    }
    if (usualAbility) return `${ABILITY_NAMES[usualAbility]} for spellcasting`;
    if (hadCastingAbility) return 'no spellcasting ability (pick one below if your subclass casts spells)';
    return '';
}

/**
 * Picking a species swaps the old species' racial traits for the new one's. An empty name (or Custom) only
 * removes them. The species must already be in ui.librarySpecies; if it isn't, only its name is set and the
 * note says how to get its traits.
 *
 * The sheet goes into "Restore an earlier version" first, since the old traits (and any rewording of them) are
 * lost. That happens only before the first of several swaps in a row, so trying species one after another can't
 * push older versions out of the list.
 *
 * Speed follows the species unless the player typed their own: it changes only from the default speed or from
 * the old species' speed.
 */
export function setSpecies(sheet, ui, speciesName) {
    const newSpecies = speciesName ? findSpecies(ui.librarySpecies, speciesName) : null;
    if (speciesName && !newSpecies) {
        sheet.species = speciesName;
        ui.headerMessage = `Couldn't load ${speciesName}'s traits. `
            + `Open the Library once to download them, then pick ${speciesName} again.`;
        return;
    }
    const oldSpecies = sheet.species ? findSpeciesIgnoringCase(ui.librarySpecies, sheet.species) : null;
    keepVersionBeforeSpeciesChange(sheet);

    const swap = swapSpecies(sheet, ui.librarySpecies, newSpecies);
    const oldName = swap.old !== speciesName ? swap.old : '';
    const traitsMessage = newSpecies
        ? addedTraitsMessage(speciesName, swap.added, oldName, swap.removed)
        : removedTraitsMessage(oldName, swap.removed);
    const speedChanged = followSpeciesSpeed(sheet, oldSpecies, newSpecies);
    const speedMessage = speedChanged ? ` Speed set to ${sheet.speed} ft.` : '';
    ui.headerMessage = traitsMessage + speedMessage;
}

const isSpecies = entry => entry.kind === 'race';

function findSpecies(librarySpecies, name) {
    return librarySpecies.find(entry => isSpecies(entry) && entry.name === name);
}

function findSpeciesIgnoringCase(librarySpecies, name) {
    const lowerCaseName = name.toLowerCase();
    return librarySpecies.find(entry => isSpecies(entry) && entry.name.toLowerCase() === lowerCaseName);
}

function keepVersionBeforeSpeciesChange(sheet) {
    const hasSpeciesToLose = sheet.species || sheet.race.length;
    const alreadyKept = snapshots()[0]?.why === BEFORE_SPECIES_CHANGE;
    if (hasSpeciesToLose && !alreadyKept) snapshot(sheet, BEFORE_SPECIES_CHANGE, true);
}

// "3 Elf traits", "1 Dwarf trait".
function traitCount(count, speciesName) {
    return `${count} ${speciesName} trait${count === 1 ? '' : 's'}`;
}

function addedTraitsMessage(newName, addedCount, oldName, removedCount) {
    const added = traitCount(addedCount, newName);
    if (!oldName) return `Added ${added} to Racial features.`;
    return `Swapped ${traitCount(removedCount, oldName)} for ${added} in Racial features.`;
}

function removedTraitsMessage(oldName, removedCount) {
    if (!oldName || !removedCount) return '';
    return `Removed ${traitCount(removedCount, oldName)} from Racial features.`;
}

// Returns true if the speed changed.
function followSpeciesSpeed(sheet, oldSpecies, newSpecies) {
    const speedBefore = sheet.speed;
    const playerKeptSpeed = speedBefore === DEFAULT_SPEED || speedBefore === speciesSpeed(oldSpecies);
    // No species at all puts the default back; a species without a Speed trait leaves the speed alone.
    const newSpeed = newSpecies ? speciesSpeed(newSpecies) : DEFAULT_SPEED;
    if (newSpeed && playerKeptSpeed) sheet.speed = newSpeed;
    return sheet.speed !== speedBefore;
}

// A species' walking speed, read from its Speed trait ("Your Speed is 35 feet."), or 0 if it has none.
function speciesSpeed(species) {
    if (!species) return 0;
    const speedTrait = (species.traits || []).find(trait => /^speed$/i.test(trait.n));
    const feet = speedTrait && /(\d+)\s*(feet|ft)/i.exec(speedTrait.d);
    return feet ? Number(feet[1]) : 0;
}
