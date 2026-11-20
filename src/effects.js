// How an effect reads on the sheet, and the effects an item can be given in Edit.
// An effect is [type, target, value], such as ['set', 'str', 19] or ['sk', 'Insight', 2].
// A skill effect that offers a choice keeps the choice as a fourth entry ('?' or '?Arcana|History').
import { AB, ABN, SK } from './sheet.js';
import { signed } from './rules.js';

// "Arcana, History" from '?Arcana|History'; '' for a choice of any skill ('?').
const choiceList = choice => (choice && choice !== '?' ? choice.slice(1).split('|').join(', ') : '');

function skillLabel(skill, level, choice) {
    if (skill) return `${skill} ${level > 1 ? 'expertise' : 'proficiency'}`;
    const options = choiceList(choice);
    return `Choose a skill${options ? ` (${options})` : ''} in Edit`;
}

/** "Strength becomes 19", "+1 saving throws", "Advantage on Initiative" and so on. */
export function effectLabel([type, target, value, choice]) {
    switch (type) {
        case 'set': return `${ABN[target]} becomes ${value}`;
        case 'chk': return `${signed(value)} ability checks`;
        case 'sv': return `${signed(value)} saving throws`;
        case 'sa': return `${signed(value)} spell attacks`;
        case 'dc': return `${signed(value)} spell save DC`;
        case 'hp': return `${signed(value)} HP per level`;
        case 'ab': return `${signed(value)} ${ABN[target]}`;
        case 'sk': return skillLabel(target, value, choice);
        default: return `Advantage on ${target === 'init' ? 'Initiative' : target}`;
    }
}

// The effects an item can be given in Edit. The value is "type|target", split again when one is added.
export const ITEM_EFFECT_CHOICES = [
    ...AB.map(ability => ({ value: `set|${ability}`, label: `Set ${ABN[ability]} to (value)` })),
    { value: 'chk|', label: 'Bonus to ability checks' },
    { value: 'sv|', label: 'Bonus to saving throws' },
    { value: 'sa|', label: 'Bonus to spell attacks' },
    { value: 'dc|', label: 'Bonus to spell save DC' },
    { value: 'adv|init', label: 'Advantage on Initiative' },
    ...SK.map(([skill]) => ({ value: `adv|${skill}`, label: `Advantage on ${skill}` })),
];
