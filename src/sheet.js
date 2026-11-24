// The character sheet's shape, and cleanSheet(), which every sheet passes through on its way in
// (page load, Import, restoring a snapshot, another tab saving) and on every save, so what you see
// while editing is what you get after a reload. Anything unexpected is dropped or coerced, so the
// page can trust that numbers are numbers and lists hold the right things.
//
// The saved sheet still uses short property names (sv for saving throws, n for a name, and so on).
// Each one is explained where cleanSheet() reads it.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES = {
    str: 'Strength',
    dex: 'Dexterity',
    con: 'Constitution',
    int: 'Intelligence',
    wis: 'Wisdom',
    cha: 'Charisma',
};

// Each skill and the ability it uses.
export const SKILLS = [
    ['Acrobatics', 'dex'], ['Animal Handling', 'wis'], ['Arcana', 'int'], ['Athletics', 'str'],
    ['Deception', 'cha'], ['History', 'int'], ['Insight', 'wis'], ['Intimidation', 'cha'],
    ['Investigation', 'int'], ['Medicine', 'wis'], ['Nature', 'int'], ['Perception', 'wis'],
    ['Performance', 'cha'], ['Persuasion', 'cha'], ['Religion', 'int'], ['Sleight of Hand', 'dex'],
    ['Stealth', 'dex'], ['Survival', 'wis'],
];
const SKILL_NAMES = SKILLS.map(([skill]) => skill);

// The twelve classes of the 2024 Player's Handbook (SRD 5.2): saving throw proficiencies, spellcasting
// ability ('' for classes that only cast through a subclass) and hit die. The sheet still accepts any class name.
export const STANDARD_CLASSES = {
    Barbarian: { saves: ['str', 'con'], spellcasting: '', hitDie: 12 },
    Bard: { saves: ['dex', 'cha'], spellcasting: 'cha', hitDie: 8 },
    Cleric: { saves: ['wis', 'cha'], spellcasting: 'wis', hitDie: 8 },
    Druid: { saves: ['int', 'wis'], spellcasting: 'wis', hitDie: 8 },
    Fighter: { saves: ['str', 'con'], spellcasting: '', hitDie: 10 },
    Monk: { saves: ['str', 'dex'], spellcasting: '', hitDie: 8 },
    Paladin: { saves: ['wis', 'cha'], spellcasting: 'cha', hitDie: 10 },
    Ranger: { saves: ['str', 'dex'], spellcasting: 'wis', hitDie: 10 },
    Rogue: { saves: ['dex', 'int'], spellcasting: '', hitDie: 8 },
    Sorcerer: { saves: ['con', 'cha'], spellcasting: 'cha', hitDie: 6 },
    Warlock: { saves: ['wis', 'cha'], spellcasting: 'cha', hitDie: 8 },
    Wizard: { saves: ['int', 'wis'], spellcasting: 'int', hitDie: 6 },
};
export const CLASS_NAMES = Object.keys(STANDARD_CLASSES);

// The SRD 5.2 species, offered before the Library has been downloaded; picking one fetches its traits.
export const SRD_SPECIES = ['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling'];

const SPELL_SLOT_LEVELS = 9;

/** A blank level 1 character. */
export function newSheet() {
    return {
        name: 'New Hero',
        cls: '', // class
        sub: '', // subclass
        species: '',
        bg: '', // background
        level: 1,
        mode: 'play', // 'play' or 'edit'
        ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, // ability scores
        sv: {}, // saving throw proficiencies: { str: true }
        sk: {}, // skill proficiencies the player added: { Arcana: 1 }, where 2 is Expertise
        hp: { cur: 10, max: 10, temp: 0 },
        ac: 10, // armor class, when typed by hand
        speed: 30,
        init: 0, // initiative bonus on top of Dexterity
        cast: '', // spellcasting ability
        slots: Array.from({ length: SPELL_SLOT_LEVELS }, () => ({ m: 0, u: 0 })), // per level: maximum and used
        spells: [],
        items: [],
        notes: '',
        insp: false, // Heroic Inspiration
        feats: [], // features and feats
        race: [], // racial features (species traits)
        vtt: 'foundry', // the virtual tabletop that roll commands are written for
        spc: false, // Spellcasting section collapsed
        inc: false, // Inventory section collapsed
        acAuto: true, // armor class worked out from gear, instead of typed
        acb: 0, // armor class bonus on top of the worked-out armor class
        hd: 0, // hit dice spent
        hdie: 0, // a custom class's hit die size (0 = not set)
    };
}

