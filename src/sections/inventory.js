// Inventory: what the character carries, what's equipped and attuned, the AC breakdown and weapon rolls.
//
// An item keeps its name in `n`, the quantity in `q` and a description in `d`. Gear you can wear or wield
// is equippable (`eq`) and equipped while `on`. A magic item may need attunement (`at`), given by `att`,
// and has a rarity rank (`rr`). Weapons have `w` (damage dice, type, two-handed dice, magic bonus and the
// ability they use), armor and other AC gear has `ar`, and magic items may have effects (`fx`).
import { signed, score, armorClass, activeGear } from '../rules.js';
import { weaponMod, withMod } from '../rolls.js';
import { md, rarityTag, magicMark } from '../text.js';
import { html, raw, when, input } from '../html.js';
import { effectLabel, ITEM_EFFECT_CHOICES } from '../effects.js';

const BODY_ARMOR_AND_SHIELDS = ['light', 'medium', 'heavy', 'shield'];

const ARMOR_KINDS = [
    { value: '', label: 'No AC effect' },
    { value: 'light', label: 'Light armor (+ Dex)' },
    { value: 'medium', label: 'Medium armor (+ Dex, max 2)' },
    { value: 'heavy', label: 'Heavy armor' },
    { value: 'shield', label: 'Shield (adds AC)' },
    { value: 'bonus', label: 'AC bonus (adds AC)' },
    { value: 'unarm', label: 'Unarmored base (+ Dex)' },
];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The Inventory section. ui.isOpen(id) says whether an item's description is open ('item-' + index), and
 * ui.attunementRefused is the index of the item whose Attune button was just refused (-1 for none).
 * Collapsed, it keeps only what's equipped, with its roll buttons.
 */
export function inventorySection(sheet, { editing, proficiency }, ui) {
    const collapsed = sheet.inc;
    const equippable = sheet.items.filter(item => item.eq);
    const inventory = {
        sheet,
        editing,
        proficiency,
        ui,
        armor: armorClass(sheet),
        gear: activeGear(sheet),
        equippedCount: equippable.filter(item => item.on).length,
        strength: score(sheet, 'str'),
        calculatedAc: sheet.acAuto,
    };
    const shown = sheet.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !collapsed || (item.eq && item.on));
    const emptyText = collapsed && sheet.items.length ? 'Nothing equipped.' : 'Nothing carried.';

    return html`
        ${inventoryHeading(sheet, inventory.equippedCount)}
        ${when(!collapsed, () => inventorySummary(sheet, equippable, inventory))}
        ${shown.length
            ? shown.map(({ item, index }) => itemRow(item, index, inventory))
            : html`<div class="empty">${emptyText}</div>`}
        ${when(editing && !collapsed, addItemRow)}`;
}

function inventoryHeading(sheet, equippedCount) {
    const counts = `${plural(sheet.items.length, 'item')}, ${equippedCount} equipped`;
    const button = html`
        <button class="hd" data-action="toggle-inventory" aria-expanded="${!sheet.inc}">Inventory</button>`;
    return html`
        <h2>${button}${when(sheet.inc, html`<small>${counts}</small>`)}</h2>`;
}

// The lines under the heading: how much is equipped and attuned, and what the AC is made of.
function inventorySummary(sheet, equippable, { gear, armor, equippedCount }) {
    const needsAttunement = sheet.items.some(item => item.at);
    const overLimit = gear.over.length;
    return html`
        ${when(equippable.length, () => html`
            <p class="sub prep">Equipped <b>${equippedCount}</b> of ${plural(equippable.length, 'equippable item')}.
                Tick the box next to gear you are wearing or wielding.</p>`)}
        ${when(needsAttunement, () => html`
            <p class="sub prep">Attuned <b>${Math.min(3, gear.attuned)}</b> of 3${when(overLimit,
                html` <span class="reqm">${overLimit} more than you can attune to</span>`)}.
                A magic item that needs attunement only works while equipped and attuned.</p>`)}
        ${when(sheet.acAuto && equippable.length, () => html`
            <p class="sub prep">Armor class <b>${armor.ac}</b>: ${armorBreakdown(armor.parts)}.</p>`)}`;
}

