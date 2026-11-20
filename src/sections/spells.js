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
import { AB, ABN } from '../sheet.js';
import { esc, md } from '../text.js';
import { signed, effectsOf } from '../rules.js';
import { spellDice } from '../rolls.js';
import { input, sourcesText } from '../html.js';

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SPELL_LEVELS = [0, ...SLOT_LEVELS];

// ui: isOpen(id) says whether a spell's description is open ('sp' + its index), and
// slotFor(index) is the slot level picked for a spell, if any.
export function spellsSection(sheet, view, ui) {
    const { editing, castingAbility } = view;
    const heading = spellsHeading(sheet, view);
    if (sheet.spc) return heading;

    let html = heading;
    if (editing) html += castingAbilityField(castingAbility);
    if (!editing && !castingAbility) {
        html += '<p class="sub prep">No spellcasting ability set. '
            + 'Choose one in Edit to see your save DC and spell attack.</p>';
    }
    if (castingAbility) html += castingSummary(sheet, view);
    html += spellSlots(sheet, editing);
    html += spellList(sheet, view, ui);
    if (editing) html += addSpellForm();
    return html;
}

// The heading toggles the section. Collapsed, it says how many spells there are and the save DC.
function spellsHeading(sheet, { proficiency, castingAbility, castingModifier, spellDcBonus }) {
    let summary = '';
    if (sheet.spc) {
        const count = sheet.spells.length;
        const dc = castingAbility ? `, save DC ${8 + proficiency + castingModifier + spellDcBonus}` : '';
        summary = `<small>${count} spell${count === 1 ? '' : 's'}${dc}</small>`;
    }
    return `<h2><button class="hd" data-a="spc" aria-expanded="${!sheet.spc}">Spellcasting</button>${summary}</h2>`;
}

function castingAbilityField(castingAbility) {
    const options = AB.map(ability =>
        `<option value="${ability}" ${castingAbility === ability ? 'selected' : ''}>${ABN[ability]}</option>`);
    return '<div class="row" style="margin-bottom:8px"><div style="flex:1">'
        + '<label class="lab" for="f-cast">Spellcasting ability</label>'
        + `<select id="f-cast" data-k="cast"><option value="">None</option>${options.join('')}</select>`
        + '</div></div>';
}

// Save DC, the spell attack (tap to roll), any item bonuses to either, and the modifier.
function castingSummary(sheet, view) {
    const { proficiency, castingModifier, spellAttackBonus, spellDcBonus } = view;
    const dc = 8 + proficiency + castingModifier + spellDcBonus;
    const attack = proficiency + castingModifier + spellAttackBonus;
    let sources = '';
    if (spellAttackBonus || spellDcBonus) {
        const bonuses = [...effectsOf(sheet, 'sa'), ...effectsOf(sheet, 'dc')].map(([source, [type, , value]]) =>
            [`${source.n} (${type === 'sa' ? 'attack' : 'DC'})`, value]);
        sources = `<span class="a">${esc(sourcesText(bonuses))}</span>`;
    }
    const attackButton = `<button class="rb" data-a="roll" data-l="Spell attack" data-b="${attack}">`
        + `${signed(attack)}</button>`;
    return `<div class="cast"><span>Save DC <b>${dc}</b></span><span>Attack ${attackButton}</span>${sources}`
        + `<span>Modifier <b>${signed(castingModifier)}</b></span></div>`;
}

// One row of pips per slot level: tap a pip to use or regain a slot. Play shows only the levels
// that have slots; Edit shows all nine, each with a field for how many.
function spellSlots(sheet, editing) {
    const levels = sheet.slots
        .map((slots, index) => ({ slots, level: index + 1 }))
        .filter(({ slots }) => editing || slots.m > 0);
    const rows = levels.length
        ? levels.map(({ slots, level }) => slotRow(slots, level, editing)).join('')
        : '<div class="empty">No spell slots. Switch to Edit to set them.</div>';
    return `<div class="slots">${rows}</div>`;
}

function slotRow(slots, level, editing) {
    const index = level - 1;
    const pips = [...Array(slots.m).keys()].map(pip =>
        `<button class="pip ${pip < slots.u ? 'used' : ''}" data-a="slot" data-v="${index}.${pip}" `
        + `aria-label="Level ${level} slot ${pip + 1}"></button>`);
    const maxField = editing
        ? input(`slots.${index}.m`, slots.m, 'number', `min=0 max=9 aria-label="Level ${level} max slots"`)
        : '';
    const label = `<span class="lv">Lvl ${level}</span>`;
    return `<div class="sl">${label}<div class="pips">${pips.join('')}</div>${maxField}</div>`;
}

// Spells grouped by level (cantrips first), alphabetically within a level.
// Cantrips are always ready, so only leveled spells get a Prepared box. Once anything is
// prepared, Play mode dims the rest; a caster who never ticks boxes sees nothing dimmed.
function spellList(sheet, view, ui) {
    const leveled = sheet.spells.filter(spell => spell.l > 0);
    const preparedCount = leveled.filter(spell => spell.p).length;
    let html = '';
    if (leveled.length) {
        html += `<p class="sub prep">Prepared <b>${preparedCount}</b> of ${leveled.length} leveled spells. `
            + 'Tick the box next to a spell to prepare it.</p>';
    }
    if (!sheet.spells.length) return html + '<div class="empty">No spells yet.</div>';

    const sorted = sheet.spells
        .map((spell, index) => ({ spell, index }))
        .sort((first, second) => first.spell.l - second.spell.l || first.spell.n.localeCompare(second.spell.n));
    let lastLevel = -1;
    for (const { spell, index } of sorted) {
        if (spell.l !== lastLevel) {
            lastLevel = spell.l;
            html += `<div class="grp">${spell.l ? 'Level ' + spell.l : 'Cantrips'}</div>`;
        }
        html += spellEntry(sheet, view, ui, spell, index, preparedCount > 0);
    }
    return html;
}

