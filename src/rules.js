// The numbers on the sheet, worked out from the character (2024 rules, SRD 5.2). Nothing here changes the
// sheet or touches the page: each function takes the sheet and returns a number or a list, so the same
// character always gives the same results.
//
// The sheet's data uses short keys (it's what's saved, so they stay). The ones used here:
//   item       n name, eq can be equipped, on equipped now, at needs attunement, att attuned,
//              fx effects, ar armor data
//   item.ar    k kind ('light', 'medium', 'heavy', 'shield', 'unarm' for an unarmored base, 'bonus'
//              for a +AC item), ac its AC, str Strength needed, stl Stealth Disadvantage,
//              nu counts only with no armor and no shield, sb bonus to saving throws
//   feature    n name, ch skill picks for skill choices
//
// Effects are how items, feats and traits change numbers: [type, target, value], such as ['ab', 'con', 2]
// (+2 Constitution) or ['set', 'str', 19] (Strength becomes 19). Each kind is summed where it applies below.
import { traitEffects } from './library.js';
import { CLS, CLASSES, SRD_SPECIES } from './sheet.js';

// Ability modifier: (score - 10) / 2, rounded down.
export const abilityMod = score => Math.floor((score - 10) / 2);

// A bonus with its sign, as the sheet shows it: +3, +0, -1.
export const signed = number => (number >= 0 ? '+' : '') + number;

// Proficiency bonus by character level: +2 at levels 1-4, +3 at 5-8, and so on up to +6 at 17-20.
export const profBonus = sheet => Math.ceil(Math.max(1, sheet.level) / 4) + 1;

// The standard class a name refers to ("fighter " is Fighter), or undefined for a custom class.
export const knownClass = name =>
    CLASSES.find(className => className.toLowerCase() === String(name).trim().toLowerCase());

// The species to choose from: the Library's (SRD 5.2 and any custom packs) in alphabetical order, each
// name once, or the SRD names before the Library has been downloaded.
export function speciesNames(librarySpecies) {
    if (!librarySpecies.length) return SRD_SPECIES;
    return [...new Set(librarySpecies.map(species => species.name))].sort();
}

// The species a name refers to ("elf " is Elf), or undefined for a custom species.
export const knownSpecies = (name, librarySpecies) => speciesNames(librarySpecies)
    .find(speciesName => speciesName.toLowerCase() === String(name).trim().toLowerCase());

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
    const attunedItems = sheet.items.filter(item => item.at && item.att);
    const seen = new Set();
    const uniq = [];
    const dup = [];
    for (const item of attunedItems) {
        const key = String(item.n || '').trim().toLowerCase();
        if (seen.has(key)) {
            dup.push(item);
        } else {
            seen.add(key);
            uniq.push(item);
        }
    }
    const counted = new Set(uniq.slice(0, 3));
    const live = sheet.items.filter(item => item.eq && item.on && (!item.at || counted.has(item)));
    return { live, over: uniq.slice(3), dup, attuned: uniq.length };
}

// A feature's or trait's effects (see traitEffects in library.js). A skill choice ('?' for any skill,
// '?A|B' for one of a list) becomes the skill picked for it in Edit (feature.ch, one pick per choice, in
// order), and keeps the choice as a fourth entry; until a skill is picked it counts for nothing.
export function featureEffects(feature) {
    let choice = 0;
    return traitEffects(feature).map(effect => {
        const [type, target, value] = effect;
        const isSkillChoice = type === 'sk' && target[0] === '?';
        return isSkillChoice ? [type, feature.ch?.[choice++] || '', value, target] : effect;
    });
}

// Every effect of one type, from working gear and from every feat and racial trait,
// each with what it came from: [[source, effect], ...].
export function effectsOf(sheet, type) {
    const fromGear = activeGear(sheet).live.map(item => [item, item.fx || []]);
    const fromFeatures = [...sheet.feats, ...sheet.race].map(feature => [feature, featureEffects(feature)]);
    return [...fromGear, ...fromFeatures].flatMap(([source, effects]) =>
        effects.filter(([effectType]) => effectType === type).map(effect => [source, effect]));
}

// Effects of one type for one target (an ability or a skill), with their sources.
const effectsFor = (sheet, type, target) =>
    effectsOf(sheet, type).filter(([, [, effectTarget]]) => effectTarget === target);

// Adds up the values of [[source, [type, target, value]], ...].
const sumValues = list => list.reduce((total, [, [, , value]]) => total + value, 0);

// The sum of every effect of one type, such as 'chk' (ability checks) or 'sa' (spell attacks).
export const effectTotal = (sheet, type) => sumValues(effectsOf(sheet, type));

// What gives Advantage on a roll ('init', or a skill name).
export const advantageFrom = (sheet, roll) => effectsFor(sheet, 'adv', roll).map(([source]) => source);

// Ability score bonuses (a homebrew species' +2 Con), with their sources.
export const scoreBonuses = (sheet, ability) => effectsFor(sheet, 'ab', ability);

