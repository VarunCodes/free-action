import './style.css';
import { openLibrary } from './libraryui.js';
import { cachedItems, cachedSpecies, loadLibrary } from './library.js';
import { dateAndTime } from './text.js';
import { newSheet, cleanSheet } from './sheet.js';
import {
    abilityMod, profBonus, knownClass, knownSpecies, effectsOf, effectTotal, advantageFrom, score,
} from './rules.js';
import { sourcesText } from './html.js';
import { abilitiesSection, savesSection, skillsSection } from './sections/stats.js';
import { spellsSection } from './sections/spells.js';
import { inventorySection } from './sections/inventory.js';
import { featuresSection, racialFeaturesSection } from './sections/features.js';
import { headerSection } from './sections/header.js';
import { vitalsSection } from './sections/vitals.js';
import { notesSection, backupSection } from './sections/backup.js';
import { rollBarSection } from './sections/rollBar.js';
import { createUi, forgetListPlaces } from './ui.js';
import {
    rollCheck, rollSpellAttack, rollSpellEffect, rollWeaponAttack, rollWeaponDamage, spendHitDie,
    rollCustomDice, copyLastRoll, setRollMode, toggleRollOptions,
} from './actions/rolls.js';
import { setClass, setSpecies } from './actions/character.js';
import { fillGearFromLibrary } from './gearUpgrade.js';
import { takeDamage, heal, setTemporaryHitPoints, longRest, useAverageHitPoints } from './actions/hitPoints.js';
import {
    toggleSaveProficiency, cycleSkillProficiency, toggleSpellSlot, addSpell, removeSpell, addItem, removeItem,
    addItemEffect, removeItemEffect, toggleAttunement, addFeature, removeFeature,
} from './actions/lists.js';
import { loadSaved, saveSheet, snapshots, snapshot, markBackedUp, downloadSheet, readBackup } from './storage.js';
let sheet = loadSaved() || newSheet();
const ui = createUi();
// A spell's roll settings when it has none yet (saved under short keys, renamed in a later step).
const newSpellRoll = () => ({ a: false, s: '', d: '', b: '', t: '', h: false, m: false, by: 'slot', up: [] });

function save() {
    sheet = saveSheet(sheet);
}

// Import, Restore and New character all replace the whole sheet. The current one goes into the history
// first, and anything that belonged to it (open sections, messages, a pending critical hit) is reset.
function replaceSheet(replacement, why) {
    snapshot(sheet, why, true);
    sheet = cleanSheet(replacement);
    ui.backupText = '';
    ui.backupMessage = null;
    ui.customClass = false;
    ui.customSpecies = false;
    ui.openSections.clear();
    forgetListPlaces(ui);
}

// Import (pasted JSON) and Open backup file. The result shows under the Backup buttons.
// Returns true if the sheet was replaced.
function importBackup(text) {
    const backup = readBackup(text);
    if (!backup) {
        ui.backupMessage = {
            isError: true,
            text: 'That is not a valid exported sheet. '
                + 'Use a file from Download backup, or paste the full JSON from Export.',
        };
        return false;
    }
    const name = cleanSheet(backup).name;
    const question = `Replace "${sheet.name}" with "${name}"? `
        + 'The current character can be brought back from "Restore an earlier version".';
    if (!confirm(question)) return false;
    replaceSheet(backup, 'before import');
    ui.backupMessage = { text: `Imported "${name}".` };
    return true;
}

// Restore the earlier version at this place in the list, after asking. Returns true if the sheet was replaced.
function restoreVersion(index) {
    const version = snapshots()[index];
    if (!version) return false;
    const savedAt = dateAndTime(version.at);
    if (!confirm(`Restore "${version.name}" from ${savedAt}? The current version is kept in the list.`)) return false;
    try {
        replaceSheet(JSON.parse(version.s), 'before restore');
    } catch {
        ui.backupMessage = { isError: true, text: 'That version could not be read.' };
        render();
        return false;
    }
    ui.backupMessage = { text: `Restored "${version.name}" from ${savedAt}.` };
    return true;
}

// Open backup file. The input is cleared afterwards, so picking the same file again still imports it.
async function openBackupFile(input) {
    const file = input.files[0];
    if (!file) return;
    ui.backupMessage = null;
    const reading = file.text();
    input.value = '';
    try {
        if (importBackup(await reading)) save();
    } catch {
        ui.backupMessage = { isError: true, text: 'Could not read that file.' };
    }
    render();
}
// Writes a value into the sheet at a data-field path, such as 'hp.max' or 'ab.str'.
function setPath(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const parent = keys.reduce((object, key) => object[key], sheet);
    parent[lastKey] = value;
}

