// Turning Open5e's items and magic items into Library items: the summary line, the description, and what the
// sheet needs to work with them (weapon stats, armor class, attunement, rarity and effects).
//
// A Library item uses the same short keys as an item on the sheet, since adding it copies them over:
//   kind 'item', name, level 0, sub the summary line, desc the description, src 'SRD'
//   eq   it can be equipped
//   at   it needs attunement
//   fx   its effects: [type, target, value] (see EFFECT_TYPES in sheet.js)
//   rr   rarity: 0 mundane, 1 Common, 2 Uncommon, 3 Rare, 4 Very Rare, 5 Legendary, 6 Artifact
//   w    weapon stats: d damage dice, t damage type, v two-handed dice, b magic bonus, ab ability
//   ar   armor class: see armorClassOf() below
import { textOf, listOf, sentencesOf, ABILITY_KEYS } from './values.js';

// Gear you wear or wield. Everything else (rope, potions, tools, ammunition...) just sits in inventory.
const EQUIPPABLE_CATEGORY = /^(weapon|armor|shield|ring|wondrous item|staff|rod|wand|spellcasting focus)$/i;

/** Every item from Open5e. Magic staves and rods can borrow the stats of the plain weapon they're used as. */
export function libraryItems(rows) {
    const plainWeapons = rows.filter(row => row.weapon && !row.rarity);
    const weaponsByName = new Map(plainWeapons.map(row => [row.name.toLowerCase(), row.weapon]));
    return rows.map(row => libraryItem(row, weaponsByName));
}

function libraryItem(row, weaponsByName) {
    const weapon = row.weapon || borrowedWeapon(row, weaponsByName);
    const category = textOf(row.category);
    // "+1" in the name: Longsword (+1), Plate Armor (+2)...
    const nameBonus = Number(/\(\+(\d)\)/.exec(row.name)?.[1] || 0);
    const weaponBonus = nameBonus || weaponBonusInText(row.desc);
    // Mithral armor drops the Strength requirement and the Stealth penalty of the armor it's made from.
    const isMithral = /^Mithral Armor/i.test(row.name);
    const effects = magicItemEffects(row);
    const header = descriptionHeader(row, weapon, weaponBonus, isMithral);
    return {
        kind: 'item',
        name: row.name,
        level: 0,
        sub: summaryLine(row, category),
        desc: [header, row.desc].filter(Boolean).join('\n\n'),
        src: 'SRD',
        eq: EQUIPPABLE_CATEGORY.test(category),
        ...(row.requires_attunement ? { at: true } : {}),
        ...(effects.length ? { fx: effects } : {}),
        rr: Math.min(6, Math.max(0, Number(row.rarity?.rank) || 0)),
        ...(weapon && weapon.damage_dice ? { w: weaponStats(weapon, weaponBonus) } : {}),
        ...armorClassOf(row, category, nameBonus, isMithral),
    };
}

// Staves and rods "wielded as a magic Quarterstaff" (or Mace...) borrow that weapon's stats.
function borrowedWeapon(row, weaponsByName) {
    const wieldedAs = /wielded as a magic ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/.exec(row.desc || '');
    return wieldedAs ? weaponsByName.get(wieldedAs[1].toLowerCase()) : undefined;
}

// Magic staves and rods state their weapon bonus in the text instead of the name.
function weaponBonusInText(description) {
    const stated = /\+(\d) bonus to attack rolls and damage rolls made with (?:it|this)/i.exec(description || '');
    return Number(stated?.[1] || 0);
}

// "Weapon, Uncommon, attunement, 15 gp, 3 lb".
function summaryLine(row, category) {
    const cost = shortNumber(row.cost);
    const weight = shortNumber(row.weight);
    return [
        category,
        row.rarity && textOf(row.rarity),
        row.requires_attunement && 'attunement',
        cost && cost + ' gp',
        weight && weight + ' lb',
    ].filter(Boolean).join(', ');
}

// At most two decimals, without trailing zeros; '' for nothing or 0.
function shortNumber(value) {
    const number = Number(value);
    return number ? String(Number(number.toFixed(2))) : '';
}

