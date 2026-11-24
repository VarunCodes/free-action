// Turning Open5e's spells into Library spells: the summary line ("Level 3 Evocation (Sorcerer, Wizard)"),
// the description with its casting details on top, and roll data the sheet can use.
import { textOf, listOf } from './values.js';

export function librarySpell(row) {
    const level = Number(row.level) || 0;
    return {
        kind: 'spell',
        name: row.name,
        level,
        sub: summaryLine(row, level),
        desc: description(row),
        src: 'SRD',
        roll: spellRoll(row),
    };
}

function summaryLine(row, level) {
    const school = textOf(row.school);
    const classes = listOf(row.classes).map(textOf).filter(Boolean).join(', ');
    return (level ? 'Level ' + level : 'Cantrip') + (school ? ' ' + school : '') + (classes ? ` (${classes})` : '');
}

function description(row) {
    const higherLevels = row.higher_level && `**Using a higher-level spell slot.** ${row.higher_level}`;
    return [castingDetails(row), row.desc, higherLevels].filter(Boolean).join('\n\n');
}

// Casting time, range, components, duration and ritual, one per line.
function castingDetails(row) {
    const hasRange = row.range_text || (row.range !== null && row.range !== undefined);
    return [
        row.casting_time && `Casting time: ${String(row.casting_time).replace(/_/g, ' ')}`,
        hasRange && `Range: ${row.range_text || row.range}`,
        componentsLine(row),
        row.duration && `Duration: ${row.concentration ? 'Concentration, ' : ''}${row.duration}`,
        row.ritual && 'Ritual',
    ].filter(Boolean).join('\n');
}

// "Components: V, S, M (a bit of fleece)", or '' for none.
function componentsLine(row) {
    const components = [row.verbal && 'V', row.somatic && 'S', row.material && 'M'].filter(Boolean).join(', ');
    if (!components) return '';
    const materials = row.material && row.material_specified ? ` (${row.material_specified})` : '';
    return `Components: ${components}${materials}`;
}

// Open5e's attack_roll flag also marks buffs like Bless, so an attack is only assumed when the text asks
// for a spell attack and there is damage to roll.
const ASKS_FOR_SPELL_ATTACK = new RegExp([
    /\b(melee|ranged) spell attack/,
    /make (a|one) spell attack/,
    /make (a|one) (melee|ranged) attack roll/,
    /spell attack (roll )?against/,
].map(pattern => pattern.source).join('|'), 'i');

// Roll data in the sheet's short keys (see cleanSpellRoll in sheet.js). The dice the Library gave (b) start out
// the same as the dice now (d); scaling only applies while they still match.
function spellRoll(row) {
    const dice = String(row.damage_roll || '').replace(/\s+/g, '');
    const damageTypes = listOf(row.damage_types).map(type => String(type).toLowerCase());
    const text = row.desc || '';
    return {
        a: ASKS_FOR_SPELL_ATTACK.test(text) && Boolean(dice),
        s: String(row.saving_throw_ability || '').slice(0, 3).toLowerCase(),
        d: dice,
        b: dice,
        t: damageTypes.join('/'),
        h: Boolean(dice) && !damageTypes.length && /regain/i.test(text),
        m: /(plus|\+) your spellcasting ability modifier/i.test(text),
        by: listOf(row.casting_options).some(isCharacterLevelOption) ? 'char' : 'slot',
        up: scalingSteps(row),
    };
}

const isCharacterLevelOption = option => /^player_level/.test(option.type || '');

// Open5e's casting options for higher levels ('slot_level_4', 'player_level_5') that add dice or targets,
// as [from level, dice, attacks].
function scalingSteps(row) {
    const steps = [];
    for (const option of listOf(row.casting_options)) {
        const level = /^(player|slot)_level_(\d+)$/.exec(option.type || '');
        const dice = String(option.damage_roll || '').replace(/\s+/g, '');
        const attacks = option.target_count;
        if (level && (dice || attacks)) steps.push([Number(level[2]), dice, attacks || 0]);
    }
    return steps;
}
