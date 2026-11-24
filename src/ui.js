// What the page keeps track of that isn't part of the character, so it isn't saved with the sheet.
import { readKey } from './storage.js';

export function createUi() {
    return {
        roll: {
            mode: '', // '', 'adv' or 'dis'
            last: null,
            error: '',
            copied: false,
            customDice: '',
            // The attack whose damage roll doubles its dice: 's2' for spell 2, 'i0' for item 0.
            criticalHit: null,
            // Kept per device, not in the sheet.
            minimized: readKey('roll-min') === '1',
        },
        // The slot level picked for each spell, by its place in the list, when cast with a higher slot.
        spellSlotLevels: {},
        // The ids of the sections and descriptions the user opened, like 'sp2' or 'roll-options'.
        openSections: new Set(),
        // The number in the Damage/Heal box.
        hitPointAmount: 1,
        // A note under the header on what picking a class or species changed.
        headerMessage: '',
        // True while the Class or Species picker is on Custom, so a typed name is used as it is.
        customClass: false,
        customSpecies: false,
        // The species the Library has downloaded, for the Species picker.
        librarySpecies: [],
        // The place in the item list of the item that couldn't be attuned (the limit is 3), or -1.
        attunementRefused: -1,
        // What the Backup JSON box holds, and the result of the last import or restore: { text, isError }.
        backupText: '',
        backupMessage: null,
    };
}

/** Forgets what belonged to the spells or items in the list, when their places in it change. */
export function forgetListPlaces(ui) {
    ui.spellSlotLevels = {};
    ui.roll.criticalHit = null;
}
