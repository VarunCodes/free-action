// The Spellcasting section: spellcasting ability, save DC and spell attack, spell slots, and the
// spell list. Collapsed, it shows only its heading with a count.
//
// The sheet's spell data uses short keys (it's what's saved, so they stay):
//   spell      n name, l level (0 for a cantrip), p prepared, d description, r roll data
//   spell.r    a makes an attack, s the saving throw's ability ('' for none), d damage or healing dice,
//              t damage type, h heals, m adds the spellcasting modifier (scaling: see spellDice)
//   slot       m how many, u how many are used (sheet.slots holds levels 1 to 9 in order)
//
// The spell save DC is 8 + proficiency + the spellcasting modifier, and the spell attack is
// proficiency + the spellcasting modifier (PHB 2024), each plus any bonuses from items.
import { ABILITIES, ABILITY_NAMES } from '../sheet.js';
import { signed, effectsOf } from '../rules.js';
import { spellDice } from '../rolls.js';
import { html, raw, when, input, sourcesText, markdownToHtml } from '../html.js';

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SPELL_LEVELS = [0, ...SLOT_LEVELS];
// The most slots of one level the sheet allows.
const MAX_SLOTS_OF_A_LEVEL = 9;

// The spell save DC: 8 + proficiency + the spellcasting modifier + bonuses from items (PHB 2024).
const SPELL_SAVE_DC_BASE = 8;
const spellSaveDc = ({ proficiency, castingModifier, spellDcBonus }) =>
    SPELL_SAVE_DC_BASE + proficiency + castingModifier + spellDcBonus;

// ui: isOpen(id) says whether a spell's description is open ('spell-' + its index), and
// slotFor(index) is the slot level picked for a spell, if any.
export function spellsSection(sheet, view, ui) {
    const { editing, castingAbility } = view;
    const heading = spellsHeading(sheet, view);
    if (sheet.spc) return heading;

    return html`
        ${heading}
        ${when(editing, castingAbilityField(castingAbility))}
        ${when(!editing && !castingAbility, html`
            <p class="sub prep">No spellcasting ability set.
                Choose one in Edit to see your save DC and spell attack.</p>`)}
        ${when(castingAbility, () => castingSummary(sheet, view))}
        ${spellSlots(sheet, editing)}
        ${spellList(sheet, view, ui)}
        ${when(editing, addSpellForm())}`;
}

// The heading toggles the section. Collapsed, it says how many spells there are and the save DC.
function spellsHeading(sheet, view) {
    const count = sheet.spells.length;
    const dc = spellSaveDc(view);
    const spells = count === 1 ? '1 spell' : `${count} spells`;
    const summary = html`<small>${spells}${when(view.castingAbility, `, save DC ${dc}`)}</small>`;
    return html`
        <h2>
            <button class="hd" data-action="toggle-spellcasting" aria-expanded="${!sheet.spc}">Spellcasting</button>
            ${when(sheet.spc, summary)}
        </h2>`;
}

function castingAbilityField(castingAbility) {
    return html`
        <div class="row" style="margin-bottom:8px">
            <div style="flex:1">
                <label class="lab" for="field-cast">Spellcasting ability</label>
                <select id="field-cast" data-field="cast">
                    <option value="">None</option>
                    ${ABILITIES.map(ability => html`
                        <option value="${ability}"
                            ${when(castingAbility === ability, 'selected')}>${ABILITY_NAMES[ability]}</option>`)}
                </select>
            </div>
        </div>`;
}

// Save DC, the spell attack (tap to roll), any item bonuses to either, and the modifier.
function castingSummary(sheet, view) {
    const { proficiency, castingModifier, spellAttackBonus, spellDcBonus } = view;
    const dc = spellSaveDc(view);
    const attack = proficiency + castingModifier + spellAttackBonus;
    const bonuses = [...effectsOf(sheet, 'sa'), ...effectsOf(sheet, 'dc')].map(([source, [type, , value]]) =>
        [`${source.n} (${type === 'sa' ? 'attack' : 'DC'})`, value]);
    return html`
        <div class="cast">
            <span>Save DC <b>${dc}</b></span>
            <span>Attack <button class="rb" data-action="roll" data-roll-label="Spell attack"
                data-roll-bonus="${attack}">${signed(attack)}</button></span>
            ${when(spellAttackBonus !== 0 || spellDcBonus !== 0, html`<span class="a">${sourcesText(bonuses)}</span>`)}
            <span>Modifier <b>${signed(castingModifier)}</b></span>
        </div>`;
}