// The lines above the description: attunement, damage, properties, armor class and armor drawbacks.
function descriptionHeader(row, weapon, weaponBonus, isMithral) {
    const armor = row.armor;
    const properties = listOf(weapon?.properties).map(propertyText);
    return [
        row.requires_attunement && (row.attunement_detail || 'Requires attunement'),
        weapon && damageLine(weapon, weaponBonus),
        properties.length && `Properties: ${properties.join(', ')}`,
        ...(armor ? armorLines(armor, isMithral) : []),
    ].filter(Boolean).join('\n');
}

function armorLines(armor, isMithral) {
    const armorClass = `Armor class: ${armor.ac_display}${armor.category ? ` (${armor.category} armor)` : ''}`;
    if (isMithral) return [armorClass];
    return [
        armorClass,
        armor.strength_score_required && `Strength ${armor.strength_score_required} required`,
        armor.grants_stealth_disadvantage && 'Disadvantage on Stealth checks',
    ];
}

// "Versatile (1d10)".
const propertyText = property => textOf(property.property) + (property.detail ? ` (${property.detail})` : '');

function damageLine(weapon, bonus) {
    const damageType = textOf(weapon.damage_type).toLowerCase();
    return `Damage: ${weapon.damage_dice} ${damageType}${bonus ? ` +${bonus}` : ''}`;
}

function weaponStats(weapon, bonus) {
    const properties = listOf(weapon.properties);
    const hasProperty = name => properties.some(property => textOf(property.property) === name);
    const versatile = properties.find(property => textOf(property.property) === 'Versatile');
    return {
        d: String(weapon.damage_dice).replace(/\s+/g, ''),
        t: textOf(weapon.damage_type).toLowerCase(),
        v: versatile?.detail || '',
        b: bonus,
        ab: weaponAbility(hasProperty),
    };
}

// Ranged weapons use Dexterity, Finesse weapons the better of Strength and Dexterity, everything else Strength.
function weaponAbility(hasProperty) {
    if (hasProperty('Ammunition')) return 'dex';
    if (hasProperty('Finesse')) return 'fin';
    return 'str';
}

// What a magic item does to the numbers on the sheet while it's equipped (and attuned), as a list of
// [type, target, value]: set (ability score becomes value, if higher), chk (bonus to ability checks),
// sv (saving throws), sa (spell attack rolls), dc (spell save DC), adv (Advantage on a skill or 'init').
// Situational wording (against..., made to interact..., in Bright Light) is skipped. Only the first effect
// of each type and target counts.
const SITUATIONAL = /against|made to interact|Bright Light|transfer/i;
const GIANT_STRENGTH = { hill: 21, 'frost or stone': 23, fire: 25, cloud: 27, storm: 29 };

function magicItemEffects(row) {
    const text = String(row.desc || '').replace(/\s+/g, ' ');
    const effects = [];
    const add = (type, target, value) => {
        const alreadyThere = effects.some(([otherType, otherTarget]) => otherType === type && otherTarget === target);
        if (!alreadyThere) effects.push([type, target, value]);
    };
    addAbilityScoreEffects(row.name, text, add);
    for (const sentence of sentencesOf(text)) {
        if (SITUATIONAL.test(sentence)) continue;
        addBonusEffects(sentence, add);
        addSpellSaveDcEffects(sentence, add);
        addWandOfTheWarMageEffect(row.name, sentence, add);
        addAdvantageEffects(sentence, add);
    }
    return effects;
}

// "Your Strength score is 19 while you wear these gauntlets", and the Belts of Giant Strength by name.
function addAbilityScoreEffects(name, text, add) {
    const setsScore = /Your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (?:score )?is (\d+) while/i
        .exec(text);
    if (setsScore) add('set', ABILITY_KEYS[setsScore[1].toLowerCase()], Number(setsScore[2]));
    const belt = /^Belt of Giant Strength \((.+)\)$/i.exec(name);
    const beltStrength = belt && GIANT_STRENGTH[belt[1].toLowerCase()];
    if (beltStrength) add('set', 'str', beltStrength);
}

// "+1 bonus to ability checks and saving throws", "+2 bonus to spell attack rolls". A bonus to Armor Class
// and saving throws (Ring of Protection) is handled with armor class.
function addBonusEffects(sentence, add) {
    const bonus = /\+(\d+) bonus to ([^.]*)/i.exec(sentence);
    if (!bonus) return;
    const amount = Number(bonus[1]);
    const appliesTo = bonus[2];
    if (!/Armor Class/i.test(appliesTo)) {
        if (/ability checks/i.test(appliesTo)) add('chk', '', amount);
        if (/saving throws/i.test(appliesTo)) add('sv', '', amount);
    }
    if (/spell attack/i.test(appliesTo)) add('sa', '', amount);
}

