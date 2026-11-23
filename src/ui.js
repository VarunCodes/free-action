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
    };
}

/** Forgets what belonged to the spells or items in the list, when their places in it change. */
export function forgetListPlaces(ui) {
    ui.spellSlotLevels = {};
    ui.roll.criticalHit = null;
}
