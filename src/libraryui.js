// The Library dialog: opening it, loading the Library into it, redrawing it, and what its buttons do. The
// markup is in sections/libraryDialog.js; what Add and Remove change on the sheet is in actions/library.js.
import { loadLibrary, search, importPack, clearPacks } from './library.js';
import { libraryDialogContent } from './sections/libraryDialog.js';
import { newFilters, passesFilter, classNamesIn } from './library/filters.js';
import { addToSheet, removeFromSheet } from './actions/library.js';

const state = {
    dialog: null,
    // What loadLibrary gave: { items, at, errors, packCount }, or null before the first load.
    library: null,
    status: 'idle', // 'idle', 'loading' or 'ready'
    errors: [],
    kind: 'spell', // the open tab
    query: '',
    filters: newFilters(),
    // The class filter starts on the character's class, and again whenever the class changes; a chip the
    // player picks sticks until then. This is the class it was last set for.
    classFilterSetFor: null,
    // The ids of the entries whose descriptions are open (see entryId).
    openEntries: new Set(),
    // The list as drawn, so Add and Remove can find their entry by its place in it.
    shown: [],
    packOpen: false,
    // The result of the last pack import or removal.
    message: '',
    // Put the cursor back in the search box after the next redraw.
    focusSearch: false,
    // Whether the last press started on the backdrop (see closesOnClick).
    pressStartedOutside: false,
};

// Set each time the Library opens: how to read the current sheet, and what to tell the page after a change.
let getSheet;
let onSheetChange;

/**
 * Opens the Library. getCurrentSheet returns the sheet; changed(removedSomething) is called after Add or
 * Remove, with true when list places on the sheet may have moved.
 */
export function openLibrary(getCurrentSheet, changed) {
    getSheet = getCurrentSheet;
    onSheetChange = removedSomething => {
        changed(Boolean(removedSomething));
        redraw();
    };
    if (!state.dialog) state.dialog = createDialog();
    if (!state.dialog.open) state.dialog.showModal();
    state.focusSearch = true;
    if (state.library) redraw();
    else load(false);
}

function createDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'lib';
    dialog.setAttribute('aria-label', 'Library');
    document.body.appendChild(dialog);
    dialog.addEventListener('toggle', event => {
        if (event.target.classList.contains('pack')) state.packOpen = event.target.open;
    }, true);
    dialog.addEventListener('input', event => {
        if (event.target.id !== 'library-search') return;
        state.query = event.target.value;
        state.focusSearch = true;
        redraw({ toTop: true });
    });
    dialog.addEventListener('pointerdown', event => {
        state.pressStartedOutside = isOnBackdrop(dialog, event);
    });
    dialog.addEventListener('click', event => onDialogClick(dialog, event));
    return dialog;
}

async function load(force) {
    state.status = 'loading';
    state.errors = [];
    redraw();
    try {
        state.library = await loadLibrary({ force });
        state.errors = state.library.errors;
        window.dispatchEvent(new Event('library-loaded'));
    } catch (error) {
        state.errors = [error.message || 'unknown error'];
    }
    state.status = 'ready';
    redraw();
}

// Drawing

/**
 * Redraws the dialog. Redrawing replaces its contents, which would jump the list back to the top: a new list
 * (tab, search, filter) starts at the top, and anything else (open a description, Add, Remove) keeps the
 * scroll position. Either way, keyboard focus goes back to the same control, so it never drops to the page
 * behind.
 */
function redraw({ toTop = false } = {}) {
    const dialog = state.dialog;
    const list = dialog.querySelector('.lbody');
    const scroll = !toTop && list ? { list: list.scrollTop, dialog: dialog.scrollTop } : null;
    const focused = focusedControl(dialog);

    dialog.innerHTML = String(libraryDialogContent(dialogView(getSheet())));

    const toSearchBox = state.focusSearch;
    if (toSearchBox) focusSearchBox(dialog);
    if (scroll) {
        dialog.querySelector('.lbody').scrollTop = scroll.list;
        dialog.scrollTop = scroll.dialog;
    }
    if (focused && !toSearchBox) dialog.querySelector(focused)?.focus({ preventScroll: true });
}

