// The top of the sheet: the name and a one-line summary, the Play/Edit switch and the Library button.
// In Edit, the character's identity fields: name, level, class, subclass, species and background.
import { CLASS_NAMES } from '../sheet.js';
import { knownClass, knownSpecies, speciesNames } from '../rules.js';
import { html, when, input, field } from '../html.js';

const HIT_DICE = [6, 8, 10, 12];

/**
 * The header. ui holds what the pickers need beyond the sheet:
 *   customClass, customSpecies   true once Custom… is picked, until a standard one is
 *   librarySpecies               the species downloaded to the Library, or [] before the first download
 *   message                      what the last class or species change did, or ''
 */
export function headerSection(sheet, { editing }, ui) {
    return html`
        <div class="top">
            <div><h1>${sheet.name || 'Unnamed'}</h1><p class="sub">${summary(sheet)}</p></div>
            <div class="seg">
                <button data-a="set-mode" data-v="play" class="${when(!editing, 'on')}">Play</button>
                <button data-a="set-mode" data-v="edit" class="${when(editing, 'on')}">Edit</button>
            </div>
            <button data-a="open-library">Library</button>
        </div>
        ${when(editing, () => identityFields(sheet, ui))}`;
}

// "Dwarf, Fighter (Champion), Level 5", leaving out whatever isn't set.
function summary(sheet) {
    const subclass = sheet.sub ? ` (${sheet.sub})` : '';
    const characterClass = sheet.cls ? sheet.cls + subclass : '';
    return [sheet.species, characterClass, `Level ${sheet.level}`].filter(Boolean).join(', ');
}

function identityFields(sheet, ui) {
    return html`
        <div class="id">
            ${field('Name', 'name', sheet.name)}
            ${field('Level', 'level', sheet.level, 'number', 'min=1 max=20')}
            ${classPicker(sheet, ui.customClass)}
            ${field('Subclass', 'sub', sheet.sub)}
            ${speciesPicker(sheet, ui)}
            ${field('Background', 'bg', sheet.bg)}
            ${when(ui.message, () => html`<p class="sub w clsm" role="status">${ui.message}</p>`)}
        </div>`;
}

// Class is a drop-down of the standard classes, so other parts of the sheet can rely on the name. Custom…
// (or any name that isn't one of them, like a homebrew class or an older sheet's "Bard 3") opens a name
// box instead, and a hit die picker, since the sheet can't know a custom class's hit die.
function classPicker(sheet, customPicked) {
    const known = knownClass(sheet.cls);
    const custom = customPicked || (!known && Boolean(sheet.cls.trim()));
    const options = CLASS_NAMES.map(name => html`<option ${when(known === name, 'selected')}>${name}</option>`);
    return html`
        <div>
            <label class="lab" for="f-clsp">Class</label>
            <select id="f-clsp">
                <option value="">Choose a class</option>${options}
                <option value="*" ${when(custom, 'selected')}>Custom…</option>
            </select>
            ${when(custom, () => customClassFields(sheet))}
        </div>`;
}

function customClassFields(sheet) {
    const dice = HIT_DICE.map(sides => html`
        <option value="${sides}" ${when(sheet.hdie === sides, 'selected')}>Hit die: d${sides}</option>`);
    return html`
        ${input('cls', sheet.cls, 'text', 'class="clsx" placeholder="Class name" aria-label="Custom class"')}
        <select class="clsx" data-k="hdie" aria-label="Custom class hit die">
            <option value="0">Hit die: not set</option>${dice}
        </select>`;
}

// Species works like Class: the Library's species (SRD 5.2 and any custom packs), or Custom… for anything else.
function speciesPicker(sheet, { customSpecies, librarySpecies }) {
    const known = knownSpecies(sheet.species, librarySpecies);
    const custom = customSpecies || (!known && Boolean(sheet.species.trim()));
    const options = speciesNames(librarySpecies).map(name => html`
        <option value="${name}" ${when(known === name, 'selected')}>${name}</option>`);
    const nameBox = () => input('species', sheet.species, 'text',
        'class="clsx" placeholder="Species name" aria-label="Custom species"');
    return html`
        <div>
            <label class="lab" for="f-spp">Species</label>
            <select id="f-spp">
                <option value="">Choose a species</option>${options}
                <option value="*" ${when(custom, 'selected')}>Custom…</option>
            </select>
            ${when(custom, nameBox)}
        </div>`;
}
