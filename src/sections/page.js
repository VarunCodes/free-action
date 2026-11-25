// The page under the header: three columns of sections. On phones the columns dissolve into one, and each
// section's place in READING_ORDER puts them back in an order that reads well top to bottom.
import { html } from '../html.js';

const COLUMNS = [
    ['vitals', 'abilities', 'saves', 'skills'],
    ['inventory', 'spells'],
    ['features', 'racialFeatures', 'notes', 'backup'],
];

const READING_ORDER = [
    'vitals', 'abilities', 'saves', 'skills', 'features', 'racialFeatures', 'inventory', 'spells', 'notes', 'backup',
];

/** The columns, from each section's markup by name: { vitals, abilities, … }. */
export function pageLayout(sections) {
    const columns = COLUMNS.map(names => html`
        <div class="col">${names.map(name => section(sections[name], READING_ORDER.indexOf(name) + 1))}</div>`);
    return html`<div class="grid">${columns}</div>`;
}

function section(content, order) {
    return html`<section class="c" style="order:${order}">${content}</section>`;
}
