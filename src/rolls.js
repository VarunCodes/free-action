// Dice. Each roll returns a result the roll bar shows and can copy as a chat command:
//   { label, notation, detail, total, critical }
//   label     what was rolled ("Longsword damage")
//   notation  the dice as a chat command writes them ("1d20+5", "2d20kh1+5", "2d8+3")
//   detail    each die as it fell ("[14] + 5", "[3, 17] take 17 + 5")
//   total     the result
//   critical  "Natural 20", "Natural 1", "Critical hit, dice doubled" or ''
// Only rollDie uses Math.random, so tests can fix the dice by replacing it.
import { abilityModifier, score, signed } from './rules.js';

export const NATURAL_20 = 'Natural 20';
const NATURAL_1 = 'Natural 1';
const D20_SIDES = 20;
// A critical hit rolls each damage die twice; a single term never rolls more dice than this.
const MAX_DICE_IN_A_TERM = 200;
// What a typed custom roll may ask for.
const MAX_CUSTOM_DICE = 100;
const MAX_CUSTOM_SIDES = 1000;
const ROLL_SHOWN_IN_ERROR = 40;

export const rollDie = sides => 1 + Math.floor(Math.random() * sides);

// Advantage ('adv'), Disadvantage ('dis') or neither (''). The mode picked on the roll bar adds to the
// roll's own (Stealth in noisy armor has Disadvantage, Cloak of Elvenkind gives Advantage), and any
// Advantage and any Disadvantage cancel out (2024 rules).
export function rollMode(picked, hasOwnDisadvantage, hasOwnAdvantage) {
    const advantage = picked === 'adv' || hasOwnAdvantage;
    const disadvantage = picked === 'dis' || hasOwnDisadvantage;
    if (advantage && disadvantage) return '';
    if (advantage) return 'adv';
    if (disadvantage) return 'dis';
    return '';
}

// A d20 roll plus a bonus: two d20s with Advantage (take the higher) or Disadvantage (the lower).
export function rollD20(label, bonus, mode) {
    const rolls = [rollDie(D20_SIDES)];
    if (mode) rolls.push(rollDie(D20_SIDES));
    const kept = keptD20(rolls, mode);
    const shown = mode ? `[${rolls.join(', ')}] take ${kept}` : `[${kept}]`;
    const bonusShown = bonus ? ` ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}` : '';
    return {
        label,
        notation: d20Notation(mode) + (bonus ? signed(bonus) : ''),
        detail: shown + bonusShown,
        total: kept + bonus,
        critical: naturalRoll(kept),
    };
}

function keptD20(rolls, mode) {
    if (mode === 'adv') return Math.max(...rolls);
    if (mode === 'dis') return Math.min(...rolls);
    return rolls[0];
}

// "1d20", or two d20s keeping the higher ("2d20kh1") or the lower ("2d20kl1").
function d20Notation(mode) {
    if (mode === 'adv') return '2d20kh1';
    if (mode === 'dis') return '2d20kl1';
    return '1d20';
}

function naturalRoll(kept) {
    if (kept === D20_SIDES) return NATURAL_20;
    if (kept === 1) return NATURAL_1;
    return '';
}

// Dice and numbers joined by + and -, like 2d6+3. A critical hit doubles the dice (not the numbers).
// Damage and healing never go below 0; a custom roll (allowNegative) can. Returns null if the expression
// has anything else in it.
export function rollDice(label, expression, isCriticalHit = false, allowNegative = false) {
    const terms = String(expression).replace(/\s/g, '').match(/[+-]?[^+-]+/g) || [];
    let total = 0;
    const details = [];
    const notations = [];
    for (const term of terms) {
        const rolled = rollTerm(term, isCriticalHit, details.length === 0);
        if (!rolled) return null;
        total += rolled.value;
        details.push(rolled.detail);
        notations.push(rolled.notation);
    }
    if (!notations.length) return null;
    return {
        label,
        notation: notations.join('').replace(/^\+/, ''),
        detail: details.join(' '),
        total: allowNegative ? total : Math.max(0, total),
        critical: isCriticalHit ? 'Critical hit, dice doubled' : '',
    };
}

// One term of a dice expression ("2d6", "-1d4" or "+3"): its value, how it's shown, and its part of the
// chat command. A negative term counts against the total. null if the term is neither dice nor a number.
function rollTerm(term, isCriticalHit, isFirst) {
    const negative = term[0] === '-';
    const sign = negative ? '-' : '+';
    const shownSign = negative ? '- ' : '+ ';
    const unsigned = term.replace(/^[+-]/, '');
    const diceMatch = unsigned.match(/^(\d*)d(\d+)$/i);
    if (diceMatch && Number(diceMatch[2]) > 0) {
        const count = Math.min(MAX_DICE_IN_A_TERM, (Number(diceMatch[1]) || 1) * (isCriticalHit ? 2 : 1));
        const sides = Number(diceMatch[2]);
        const rolls = Array.from({ length: count }, () => rollDie(sides));
        const sum = rolls.reduce((total, roll) => total + roll, 0);
        const joiner = isFirst && !negative ? '' : shownSign;
        return {
            value: negative ? -sum : sum,
            detail: `${joiner}[${rolls.join(', ')}]`,
            notation: `${sign}${count}d${sides}`,
        };
    }
    if (/^\d+$/.test(unsigned)) {
        const number = Number(unsigned);
        return { value: negative ? -number : number, detail: shownSign + unsigned, notation: sign + unsigned };
    }
    return null;
}

