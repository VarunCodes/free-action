// What the sheet keeps in this browser's localStorage:
//   sheet            the character, as cleanSheet() leaves it
//   sheet-history    up to 6 earlier versions, newest first
//   sheet-exported   when a backup was last downloaded or exported (milliseconds)
//   roll-min         a display preference, read and written by main.js
// Storage can be full or blocked (a private window, a browser setting), so no read or write here
// ever throws: the sheet keeps working, it just isn't saved.
import { cleanSheet } from './sheet.js';

const HISTORY_SIZE = 6;
const AUTOSAVE_EVERY = 30 * 60 * 1000;

export function readKey(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

// Returns false when the browser refused to store it (usually because storage is full).
export function writeKey(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

// The saved character, or null if there is none or it can't be read.
export function loadSaved() {
    try {
        const saved = readKey('sheet');
        return saved ? cleanSheet(JSON.parse(saved)) : null;
    } catch {
        return null;
    }
}

// Every save goes through the same limits as loading (scores 1-30, current HP no more than max,
// and so on), so what you see while editing is what you get after a reload.
// Returns the cleaned sheet, which the caller should keep in place of the one it passed.
export function saveSheet(sheet) {
    const clean = cleanSheet(sheet);
    writeKey('sheet', JSON.stringify(clean));
    snapshot(clean, 'autosave');
    return clean;
}

// Earlier versions kept in this browser, newest first: { at, why, name, s }, where s is the sheet as JSON.
export function snapshots() {
    try {
        const list = JSON.parse(readKey('sheet-history') || '[]');
        return Array.isArray(list) ? list.filter(version => version && typeof version.s === 'string') : [];
    } catch {
        return [];
    }
}

// Adds a version to the history: one when the page opens, one per 30 minutes of editing, and one right
// before Import, Restore or New character replaces the sheet (force skips the 30-minute wait).
// A version identical to the newest one is never added twice.
export function snapshot(sheet, why, force = false) {
    const list = snapshots();
    const now = Date.now();
    const json = JSON.stringify(sheet);
    const newest = list[0];
    if (newest && newest.s === json) return;
    if (!force && newest && now - newest.at < AUTOSAVE_EVERY) return;
    list.unshift({ at: now, why, name: sheet.name, s: json });
    // If storage is full, drop the oldest versions until the rest fit.
    while (list.length && !writeKey('sheet-history', JSON.stringify(list.slice(0, HISTORY_SIZE)))) list.pop();
}

// When a backup was last downloaded or exported, or 0 for never.
export function lastBackup() {
    return Number(readKey('sheet-exported')) || 0;
}

export function markBackedUp() {
    writeKey('sheet-exported', String(Date.now()));
}

// Saves the sheet as <character name>.json through the browser's downloads.
export function downloadSheet(sheet) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(sheet, null, 1)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = (sheet.name || 'character').replace(/[^\w-]+/g, '-') + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackedUp();
}

// The sheet in a backup file or pasted export, or null if the text isn't one.
// It isn't cleaned yet: replacing the sheet does that.
export function readBackup(text) {
    try {
        const sheet = JSON.parse(text);
        return sheet && typeof sheet === 'object' && sheet.ab ? sheet : null;
    } catch {
        return null;
    }
}
