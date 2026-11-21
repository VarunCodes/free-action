// Vitals: Armor Class, Initiative, Speed and proficiency, then hit points and hit dice.
// In Edit, most boxes become fields, and the AC settings appear underneath.
import {
    abilityMod, signed, score, hitDie, hitDiceLeft, averageHP, effectsOf,
    armorClass, currentAC, currentSpeed, unmetStrength,
} from '../rules.js';
import { html, when, input, field } from '../html.js';

/** The Vitals section. ui.amount is the number in the Damage/Heal box, kept between renders. */
export function vitalsSection(sheet, view, ui) {
    return html`
        <h2>Vitals</h2>
        <div class="vitals">
            ${armorClassBox(sheet, view)}
            ${initiativeBox(sheet, view)}
            ${speedBox(sheet, view)}
            <div class="vit" role="group" aria-label="Proficiency">
                <b>${signed(view.proficiency)}</b><span class="lab">Proficiency</span>
            </div>
        </div>
        ${hitPointsBox(sheet, view, ui.amount)}
        ${when(view.editing, () => armorClassSettings(sheet))}`;
}

// A calculated AC's tooltip lists what it's made of, one part per line ("Chain Mail +16").
function armorClassBox(sheet, { editing }) {
    const breakdown = sheet.acAuto
        ? armorClass(sheet).parts.map(([name, value]) => `${name} ${signed(value)}`).join('\n')
        : 'Typed in by hand';
    const typedByHand = editing && !sheet.acAuto;
    const inside = typedByHand
        ? field('AC', 'ac', sheet.ac, 'number')
        : html`<b>${currentAC(sheet)}</b><span class="lab">Armor class</span>`;
    return html`<div class="vit" role="group" aria-label="Armor class" title="${breakdown}">${inside}</div>`;
}

// Initiative: Dex modifier, plus the bonus typed in Edit, plus bonuses to ability checks. Tapping it rolls.
function initiativeBox(sheet, { editing, checkBonus, checkBonusSources, advantageSources }) {
    if (editing) {
        const bonusField = field('Init bonus', 'init', sheet.init, 'number', 'min=-20 max=20');
        return html`<div class="vit">${bonusField}</div>`;
    }
    const bonus = abilityMod(score(sheet, 'dex')) + sheet.init + checkBonus;
    const advantage = advantageSources('init');
    const tooltip = [checkBonusSources, advantage].filter(Boolean).join('. ');
    return html`
        <div class="vit">
            <button class="bigb" data-a="roll" data-l="Initiative" data-b="${bonus}"
                aria-label="Initiative ${signed(bonus)}" ${when(advantage, html`data-adv="1"`)}
                title="${tooltip}">${signed(bonus)}</button>
            <span class="lab">Initiative${when(advantage, html` <span class="pill adv">Adv</span>`)}</span>
        </div>`;
}

// Speed is 10 ft slower while wearing armor you're not strong enough for; the tooltip says which.
function speedBox(sheet, { editing }) {
    if (editing) {
        return html`
            <div class="vit" role="group" aria-label="Speed">
                ${field('Speed', 'speed', sheet.speed, 'number', 'min=0 max=999')}
            </div>`;
    }
    const speed = currentSpeed(sheet);
    const slowed = speed < sheet.speed;
    const tooHeavy = unmetStrength(sheet).map(item => `${item.n} needs Str ${item.ar.str}`).join(', ');
    const tooltip = `${sheet.speed} ft, minus 10 ft: ${tooHeavy}`;
    return html`
        <div class="vit" role="group" aria-label="Speed">
            <b class="${when(slowed, 'slow')}" ${when(slowed, () => html`title="${tooltip}"`)}>${speed}</b>
            <span class="lab">Speed${when(slowed, html` <span class="pill dis">&minus;10 ft</span>`)}</span>
        </div>`;
}

