// The stats column: the six abilities, saving throws, and skills with Passive Perception.
//
// Each section takes the sheet and the shared values render() works out once (see sheetView in
// main.js): editing, proficiency, checkBonus, checkBonusSources and advantageSources.
//
// A note on the sheet's data: items and features keep their name in `n`, and an effect is a list
// [type, target, value], such as ['set', 'str', 19] or ['sk', 'Insight', 2].
//
// Buttons with data-a="roll" roll a d20 plus data-b when tapped (see doRoll in main.js).
import { AB, ABN, SK } from '../sheet.js';
import { esc } from '../text.js';
import {
    abilityMod, signed, score, scoreSetBy, scoreBonuses, baseScore,
    skillProf, skillGranted, skillGrants, saveBonus, saveBonuses, wornWith,
} from '../rules.js';
import { input, PROF_MARK, PROF_LABEL, sourcesText } from '../html.js';

// Abilities. In Play, a note on top lists bonuses to every ability check; each ability shows its
// check bonus (tap to roll) and its score. In Edit, the score becomes a field.
export function abilitiesSection(sheet, { editing, checkBonus, checkBonusSources }) {
    const note = !editing && checkBonus ? `<small>${esc(checkBonusSources)} on checks</small>` : '';
    const boxes = AB.map(ability => abilityBox(sheet, ability, editing, checkBonus)).join('');
    return `<h2>Abilities ${note}</h2><div class="abs">${boxes}</div>`;
}

// One ability. A score raised by an item or a bonus is highlighted, and its tooltip says by what.
function abilityBox(sheet, ability, editing, checkBonus) {
    const name = ABN[ability];
    const setBy = scoreSetBy(sheet, ability);
    const bonuses = scoreBonuses(sheet, ability);

    let why = '';
    if (setBy) {
        const [item, [, , value]] = setBy;
        why = `${item.n} sets ${name} to ${value} (yours: ${baseScore(sheet, ability)})`;
    } else if (bonuses.length) {
        const sources = bonuses.map(([source, [, , value]]) => [source.n, value]);
        why = `${sheet.ab[ability]}, plus ${sourcesText(sources)}`;
    }

    const check = abilityMod(score(sheet, ability)) + checkBonus;
    const rollButton = `<button class="rb m" data-a="roll" data-l="${name} check" data-b="${check}" `
    + `aria-label="${name} check ${signed(check)}">${signed(check)}</button>`;
    const raisedBy = setBy ? ` <span class="up">${esc(setBy[0].n)}</span>` : '';
    const scoreShown = editing
        ? input('ab.' + ability, sheet.ab[ability], 'number', `min=1 max=30 aria-label="${name} score"`)
        : `<div class="s">${score(sheet, ability)}${raisedBy}</div>`;

    const highlight = setBy || bonuses.length ? ' boost' : '';
    const tooltip = why ? `title="${esc(why)}"` : '';
    const shortName = name.slice(0, 3);
    return `<div class="ab${highlight}" ${tooltip}><div class="n">${shortName}</div>${rollButton}${scoreShown}</div>`;
}

// The proficiency mark in front of a save or skill (see PROF_MARK). In Edit, tapping it changes the
// proficiency; in Play it's disabled.
function proficiencyMark({ action, value, label, level, description, editing }) {
    return `<button class="pr" data-a="${action}" data-v="${value}" aria-label="${label} proficiency" `
    + `aria-pressed="${!!level}" aria-description="${esc(description)}" title="${esc(description)}" `
    + `${editing ? '' : 'disabled'}>${PROF_MARK[level]}</button>`;
}

// Saving throws: ability modifier, plus proficiency if proficient, plus bonuses to every save
// (a Ring of Protection, a Luckstone), which the heading lists in Play.
export function savesSection(sheet, { editing, proficiency }) {
    const bonus = saveBonus(sheet);
    const bonusSources = bonus ? `Includes ${sourcesText(saveBonuses(sheet))}` : '';
    let note = '';
    if (editing) note = '<small>tap circles to set proficiency</small>';
    else if (bonus) note = `<small>${esc(bonusSources)}</small>`;
    const save = { editing, proficiency, bonus, bonusSources };
    const rows = AB.map(ability => saveRow(sheet, ability, save)).join('');
    return `<h2>Saving throws ${note}</h2><div class="list two">${rows}</div>`;
}

