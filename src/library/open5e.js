// Downloading the 2024 SRD (5.2, CC-BY 4.0) from the Open5e API, one kind of entry at a time.
const API = 'https://api.open5e.com/v2';
export const SRD_2024 = 'srd-2024';
const MAX_PAGES = 30;
const PAGE_TIMEOUT_MS = 20000;

// The Open5e endpoint for each kind of Library entry.
export const ENDPOINTS = { spell: 'spells', feat: 'feats', race: 'species', class: 'classes', item: 'items' };

/** Every Open5e row for one kind of entry. Items come from two endpoints: gear and magic items. */
export async function downloadKind(kind) {
    if (kind !== 'item') return downloadAll(ENDPOINTS[kind]);
    const [gear, magicItems] = await Promise.all([downloadAll('items', 500), downloadAll('magicitems', 500)]);
    return [...gear, ...magicItems];
}

// Follows the "next" links page by page. A page that fails or times out fails the whole download.
async function downloadAll(endpoint, pageSize = 100) {
    let url = `${API}/${endpoint}/?document__key=${SRD_2024}&limit=${pageSize}`;
    const rows = [];
    for (let page = 0; url && page < MAX_PAGES; page++) {
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
        const body = await response.json();
        rows.push(...(body.results || []).filter(isFrom2024Srd));
        url = body.next ? String(body.next).replace(/^http:/, 'https:') : null;
    }
    return rows;
}

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Some endpoints (items, magicitems) ignore document__key and mix in the 2014 SRD or other books, which
// shows up as duplicates like two Plate Armors. Keep the 2024 SRD only.
const isFrom2024Srd = row => !row.document || row.document.key === SRD_2024;
