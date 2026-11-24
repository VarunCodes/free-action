// What a species trait (or any feature) does to the numbers, in the same [type, target, value] form as magic
// item effects, plus three types of its own: hp (+value HP per level), ab (+value to an ability score) and
// sk (skill proficiency: target is a skill, '?' for any skill of your choice, or '?A|B|C' to choose from a list).
//
// Effects come from, in order: the trait's own fx (custom packs can give any trait effects), the SRD traits
// named below, or wording the SRD uses, so homebrew written the same way works without an fx list.
import { SKILLS } from '../sheet.js';
import { ABILITY_KEYS } from './values.js';

const SKILL_NAMES = SKILLS.map(([skill]) => skill);

const NAMED_TRAITS = {
    'dwarven toughness': [['hp', '', 1]],
    'keen senses': [['sk', '?Insight|Perception|Survival', 1]],
    'skillful': [['sk', '?', 1]],
};

/** A trait or feature: { n: name, d: description, fx: effects if it has its own }. */
export function traitEffects(trait) {
    if (Array.isArray(trait.fx) && trait.fx.length) return trait.fx;
    const named = NAMED_TRAITS[String(trait.n || '').trim().toLowerCase()];
    if (named) return named;
    const text = String(trait.d || '').replace(/\s+/g, ' ');
    return [...hitPointEffects(text), ...abilityScoreEffects(text), ...skillEffects(text)];
}

// "Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level."
function hitPointEffects(text) {
    const perLevel = /Hit Point maximum increases by (\d+),? and it increases by \1 again whenever you gain a level/i
        .exec(text);
    return perLevel ? [['hp', '', Number(perLevel[1])]] : [];
}

// "Your Constitution score increases by 2."
function abilityScoreEffects(text) {
    const increases = text.matchAll(
        /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d+)/gi);
    return [...increases].map(([, ability, amount]) => ['ab', ABILITY_KEYS[ability.toLowerCase()], Number(amount)]);
}

// "You have proficiency in the Perception skill", "proficiency in one skill of your choice".
function skillEffects(text) {
    const named = text.matchAll(/\bproficiency in the ([A-Z][a-z]+(?: [a-z]+ [A-Z][a-z]+| [A-Z][a-z]+)?) skill\b/g);
    const effects = [...named]
        .filter(([, skill]) => SKILL_NAMES.includes(skill))
        .map(([, skill]) => ['sk', skill, 1]);
    if (/\bproficiency in one skill of your choice\b/i.test(text)) effects.push(['sk', '?', 1]);
    return effects;
}