// "Your spell save DC and spell attack bonus each increase by 2."
function addSpellSaveDcEffects(sentence, add) {
    const increase = /spell save DC (and spell attack bonus )?(?:each )?increases? by (\d+)/i.exec(sentence);
    if (!increase) return;
    const amount = Number(increase[2]);
    add('dc', '', amount);
    if (increase[1]) add('sa', '', amount);
}

// The Wand of the War Mage's bonus comes from its name: Wand of the War Mage (+2).
function addWandOfTheWarMageEffect(name, sentence, add) {
    if (!/bonus to spell attack rolls determined by the wand's rarity/i.test(sentence)) return;
    add('sa', '', Number(/\+(\d)/.exec(name)?.[1] || 1));
}

// "Advantage on Wisdom (Perception) checks", "Advantage on Initiative rolls".
function addAdvantageEffects(sentence, add) {
    const skillChecks =
        /\bAdvantage on (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) \(([A-Za-z ]+)\) checks/gi;
    for (const [, skill] of sentence.matchAll(skillChecks)) add('adv', skill.trim(), 0);
    if (/\bAdvantage on [^.]*Initiative rolls/i.test(sentence)) add('adv', 'init', 0);
}

// How an item affects Armor Class, as { ar: { k, ac, str, nu, sb, stl } }:
//   k light|medium|heavy: body armor; ac is its base (magic bonus included). Light adds Dex,
//     medium adds Dex up to +2, heavy adds none. str is the Strength it needs.
//   k shield: ac is added on top (2, plus any magic bonus).
//   k bonus: ac is added on top (Ring/Cloak of Protection...); nu = only with no armor and no shield.
//   k unarm: a better unarmored base (Robe of the Archmagi: 15 + Dex).
//   sb: bonus to saving throws; stl: Disadvantage on Stealth checks while worn.
// Situational bonuses (only against ranged attacks, moved from a weapon, from a lit rod) are skipped.
// Items that don't change Armor Class give {}.
function armorClassOf(row, category, nameBonus, isMithral) {
    const armor = row.armor;
    const description = String(row.desc || '');
    const bonuses = armorClassBonuses(description);
    const textBonus = sum(bonuses);
    // "+1 bonus to Armor Class and saving throws" (Ring/Cloak of Protection, Staff of Power) also raises saves.
    const sb = sum(bonuses.filter(({ sentence }) => /saving throws/i.test(sentence)));

    const isShield = /\bShield\b/.test(row.name) && /^armor$/i.test(category) && (!armor || armor.ac_base <= 2);
    if (isShield) return { ar: { k: 'shield', ac: 2 + nameBonus, str: 0, sb } };
    if (armor && armor.ac_base) return { ar: bodyArmor(armor, nameBonus + textBonus, sb, isMithral) };
    const unarmoredBase = /base Armor Class is (\d+) plus your Dexterity/i.exec(description);
    if (unarmoredBase) return { ar: { k: 'unarm', ac: Number(unarmoredBase[1]), str: 0, sb } };
    if (textBonus) {
        const onlyWithoutArmor = bonuses.some(({ sentence }) => /no armor/i.test(sentence));
        return { ar: { k: 'bonus', ac: textBonus, str: 0, sb, nu: onlyWithoutArmor } };
    }
    return {};
}

// Each sentence that gives a bonus to Armor Class, with its amount.
function armorClassBonuses(description) {
    const bonuses = [];
    for (const sentence of sentencesOf(description)) {
        const bonus = /\+(\d+) bonus to Armor Class/i.exec(sentence);
        if (bonus && !/against|transfer|allies|Bright Light/i.test(sentence)) {
            bonuses.push({ sentence, amount: Number(bonus[1]) });
        }
    }
    return bonuses;
}

const sum = bonuses => bonuses.reduce((total, { amount }) => total + amount, 0);

function bodyArmor(armor, bonus, sb, isMithral) {
    return {
        k: ['light', 'medium', 'heavy'].includes(armor.category) ? armor.category : 'heavy',
        ac: armor.ac_base + bonus,
        str: isMithral ? 0 : armor.strength_score_required || 0,
        sb,
        stl: !isMithral && Boolean(armor.grants_stealth_disadvantage),
    };
}