// A species missing from the Library's list is downloaded first, then picked. The sheet is looked up again
// once the download finishes, because saving in the meantime replaces it.
function chooseSpecies(speciesName) {
    const isLoaded = ui.librarySpecies.some(species => species.name === speciesName);
    if (!speciesName || isLoaded) {
        setSpecies(sheet, ui, speciesName);
        return;
    }
    ui.headerMessage = `Loading ${speciesName}'s traits…`;
    loadLibrary()
        .then(library => {
            ui.librarySpecies = library.items.filter(entry => entry.kind === 'race');
        })
        .catch(() => {})
        .finally(() => {
            setSpecies(sheet, ui, speciesName);
            save();
            render();
        });
}

function renderRoll() {
    const rollBar = document.getElementById('roll');
    rollBar.innerHTML = rollBarSection(sheet, ui.roll, id => ui.openSections.has(id));
    fitPageAboveRollBar();
}

// The page leaves room at the bottom for however tall the roll bar is now.
function fitPageAboveRollBar() {
    const bar = document.getElementById('roll').firstChild;
    if (bar) document.documentElement.style.setProperty('--rollh', bar.offsetHeight + 'px');
}
// Values several sections use, worked out once per render:
//   editing             true in Edit mode, false in Play
//   proficiency         the proficiency bonus for the character's level
//   castingAbility      the spellcasting ability ('int', 'wis', 'cha') or '' for none
//   castingModifier     that ability's modifier (0 without one)
//   checkBonus          bonuses to every ability check, from items and features
//   spellAttackBonus    bonuses to spell attacks
//   spellDcBonus        bonuses to spell save DCs
//   checkBonusSources   "Includes Stone of Good Luck +1", or '' with no check bonus
//   advantageSources    a function: what gives Advantage on a roll ('init' or a skill name), as text
function sheetView(){
    const castingAbility = sheet.cast;
    const checkBonus = effectTotal(sheet, 'chk');
    const checkSources = effectsOf(sheet, 'chk').map(([source, [, , value]]) => [source.n, value]);
    return {
        editing: sheet.mode === 'edit',
        proficiency: profBonus(sheet),
        castingAbility,
        castingModifier: castingAbility ? abilityMod(score(sheet, castingAbility)) : 0,
        checkBonus,
        spellAttackBonus: effectTotal(sheet, 'sa'),
        spellDcBonus: effectTotal(sheet, 'dc'),
        checkBonusSources: checkBonus ? `Includes ${sourcesText(checkSources)}` : '',
        advantageSources: roll => {
            const sources = advantageFrom(sheet, roll);
            return sources.length ? `Advantage from ${sources.map(source => source.n).join(', ')}` : '';
        },
    };
}

// Sections go into three columns: stats, inventory and spells, everything else. On phones the columns
// dissolve and each section's order puts them back into one reading order.
function render() {
    const view = sheetView();
    for (const spell of sheet.spells) spell.r = { ...newSpellRoll(), ...spell.r };
    const isOpen = id => ui.openSections.has(id);
    const header = headerSection(sheet, view, {
        customClass: ui.customClass,
        customSpecies: ui.customSpecies,
        librarySpecies: ui.librarySpecies,
        message: ui.headerMessage,
    });
    const vitals = vitalsSection(sheet, view, { amount: ui.hitPointAmount });
    const abilities = abilitiesSection(sheet, view);
    const saves = savesSection(sheet, view);
    const skills = skillsSection(sheet, view);
    const features = featuresSection(sheet, view, { isOpen });
    const racialFeatures = racialFeaturesSection(sheet, view, { isOpen });
    const spells = spellsSection(sheet, view, { isOpen, slotFor: index => ui.spellSlotLevels[index] });
    const inventory = inventorySection(sheet, view, { isOpen, attunementRefused: ui.attunementRefused });
    const notes = notesSection(sheet);
    const backup = backupSection({ backupText: ui.backupText, message: ui.backupMessage });

    const statsColumn = column(section(1, vitals), section(2, abilities), section(3, saves), section(4, skills));
    const gearColumn = column(section(7, inventory), section(8, spells));
    const otherColumn = column(
        section(5, features), section(6, racialFeatures), section(9, notes), section(10, backup));
    const grid = `<div class="grid">${statsColumn}${gearColumn}${otherColumn}</div>`;
    document.getElementById('app').innerHTML = header + grid;
    renderRoll();
    document.title = `${sheet.name.trim() || 'Unnamed'} · Character Sheet`;
}