function saveRow(sheet, ability, { editing, proficiency, bonus, bonusSources }) {
    const name = ABN[ability];
    const level = sheet.sv[ability] ? 1 : 0;
    const total = abilityMod(score(sheet, ability)) + level * proficiency + bonus;
    const mark = proficiencyMark({
        action: 'sv', value: ability, label: `${name} save`, level, description: PROF_LABEL[level], editing,
    });
    const rollButton = `<button class="rb" data-a="roll" data-l="${name} save" data-b="${total}" `
    + `aria-label="${name} save ${signed(total)}" title="${esc(bonusSources)}">${signed(total)}</button>`;
    return `<div class="ln">${mark}<span class="g">${name}</span>${rollButton}</div>`;
}

// Skills: ability modifier, plus proficiency (doubled for Expertise), plus bonuses to every check.
// Advantage comes from features and items; armor with a Stealth penalty gives Stealth Disadvantage.
// Then Passive Perception: 10 + the Perception bonus, +5 with Advantage (PHB 2024).
export function skillsSection(sheet, view) {
    const { editing, proficiency, checkBonus, checkBonusSources, advantageSources } = view;
    const noisyArmor = wornWith(sheet, armor => armor.stl);
    const stealthPenalty = noisyArmor.length
        ? `Disadvantage from ${noisyArmor.map(item => item.n).join(', ')}`
        : '';

    let note = '';
    if (editing) note = '<small>tap to cycle: none, proficient, expertise</small>';
    else if (checkBonus) note = `<small>${esc(checkBonusSources)}</small>`;
    const rows = SK.map(([skill, ability]) => skillRow(sheet, view, skill, ability, stealthPenalty)).join('');

    const perceptionAdvantage = advantageSources('Perception');
    const perception = abilityMod(score(sheet, 'wis')) + skillProf(sheet, 'Perception') * proficiency + checkBonus;
    const passive = 10 + perception + (perceptionAdvantage ? 5 : 0);
    const passiveWhy = [checkBonusSources, perceptionAdvantage ? '+5 for Advantage' : ''].filter(Boolean).join('. ');
    return `<h2>Skills ${note}</h2><div class="list two">${rows}</div>
 <div class="ln" role="group" aria-label="Passive Perception"><span class="g">Passive Perception</span>`
    + `<span class="v" title="${esc(passiveWhy)}">${passive}</span></div>`;
}

// One skill. stealthPenalty says which armor gives Stealth Disadvantage, or is '' for none.
function skillRow(sheet, view, skill, ability, stealthPenalty) {
    const { editing, proficiency, checkBonus, checkBonusSources, advantageSources } = view;
    const level = skillProf(sheet, skill);
    // When a feature grants exactly this level, the mark's description names it.
    const grantedBy = level && skillGranted(sheet, skill) === level
        ? skillGrants(sheet, skill).filter(([, [, , value]]) => value === level).map(([feature]) => feature.n)
        : [];
    const description = PROF_LABEL[level] + (grantedBy.length ? ` (from ${grantedBy.join(', ')})` : '');
    const disadvantage = skill === 'Stealth' && stealthPenalty;
    const advantage = advantageSources(skill);
    const total = abilityMod(score(sheet, ability)) + level * proficiency + checkBonus;

    const disPill = disadvantage ? ` <span class="pill dis" title="${esc(stealthPenalty)}">Dis</span>` : '';
    const advPill = advantage ? ` <span class="pill adv" title="${esc(advantage)}">Adv</span>` : '';
    const why = [skill === 'Stealth' ? stealthPenalty : '', advantage, checkBonusSources].filter(Boolean).join('. ');
    const rollButton = `<button class="rb" data-a="roll" data-l="${skill}" data-b="${total}" `
    + `aria-label="${skill} ${signed(total)}" ${disadvantage ? `data-dis="1"` : ''} ${advantage ? `data-adv="1"` : ''} `
    + `title="${esc(why)}">${signed(total)}</button>`;
    const mark = proficiencyMark({ action: 'sk', value: skill, label: skill, level, description, editing });
    const label = `<span class="g">${skill} <span class="a">${ability}</span>${disPill}${advPill}</span>`;
    return `<div class="ln">${mark}${label}${rollButton}</div>`;
}
