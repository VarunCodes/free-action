// Dice. Each roll returns a result the roll bar shows and can copy as a chat command:
//   { label, expr, detail, total, crit }
//   label   what was rolled ("Longsword damage")
//   expr    the dice in chat-command form ("1d20+5", "2d20kh1+5", "2d8+3")
//   detail  each die as it fell ("[14] + 5", "[3, 17] take 17 + 5")
//   total   the result
//   crit    "Natural 20", "Natural 1", "Critical hit, dice doubled" or ''
// Only rollDie uses Math.random, so tests can fix the dice by replacing it.
import { abilityMod, score, signed } from './rules.js';

export const rollDie = sides => 1 + Math.floor(Math.random() * sides);

// Advantage ('adv'), Disadvantage ('dis') or neither (''). The mode picked on the roll bar adds to the
// roll's own (Stealth in noisy armor has Disadvantage, Cloak of Elvenkind gives Advantage), and any
// Advantage and any Disadvantage cancel out (2024 rules).
export function rollMode(picked, dis, adv) {
  const hasAdv = picked === 'adv' || adv;
  const hasDis = picked === 'dis' || dis;
  if (hasAdv && hasDis) return '';
  return hasAdv ? 'adv' : hasDis ? 'dis' : '';
}

// A d20 roll plus a bonus: two d20s with Advantage (take the higher) or Disadvantage (the lower).
export function rollD20(label, bonus, mode) {
  const rolls = [rollDie(20)];
  if (mode) rolls.push(rollDie(20));
  const kept = mode === 'adv' ? Math.max(...rolls) : mode === 'dis' ? Math.min(...rolls) : rolls[0];
  const dice = mode ? '2d20' + (mode === 'adv' ? 'kh1' : 'kl1') : '1d20';
  const shown = mode ? '[' + rolls.join(', ') + '] take ' + kept : '[' + kept + ']';
  const bonusShown = bonus ? ' ' + (bonus > 0 ? '+' : '-') + ' ' + Math.abs(bonus) : '';
  return {
    label,
    expr: dice + (bonus ? signed(bonus) : ''),
    detail: shown + bonusShown,
    total: kept + bonus,
    crit: kept === 20 ? 'Natural 20' : kept === 1 ? 'Natural 1' : '',
  };
}

// Dice and numbers joined by + and -, like 2d6+3. A critical hit doubles the dice (not the numbers).
// Damage and healing never go below 0; a custom roll (raw) can. Returns null if the expression
// has anything else in it.
export function rollDice(label, expression, crit = false, raw = false) {
  const terms = String(expression).replace(/\s/g, '').match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  const detail = [];
  const expr = [];
  for (const term of terms) {
    const rolled = rollTerm(term, crit, detail.length === 0);
    if (!rolled) return null;
    total += rolled.value;
    detail.push(rolled.detail);
    expr.push(rolled.expr);
  }
  if (!expr.length) return null;
  return {
    label,
    expr: expr.join('').replace(/^\+/, ''),
    detail: detail.join(' '),
    total: raw ? total : Math.max(0, total),
    crit: crit ? 'Critical hit, dice doubled' : '',
  };
}

// One term of a dice expression ("2d6", "-1d4" or "+3"): its value, how it's shown, and its part of the
// chat command. A negative term counts against the total. null if the term is neither dice nor a number.
function rollTerm(term, crit, first) {
  const negative = term[0] === '-';
  const sign = negative ? '-' : '+';
  const body = term.replace(/^[+-]/, '');
  const dice = body.match(/^(\d*)d(\d+)$/i);
  if (dice && +dice[2] > 0) {
    const count = Math.min(200, (+dice[1] || 1) * (crit ? 2 : 1));
    const sides = +dice[2];
    const rolls = Array.from({ length: count }, () => rollDie(sides));
    const sum = rolls.reduce((total, roll) => total + roll, 0);
    const join = negative ? '- ' : first ? '' : '+ ';
    return {
      value: negative ? -sum : sum,
      detail: join + '[' + rolls.join(', ') + ']',
      expr: sign + count + 'd' + sides,
    };
  }
  if (/^\d+$/.test(body)) {
    return { value: negative ? -body : +body, detail: (negative ? '- ' : '+ ') + body, expr: sign + body };
  }
  return null;
}

// Why a typed custom roll can't be made, or '' if it can. Too many dice is refused, not trimmed.
export function customRollError(text) {
  const expression = text.replace(/\s/g, '');
  if (!expression) return 'Type a roll first, like 2d6+3.';
  // Each "2d6" as [count, sides]; a bare "d6" counts as one die.
  const dice = [...expression.matchAll(/(\d*)d(\d+)/gi)].map(([, count, sides]) => [count, +sides]);
  const wellFormed = /^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(expression);
  const hasZero = dice.some(([count, sides]) => (count !== '' && +count < 1) || sides < 1);
  if (!wellFormed || !dice.length || hasZero) {
    return `"${text.trim().slice(0, 40)}" is not a roll. Use dice like 2d6+3 or 1d20+1d4.`;
  }
  const totalDice = dice.reduce((total, [count]) => total + (+count || 1), 0);
  if (totalDice > 100 || dice.some(([, sides]) => sides > 1000)) {
    return 'That roll is too big. Use up to 100 dice, each with up to 1000 sides.';
  }
  return '';
}

// A result as a chat command for Foundry (/r), Roll20 (/roll) or a Roll20 template.
export function chatCommand(result, format) {
  if (!result) return '';
  const { label, expr } = result;
  if (format === 'roll20t') return `&{template:default} {{name=${label}}} {{Roll=[[${expr}]]}}`;
  if (format === 'roll20') return `/roll ${expr}`;
  return `/r ${expr} # ${label}`;
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
  if (dice && dice === roll.b) ({ dice, attacks } = scaledDice(roll, roll.by === 'char' ? sheet.level : slot));
  const castingModifier = sheet.cast ? abilityMod(score(sheet, sheet.cast)) : 0;
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
export function weaponMod(sheet, item) {
  const weapon = item.w;
  const str = abilityMod(score(sheet, 'str'));
  const dex = abilityMod(score(sheet, 'dex'));
  const ability = weapon.ab === 'dex' ? dex : weapon.ab === 'fin' ? Math.max(str, dex) : str;
  const magic = item.at && !item.att ? 0 : (+weapon.b || 0);
  return ability + magic;
}

// Dice with a modifier added: "1d8" and 3 give "1d8+3"; 0 leaves the dice alone.
export const withMod = (dice, modifier) => (modifier ? dice + signed(modifier) : dice);
