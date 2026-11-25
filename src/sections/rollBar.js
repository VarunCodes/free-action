// The roll bar along the bottom: the last roll's result, then the roll mode, the chat command to copy,
// and (under "VTT format and custom roll") the chat format and a box for any dice.
import { chatCommand } from '../rolls.js';
import { html, when } from '../html.js';

const MODES = [['', 'Normal'], ['adv', 'Adv'], ['dis', 'Dis']];
const CHAT_FORMATS = [['foundry', 'Foundry (/r)'], ['roll20', 'Roll20 (/roll)'], ['roll20t', 'Roll20 template']];

/** The roll bar, from the roll state in ui.js. isOpen(id) says whether the options panel is open. */
export function rollBarSection(sheet, roll, isOpen) {
    const toggleLabel = roll.minimized ? 'Show roll options' : 'Hide roll options';
    return html`
        <div class="rp${roll.minimized ? ' min' : ''}"><div class="rpi">
            <button class="hd rt" data-action="toggle-roll-options" aria-expanded="${!roll.minimized}"
                aria-label="${toggleLabel}" title="${toggleLabel}"></button>
            <div class="rr">${rollResult(roll)}</div>
            ${when(!roll.minimized, () => rollOptions(sheet, roll, isOpen))}
        </div></div>`;
}

function rollResult({ last, error }) {
    if (last) {
        return html`
            <output class="tot" aria-label="Roll total">${last.total}</output>
            <span>${last.label} ${last.detail}</span>
            ${when(last.critical, () => html`<span class="crit">${last.critical}</span>`)}`;
    }
    if (error) return html`<span class="reqn" role="alert">${error}</span>`;
    return html`<span class="sub">Tap any modifier to roll</span>`;
}

function rollOptions(sheet, roll, isOpen) {
    const modeButtons = MODES.map(([mode, label]) => html`
        <button data-action="set-roll-mode" data-value="${mode}" class="${roll.mode === mode ? 'on' : ''}"
            aria-pressed="${roll.mode === mode}">${label}</button>`);
    const formatOptions = CHAT_FORMATS.map(([format, label]) => html`
        <option value="${format}" ${when(sheet.vtt === format, 'selected')}>${label}</option>`);
    return html`
        <div class="rc">
            <div class="seg" role="group" aria-label="Roll mode">${modeButtons}</div>
            <input id="chat-command" readonly value="${chatCommand(roll.last, sheet.vtt)}"
                placeholder="Chat command" aria-label="Chat command">
            <button class="pri" data-action="copy-roll"
                ${when(!roll.last, 'disabled')}>${roll.copied ? 'Copied' : 'Copy'}</button>
        </div>
        <details data-section="roll-options" ${when(isOpen('roll-options'), 'open')}>
            <summary>VTT format and custom roll</summary>
            <div class="rc">
                <select data-field="vtt" aria-label="Chat format">${formatOptions}</select>
                <input id="custom-dice" placeholder="2d6+3" value="${roll.customDice}" aria-label="Custom dice">
                <button data-action="roll-custom-dice">Roll</button>
            </div>
        </details>`;
}