// One row of pips per slot level: tap a pip to use or regain a slot. Play shows only the levels
// that have slots; Edit shows all nine, each with a field for how many.
function spellSlots(sheet, editing) {
    const levels = sheet.slots
        .map((slots, index) => ({ slots, level: index + 1 }))
        .filter(({ slots }) => editing || slots.m > 0);
    return html`
        <div class="slots">
            ${levels.length > 0
                ? levels.map(({ slots, level }) => slotRow(slots, level, editing))
                : html`<div class="empty">No spell slots. Switch to Edit to set them.</div>`}
        </div>`;
}

function slotRow(slots, level, editing) {
    const index = level - 1;
    return html`
        <div class="sl">
            <span class="lv">Lvl ${level}</span>
            <div class="pips">
                ${[...Array(slots.m).keys()].map(pip => html`
                    <button class="pip ${when(pip < slots.u, 'used')}"
                        data-action="toggle-slot" data-value="${index}.${pip}"
                        aria-label="Level ${level} slot ${pip + 1}"></button>`)}
            </div>
            ${when(editing, () => input(`slots.${index}.m`, slots.m, 'number',
                `min=0 max=${MAX_SLOTS_OF_A_LEVEL} aria-label="Level ${level} max slots"`))}
        </div>`;
}

// Spells grouped by level (cantrips first), alphabetically within a level.
// Cantrips are always ready, so only leveled spells get a Prepared box. Once anything is
// prepared, Play mode dims the rest; a caster who never ticks boxes sees nothing dimmed.
function spellList(sheet, view, ui) {
    const leveled = sheet.spells.filter(spell => spell.l > 0);
    const preparedCount = leveled.filter(spell => spell.p).length;
    const sorted = sheet.spells
        .map((spell, index) => ({ spell, index }))
        .sort((first, second) => first.spell.l - second.spell.l || first.spell.n.localeCompare(second.spell.n));

    const entries = [];
    let lastLevel = -1;
    for (const { spell, index } of sorted) {
        if (spell.l !== lastLevel) {
            lastLevel = spell.l;
            entries.push(html`<div class="grp">${spell.l ? `Level ${spell.l}` : 'Cantrips'}</div>`);
        }
        entries.push(spellEntry(sheet, view, ui, spell, index, preparedCount > 0));
    }

    return html`
        ${when(leveled.length > 0, html`
            <p class="sub prep">Prepared <b>${preparedCount}</b> of ${leveled.length} leveled spells.
                Tick the box next to a spell to prepare it.</p>`)}
        ${entries.length > 0 ? entries : html`<div class="empty">No spells yet.</div>`}`;
}

// One spell: Prepared box, name (tap to show the description), its rolls, and in Edit a remove button.
function spellEntry(sheet, view, ui, spell, index, anyPrepared) {
    const { editing } = view;
    const dimmed = !editing && anyPrepared && spell.l > 0 && !spell.p;
    const descriptionOpen = ui.isOpen('spell-' + index);
    return html`
        <div class="spi${when(dimmed, ' unp')}">
            <div class="ln">
                ${preparedBox(spell, index)}
                <span class="g">${spellTitle(spell, index, descriptionOpen)}</span>
                ${when(editing, html`
                    <button class="x" data-action="remove-spell" data-value="${index}"
                        aria-label="Remove ${spell.n}">✕</button>`)}
            </div>
            ${editing ? spellRollFields(spell, index) : spellRollButtons(sheet, view, ui, spell, index)}
            ${when(spell.d && descriptionOpen, () => html`<p class="sd">${raw(markdownToHtml(spell.d))}</p>`)}
        </div>`;
}

