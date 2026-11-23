// The roll bar along the bottom: the last roll's result, then the roll mode, the chat command to copy,
// and (under "VTT format and custom roll") the chat format and a box for any dice.
import { chatCommand } from '../rolls.js';
import { html, when } from '../html.js';

const MODES = [['', 'Normal'], ['adv', 'Adv'], ['dis', 'Dis']];
const CHAT_FORMATS = [['foundry', 'Foundry (/r)'], ['roll20', 'Roll20 (/roll)'], ['roll20t', 'Roll20 template']];

/**
 * The roll bar. ui holds what isn't saved in the sheet:
 * lastRoll (or null), rollError (text, shown when there's no roll), mode ('', 'adv' or 'dis'),
 * copied (the chat command was copied), customDice (what's in the Custom dice box),
 * minimized (only the result shows) and isOpen(id) for the options panel.
 */
export function rollBarSection(sheet, ui) {
    const toggleLabel = ui.minimized ? 'Show roll options' : 'Hide roll options';
    return html`
        <div class="rp${ui.minimized ? ' min' : ''}"><div class="rpi">
            <button class="hd rt" data-a="rmin" aria-expanded="${!ui.minimized}"
                aria-label="${toggleLabel}" title="${toggleLabel}"></button>
            <div class="rr">${rollResult(ui)}</div>
            ${when(!ui.minimized, () => rollOptions(sheet, ui))}
        </div></div>`;
}

function rollResult({ lastRoll, rollError }) {
    if (lastRoll) {
        return html`
            <output class="tot" aria-label="Roll total">${lastRoll.total}</output>
            <span>${lastRoll.label} ${lastRoll.detail}</span>
            ${when(lastRoll.crit, () => html`<span class="crit">${lastRoll.crit}</span>`)}`;
    }
    if (rollError) return html`<span class="reqn" role="alert">${rollError}</span>`;
    return html`<span class="sub">Tap any modifier to roll</span>`;
}

function rollOptions(sheet, ui) {
    const modeButtons = MODES.map(([mode, label]) => html`
        <button data-a="rm" data-v="${mode}" class="${ui.mode === mode ? 'on' : ''}"
            aria-pressed="${ui.mode === mode}">${label}</button>`);
    const formatOptions = CHAT_FORMATS.map(([format, label]) => html`
        <option value="${format}" ${when(sheet.vtt === format, 'selected')}>${label}</option>`);
    return html`
        <div class="rc">
            <div class="seg" role="group" aria-label="Roll mode">${modeButtons}</div>
            <input id="cmd" readonly value="${chatCommand(ui.lastRoll, sheet.vtt)}"
                placeholder="Chat command" aria-label="Chat command">
            <button class="pri" data-a="cp" ${when(!ui.lastRoll, 'disabled')}>${ui.copied ? 'Copied' : 'Copy'}</button>
        </div>
        <details data-id="more" ${when(ui.isOpen('more'), 'open')}>
            <summary>VTT format and custom roll</summary>
            <div class="rc">
                <select data-k="vtt" aria-label="Chat format">${formatOptions}</select>
                <input id="cx" placeholder="2d6+3" value="${ui.customDice}" aria-label="Custom dice">
                <button data-a="cx">Roll</button>
            </div>
        </details>`;
}
