// The numbers on the sheet, worked out from the character (2024 rules, SRD 5.2). Nothing here changes the
// sheet or touches the page: each function takes the sheet and returns a number or a list, so the same
// character always gives the same results.
//
// Effects are how items, feats and traits change numbers: [type, target, value], such as ['ab', 'con', 2]
// (+2 Constitution) or ['set', 'str', 19] (Strength becomes 19). Each kind is summed where it applies below.
import { traitEffects } from './library.js';
import { CLS, CLASSES } from './sheet.js';

// Ability modifier: (score - 10) / 2, rounded down.
export const abilityMod = score => Math.floor((score - 10) / 2);

// A bonus with its sign, as the sheet shows it: +3, +0, -1.
export const signed = n => (n >= 0 ? '+' : '') + n;

// Proficiency bonus by character level: +2 at levels 1-4, +3 at 5-8, and so on up to +6 at 17-20.
export const profBonus = sheet => Math.ceil(Math.max(1, sheet.level) / 4) + 1;

// The standard class a name refers to ("fighter " is Fighter), or undefined for a custom class.
export const knownClass = name => CLASSES.find(c => c.toLowerCase() === String(name).trim().toLowerCase());

// Hit dice: one per level, of the class's size (or the one picked for a custom class). sheet.hd counts
// the ones spent. A short rest spends them one at a time (die + Con modifier, at least 1 HP); a long rest
// gives them all back (2024 rules).
export const hitDie = sheet => CLS[knownClass(sheet.cls)]?.hd || sheet.hdie;
export const hitDiceLeft = sheet => Math.max(0, sheet.level - sheet.hd);

// Max HP by the fixed-average rule: the full die plus Con at level 1, then half the die + 1 + Con per level,
// each at least 1; plus any HP per level from features (Dwarven Toughness). 0 if there's no hit die yet.
export function averageHP(sheet) {
  const die = hitDie(sheet);
  if (!die) return 0;
  const con = abilityMod(score(sheet, 'con'));
  const firstLevel = Math.max(1, die + con);
  const laterLevels = (sheet.level - 1) * Math.max(1, die / 2 + 1 + con);
  return firstLevel + laterLevels + sheet.level * effectTotal(sheet, 'hp');
}

// Gear whose magic is working: equipped and, if it needs attunement, attuned. You choose what to
// attune to (up to 3). If a sheet somehow has more (an import), the first three count and the rest
// are flagged.
// A creature can't attune to more than one copy of a magic item (SRD 5.2,
// Attunement). A second same-named copy is flagged as a duplicate and takes no slot.
export function activeGear(sheet) {
  const att = sheet.items.filter(x => x.at && x.att);
  const seen = new Set();
  const uniq = [];
  const dup = [];
  for (const x of att) {
    const key = String(x.n || '').trim().toLowerCase();
    if (seen.has(key)) {
      dup.push(x);
    } else {
      seen.add(key);
      uniq.push(x);
    }
  }
  const ok = new Set(uniq.slice(0, 3));
  const live = sheet.items.filter(x => x.eq && x.on && (!x.at || ok.has(x)));
  return { live, over: uniq.slice(3), dup, attuned: uniq.length };
}

// A feature's or trait's effects (see traitEffects in library.js). A skill choice ('?' for any skill,
// '?A|B' for one of a list) becomes the skill picked for it in Edit (x.ch, one pick per choice, in order),
// and keeps the choice as a fourth entry; until a skill is picked it counts for nothing.
export function featureEffects(feature) {
  let choice = 0;
  return traitEffects(feature).map(f =>
    f[0] === 'sk' && f[1][0] === '?' ? [f[0], feature.ch?.[choice++] || '', f[2], f[1]] : f);
}

// Every effect of one type, from working gear and from every feat and racial trait,
// each with what it came from: [[source, effect], ...].
export function effectsOf(sheet, type) {
  const fromGear = activeGear(sheet).live.map(x => [x, x.fx || []]);
  const fromFeatures = [...sheet.feats, ...sheet.race].map(x => [x, featureEffects(x)]);
  return [...fromGear, ...fromFeatures].flatMap(([x, list]) => list.filter(f => f[0] === type).map(f => [x, f]));
}

// The sum of every effect of one type, such as 'chk' (ability checks) or 'sa' (spell attacks).
export const effectTotal = (sheet, type) => effectsOf(sheet, type).reduce((n, [, f]) => n + f[2], 0);

// What gives Advantage on a roll ('init', or a skill name).
export const advantageFrom = (sheet, roll) => effectsOf(sheet, 'adv').filter(([, f]) => f[1] === roll).map(([x]) => x);