// Cantrips are always ready, so they get an empty space where leveled spells have a Prepared box.
function preparedBox(spell, index) {
    if (spell.l <= 0) return html`<span class="pk"></span>`;
    return html`<input type="checkbox" data-field="spells.${index}.p" ${when(spell.p, 'checked')}
        aria-label="${spell.n} prepared" title="Prepared">`;
}

// The spell's name. When it has a description, the name is a button that shows or hides it.
function spellTitle(spell, index, descriptionOpen) {
    if (!spell.d) return spell.n;
    return html`<button class="lk" data-action="toggle-spell-description" data-value="${index}"
        aria-expanded="${descriptionOpen}">${spell.n}</button>`;
}

// Edit: whether the spell makes an attack or forces a save, its dice and damage type, and whether
// the spellcasting modifier is added.
function spellRollFields(spell, index) {
    const roll = spell.r;
    const key = `spells.${index}.r.`;
    const name = spell.n;
    return html`
        <div class="srl">
            <label class="row"><input type="checkbox" data-field="${key}a" ${when(roll.a, 'checked')}
                aria-label="${name} attack"> Attack</label>
            <select data-field="${key}s" aria-label="${name} saving throw">
                <option value="">No save</option>
                ${ABILITIES.map(ability => html`
                    <option value="${ability}"
                        ${when(roll.s === ability, 'selected')}>${ABILITY_NAMES[ability].slice(0, 3)} save</option>`)}
            </select>
            ${input(key + 'd', roll.d, 'text',
                html`class="dmg" placeholder="Dice, e.g. 1d10" aria-label="${name} damage dice"`)}
            ${input(key + 't', roll.t, 'text', html`class="dmt" placeholder="Type" aria-label="${name} damage type"`)}
            <label class="row"><input type="checkbox" data-field="${key}m" ${when(roll.m, 'checked')}
                aria-label="${name} adds modifier"> + modifier</label>
        </div>`;
}

// Play: the attack button, the save DC, the damage or healing button, how many attacks, and for
// spells that scale with the slot, a slot picker. Nothing if the spell has none of these.
function spellRollButtons(sheet, view, ui, spell, index) {
    const { proficiency, castingModifier, spellAttackBonus } = view;
    const roll = spell.r;
    const slot = ui.slotFor(index) ?? spell.l;
    const { dice, attacks } = spellDice(sheet, spell, slot);
    const saveName = ABILITY_NAMES[roll.s];
    if (!roll.a && !saveName && !dice) return '';

    const attack = proficiency + castingModifier + spellAttackBonus;
    const dc = spellSaveDc(view);
    const effect = roll.h || roll.t ? ` ${roll.h ? 'healing' : roll.t}` : '';
    return html`
        <div class="srl">
            ${when(roll.a, html`
                <button class="rb" data-action="spell-attack" data-value="${index}">Hit ${signed(attack)}</button>`)}
            ${when(saveName, () => html`<span class="pill">DC ${dc} ${saveName.slice(0, 3)}</span>`)}
            ${when(dice, html`
                <button class="rb" data-action="spell-effect" data-value="${index}">${dice}${effect}</button>`)}
            ${when(attacks > 1, html`<span class="a">&times;${attacks}</span>`)}
            ${slotLevelPicker(spell, index, slot)}
        </div>`;
}

// For spells that scale with the slot used: which slot to cast it with, from its own level up.
function slotLevelPicker(spell, index, slot) {
    const roll = spell.r;
    if (roll.by !== 'slot' || !roll.up.length || spell.l <= 0) return '';
    return html`
        <select data-slot-level-for="${index}" aria-label="${spell.n} slot level">
            ${SLOT_LEVELS.filter(level => level >= spell.l).map(level => html`
                <option value="${level}" ${when(level === slot, 'selected')}>Slot ${level}</option>`)}
        </select>`;
}

// Edit: the name and level of a new spell.
function addSpellForm() {
    return html`
        <div class="add">
            <input class="n" id="new-spell-name" placeholder="Spell name" aria-label="New spell name">
            <select id="new-spell-level" aria-label="New spell level">
                ${SPELL_LEVELS.map(level => html`
                    <option value="${level}">${level ? `Lvl ${level}` : 'Cantrip'}</option>`)}
            </select>
            <button class="pri" data-action="add-spell">Add</button>
        </div>`;
}