// The order is where the section goes when the columns dissolve into one on phones.
function section(order, content) {
    return `<section class="c" style="order:${order}">${content}</section>`;
}

function column(...sections) {
    return `<div class="col">${sections.join('')}</div>`;
}

// Boxes that only change what the page shows: the Damage/Heal amount, the custom dice and a spell's slot level.
// Everything else edits the sheet.
document.addEventListener('change', event => {
    const input = event.target;
    if (input.id === 'hit-point-amount') {
        ui.hitPointAmount = Math.max(0, parseInt(input.value) || 0);
    } else if (input.id === 'custom-dice') {
        ui.roll.customDice = input.value;
    } else if (input.dataset.slotLevelFor !== undefined) {
        ui.spellSlotLevels[input.dataset.slotLevelFor] = Number(input.value);
        render();
    } else if (editsTheSheet(input)) {
        editSheet(input);
    }
});

// A box bound to the sheet, a feature's skill choice, or the Class or Species drop-down.
function editsTheSheet(input) {
    const { field, skillChoice } = input.dataset;
    return Boolean(field || skillChoice) || input.id === 'class-picker' || input.id === 'species-picker';
}

// An edit to the sheet. The note on what a class or species set stays only until the next edit anywhere.
function editSheet(input) {
    ui.headerMessage = '';
    // A blank or non-numeric number box puts the old value back instead of becoming 0.
    if (input.type === 'number' && !Number.isFinite(parseInt(input.value))) {
        render();
        return;
    }
    applyEdit(input);
    save();
    render();
    // Picking Custom moves straight to the box for typing the name.
    if (input.id === 'class-picker' && ui.customClass) document.getElementById('field-cls')?.focus();
    if (input.id === 'species-picker' && ui.customSpecies) document.getElementById('field-species')?.focus();
}

function applyEdit(input) {
    const path = input.dataset.field;
    if (input.dataset.skillChoice) {
        chooseFeatureSkill(input.dataset.skillChoice, input.value);
    } else if (input.id === 'class-picker') {
        pickClassFromList(input.value);
    } else if (input.id === 'species-picker') {
        pickSpeciesFromList(input.value);
    } else if (path === 'cls' && knownClass(input.value)) {
        // A typed name that is a standard class snaps to it.
        setClass(sheet, ui, knownClass(input.value));
        ui.customClass = false;
    } else if (path === 'species' && knownSpecies(input.value, ui.librarySpecies)) {
        ui.customSpecies = false;
        chooseSpecies(knownSpecies(input.value, ui.librarySpecies));
    } else {
        setPath(path, inputValue(input));
    }
}

function inputValue(input) {
    if (input.type === 'number') return parseInt(input.value);
    if (input.type === 'checkbox') return input.checked;
    return input.value;
}

// A feature's skill choice, such as "Choose a skill" on a feat. Its id is like 'feats.2.0': the list, the
// feature's place in it, and which of the feature's choices this is.
function chooseFeatureSkill(choiceId, skill) {
    const [listKey, featureIndex, choiceIndex] = choiceId.split('.');
    const feature = sheet[listKey]?.[Number(featureIndex)];
    if (!feature) return;
    feature.ch = feature.ch || [];
    feature.ch[Number(choiceIndex)] = skill;
}

// The Class drop-down. Picking Custom clears a standard class, so the name box starts empty.
function pickClassFromList(value) {
    ui.customClass = value === '*';
    if (!ui.customClass) setClass(sheet, ui, value);
    else if (knownClass(sheet.cls)) sheet.cls = '';
}

// The Species drop-down. Picking Custom removes the old species' traits, and the name box starts empty.
function pickSpeciesFromList(value) {
    ui.customSpecies = value === '*';
    chooseSpecies(ui.customSpecies ? '' : value);
}
// A details section (a feature's description, the roll bar's options) remembers being opened, so it stays open
// when the page is redrawn. In Edit every feature shows its fields, so only the roll bar's options are kept.
document.addEventListener('toggle', event => {
    const details = event.target;
    const id = details.dataset?.section;
    if (!id || (sheet.mode === 'edit' && id !== 'roll-options')) return;
    if (details.open) ui.openSections.add(id);
    else ui.openSections.delete(id);
}, true);

