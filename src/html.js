// Everything that builds HTML outside src/sections/: the html`…` tag the sections write with, escaping, the
// markdown renderer for descriptions, and small pieces of HTML several sections share.
import { RARITY } from './text.js';
import { signed } from './rules.js';

// Makes any value safe to put in HTML, text or an attribute.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, character => ENTITIES[character]);

// A small, safe markdown renderer for SRD descriptions: escapes everything, then allows **bold**, *italic* and
// _italic_. Headings lose their #s, and table rows become "a / b / c".
export function markdownToHtml(markdown) {
    if (!markdown) return '';
    const isTableRule = line => line.includes('|') && line.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
    const lines = String(markdown).split('\n').filter(line => !isTableRule(line));
    const plainLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('|')) {
            return trimmed.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()).join(' / ');
        }
        return line.replace(/^#{1,6}\s*/, '');
    });
    return escapeHtml(plainLines.join('\n'))
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
        .replace(/_([^_\n]+)_/g, '<i>$1</i>');
}

class SafeHtml {
    constructor(markup) {
        this.markup = markup;
    }

    toString() {
        return this.markup;
    }
}

/** Marks markup as safe to put in the page unescaped. Only for HTML that's already safe, like markdownToHtml's. */
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
    return escapeHtml(value);
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

// Every bound field gets an id from its key (field-hp-max), so a visible label can point at it with for=.
export const fieldId = key => 'field-' + key.split('.').join('-');

// An input bound to a path in the sheet through data-field, such as 'hp.max' or 'ab.str'. extra holds more
// attributes, written by the code (min=1 max=30). It goes in as it is, so any value in it that came from the
// player is written with html`…`, which escapes it: html`aria-label="${spell.n} dice"`.
export const input = (key, value, type = 'text', extra = '') =>
    html`<input id="${fieldId(key)}" data-field="${key}" type="${type}" value="${value}" ${raw(extra)}>`;

// An input with a visible label above it.
export const field = (label, key, value, type, extra) =>
    html`<div><label class="lab" for="${fieldId(key)}">${label}</label>${input(key, value, type, extra)}</div>`;

// Proficiency marks by level (0 none, 1 proficient, 2 Expertise): an empty ring, the same ring with
// a dot inside, and a diamond. The labels say the same in words.
export const PROFICIENCY_MARK = [raw('<i class="pm"></i>'), raw('<i class="pm on"></i>'), raw('◆')];
export const PROFICIENCY_LABEL = ['Not proficient', 'Proficient', 'Expertise'];

// Ranks 1 (Common) to 6 (Artifact) get a mark; 0 is mundane gear, which gets none.
const isMagicRank = rank => rank > 0 && rank < RARITY.length;

// A magic item's rarity as a colored tag after its name: " Rare".
export const rarityTag = rank =>
    when(isMagicRank(rank), () => html` <span class="rar r${rank}">${RARITY[rank]}</span>`);

// A ✦ before a magic item's name, in its rarity's color. Hidden from screen readers, because the tag says it.
export const magicMark = rank =>
    when(isMagicRank(rank), () => html`<span class="mm r${rank}" aria-hidden="true">✦</span>`);

// "Ring of Protection +1, Stone of Good Luck +1" from [[name, value], ...].
export const sourcesText = list => list.map(([name, value]) => `${name} ${signed(value)}`).join(', ');
