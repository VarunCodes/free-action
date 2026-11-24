// Notes, and Backup: download, open, export and import the sheet, start a new character, or go back to
// an earlier version kept in this browser.
import { snapshots, lastBackup } from '../storage.js';
import { dateAndTime } from '../text.js';
import { html, when } from '../html.js';

const DAY = 24 * 60 * 60 * 1000;

/** The Notes section: one free-text box. */
export function notesSection(sheet) {
    return html`
        <h2>Notes</h2>
        <textarea data-field="notes" aria-label="Notes"
            placeholder="Features, backstory, session notes">${sheet.notes}</textarea>`;
}

/**
 * The Backup section. ui.backupText is what the Backup JSON box holds (an export, or pasted JSON).
 * ui.message is the result of the last import or restore, { text, isError }, or null.
 */
export function backupSection(ui) {
    return html`
        <h2>Backup</h2>
        ${backupReminder()}
        <div class="row" style="margin-bottom:8px">
            <button class="pri" data-action="download-backup">Download backup</button>
            <label class="btn">Open backup file<input type="file" id="backup-file" class="vh"
                accept=".json,application/json"></label>
        </div>
        <textarea id="backup-json" aria-label="Backup JSON"
            placeholder="Exported JSON appears here. Paste JSON here to import.">${ui.backupText}</textarea>
        <div class="row" style="margin-top:8px">
            <button data-action="export">Export</button>
            <button data-action="import">Import</button>
            <button class="bad" data-action="new-character">New character</button>
        </div>
        ${when(ui.message, () => backupMessage(ui.message))}
        ${earlierVersions()}`;
}

// Browsers can clear what a site saves, so the section says when a backup was last downloaded.
function backupReminder() {
    const lastDownload = lastBackup();
    const status = lastDownload ? `Last backup ${daysAgo(lastDownload)}.` : 'No backup downloaded yet.';
    return html`
        <p class="sub" style="margin:0 0 8px">Saves automatically in this browser only. Browsers can clear saved data
            (Safari after 7 days without a visit), so keep a backup file. <b>${status}</b></p>`;
}

function daysAgo(time) {
    const days = Math.floor((Date.now() - time) / DAY);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
}

// An error is announced at once (alert); a success waits its turn (status).
function backupMessage({ text, isError }) {
    return html`
        <p class="${isError ? 'reqn' : 'sub'}" role="${isError ? 'alert' : 'status'}"
            style="margin:8px 0 0">${text}</p>`;
}

// Earlier versions, newest first. A version kept for a reason other than autosave says why.
function earlierVersions() {
    const versions = snapshots();
    if (!versions.length) return '';
    const options = versions.map((version, index) => {
        const reason = version.why === 'autosave' ? '' : ` (${version.why})`;
        return html`<option value="${index}">${dateAndTime(version.at)}: ${version.name}${reason}</option>`;
    });
    return html`
        <div class="row" style="margin-top:8px">
            <select id="earlier-version" aria-label="Earlier version" style="flex:1">${options}</select>
            <button data-action="restore">Restore an earlier version</button>
        </div>`;
}
