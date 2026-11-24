// The stats column: the six abilities, saving throws, and skills with Passive Perception.
//
// Each section takes the sheet and the shared values render() works out once (see sheetView in
// main.js): editing, proficiency, checkBonus, checkBonusSources and advantageSources.
//
// A note on the sheet's data: items and features keep their name in `n`, and an effect is a list
// [type, target, value], such as ['set', 'str', 19] or ['sk', 'Insight', 2].
//
// Buttons with data-a="roll" roll a d20 plus data-b when tapped (see rollCheck in actions/rolls.js).
import { ABILITIES, ABILITY_NAMES, SKILLS } from '../sheet.js';
import {
    abilityMod, signed, score, scoreSetBy, scoreBonuses, baseScore,
    skillProf, skillGranted, skillGrants, saveBonus, saveBonuses, wornWith,
} from '../rules.js';
import { html, when, input, PROF_MARK, PROF_LABEL, sourcesText } from '../html.js';

// Abilities. In Play, a note on top lists bonuses to every ability check; each ability shows its
// check bonus (tap to roll) and its score. In Edit, the score becomes a field.
export function abilitiesSection(sheet, { editing, checkBonus, checkBonusSources }) {
    const showNote = !editing && checkBonus !== 0;
    return html`
        <h2>Abilities ${when(showNote, html`<small>${checkBonusSources} on checks</small>`)}</h2>
        <div class="abs">${ABILITIES.map(ability => abilityBox(sheet, ability, editing, checkBonus))}</div>`;
}

// One ability. A score raised by an item or a bonus is highlighted, and its tooltip says by what.
function abilityBox(sheet, ability, editing, checkBonus) {
    const name = ABILITY_NAMES[ability];
    const setBy = scoreSetBy(sheet, ability);
    const bonuses = scoreBonuses(sheet, ability);
    const raised = setBy !== undefined || bonuses.length > 0;

    let why = '';
    if (setBy) {
        const [item, [, , value]] = setBy;
        why = `${item.n} sets ${name} to ${value} (yours: ${baseScore(sheet, ability)})`;
    } else if (bonuses.length) {
        const sources = bonuses.map(([source, [, , value]]) => [source.n, value]);
        why = `${sheet.ab[ability]}, plus ${sourcesText(sources)}`;
    }

    const check = abilityMod(score(sheet, ability)) + checkBonus;
    const raisedBy = when(setBy, () => html` <span class="up">${setBy[0].n}</span>`);
    const scoreShown = editing
        ? input('ab.' + ability, sheet.ab[ability], 'number', `min=1 max=30 aria-label="${name} score"`)
        : html`<div class="s">${score(sheet, ability)}${raisedBy}</div>`;

    return html`
        <div class="ab${when(raised, ' boost')}" ${when(why, html`title="${why}"`)}>
            <div class="n">${name.slice(0, 3)}</div>
            <button class="rb m" data-a="roll" data-l="${name} check" data-b="${check}"
                aria-label="${name} check ${signed(check)}">${signed(check)}</button>
            ${scoreShown}
        </div>`;
}

// The proficiency mark in front of a save or skill (see PROF_MARK). In Edit, tapping it changes the
// proficiency; in Play it's disabled.
function proficiencyMark({ action, value, label, level, description, editing }) {
    return html`
        <button class="pr" data-a="${action}" data-v="${value}" aria-label="${label} proficiency"
            aria-pressed="${level > 0}" aria-description="${description}"
            title="${description}" ${when(!editing, 'disabled')}>${PROF_MARK[level]}</button>`;
}

// Saving throws: ability modifier, plus proficiency if proficient, plus bonuses to every save
// (a Ring of Protection, a Luckstone), which the heading lists in Play.
export function savesSection(sheet, { editing, proficiency }) {
    const bonus = saveBonus(sheet);
    const bonusSources = bonus ? `Includes ${sourcesText(saveBonuses(sheet))}` : '';
    let note = '';
    if (editing) note = html`<small>tap circles to set proficiency</small>`;
    else if (bonus) note = html`<small>${bonusSources}</small>`;
    const save = { editing, proficiency, bonus, bonusSources };
    return html`
        <h2>Saving throws ${note}</h2>
        <div class="list two">${ABILITIES.map(ability => saveRow(sheet, ability, save))}</div>`;
}

function saveRow(sheet, ability, { editing, proficiency, bonus, bonusSources }) {
    const name = ABILITY_NAMES[ability];
    const level = sheet.sv[ability] ? 1 : 0;
    const total = abilityMod(score(sheet, ability)) + level * proficiency + bonus;
    const description = PROF_LABEL[level];
    return html`
        <div class="ln">
            ${proficiencyMark({
                action: 'toggle-save', value: ability, label: `${name} save`, level, description, editing,
            })}
            <span class="g">${name}</span>
            <button class="rb" data-a="roll" data-l="${name} save" data-b="${total}"
                aria-label="${name} save ${signed(total)}" title="${bonusSources}">${signed(total)}</button>
        </div>`;
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
    if (editing) note = html`<small>tap to cycle: none, proficient, expertise</small>`;
    else if (checkBonus) note = html`<small>${checkBonusSources}</small>`;

    const perceptionAdvantage = advantageSources('Perception');
    const perception = abilityMod(score(sheet, 'wis')) + skillProf(sheet, 'Perception') * proficiency + checkBonus;
    const passive = 10 + perception + (perceptionAdvantage ? 5 : 0);
    const passiveWhy = [checkBonusSources, perceptionAdvantage ? '+5 for Advantage' : ''].filter(Boolean).join('. ');
    const rows = SKILLS.map(([skill, ability]) => skillRow(sheet, view, skill, ability, stealthPenalty));
    return html`
        <h2>Skills ${note}</h2>
        <div class="list two">${rows}</div>
        <div class="ln" role="group" aria-label="Passive Perception">
            <span class="g">Passive Perception</span>
            <span class="v" title="${passiveWhy}">${passive}</span>
        </div>`;
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
    const disadvantage = skill === 'Stealth' && stealthPenalty !== '';
    const advantage = advantageSources(skill);
    const total = abilityMod(score(sheet, ability)) + level * proficiency + checkBonus;
    const why = [skill === 'Stealth' ? stealthPenalty : '', advantage, checkBonusSources].filter(Boolean).join('. ');
    const disPill = when(disadvantage, html` <span class="pill dis" title="${stealthPenalty}">Dis</span>`);
    const advPill = when(advantage, html` <span class="pill adv" title="${advantage}">Adv</span>`);

    return html`
        <div class="ln">
            ${proficiencyMark({ action: 'cycle-skill', value: skill, label: skill, level, description, editing })}
            <span class="g">${skill} <span class="a">${ability}</span>${disPill}${advPill}</span>
            <button class="rb" data-a="roll" data-l="${skill}" data-b="${total}" aria-label="${skill} ${signed(total)}"
                ${when(disadvantage, html`data-dis="1"`)} ${when(advantage, html`data-adv="1"`)}
                title="${why}">${signed(total)}</button>
        </div>`;
}