// Coercing one saved value.

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asList = (value, maxLength) => (Array.isArray(value) ? value.slice(0, maxLength) : []);
const asBoolean = value => value === true;
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

function asText(value, maxLength = 200, fallback = '') {
    if (typeof value === 'string') return value.slice(0, maxLength);
    if (typeof value === 'number') return String(value);
    return fallback;
}

// A whole number between min and max; anything that isn't a number becomes the fallback.
function asWholeNumber(value, min, max, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * Every sheet passes through here on its way in and on every save. Fields it doesn't name are dropped, so a
 * new field must be added here, and a sheet saved before a change is upgraded here.
 */
export function cleanSheet(saved) {
    saved = asObject(saved);
    const blank = newSheet();
    const level = asWholeNumber(saved.level, 1, 20, 1);
    return {
        name: asText(saved.name, 120, blank.name),
        cls: asText(saved.cls, 120),
        sub: asText(saved.sub, 120),
        species: asText(saved.species, 120),
        bg: asText(saved.bg, 120),
        level,
        mode: oneOf(saved.mode, ['play', 'edit'], 'play'),
        ab: cleanAbilityScores(saved.ab),
        sv: cleanSaveProficiencies(saved.sv),
        sk: cleanSkillProficiencies(saved.sk),
        hp: cleanHitPoints(saved.hp, blank.hp.max),
        ac: asWholeNumber(saved.ac, 0, 50, blank.ac),
        speed: asWholeNumber(saved.speed, 0, 999, blank.speed),
        init: asWholeNumber(saved.init, -20, 20, 0),
        cast: oneOf(saved.cast, ABILITIES, ''),
        slots: cleanSpellSlots(saved.slots),
        spells: asList(saved.spells, 500).map(asObject).filter(spell => spell.n).map(cleanSpell),
        items: asList(saved.items, 500).map(asObject).filter(item => item.n).map(cleanItem).map(upgradeItem),
        notes: asText(saved.notes, 100000),
        insp: asBoolean(saved.insp),
        feats: asList(saved.feats, 500).map(cleanFeature).filter(feature => feature.n),
        race: asList(saved.race, 200).map(cleanFeature).filter(feature => feature.n),
        vtt: oneOf(saved.vtt, ['foundry', 'roll20', 'roll20t'], 'foundry'),
        spc: asBoolean(saved.spc),
        inc: asBoolean(saved.inc),
        acAuto: armorClassIsWorkedOut(saved),
        acb: asWholeNumber(saved.acb, -10, 20, 0),
        hd: asWholeNumber(saved.hd, 0, level, 0),
        hdie: [6, 8, 10, 12].includes(Number(saved.hdie)) ? Number(saved.hdie) : 0,
    };
}

function cleanAbilityScores(saved) {
    const scores = asObject(saved);
    return Object.fromEntries(ABILITIES.map(ability => [ability, asWholeNumber(scores[ability], 1, 30, 10)]));
}

// Only proficient saves are kept: { dex: true, cha: true }.
function cleanSaveProficiencies(saved) {
    const saves = asObject(saved);
    const proficient = ABILITIES.filter(ability => asBoolean(saves[ability]));
    return Object.fromEntries(proficient.map(ability => [ability, true]));
}

// Only skills with a proficiency are kept: 1 is proficient, 2 is Expertise.
function cleanSkillProficiencies(saved) {
    const skills = asObject(saved);
    const levels = SKILL_NAMES.map(skill => [skill, asWholeNumber(skills[skill], 0, 2, 0)]);
    return Object.fromEntries(levels.filter(([, level]) => level));
}

function cleanHitPoints(saved, defaultMax) {
    const hitPoints = asObject(saved);
    const max = asWholeNumber(hitPoints.max, 1, 9999, defaultMax);
    return {
        cur: asWholeNumber(hitPoints.cur, 0, max, max),
        max,
        temp: asWholeNumber(hitPoints.temp, 0, 9999, 0),
    };
}

// One entry per spell level: m is the maximum number of slots, u how many are used.
function cleanSpellSlots(saved) {
    const slots = asList(saved, SPELL_SLOT_LEVELS);
    return Array.from({ length: SPELL_SLOT_LEVELS }, (unused, levelIndex) => {
        const slot = asObject(slots[levelIndex]);
        const max = asWholeNumber(slot.m, 0, 9, 0);
        return { m: max, u: asWholeNumber(slot.u, 0, max, 0) };
    });
}

// Sheets from before armor class was worked out keep a hand-typed armor class, unless it was still the default.
function armorClassIsWorkedOut(saved) {
    if (saved.acAuto !== undefined) return asBoolean(saved.acAuto);
    return saved.ac === undefined || Number(saved.ac) === 10;
}

// A spell: n name, l level (0 for a cantrip), p prepared, d description, r how it rolls.
function cleanSpell(spell) {
    return {
        n: asText(spell.n),
        l: asWholeNumber(spell.l, 0, 9, 0),
        p: asBoolean(spell.p),
        d: asText(spell.d, 20000),
        r: cleanSpellRoll(spell.r),
    };
}

// How a spell rolls:
//   a   it makes a spell attack
//   s   the ability of the saving throw it forces ('' for none)
//   d   its dice now, like '8d6'
//   b   the dice the Library gave (scaling applies only while d still matches them, so hand edits win)
//   t   its damage type, like 'fire'
//   h   it heals instead of dealing damage
//   m   the spellcasting modifier is added to the dice
//   by  what makes it stronger: 'slot' (a higher slot) or 'char' (character level, for cantrips)
//   up  the Library's scaling steps: [from level, dice, attacks]
function cleanSpellRoll(saved) {
    const roll = asObject(saved);
    return {
        a: asBoolean(roll.a),
        s: oneOf(roll.s, ABILITIES, ''),
        d: asText(roll.d, 40),
        b: asText(roll.b, 40),
        t: asText(roll.t, 40),
        h: asBoolean(roll.h),
        m: asBoolean(roll.m),
        by: oneOf(roll.by, ['char', 'slot'], 'slot'),
        up: asList(roll.up, 20).filter(Array.isArray).map(cleanScalingStep),
    };
}

// One step of a spell's scaling, saved as a list: [from level, dice, attacks]. From that level (the slot level,
// or the character level for a cantrip) the spell rolls those dice, as that many attacks.
function cleanScalingStep([fromLevel, dice, attacks]) {
    return [
        asWholeNumber(fromLevel, 0, 20, 0),
        asText(dice, 40),
        asWholeNumber(attacks, 0, 20, 0),
    ];
}

// An item. Optional parts are only kept when the item has them:
//   n name, q quantity, d description
//   eq it can be equipped, on it is equipped
//   w its weapon stats, ar its armor stats
//   v the gear data version it was filled to (see gearUpgrade.js)
//   rr rarity (0 to 6), at it needs attunement, att it is attuned
//   fx its effects
function cleanItem(item) {
    return {
        n: asText(item.n),
        q: asWholeNumber(item.q, 0, 99999, 1),
        d: asText(item.d, 20000),
        ...(item.eq === undefined ? {} : { eq: asBoolean(item.eq) }),
        on: asBoolean(item.on),
        ...(item.w ? { w: cleanWeapon(item.w) } : {}),
        ...(item.ar ? { ar: cleanArmor(item.ar) } : {}),
        ...(item.v ? { v: asWholeNumber(item.v, 0, 99, 0) } : {}),
        ...(item.rr ? { rr: asWholeNumber(item.rr, 0, 6, 0) } : {}),
        ...(item.at ? { at: true, ...(item.att === undefined ? {} : { att: asBoolean(item.att) }) } : {}),
        ...(item.fx ? { fx: cleanEffects(item.fx) } : {}),
    };
}

// A weapon: d damage dice, t damage type, v two-handed (versatile) dice, b attack and damage bonus,
// ab the ability it uses ('fin' for finesse: the better of Strength and Dexterity).
function cleanWeapon(saved) {
    const weapon = asObject(saved);
    return {
        d: asText(weapon.d, 40),
        t: asText(weapon.t, 40),
        v: asText(weapon.v, 40),
        b: asWholeNumber(weapon.b, -10, 10, 0),
        ab: oneOf(weapon.ab, ['str', 'dex', 'fin'], 'str'),
    };
}

// Armor: k its kind ('unarm' for an unarmored base, 'bonus' for a +AC item), ac its armor class (or bonus),
// str the Strength it needs, nu counts only with no armor and no shield, sb a bonus to saving throws,
// stl Disadvantage on Stealth.
function cleanArmor(saved) {
    const armor = asObject(saved);
    return {
        k: oneOf(armor.k, ['light', 'medium', 'heavy', 'shield', 'bonus', 'unarm'], ''),
        ac: asWholeNumber(armor.ac, -10, 30, 0),
        str: asWholeNumber(armor.str, 0, 30, 0),
        nu: asBoolean(armor.nu),
        sb: asWholeNumber(armor.sb, -5, 10, 0),
        stl: asBoolean(armor.stl),
    };
}

// Gear saved before equipping and attuning were separate choices. Weapons start out equippable, gear
// that can't be equipped isn't equipped, equippable gear gets an empty armor entry for its AC setting,
// and anything that was equipped stays attuned.
function upgradeItem(item) {
    if (item.eq === undefined) item.eq = Boolean(item.w);
    if (!item.eq) item.on = false;
    if (item.eq && !item.ar) item.ar = cleanArmor({});
    if (item.at && item.att === undefined) item.att = item.on;
    return item;
}

// Item and trait effects are [type, target, value]. See effectsOf() and traitEffects() in library.js.
//   set  sets an ability score (target: the ability)
//   ab   a bonus to an ability score (target: the ability)
//   adv  Advantage (target: 'init' or a skill)
//   sk   a skill proficiency (target: a skill, '?' or '?A|B'; value 1, or 2 for Expertise)
//   chk  a bonus to every ability check
//   sv   a bonus to every saving throw
//   sa   a bonus to spell attacks
//   dc   a bonus to spell save DCs
//   hp   hit points per level
const EFFECT_TYPES = ['set', 'chk', 'sv', 'sa', 'dc', 'adv', 'hp', 'ab', 'sk'];
const TYPES_THAT_NEED_A_TARGET = ['set', 'adv', 'ab', 'sk'];

export function cleanEffects(saved) {
    return asList(saved, 12)
        .filter(Array.isArray)
        .map(cleanEffect)
        .filter(([type, target]) => type && (target || !TYPES_THAT_NEED_A_TARGET.includes(type)));
}

function cleanEffect([savedType, savedTarget, savedValue]) {
    const type = oneOf(savedType, EFFECT_TYPES, '');
    const target = effectTarget(type, savedTarget);
    if (type === 'sk') return [type, target, asWholeNumber(savedValue, 1, 2, 1)];
    if (type === 'set') return [type, target, asWholeNumber(savedValue, 1, 30, 0)];
    return [type, target, asWholeNumber(savedValue, -10, 30, 0)];
}

function effectTarget(type, target) {
    if (type === 'set' || type === 'ab') return oneOf(target, ABILITIES, '');
    if (type === 'adv') return oneOf(target, ['init', ...SKILL_NAMES], '');
    if (type === 'sk') return skillEffectTarget(target);
    return '';
}

// A skill effect's target: one skill, '?' (any skill), or '?A|B|C' (one of these); anything else is dropped.
function skillEffectTarget(saved) {
    const target = String(saved ?? '');
    if (SKILL_NAMES.includes(target) || target === '?') return target;
    if (!target.startsWith('?')) return '';
    const offered = target.slice(1).split('|').filter(skill => SKILL_NAMES.includes(skill));
    return offered.length ? '?' + offered.join('|') : '';
}

// A feature, feat or racial trait: n name, t type, d description, fx effects (custom packs can give them),
// and ch the skills picked, one per skill choice it offers.
function cleanFeature(saved) {
    const feature = asObject(saved);
    const effects = cleanEffects(feature.fx);
    const choices = asList(feature.ch, 12).map(skill => (SKILL_NAMES.includes(skill) ? skill : ''));
    return {
        n: asText(feature.n),
        t: asText(feature.t, 60),
        d: asText(feature.d, 20000),
        ...(effects.length ? { fx: effects } : {}),
        ...(choices.some(Boolean) ? { ch: choices } : {}),
    };
}