// What each button does, by its data-action name. Each action gets the clicked button, whose data-value says which
// spell, item or ability it is about. Afterwards the sheet is saved and the page redrawn, unless the action
// returns NOTHING_TO_SAVE (nothing changed, or it already redrew what it needed to).
const NOTHING_TO_SAVE = false;
const valueOf = button => button.dataset.value;
const indexOf = button => Number(button.dataset.value);
// A data-value of '2.0' names a part inside a part: a slot level and one of its pips, an item and one of its effects.
const twoIndexesOf = button => button.dataset.value.split('.').map(Number);
const textIn = id => document.getElementById(id).value.trim();
const numberIn = id => parseInt(document.getElementById(id).value);

const CLICK_ACTIONS = {
    'set-mode': button => {
        sheet.mode = valueOf(button);
        ui.headerMessage = '';
    },
    'open-library': () => {
        showLibrary();
        return NOTHING_TO_SAVE;
    },

    'damage': () => takeDamage(sheet, typedHitPointAmount()),
    'heal': () => heal(sheet, typedHitPointAmount()),
    'set-temp-hp': () => setTemporaryHitPoints(sheet, typedHitPointAmount()),
    'long-rest': () => longRest(sheet),
    'spend-hit-die': () => spendHitDie(sheet, ui),
    'use-average-hp': () => useAverageHitPoints(sheet),
    'toggle-save': button => toggleSaveProficiency(sheet, valueOf(button)),
    'cycle-skill': button => cycleSkillProficiency(sheet, valueOf(button)),

    'roll': button => rollCheck(sheet, ui, button),
    'spell-attack': button => rollSpellAttack(sheet, ui, indexOf(button)),
    'spell-effect': button => rollSpellEffect(sheet, ui, indexOf(button)),
    'weapon-attack': button => rollWeaponAttack(sheet, ui, indexOf(button)),
    'weapon-damage': button => rollWeaponDamage(sheet, ui, indexOf(button), button.dataset.twoHanded === '1'),
    'set-roll-mode': button => setRollMode(ui, valueOf(button)),
    'roll-custom-dice': () => rollCustomDice(sheet, ui, document.getElementById('custom-dice').value),
    'copy-roll': () => copyLastRoll(sheet, ui),
    'toggle-roll-options': () => {
        toggleRollOptions(ui);
        renderRoll();
        return NOTHING_TO_SAVE;
    },

    'toggle-spellcasting': () => {
        sheet.spc = !sheet.spc;
    },
    'toggle-slot': button => toggleSpellSlot(sheet, ...twoIndexesOf(button)),
    'toggle-spell-description': button => toggleOpen('spell-' + valueOf(button)),
    'add-spell': () => addSpell(sheet, textIn('new-spell-name'), numberIn('new-spell-level')) || NOTHING_TO_SAVE,
    'remove-spell': button => removeSpell(sheet, ui, indexOf(button)),

    'toggle-inventory': () => {
        sheet.inc = !sheet.inc;
    },
    'toggle-item-description': button => toggleOpen('item-' + valueOf(button)),
    'add-item': () => addItem(sheet, textIn('new-item-name'), numberIn('new-item-quantity')) || NOTHING_TO_SAVE,
    'remove-item': button => removeItem(sheet, ui, indexOf(button)),
    'toggle-attunement': button => {
        if (toggleAttunement(sheet, indexOf(button))) return;
        ui.attunementRefused = indexOf(button);
        render();
        return NOTHING_TO_SAVE;
    },
    'add-effect': button => {
        const index = valueOf(button);
        const choice = document.getElementById('new-effect-' + index).value;
        addItemEffect(sheet.items[index], choice, numberIn('new-effect-value-' + index));
    },
    'remove-effect': button => {
        const [itemIndex, effectIndex] = twoIndexesOf(button);
        removeItemEffect(sheet.items[itemIndex], effectIndex);
    },

    'add-feature': button => {
        const listKey = valueOf(button);
        const typePicker = document.getElementById('new-feature-type-' + listKey);
        const type = typePicker ? typePicker.value : '';
        return addFeature(sheet, listKey, textIn('new-feature-name-' + listKey), type) || NOTHING_TO_SAVE;
    },
    'remove-feature': button => {
        const [listKey, index] = valueOf(button).split('.');
        removeFeature(sheet, ui, listKey, Number(index));
    },

    'export': () => {
        exportToBox();
        return NOTHING_TO_SAVE;
    },
    'download-backup': () => {
        ui.backupMessage = null;
        downloadSheet(sheet);
    },
    'import': () => {
        ui.backupText = document.getElementById('backup-json').value;
        ui.backupMessage = null;
        if (importBackup(ui.backupText)) return;
        render();
        return NOTHING_TO_SAVE;
    },
    'restore': () => restoreVersion(numberIn('earlier-version')) || NOTHING_TO_SAVE,
    'new-character': () => {
        const question = 'Start a new character? '
            + 'The current one can be brought back from "Restore an earlier version".';
        if (!confirm(question)) return NOTHING_TO_SAVE;
        replaceSheet({}, 'before new character');
    },
};

