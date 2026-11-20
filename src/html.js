// Writing HTML for the page, and small pieces of it that several sections use.
//
// Sections write their HTML with the html`…` tag, laid out like the HTML itself:
//
//     return html`
//         <div class="add">
//             <input class="n" id="spn" aria-label="New spell name">
//             <button class="pri" data-a="addsp">Add</button>
//         </div>`;
//
// What the tag does:
//   - A line break and the indentation around it is removed between two tags, and next to a ${…} at the
//     start or end of a line, so the page gets compact markup. Anywhere else (inside a tag, or in text)
//     it becomes one space, as in plain HTML. So a long tag can be split across lines, but a space you
//     mean before an inline element (" <span…") has to stay on the line.
//   - Every value put in with ${…} is escaped, so text from the sheet or the Library can't become markup.
//     The exceptions are HTML made by html`…` itself (nested templates, input(), field()) and raw(…),
//     for HTML that's already safe, such as md()'s output.
//   - A list puts its items in one after another; false, null and undefined put in nothing. So
//     ${editing && removeButton} works, as long as the condition is a true boolean: a 0 would show "0".
//     For an attribute that needs the words true or false (aria-pressed), write them out:
//     ${pressed ? 'true' : 'false'}.
import { esc } from './text.js';
import { signed } from './rules.js';

// HTML that's safe to put in the page as it is. Turns into its markup wherever a string is expected.
class SafeHtml {
    constructor(markup) {
        this.markup = markup;
    }

    toString() {
        return this.markup;
    }
}

// Marks markup as safe without escaping it. Only for HTML that's already escaped or made by the app.
export const raw = markup => new SafeHtml(String(markup ?? ''));

// A value as it goes into the page: nothing, a list's items, safe HTML as it is, anything else escaped.
function asMarkup(value) {
    if (value === false || value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(asMarkup).join('');
    if (value instanceof SafeHtml) return value.markup;
    return esc(value);
}

// The html`…` tag (see the top of this file).
export function html(strings, ...values) {
    let markup = '';
    strings.forEach((text, index) => {
        markup += text.replace(/(^|>)\s*\n\s*(?=<|$)/g, '$1').replace(/\s*\n\s*/g, ' ');
        if (index < values.length) markup += asMarkup(values[index]);
    });
    return new SafeHtml(markup);
}

// Every bound field gets an id from its key (f-hp-max), so a visible label can point at it with for=.
export const fieldId = key => 'f-' + key.split('.').join('-');

// An input bound to a path in the sheet through data-k, such as 'hp.max' or 'ab.str'. extra holds more
// attributes, written by the code (min=1 max=30 aria-label="…"), so it goes in as it is.
export const input = (key, value, type = 'text', extra = '') =>
    html`<input id="${fieldId(key)}" data-k="${key}" type="${type}" value="${value}" ${raw(extra)}>`;

// An input with a visible label above it.
export const field = (label, key, value, type, extra) =>
    html`<div><label class="lab" for="${fieldId(key)}">${label}</label>${input(key, value, type, extra)}</div>`;

// Proficiency marks by level (0 none, 1 proficient, 2 Expertise): an empty ring, the same ring with
// a dot inside, and a diamond. The labels say the same in words.
export const PROF_MARK = [raw('<i class="pm"></i>'), raw('<i class="pm on"></i>'), raw('◆')];
export const PROF_LABEL = ['Not proficient', 'Proficient', 'Expertise'];

// "Ring of Protection +1, Stone of Good Luck +1" from [[name, value], ...].
export const sourcesText = list => list.map(([name, value]) => `${name} ${signed(value)}`).join(', ');
