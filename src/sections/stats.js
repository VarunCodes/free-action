// The stats column: the six abilities, saving throws, and skills with Passive Perception.
// Each section takes the sheet and the values render() works out once for every section
// (view: ed for Edit mode, p for proficiency bonus, CK and ckT for bonuses to ability checks,
// advT(roll) for what gives Advantage on a roll).
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
export function abilitiesSection(sheet, { ed, CK, ckT }) {
    const note = !ed && CK ? `<small>${esc(ckT)} on checks</small>` : '';
    const boxes = AB.map(a => abilityBox(sheet, a, ed, CK)).join('');
    return `<h2>Abilities ${note}</h2><div class="abs">${boxes}</div>`;
}

// One ability. A score raised by an item or bonus is highlighted, and its tooltip says by what.
function abilityBox(sheet, a, ed, CK) {
    const name = ABN[a];
    const setBy = scoreSetBy(sheet, a);
    const bonuses = scoreBonuses(sheet, a);
    let why = '';
    if (setBy) why = `${setBy[0].n} sets ${name} to ${setBy[1][2]} (yours: ${baseScore(sheet, a)})`;
    else if (bonuses.length) why = `${sheet.ab[a]}, plus ${sourcesText(bonuses.map(([x, f]) => [x.n, f[2]]))}`;

    const check = abilityMod(score(sheet, a)) + CK;
    const roll = `<button class="rb m" data-a="roll" data-l="${name} check" data-b="${check}" `
    + `aria-label="${name} check ${signed(check)}">${signed(check)}</button>`;
    const raisedBy = setBy ? ` <span class="up">${esc(setBy[0].n)}</span>` : '';
    const value = ed
        ? input('ab.' + a, sheet.ab[a], 'number', `min=1 max=30 aria-label="${name} score"`)
        : `<div class="s">${score(sheet, a)}${raisedBy}</div>`;

    const boost = setBy || bonuses.length ? ' boost' : '';
    const title = why ? `title="${esc(why)}"` : '';
    return `<div class="ab${boost}" ${title}><div class="n">${name.slice(0, 3)}</div>${roll}${value}</div>`;
}

// The proficiency mark in front of a save or skill. In Edit, tapping it changes the proficiency.
function profButton(action, value, label, prof, description, ed) {
    return `<button class="pr" data-a="${action}" data-v="${value}" aria-label="${label} proficiency" `
    + `aria-pressed="${!!prof}" aria-description="${esc(description)}" title="${esc(description)}" `
    + `${ed ? '' : 'disabled'}>${PROF_MARK[prof]}</button>`;
}

// Saving throws: ability modifier, plus proficiency if proficient, plus bonuses to every save
// (a Ring of Protection, a Luckstone), which the heading lists in Play.
export function savesSection(sheet, { ed, p }) {
    const bonus = saveBonus(sheet);
    const bonusText = bonus ? `Includes ${sourcesText(saveBonuses(sheet))}` : '';
    let note = '';
    if (ed) note = '<small>tap circles to set proficiency</small>';
    else if (bonus) note = `<small>${esc(bonusText)}</small>`;
    const rows = AB.map(a => saveRow(sheet, a, ed, p, bonus, bonusText)).join('');
    return `<h2>Saving throws ${note}</h2><div class="list two">${rows}</div>`;
}

function saveRow(sheet, a, ed, p, bonus, bonusText) {
    const name = ABN[a];
    const prof = sheet.sv[a] ? 1 : 0;
    const total = abilityMod(score(sheet, a)) + prof * p + bonus;
    const mark = profButton('sv', a, `${name} save`, prof, PROF_LABEL[prof], ed);
    const roll = `<button class="rb" data-a="roll" data-l="${name} save" data-b="${total}" `
    + `aria-label="${name} save ${signed(total)}" title="${esc(bonusText)}">${signed(total)}</button>`;
    return `<div class="ln">${mark}<span class="g">${name}</span>${roll}</div>`;
}

// Skills: ability modifier, plus proficiency (doubled for Expertise), plus bonuses to every check.
// Advantage comes from features and items; armor with a Stealth penalty gives Stealth Disadvantage.
// Then Passive Perception: 10 + the Perception bonus, +5 with Advantage (PHB 2024).
export function skillsSection(sheet, view) {
    const { ed, p, CK, ckT, advT } = view;
    const noisy = wornWith(sheet, a => a.stl);
    const noisyText = noisy.length ? `Disadvantage from ${noisy.map(x => x.n).join(', ')}` : '';
    let note = '';
    if (ed) note = '<small>tap to cycle: none, proficient, expertise</small>';
    else if (CK) note = `<small>${esc(ckT)}</small>`;
    const rows = SK.map(([name, a]) => skillRow(sheet, view, name, a, noisy.length ? noisyText : '')).join('');

    const perceptionAdv = advT('Perception');
    const passive = 10 + abilityMod(score(sheet, 'wis')) + skillProf(sheet, 'Perception') * p + CK
    + (perceptionAdv ? 5 : 0);
    const passiveWhy = [ckT, perceptionAdv ? '+5 for Advantage' : ''].filter(Boolean).join('. ');
    return `<h2>Skills ${note}</h2><div class="list two">${rows}</div>
 <div class="ln" role="group" aria-label="Passive Perception"><span class="g">Passive Perception</span>`
    + `<span class="v" title="${esc(passiveWhy)}">${passive}</span></div>`;
}

// One skill. noisyText is set when worn armor gives Stealth Disadvantage.
function skillRow(sheet, { ed, p, CK, ckT, advT }, name, a, noisyText) {
    const prof = skillProf(sheet, name);
    // When a feature grants exactly this level, the mark's description names it.
    const grantedBy = prof && skillGranted(sheet, name) === prof
        ? skillGrants(sheet, name).filter(([, f]) => f[2] === prof).map(([x]) => x.n)
        : [];
    const profText = PROF_LABEL[prof] + (grantedBy.length ? ` (from ${grantedBy.join(', ')})` : '');
    const dis = name === 'Stealth' && noisyText;
    const adv = advT(name);
    const total = abilityMod(score(sheet, a)) + prof * p + CK;

    const disPill = dis ? ` <span class="pill dis" title="${esc(noisyText)}">Dis</span>` : '';
    const advPill = adv ? ` <span class="pill adv" title="${esc(adv)}">Adv</span>` : '';
    const why = [name === 'Stealth' ? noisyText : '', adv, ckT].filter(Boolean).join('. ');
    const roll = `<button class="rb" data-a="roll" data-l="${name}" data-b="${total}" `
    + `aria-label="${name} ${signed(total)}" ${dis ? `data-dis="1"` : ''} ${adv ? `data-adv="1"` : ''} `
    + `title="${esc(why)}">${signed(total)}</button>`;
    return `<div class="ln">${profButton('sk', name, name, prof, profText, ed)}`
    + `<span class="g">${name} <span class="a">${a}</span>${disPill}${advPill}</span>${roll}</div>`;
}