// Current and max HP with a bar, Damage/Heal/Set temp, hit dice, Long rest and Heroic Inspiration.
// In Edit, also the HP fields and the fixed-average max HP for the class.
function hitPointsBox(sheet, { editing }, amount) {
    const { cur: current, max, temp } = sheet.hp;
    const percent = Math.max(0, Math.min(100, max ? current / max * 100 : 0));
    const tempPill = when(temp, () => html`<span class="pill">+${temp} temp</span>`);
    return html`
        <div class="hp">
            <div class="hpn" role="group" aria-label="Hit points">
                <b>${current}</b><span>/ ${max} HP</span>${tempPill}
            </div>
            <div class="bar ${when(percent < 25, 'low')}"><i style="width:${percent}%"></i></div>
            <div class="row">
                <input id="amt" type="number" min="0" value="${amount}" aria-label="Amount">
                <button class="bad" data-a="dmg">Damage</button>
                <button class="pri" data-a="heal">Heal</button>
                <button data-a="temp">Set temp</button>
            </div>
            ${when(editing, () => hitPointFields(sheet))}
            ${when(hitDie(sheet), () => hitDiceRow(sheet))}
            <div class="row" style="margin-top:8px">
                <button data-a="long">Long rest</button>
                <label class="row" style="margin-left:auto">
                    <input type="checkbox" data-k="insp" ${when(sheet.insp, 'checked')}> Heroic Inspiration</label>
            </div>
        </div>`;
}

function hitPointFields(sheet) {
    const fields = html`
        <div class="row" style="margin-top:8px">
            ${field('Max HP', 'hp.max', sheet.hp.max, 'number', 'min=1 max=9999')}
            ${field('Current HP', 'hp.cur', sheet.hp.cur, 'number', `min=0 max=${sheet.hp.max}`)}
        </div>`;
    if (!hitDie(sheet)) return fields;
    const average = averageHP(sheet);
    const alreadyUsed = average === sheet.hp.max;
    const useButton = html`<button data-a="avghp" ${when(alreadyUsed, 'disabled')}>Use ${average}</button>`;
    const sources = averageHPSources(sheet);
    return html`
        ${fields}
        <p class="sub hds">Average max HP for level ${sheet.level} (${sources}): <b>${average}</b> ${useButton}</p>`;
}

// "d10, Con +2, Dwarven Toughness +1/level"
function averageHPSources(sheet) {
    const conModifier = abilityMod(score(sheet, 'con'));
    const perLevel = effectsOf(sheet, 'hp').map(([source, [, , value]]) => `, ${source.n} ${signed(value)}/level`);
    return `d${hitDie(sheet)}, Con ${signed(conModifier)}${perLevel.join('')}`;
}

// A short rest spends one hit die at a time. The button's tooltip says what it does, or why it can't.
function hitDiceRow(sheet) {
    const left = hitDiceLeft(sheet);
    const hurt = sheet.hp.cur < sheet.hp.max;
    const die = hitDie(sheet);
    const conModifier = abilityMod(score(sheet, 'con'));
    let tooltip = 'Already at full HP';
    if (!left) tooltip = 'No hit dice left. A long rest gives them all back.';
    else if (hurt) tooltip = `Short rest: roll d${die} ${signed(conModifier)} and heal that much`;
    return html`
        <div class="row hds" style="margin-top:8px">
            <span>Hit dice <b>${left}</b> of ${sheet.level} (d${die})</span>
            <button data-a="hd" ${when(!left || !hurt, 'disabled')} title="${tooltip}">Spend a hit die</button>
        </div>`;
}

// Edit only: whether AC comes from equipped gear, and a bonus of your own on top.
function armorClassSettings(sheet) {
    const bonusField = html`
        <label class="row">Other AC bonus
            ${input('acb', sheet.acb, 'number', 'min=-10 max=20 style="width:72px" aria-label="Other AC bonus"')}
        </label>`;
    const calculated = sheet.acAuto;
    return html`
        <div class="row acset">
            <label class="row">
                <input type="checkbox" data-k="acAuto" ${when(calculated, 'checked')}> Calculate AC from equipped gear</label>
            ${when(calculated, bonusField)}
        </div>`;
}
