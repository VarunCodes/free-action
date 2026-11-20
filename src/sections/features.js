// Features and feats, and racial features: two lists that work the same way.
//
// A feature keeps its name in `n`, its type in `t` ("Class feature", "Feat"; racial traits have none) and
// its description in `d`. Its effects come from featureEffects() (src/rules.js), and a skill it lets you
// choose is stored in `ch`, one pick per choice.
import { SK } from '../sheet.js';
import { featureEffects } from '../rules.js';
import { md } from '../text.js';
import { html, raw, when } from '../html.js';
import { effectLabel } from '../effects.js';

const ALL_SKILLS = SK.map(([skill]) => skill);

/** Features and feats. ui.isOpen(id) says whether a feature is open in Play ('feats.' + index). */
export function featuresSection(sheet, { editing }, ui) {
    return featureList(sheet, { title: 'Features and feats', key: 'feats', hasType: true }, editing, ui);
}

/** Racial features, the species' traits. Opened the same way ('race.' + index). */
export function racialFeaturesSection(sheet, { editing }, ui) {
    return featureList(sheet, { title: 'Racial features', key: 'race', hasType: false }, editing, ui);
}

function featureList(sheet, list, editing, ui) {
    const features = sheet[list.key];
    const rows = features.map((feature, index) => featureRow(feature, `${list.key}.${index}`, editing, ui));
    return html`
        <h2>${list.title}</h2>
        ${features.length ? rows : html`<div class="empty">None yet.</div>`}
        ${when(editing, () => addFeatureRow(list))}`;
}

// A feature opens to show its description: always in Edit, where the description becomes a text box,
// and in Play when tapped. What it changes shows next to its name in Play and under it in Edit.
function featureRow(feature, id, editing, ui) {
    const effects = effectsLine(feature, id, editing);
    const removeButton = html`
        <button class="x" data-a="delft" data-v="${id}" aria-label="Remove ${feature.n}">✕</button>`;
    const description = md(feature.d);
    const body = editing
        ? html`<textarea data-k="${id}.d" placeholder="Description"
            aria-label="${feature.n} description">${feature.d}</textarea>`
        : html`<p>${description ? raw(description) : 'No description.'}</p>`;

    return html`
        <details class="ft" data-id="${id}" ${when(editing || ui.isOpen(id), 'open')}>
            <summary>
                <span class="g">${feature.n}</span>
                ${when(feature.t, () => html`<span class="pill">${feature.t}</span>`)}
                ${when(editing, removeButton)}
                ${when(!editing && effects, () => html` ${effects}`)}
            </summary>
            ${when(editing && effects, () => html`<div class="srl fxl">${effects}</div>`)}
            ${body}
        </details>`;
}

// What the feature changes, as short labels separated by spaces. In Edit, a skill it lets you choose
// becomes a drop-down instead ("Brakka skill 1", "Brakka skill 2" when there are several).
function effectsLine(feature, id, editing) {
    const effects = featureEffects(feature);
    const choiceCount = effects.filter(isSkillChoice).length;
    let choiceIndex = 0;
    const parts = effects.map(effect => {
        if (!editing || !isSkillChoice(effect)) return html`<span class="a">${effectLabel(effect)}</span>`;
        const choice = { id: `${id}.${choiceIndex}`, number: choiceIndex + 1, count: choiceCount };
        choiceIndex++;
        return skillChoice(feature, effect, choice);
    });
    return parts.length ? raw(parts.join(' ')) : '';
}

// A skill effect whose skill the player picks: '?' for any skill, '?Arcana|History' for one of a list.
const isSkillChoice = ([type, , , choice]) => type === 'sk' && Boolean(choice);

function skillChoice(feature, [, picked, , offered], choice) {
    const skills = offered === '?' ? ALL_SKILLS : offered.slice(1).split('|');
    const label = `${feature.n} skill${choice.count > 1 ? ` ${choice.number}` : ''}`;
    const options = skills.map(skill => html`<option ${when(picked === skill, 'selected')}>${skill}</option>`);
    return html`
        <select data-ch="${choice.id}" aria-label="${label}">
            <option value="">Choose a skill</option>${options}
        </select>`;
}

// Edit: a name box and Add, plus the type for features and feats.
function addFeatureRow({ key, hasType }) {
    const what = key === 'race' ? 'racial feature' : 'feature';
    return html`
        <div class="add">
            <input class="n" id="ftn-${key}" placeholder="Name" aria-label="New ${what} name">
            ${when(hasType, html`
                <select id="ftt-${key}" aria-label="New feature type">
                    <option>Class feature</option><option>Feat</option>
                </select>`)}
            <button class="pri" data-a="addft" data-v="${key}">Add</button>
        </div>`;
}