// Your score plus any bonuses, kept between 1 and 30.
export function baseScore(sheet, ability) {
    const bonus = sumValues(scoreBonuses(sheet, ability));
    return Math.max(1, Math.min(30, sheet.ab[ability] + bonus));
}

// The "your Strength is 19" item that sets this score, if it's higher than yours (the highest one wins):
// [source, ['set', ability, value]], or undefined.
export function scoreSetBy(sheet, ability) {
    const base = baseScore(sheet, ability);
    const valueOf = ([, [, , value]]) => value;
    return effectsFor(sheet, 'set', ability)
        .filter(setter => valueOf(setter) > base)
        .sort((first, second) => valueOf(second) - valueOf(first))[0];
}

// The ability score used everywhere: an item that sets it raises it, never lowers it.
export function score(sheet, ability) {
    const setter = scoreSetBy(sheet, ability);
    if (!setter) return baseScore(sheet, ability);
    const [, [, , value]] = setter;
    return value;
}

// Skill proficiency is 0 (none), 1 (proficient) or 2 (Expertise). A feature can grant it, and what it
// grants is the least you have: ticking the skill can't go below it.
export const skillGrants = (sheet, skill) => effectsFor(sheet, 'sk', skill);
export const skillGranted = (sheet, skill) =>
    Math.max(0, ...skillGrants(sheet, skill).map(([, [, , level]]) => level));
export const skillProf = (sheet, skill) => Math.max(sheet.sk[skill] || 0, skillGranted(sheet, skill));

// Equipped armor whose Strength requirement isn't met. As in the 2024 rules this costs 10 ft of Speed
// (once, however many such items are worn) and doesn't change any rolls.
export const unmetStrength = sheet =>
    sheet.items.filter(item => item.eq && item.on && item.ar && item.ar.str > score(sheet, 'str'));

export const currentSpeed = sheet => Math.max(0, sheet.speed - (unmetStrength(sheet).length ? 10 : 0));

// Working gear with armor data (item.ar) that passes the test, such as armor => armor.stl for noisy armor.
export const wornWith = (sheet, test) => activeGear(sheet).live.filter(item => item.ar && test(item.ar));

// Armor class from equipped gear: the best body armor (or 10 + Dex, or a better unarmored base),
// plus the best shield, plus every equipped AC bonus item, plus the sheet's own bonus.
// Light armor adds Dex, medium adds at most +2, heavy adds none. A bonus item marked nu ("no armor")
// only counts without armor or a shield.
// Returns the total, the parts it's made of ([name, value]) and the armor and shield that were used.
export function armorClass(sheet) {
    const dex = abilityMod(score(sheet, 'dex'));
    const armorItems = activeGear(sheet).live.filter(item => item.ar && item.ar.k);
    const ofKind = (...kinds) => armorItems.filter(item => kinds.includes(item.ar.k));
    const dexFor = kind => (kind === 'light' ? dex : kind === 'medium' ? Math.min(dex, 2) : 0);

    // The item that gives the most AC, with that AC: { item, ac }.
    const best = (items, acOf) =>
        items.map(item => ({ item, ac: acOf(item) })).sort((first, second) => second.ac - first.ac)[0];
    const body = best(ofKind('light', 'medium', 'heavy'), item => item.ar.ac + dexFor(item.ar.k));
    const shield = best(ofKind('shield'), item => item.ar.ac);
    const unarmored = Math.max(10, ...ofKind('unarm').map(item => item.ar.ac));

    const parts = [];
    if (body) parts.push([body.item.n, body.ac]);
    else parts.push([unarmored > 10 ? `Unarmored base ${unarmored} + Dex` : 'Unarmored (10 + Dex)', unarmored + dex]);
    if (shield) parts.push([shield.item.n, shield.ac]);
    const bonusItems = ofKind('bonus').filter(item => !item.ar.nu || (!body && !shield));
    for (const item of bonusItems) parts.push([item.n, item.ar.ac]);
    if (sheet.acb) parts.push(['Other bonus', sheet.acb]);

    const ac = parts.reduce((total, [, value]) => total + value, 0);
    return { ac, parts, used: new Set([body?.item, shield?.item]) };
}

// The AC shown: worked out from gear, or the number typed in by hand.
export const currentAC = sheet => (sheet.acAuto ? armorClass(sheet).ac : sheet.ac);

// Saving throw bonuses, with their sources ([name, value]): protection items (+AC and saves) and
// effects like the Luckstone's.
export function saveBonuses(sheet) {
    const fromArmor = wornWith(sheet, armor => armor.sb).map(item => [item.n, item.ar.sb]);
    const fromEffects = effectsOf(sheet, 'sv').map(([source, [, , value]]) => [source.n, value]);
    return [...fromArmor, ...fromEffects];
}

export const saveBonus = sheet => saveBonuses(sheet).reduce((total, [, value]) => total + value, 0);