// Ability score bonuses (a homebrew species' +2 Con), with their sources.
export const scoreBonuses = (sheet, ability) => effectsOf(sheet, 'ab').filter(([, f]) => f[1] === ability);

// Your score plus any bonuses, kept between 1 and 30.
export function baseScore(sheet, ability) {
  const bonus = scoreBonuses(sheet, ability).reduce((n, [, f]) => n + f[2], 0);
  return Math.max(1, Math.min(30, sheet.ab[ability] + bonus));
}

// The "your Strength is 19" item that sets this score, if it's higher than yours (the highest one wins).
export function scoreSetBy(sheet, ability) {
  const base = baseScore(sheet, ability);
  return effectsOf(sheet, 'set')
    .filter(([, f]) => f[1] === ability && f[2] > base)
    .sort((p, q) => q[1][2] - p[1][2])[0];
}

// The ability score used everywhere: an item that sets it raises it, never lowers it.
export const score = (sheet, ability) => scoreSetBy(sheet, ability)?.[1][2] ?? baseScore(sheet, ability);

// Skill proficiency is 0 (none), 1 (proficient) or 2 (Expertise). A feature can grant it, and what it
// grants is the least you have: ticking the skill can't go below it.
export const skillGrants = (sheet, skill) => effectsOf(sheet, 'sk').filter(([, f]) => f[1] === skill);
export const skillGranted = (sheet, skill) => Math.max(0, ...skillGrants(sheet, skill).map(([, f]) => f[2]));
export const skillProf = (sheet, skill) => Math.max(sheet.sk[skill] || 0, skillGranted(sheet, skill));

// Equipped armor whose Strength requirement isn't met. As in the 2024 rules this costs 10 ft of Speed
// (once, however many such items are worn) and doesn't change any rolls.
export const unmetStrength = sheet =>
  sheet.items.filter(x => x.eq && x.on && x.ar && x.ar.str > score(sheet, 'str'));

export const currentSpeed = sheet => Math.max(0, sheet.speed - (unmetStrength(sheet).length ? 10 : 0));

// Working gear with armor data (x.ar) that passes the test, such as a => a.stl for noisy armor.
export const wornWith = (sheet, test) => activeGear(sheet).live.filter(x => x.ar && test(x.ar));

// Armor class from equipped gear: the best body armor (or 10 + Dex, or a better unarmored base),
// plus the best shield, plus every equipped AC bonus item, plus the sheet's own bonus.
// Light armor adds Dex, medium adds at most +2, heavy adds none. A bonus item marked nu ("no armor")
// only counts without armor or a shield.
// Returns the total, the parts it's made of ([name, value]) and the armor and shield that were used.
export function armorClass(sheet) {
  const dex = abilityMod(score(sheet, 'dex'));
  const armor = activeGear(sheet).live.filter(x => x.ar && x.ar.k);
  const best = (list, value) => list.map(x => ({ x, v: value(x) })).sort((a, b) => b.v - a.v)[0];
  const dexFor = kind => (kind === 'light' ? dex : kind === 'medium' ? Math.min(dex, 2) : 0);

  const body = best(armor.filter(x => ['light', 'medium', 'heavy'].includes(x.ar.k)), x => x.ar.ac + dexFor(x.ar.k));
  const shield = best(armor.filter(x => x.ar.k === 'shield'), x => x.ar.ac);
  const unarmored = Math.max(10, ...armor.filter(x => x.ar.k === 'unarm').map(x => x.ar.ac));

  const parts = [];
  if (body) parts.push([body.x.n, body.v]);
  else parts.push([unarmored > 10 ? `Unarmored base ${unarmored} + Dex` : 'Unarmored (10 + Dex)', unarmored + dex]);
  if (shield) parts.push([shield.x.n, shield.v]);
  for (const x of armor.filter(x => x.ar.k === 'bonus' && (!x.ar.nu || (!body && !shield)))) parts.push([x.n, x.ar.ac]);
  if (sheet.acb) parts.push(['Other bonus', sheet.acb]);

  return { ac: parts.reduce((n, [, v]) => n + v, 0), parts, used: new Set([body?.x, shield?.x]) };
}

// The AC shown: worked out from gear, or the number typed in by hand.
export const currentAC = sheet => (sheet.acAuto ? armorClass(sheet).ac : sheet.ac);

// Saving throw bonuses, with their sources: protection items (+AC and saves) and effects like the Luckstone's.
export function saveBonuses(sheet) {
  const fromArmor = wornWith(sheet, a => a.sb).map(x => [x.n, x.ar.sb]);
  const fromEffects = effectsOf(sheet, 'sv').map(([x, f]) => [x.n, f[2]]);
  return [...fromArmor, ...fromEffects];
}

export const saveBonus = sheet => saveBonuses(sheet).reduce((n, [, v]) => n + v, 0);