// What the dialog shows, worked out from the state and the sheet.
function dialogView(sheet) {
    const entries = state.library ? state.library.items : [];
    const classNames = classNamesIn(entries);
    if (state.library && sheet.cls !== state.classFilterSetFor) {
        state.classFilterSetFor = sheet.cls;
        state.filters.class = classNames.includes(sheet.cls) ? sheet.cls : 'all';
    }
    const filtered = entries.filter(entry => passesFilter(entry, state.filters));
    const { shown, total } = state.library ? search(filtered, state.kind, state.query) : { shown: [], total: 0 };
    state.shown = shown;
    return { ...state, sheet, classNames, shown, total };
}

function focusSearchBox(dialog) {
    const searchBox = dialog.querySelector('#library-search');
    searchBox.focus();
    searchBox.setSelectionRange(searchBox.value.length, searchBox.value.length);
    state.focusSearch = false;
}

// A selector that finds the focused control again after a redraw, by its id or its data attribute, or ''.
// Add and Remove share a spot, so after either the one now in its place is focused.
function focusedControl(dialog) {
    const active = document.activeElement;
    if (!active || active === dialog || !dialog.contains(active)) return '';
    if (active.id === 'library-search') {
        state.focusSearch = true;
        return '';
    }
    if (active.id) return '#' + CSS.escape(active.id);
    const { add, remove } = active.dataset;
    if (add || remove) return `[data-add="${add || remove}"],[data-remove="${add || remove}"]`;
    const [key] = Object.keys(active.dataset);
    if (!key) return '';
    return `[${dataAttribute(key)}="${CSS.escape(active.dataset[key])}"]`;
}

// dataset's name for an attribute back to the attribute: 'entryId' -> 'data-entry-id'.
const dataAttribute = key => 'data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());

// Clicks

async function onDialogClick(dialog, event) {
    if (isOnBackdrop(dialog, event) && state.pressStartedOutside) {
        closeUnlessPackPending(dialog);
        return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    const { kind, filter, entry, add, remove, library: action } = button.dataset;
    if (kind) {
        // A new tab usually means a new search, so land in the search box instead of on the tab.
        state.kind = kind;
        state.focusSearch = true;
        redraw({ toTop: true });
    } else if (filter) {
        state.filters[state.kind] = filter;
        redraw({ toTop: true });
    } else if (entry) {
        toggleEntry(entry);
    } else if (add) {
        onSheetChange(addToSheet(getSheet(), state.shown[Number(add)], state.library.items));
    } else if (remove) {
        // Add and Remove share a spot, so the second click of a double-click doesn't undo the first.
        if (event.detail < 2 && removeFromSheet(getSheet(), state.shown[Number(remove)])) onSheetChange(true);
    } else if (action) {
        await runAction(dialog, action);
    }
}

function toggleEntry(id) {
    if (state.openEntries.has(id)) state.openEntries.delete(id);
    else state.openEntries.add(id);
    redraw();
}

async function runAction(dialog, action) {
    if (action === 'close') dialog.close();
    else if (action === 'retry') load(false);
    else if (action === 'redownload') load(true);
    else if (action === 'import-pack') await importPastedPack(dialog);
    else if (action === 'clear-packs') await clearCustomContent();
}

async function importPastedPack(dialog) {
    try {
        const count = await importPack(dialog.querySelector('#library-pack').value);
        state.message = `Imported ${count} entries.`;
        state.library = await loadLibrary();
    } catch (error) {
        state.message = error.message;
    }
    redraw();
}

async function clearCustomContent() {
    if (!confirm('Remove all custom content from the library? Entries already on your sheet stay.')) return;
    await clearPacks();
    state.message = 'Custom content removed.';
    state.library = await loadLibrary();
    redraw();
}

// Clicking the backdrop closes the Library, but only when the press also started there, so dragging a text
// selection out of the search box doesn't close it.
function isOnBackdrop(dialog, event) {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right
        || event.clientY < box.top || event.clientY > box.bottom;
    return event.target === dialog && outside;
}

// Never closes while unimported custom content is sitting in the box: it says so and keeps the text.
function closeUnlessPackPending(dialog) {
    const pending = dialog.querySelector('#library-pack')?.value || '';
    if (!pending.trim()) {
        dialog.close();
        return;
    }
    state.message = 'Import or clear the custom content before closing.';
    state.packOpen = true;
    redraw();
    dialog.querySelector('#library-pack').value = pending;
}