// "Chain Mail 16, Shield +2, Ring of Protection +1": the first part is the base, the rest add to it.
const armorBreakdown = parts => parts
    .map(([name, value], index) => `${name} ${index === 0 ? value : signed(value)}`)
    .join(', ');

// One item: its name line, then whatever applies of warnings, effects, the Edit settings, the weapon
// rolls and the description.
function itemRow(item, index, inventory) {
    const { editing, ui } = inventory;
    const faded = !editing && inventory.equippedCount && item.eq && !item.on;

    return html`
        <div class="spi${when(faded, ' unp')}${itemHighlight(item, inventory)}">
            ${itemLine(item, index, inventory)}
            ${when(ui.attunementRefused === index, html`
                <p class="reqn srl" role="alert">Already attuned to 3 items. End attunement to one first.</p>`)}
            ${when(!editing && item.fx?.length, () => html`
                <div class="srl fxl">${item.fx.map(effectLabel).join(' · ')}</div>`)}
            ${when(editing && item.eq, () => attunementAndEffects(item, index))}
            ${when(editing, () => equippableSettings(item, index))}
            ${when(item.w && !editing, () => weaponButtons(item, index, inventory))}
            ${when(item.d && ui.isOpen('item-' + index), () => html`<p class="sd">${raw(md(item.d))}</p>`)}
        </div>`;
}

const strengthTooLow = (item, { strength }) => item.eq && item.on && item.ar && item.ar.str > strength;

// Red for a problem (too heavy, over the attunement limit, a second attuned copy), else the rarity's color.
function itemHighlight(item, inventory) {
    const { gear } = inventory;
    if (strengthTooLow(item, inventory) || gear.over.includes(item) || gear.dup.includes(item)) return ' req';
    return item.rr ? ` rs r${item.rr}` : '';
}

// The Equipped box, the name with its rarity and notes, and the quantity (a field in Edit).
function itemLine(item, index, inventory) {
    const { editing } = inventory;
    const equippedBox = item.eq
        ? html`<input type="checkbox" data-field="items.${index}.on" ${when(item.on, 'checked')}
            aria-label="${item.n} equipped" title="Equipped">`
        : html`<span class="pk"></span>`;
    const quantity = editing
        ? input(`items.${index}.q`, item.q, 'number', html`min=0 style="width:64px" aria-label="${item.n} quantity"`)
        : html`<span class="v">&times;${item.q}</span>`;
    const removeButton = html`
        <button class="x" data-action="remove-item" data-value="${index}" aria-label="Remove ${item.n}">✕</button>`;

    return html`
        <div class="ln">
            ${equippedBox}
            <span class="g">
                ${raw(magicMark(item.rr))}
                ${itemName(item, index, inventory.ui)}
                ${raw(rarityTag(item.rr))}
                ${itemNotes(item, index, inventory)}
            </span>
            ${quantity}
            ${when(editing, removeButton)}
        </div>`;
}

// With a description, the name is a button that opens it.
function itemName(item, index, ui) {
    if (!item.d) return item.n;
    return html`
        <button class="lk" data-action="toggle-item-description" data-value="${index}"
            aria-expanded="${ui.isOpen('item-' + index)}">${item.n}</button>`;
}

// Notes after the name: too heavy to wear well, the Attune button, and why an item has no effect.
function itemNotes(item, index, inventory) {
    const { gear, armor, strength, calculatedAc } = inventory;
    const unusedArmor = item.on && item.ar && BODY_ARMOR_AND_SHIELDS.includes(item.ar.k) && !armor.used.has(item);
    return html`
        ${when(strengthTooLow(item, inventory), () =>
            html` <span class="reqm">Needs Str ${item.ar.str} (you have ${strength}): Speed &minus;10 ft</span>`)}
        ${when(item.at, () => attuneButton(item, index))}
        ${when(gear.over.includes(item), html` <span class="reqm">Over the 3-item attunement limit</span>`)}
        ${when(gear.dup.includes(item), html` <span class="reqm">Already attuned to another copy, no effect</span>`)}
        ${when(item.at && item.on && !item.att, html` <span class="a">not attuned, no effect</span>`)}
        ${when(unusedArmor && calculatedAc, html` <span class="a">not counted, a better one is equipped</span>`)}`;
}

