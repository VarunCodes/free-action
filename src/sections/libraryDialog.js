// The Library dialog's contents: tabs, search, filter chips, the list of entries with Add and Remove, custom
// packs, and the credits. libraryui.js draws it and handles its buttons, which use data-library="…" (and
// data-filter, data-entry, data-add, data-remove), so the page's own data-a click handler leaves them alone.
import { html, raw, when } from '../html.js';
import { md, rarityTag, magicMark } from '../text.js';
import { KINDS } from '../library.js';
import { chipRow, isLaterClassFeature } from '../library/filters.js';
import { isOnSheet, ownedCount } from '../actions/library.js';

/**
 * view: { sheet, kind, query, filters, classNames, status ('idle', 'loading' or 'ready'), errors, library
 * (what loadLibrary gave, or null), shown and total (the search results), openEntries, packOpen, message }
 */
export function libraryDialogContent(view) {
    return html`
        <div class="dh"><h2>Library</h2><button data-library="close">Close</button></div>
        ${tabs(view.kind)}
        ${searchBox(view.kind, view.query)}
        ${filterChips(view)}
        <div class="lbody">${listBody(view)}</div>
        ${customPacks(view)}
        ${credits(view.library)}`;
}

function tabs(currentKind) {
    const buttons = KINDS.map(({ id, label }) => html`
        <button role="tab" data-kind="${id}" class="${when(id === currentKind, 'on')}"
            aria-selected="${id === currentKind}">${label}</button>`);
    return html`<div class="seg" role="tablist" aria-label="Library category">${buttons}</div>`;
}

function searchBox(kind, query) {
    const label = KINDS.find(({ id }) => id === kind).label.toLowerCase();
    const hint = kind === 'item' ? 'try weapon, armor or rare' : 'try a class name or level';
    return html`
        <input id="library-search" type="search" placeholder="Search ${label} (${hint})" value="${query}"
            aria-label="Search">`;
}

function filterChips({ kind, filters, classNames, library, sheet }) {
    // Class chips list the classes the Library has, so they wait until it's loaded.
    if (kind === 'class' && !library) return '';
    const row = chipRow(kind, filters, classNames, sheet.cls);
    if (!row) return '';
    const chips = row.chips.map(({ value, text, className }) => html`
        <button class="chip${when(row.current === value, ' on')}${className}" data-filter="${value}"
            aria-pressed="${row.current === value}">${text}</button>`);
    return html`<div class="chips" role="group" aria-label="${row.label}">${chips}</div>`;
}

function listBody(view) {
    const { status, errors, shown, total } = view;
    const noMatches = status === 'ready' && !errors.length && !total;
    return html`
        ${when(status === 'loading', html`<p class="empty">Loading the 2024 SRD…</p>`)}
        ${when(errors.length, () => html`
            <p class="err">Could not load: ${errors.join('; ')}. Check your connection, then
                <button data-library="retry">Retry</button></p>`)}
        ${when(noMatches, html`<p class="empty">No matches. Try a shorter search.</p>`)}
        ${shown.map((entry, index) => entryRow(view, entry, index))}
        ${when(total > shown.length, () => html`
            <p class="empty">Showing ${shown.length} of ${total}. Narrow the search to see the rest.</p>`)}`;
}

// The open state is kept per row, so the same name in another tab or place in the list opens separately.
export const entryId = (kind, entry, index) => `${kind}:${entry.name}:${index}`;

function entryRow({ sheet, kind, openEntries }, entry, index) {
    const id = entryId(kind, entry, index);
    const isOpen = openEntries.has(id);
    const isLater = isLaterClassFeature(sheet, entry);
    const notes = [
        entry.src === 'Custom' ? ' (custom)' : '',
        isLater ? ` · you're level ${sheet.level}` : '',
    ].join('');
    return html`
        <div class="lrow${when(isLater, ' later')}">
            <div class="lhd">
                <button class="lk" data-entry="${id}" aria-expanded="${isOpen}">
                    <span>${raw(magicMark(entry.rr))}${entry.name}${raw(rarityTag(entry.rr))}</span>
                    <small>${entry.sub}${notes}</small>
                </button>
                ${isOnSheet(sheet, entry) ? removeButton(kind, index) : addButton(sheet, kind, entry, index)}
            </div>
            ${when(isOpen, () => html`<p class="sd">${raw(md(entry.desc) || 'No description.')}</p>`)}
        </div>`;
}

function removeButton(kind, index) {
    return html`
        <button class="bad" data-remove="${index}"
            title="On your sheet. Click to remove it.">${kind === 'race' ? 'Remove species' : 'Remove'}</button>`;
}

function addButton(sheet, kind, entry, index) {
    return html`<button class="pri" data-add="${index}">${addLabel(sheet, kind, entry)}</button>`;
}

function addLabel(sheet, kind, entry) {
    if (kind === 'race') return sheet.species ? 'Switch species' : 'Add species';
    const owned = ownedCount(sheet, entry);
    return owned ? `Add (have ${owned})` : 'Add';
}

function customPacks({ library, packOpen, message }) {
    const savedCount = library && library.packCount ? `(${library.packCount} saved)` : '';
    return html`
        <details class="pack" ${when(packOpen, 'open')}>
            <summary>Custom content ${savedCount}</summary>
            <p class="sub">Paste JSON for homebrew or books you own.
                It stays in this browser and appears in search above.</p>
            <textarea id="library-pack"
                placeholder='[{"kind":"feat","name":"My Feat","sub":"General feat","desc":"What it does"}]'></textarea>
            <div class="row">
                <button data-library="import-pack">Import</button>
                <button class="bad" data-library="clear-packs">Remove all custom content</button>
            </div>
            ${when(message, () => html`<p class="sub" role="status">${message}</p>`)}
        </details>`;
}

function credits(library) {
    const savedOn = library && library.at
        ? `SRD data saved ${new Date(library.at).toLocaleDateString(undefined, { dateStyle: 'medium' })} · `
        : '';
    return html`
        <p class="sub foot">${savedOn}Rules content: SRD 5.2 by Wizards of the Coast, CC-BY 4.0, via Open5e.
            ${when(library, () => html`<button data-library="redownload">Re-download</button>`)}</p>`;
}