// One spell: Prepared box, name (tap to show the description), its rolls, and in Edit a remove button.
function spellEntry(sheet, view, ui, spell, index, anyPrepared) {
    const { editing } = view;
    const name = esc(spell.n);
    const dimmed = !editing && anyPrepared && spell.l > 0 && !spell.p;
    const preparedBox = spell.l > 0
        ? `<input type="checkbox" data-k="spells.${index}.p" ${spell.p ? 'checked' : ''} `
            + `aria-label="${name} prepared" title="Prepared">`
        : '<span class="pk"></span>';
    const descriptionOpen = ui.isOpen('sp' + index);
    const title = spell.d
        ? `<button class="lk" data-a="spd" data-v="${index}" aria-expanded="${descriptionOpen}">${name}</button>`
        : name;
    const removeButton = editing
        ? `<button class="x" data-a="delsp" data-v="${index}" aria-label="Remove ${name}">✕</button>`
        : '';
    const rolls = editing ? spellRollFields(spell, index) : spellRollButtons(sheet, view, ui, spell, index);
    const description = spell.d && descriptionOpen ? `<p class="sd">${md(spell.d)}</p>` : '';
    return `<div class="spi${dimmed ? ' unp' : ''}"><div class="ln">${preparedBox}<span class="g">${title}</span>`
        + `${removeButton}</div>${rolls}${description}</div>`;
}

// Edit: whether the spell makes an attack or forces a save, its dice and damage type, and whether
// the spellcasting modifier is added.
function spellRollFields(spell, index) {
    const roll = spell.r;
    const key = `spells.${index}.r.`;
    const name = esc(spell.n);
    const saveOptions = AB.map(ability =>
        `<option value="${ability}" ${roll.s === ability ? 'selected' : ''}>${ABN[ability].slice(0, 3)} save</option>`);
    return `<div class="srl"><label class="row"><input type="checkbox" data-k="${key}a" ${roll.a ? 'checked' : ''} `
        + `aria-label="${name} attack"> Attack</label>`
        + `<select data-k="${key}s" aria-label="${name} saving throw"><option value="">No save</option>`
        + `${saveOptions.join('')}</select>`
        + input(key + 'd', roll.d, 'text', `class="dmg" placeholder="Dice, e.g. 1d10" aria-label="${name} damage dice"`)
        + input(key + 't', roll.t, 'text', `class="dmt" placeholder="Type" aria-label="${name} damage type"`)
        + `<label class="row"><input type="checkbox" data-k="${key}m" ${roll.m ? 'checked' : ''} `
        + `aria-label="${name} adds modifier"> + modifier</label></div>`;
}

// Play: the attack button, the save DC, the damage or healing button, how many attacks, and for
// spells that scale with the slot, a slot picker. Nothing if the spell has none of these.
function spellRollButtons(sheet, view, ui, spell, index) {
    const { proficiency, castingModifier, spellAttackBonus, spellDcBonus } = view;
    const roll = spell.r;
    const slot = ui.slotFor(index) ?? spell.l;
    const { dice, attacks } = spellDice(sheet, spell, slot);
    const saveName = ABN[roll.s];
    if (!roll.a && !saveName && !dice) return '';

    const attack = proficiency + castingModifier + spellAttackBonus;
    const dc = 8 + proficiency + castingModifier + spellDcBonus;
    const attackButton = roll.a
        ? `<button class="rb" data-a="satk" data-v="${index}">Hit ${signed(attack)}</button>`
        : '';
    const savePill = saveName ? `<span class="pill">DC ${dc} ${saveName.slice(0, 3)}</span>` : '';
    const effect = roll.h || roll.t ? ' ' + esc(roll.h ? 'healing' : roll.t) : '';
    const diceButton = dice ? `<button class="rb" data-a="sdmg" data-v="${index}">${esc(dice)}${effect}</button>` : '';
    const attackCount = attacks > 1 ? `<span class="a">&times;${attacks}</span>` : '';
    const slotPicker = slotLevelPicker(spell, index, slot);
    return `<div class="srl">${attackButton}${savePill}${diceButton}${attackCount}${slotPicker}</div>`;
}

// For spells that scale with the slot used: which slot to cast it with, from its own level up.
function slotLevelPicker(spell, index, slot) {
    const roll = spell.r;
    if (roll.by !== 'slot' || !roll.up.length || spell.l <= 0) return '';
    const options = SLOT_LEVELS.filter(level => level >= spell.l).map(level =>
        `<option value="${level}" ${level === slot ? 'selected' : ''}>Slot ${level}</option>`);
    return `<select data-up="${index}" aria-label="${esc(spell.n)} slot level">${options.join('')}</select>`;
}

// Edit: the name and level of a new spell.
function addSpellForm() {
    const levels = SPELL_LEVELS.map(level => `<option value="${level}">${level ? 'Lvl ' + level : 'Cantrip'}</option>`);
    return '<div class="add"><input class="n" id="spn" placeholder="Spell name" aria-label="New spell name">'
        + `<select id="spl" aria-label="New spell level">${levels.join('')}</select>`
        + '<button class="pri" data-a="addsp">Add</button></div>';
}
