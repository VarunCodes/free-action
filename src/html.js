// The html`…` tag for writing the page's markup, and small pieces of HTML several sections share.
import { esc } from './text.js';
import { signed } from './rules.js';

class SafeHtml {
    constructor(markup) {
        this.markup = markup;
    }

    toString() {
        return this.markup;
    }
}

/** Marks markup as safe to put in the page unescaped. Only for HTML that's already safe, such as md()'s. */
export const raw = markup => new SafeHtml(String(markup ?? ''));

/**
 * The markup if the condition holds, otherwise nothing: ${when(editing, removeButton)}.
 * Pass a function when the markup can only be built if the condition holds: when(item, () => item.n).
 */
export function when(condition, markup) {
    if (!condition) return '';
    return typeof markup === 'function' ? markup() : markup;
}

function asMarkup(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(asMarkup).join('');
    if (value instanceof SafeHtml) return value.markup;
    return esc(value);
}

// HTML laid out across lines for reading becomes compact markup, as the browser would read it.
const dropLineBreaksBetweenTags = text => text.replace(/(^|>)\s*\n\s*(?=<|$)/g, '$1');
const lineBreaksToSpaces = text => text.replace(/\s*\n\s*/g, ' ');

/**
 * Markup from a template written like HTML. Every ${value} is escaped unless it's html`…` itself or raw(…);
 * lists are joined; null and undefined add nothing (use when() for optional parts).
 */
export function html(strings, ...values) {
    let markup = '';
    strings.forEach((text, index) => {
        markup += lineBreaksToSpaces(dropLineBreaksBetweenTags(text));
        if (index < values.length) markup += asMarkup(values[index]);
    });
    return new SafeHtml(markup);
}

// Every bound field gets an id from its key (f-hp-max), so a visible label can point at it with for=.
export const fieldId = key => 'field-' + key.split('.').join('-');

// An input bound to a path in the sheet through data-field, such as 'hp.max' or 'ab.str'. extra holds more
// attributes, written by the code (min=1 max=30 aria-label="…"), so it goes in as it is.
export const input = (key, value, type = 'text', extra = '') =>
    html`<input id="${fieldId(key)}" data-field="${key}" type="${type}" value="${value}" ${raw(extra)}>`;

// An input with a visible label above it.
export const field = (label, key, value, type, extra) =>
    html`<div><label class="lab" for="${fieldId(key)}">${label}</label>${input(key, value, type, extra)}</div>`;

// Proficiency marks by level (0 none, 1 proficient, 2 Expertise): an empty ring, the same ring with
// a dot inside, and a diamond. The labels say the same in words.
export const PROF_MARK = [raw('<i class="pm"></i>'), raw('<i class="pm on"></i>'), raw('◆')];
export const PROF_LABEL = ['Not proficient', 'Proficient', 'Expertise'];

// "Ring of Protection +1, Stone of Good Luck +1" from [[name, value], ...].
export const sourcesText = list => list.map(([name, value]) => `${name} ${signed(value)}`).join(', ');