// Why a typed custom roll can't be made, or '' if it can. Too many dice is refused, not trimmed.
export function customRollError(text) {
    const expression = text.replace(/\s/g, '');
    if (!expression) return 'Type a roll first, like 2d6+3.';
    // Each "2d6" as [count, sides]; a bare "d6" counts as one die.
    const dice = [...expression.matchAll(/(\d*)d(\d+)/gi)].map(([, count, sides]) => ({ count, sides: +sides }));
    const wellFormed = /^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(expression);
    const hasZero = dice.some(({ count, sides }) => (count !== '' && Number(count) < 1) || sides < 1);
    if (!wellFormed || !dice.length || hasZero) {
        const shown = text.trim().slice(0, ROLL_SHOWN_IN_ERROR);
        return `"${shown}" is not a roll. Use dice like 2d6+3 or 1d20+1d4.`;
    }
    const totalDice = dice.reduce((total, { count }) => total + (Number(count) || 1), 0);
    if (totalDice > MAX_CUSTOM_DICE || dice.some(({ sides }) => sides > MAX_CUSTOM_SIDES)) {
        return `That roll is too big. Use up to ${MAX_CUSTOM_DICE} dice, each with up to ${MAX_CUSTOM_SIDES} sides.`;
    }
    return '';
}

// A result as a chat command for Foundry (/r), Roll20 (/roll) or a Roll20 template.
export function chatCommand(result, format) {
    if (!result) return '';
    const { label, notation } = result;
    if (format === 'roll20t') return `&{template:default} {{name=${label}}} {{Roll=[[${notation}]]}}`;
    if (format === 'roll20') return `/roll ${notation}`;
    return `/r ${notation} # ${label}`;
}

// Damage or healing dice for a spell: cantrips scale with character level, other spells with the slot
// used. The spell's roll data (spell.r) has d the dice now, b the dice the Library gave, by 'char' or
// 'slot', up the scaling steps, and m true when the spellcasting modifier is added.
// Scaling only applies while the dice still match what the Library gave, so hand edits win.
// Returns the dice and, for spells that make several attacks, how many (0 otherwise).
export function spellDice(sheet, spell, slot) {
    const roll = spell.r;
    let dice = String(roll.d).replace(/\s+/g, '');
    let attacks = 0;
    const scalingLevel = roll.by === 'char' ? sheet.level : slot;
    if (dice && dice === roll.b) ({ dice, attacks } = scaledDice(roll, scalingLevel));
    const castingModifier = sheet.cast ? abilityModifier(score(sheet, sheet.cast)) : 0;
    if (dice && roll.m && castingModifier) dice += signed(castingModifier);
    return { dice, attacks };
}

// The Library's scaling steps (roll.up: [from level, dice, attacks]) that apply at this level;
// the last one wins.
function scaledDice(roll, level) {
    let dice = roll.b;
    let attacks = 0;
    for (const [, stepDice, stepAttacks] of roll.up.filter(([fromLevel]) => fromLevel <= level)) {
        if (stepDice) dice = stepDice;
        if (stepAttacks) attacks = stepAttacks;
    }
    return { dice, attacks };
}

// The modifier for a weapon's attack and damage: ranged weapons use Dex, Finesse the better of Str and
// Dex, others Str. A magic weapon's +N adds to both, but only once attuned if it needs attunement.
// The weapon data (item.w) has ab: 'str', 'dex' or 'fin' (Finesse), and b: the magic bonus.
export function weaponModifier(sheet, item) {
    const weapon = item.w;
    const magicBonus = item.at && !item.att ? 0 : (Number(weapon.b) || 0);
    return weaponAbilityModifier(sheet, weapon.ab) + magicBonus;
}

function weaponAbilityModifier(sheet, ability) {
    const strength = abilityModifier(score(sheet, 'str'));
    const dexterity = abilityModifier(score(sheet, 'dex'));
    if (ability === 'dex') return dexterity;
    if (ability === 'fin') return Math.max(strength, dexterity);
    return strength;
}

// Dice with a modifier added: "1d8" and 3 give "1d8+3"; 0 leaves the dice alone.
export const withModifier = (dice, modifier) => (modifier ? dice + signed(modifier) : dice);