function attuneButton(item, index) {
    const attuned = Boolean(item.att);
    const title = attuned ? 'Attuned. Click to end attunement' : 'Needs attunement. Click to attune';
    const label = attuned ? 'Attuned' : 'Attune';
    return html` <button class="pill att${when(attuned, ' on')}" data-action="toggle-attunement" data-value="${index}"
        aria-label="Attune ${item.n}" aria-pressed="${attuned}" title="${title}">${label}</button>`;
}

// Edit, equippable gear: whether it needs attunement, its effects, and a way to add one.
function attunementAndEffects(item, index) {
    const effects = (item.fx || []).map((effect, effectIndex) => {
        const label = effectLabel(effect);
        return html`<span class="pill">${label} <button class="x" data-action="remove-effect"
            data-value="${index}.${effectIndex}"
            aria-label="Remove ${label} from ${item.n}">✕</button></span>`;
    });
    const choices = ITEM_EFFECT_CHOICES.map(({ value, label }) => html`<option value="${value}">${label}</option>`);

    return html`
        <div class="srl">
            <label class="row"><input type="checkbox" data-field="items.${index}.at" ${when(item.at, 'checked')}
                aria-label="${item.n} needs attunement"> Needs attunement</label>
            ${effects}
            <select id="new-effect-${index}" aria-label="${item.n} effect">${choices}</select>
            <input id="new-effect-value-${index}" type="number" value="1" style="width:64px"
                aria-label="${item.n} effect value">
            <button data-action="add-effect" data-value="${index}"
                aria-label="Add effect to ${item.n}">Add effect</button>
        </div>`;
}

// Edit: whether the item can be equipped and, if so, what it does for AC.
function equippableSettings(item, index) {
    const kinds = ARMOR_KINDS.map(({ value, label }) => html`
        <option value="${value}" ${when(item.ar?.k === value, 'selected')}>${label}</option>`);
    return html`
        <div class="srl">
            <label class="row"><input type="checkbox" data-field="items.${index}.eq" ${when(item.eq, 'checked')}
                aria-label="${item.n} equippable"> Equippable</label>
            ${when(item.eq, () => html`
                <select data-field="items.${index}.ar.k" aria-label="${item.n} armor class effect">${kinds}</select>
                ${when(item.ar.k, () => armorFields(item, index))}`)}
        </div>`;
}

function armorFields(item, index) {
    const number = (key, value, range, label) => input(`items.${index}.ar.${key}`, value, 'number',
        html`${range} style="width:64px" aria-label="${item.n} ${label}"`);
    return html`
        <label class="row">AC ${number('ac', item.ar.ac, 'min=-10 max=30', 'AC value')}</label>
        <label class="row">Str needed ${number('str', item.ar.str, 'min=0 max=30', 'strength needed')}</label>
        <label class="row">Save bonus ${number('sb', item.ar.sb || 0, 'min=-5 max=10', 'saving throw bonus')}</label>
        <label class="row"><input type="checkbox" data-field="items.${index}.ar.stl" ${when(item.ar.stl, 'checked')}
            aria-label="${item.n} Stealth Disadvantage"> Stealth Disadvantage</label>`;
}

// Play, weapons: attack and damage buttons, plus two-handed damage for versatile weapons.
function weaponButtons(item, index, { sheet, proficiency }) {
    const weapon = item.w;
    const modifier = weaponMod(sheet, item);
    return html`
        <div class="srl">
            <button class="rb" data-action="weapon-attack"
                data-value="${index}">Hit ${signed(proficiency + modifier)}</button>
            <button class="rb" data-action="weapon-damage"
                data-value="${index}">${withMod(weapon.d, modifier)} ${weapon.t}</button>
            ${when(weapon.v, html`
                <button class="rb" data-action="weapon-damage" data-value="${index}" data-two-handed="1">
                    ${withMod(weapon.v, modifier)} two-handed</button>`)}
        </div>`;
}

function addItemRow() {
    return html`
        <div class="add">
            <input class="n" id="new-item-name" placeholder="Item name" aria-label="New item name">
            <input class="q" id="new-item-quantity" type="number" value="1" min="0" aria-label="New item quantity">
            <button class="pri" data-action="add-item" aria-label="Add item">Add</button>
        </div>`;
}