document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    const action = button?.dataset.action;
    // The attunement-limit message goes away on the next click anywhere.
    if (ui.attunementRefused >= 0 && action !== 'toggle-attunement') {
        ui.attunementRefused = -1;
        if (!button) render();
    }
    if (!button) return;
    rememberHitPointAmount();
    if (CLICK_ACTIONS[action](button) === NOTHING_TO_SAVE) return;
    save();
    render();
});

// The number in the Damage/Heal box, at least 0.
function typedHitPointAmount() {
    return Math.max(0, parseInt(document.getElementById('hit-point-amount')?.value) || 0);
}

// The box keeps its number across redraws, unless it was cleared or set to 0.
function rememberHitPointAmount() {
    ui.hitPointAmount = typedHitPointAmount() || ui.hitPointAmount;
}

function toggleOpen(id) {
    if (ui.openSections.has(id)) ui.openSections.delete(id);
    else ui.openSections.add(id);
}

// The Library may download (or import) species, so the Species drop-down reads them again afterwards.
// Removing something from the sheet there moves list places, so open sections are forgotten.
function showLibrary() {
    openLibrary(() => sheet, removedSomething => {
        if (removedSomething) {
            ui.openSections.clear();
            forgetListPlaces(ui);
        }
        save();
        render();
        cachedSpecies()
            .then(species => {
                ui.librarySpecies = species;
                render();
            })
            .catch(() => {});
    });
}

// Export: the sheet as JSON in the Backup box, selected and copied, and now noted as the last backup.
function exportToBox() {
    ui.backupMessage = null;
    ui.backupText = JSON.stringify(sheet, null, 1);
    markBackedUp();
    save();
    render();
    document.getElementById('backup-json').select();
    try {
        navigator.clipboard.writeText(ui.backupText).catch(() => {});
    } catch {
        // No clipboard (an insecure page or an old browser): the text is selected for copying by hand.
    }
}

document.addEventListener('change', event => {
    if (event.target.id === 'backup-file') openBackupFile(event.target);
});
// Another tab saved: take its version, so this tab never writes a stale copy over it.
window.addEventListener('storage', event => {
    if (event.key !== 'sheet' || !event.newValue) return;
    try {
        sheet = cleanSheet(JSON.parse(event.newValue));
        render();
    } catch {
        // Not a sheet this tab can read: keep the one it has.
    }
});

// Fill in gear data from the saved Library copy, on opening and whenever the Library downloads again.
async function upgradeGear() {
    let libraryItems;
    try {
        libraryItems = await cachedItems();
    } catch {
        return;
    }
    if (!fillGearFromLibrary(sheet, libraryItems)) return;
    save();
    render();
}
window.addEventListener('library-loaded', upgradeGear);

// Keep the room at the bottom right when the roll bar rewraps (window resized, phone rotated).
window.addEventListener('resize', fitPageAboveRollBar);

// Ask the browser not to clear this site's data under storage pressure (granted silently or not at all).
function askToKeepStorage() {
    try {
        navigator.storage?.persisted?.()
            .then(alreadyKept => alreadyKept || navigator.storage.persist())
            .catch(() => {});
    } catch {
        // No Storage API: the browser decides on its own.
    }
}

// Opening the page: keep the version it opened with, upgrade old gear, and read the Library's species
// for the Species picker, which only Edit shows.
askToKeepStorage();
snapshot(sheet, 'opened', true);
upgradeGear();
cachedSpecies()
    .then(species => {
        ui.librarySpecies = species;
        if (sheet.mode === 'edit') render();
    })
    .catch(() => {});
render();
