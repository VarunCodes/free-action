// The Library: the 2024 SRD (5.2, CC-BY 4.0), downloaded from the Open5e API and kept in IndexedDB, plus
// any custom content packs the user has imported. Every entry has the same shape:
//   { kind, name, level, sub (the summary line), desc (Markdown), src ('SRD' or 'Custom') }
// plus whatever its kind needs: a spell's roll, a species' traits, an item's weapon or armor stats.
import { cleanEffects } from './sheet.js';
import { readValue, writeValue } from './library/store.js';
import { downloadKind, ENDPOINTS } from './library/open5e.js';
import { librarySpell } from './library/spells.js';
import { libraryFeat, librarySpecies, libraryClassFeatures } from './library/features.js';
import { libraryItems } from './library/items.js';

// Raise this when the shape of an entry changes, so saved copies are downloaded again.
const CACHE_VERSION = 10;
const CACHE_KEY = 'srd-cache';
const PACKS_KEY = 'packs';

export const KINDS = [
    { id: 'spell', label: 'Spells' },
    { id: 'feat', label: 'Feats' },
    { id: 'race', label: 'Species' },
    { id: 'class', label: 'Class features' },
    { id: 'item', label: 'Items' },
];
const KIND_IDS = KINDS.map(kind => kind.id);

function libraryEntries(kind, rows) {
    if (kind === 'spell') return rows.map(librarySpell);
    if (kind === 'feat') return rows.map(libraryFeat);
    if (kind === 'race') return rows.map(librarySpecies);
    if (kind === 'item') return libraryItems(rows);
    return rows.flatMap(libraryClassFeatures);
}

/**
 * The whole Library: the saved SRD copy, downloading any kind of entry it doesn't have yet (or all of them
 * with force), followed by the custom packs. A kind that fails to download is listed in errors and the rest
 * still load.
 */
export async function loadLibrary({ force = false } = {}) {
    let cache = await readValue(CACHE_KEY);
    if (!cache || cache.ver !== CACHE_VERSION || force) cache = { ver: CACHE_VERSION, at: 0, kinds: {} };
    const errors = await downloadMissingKinds(cache);
    const packs = (await readValue(PACKS_KEY)) || [];
    const items = [...Object.values(cache.kinds).flat(), ...packs];
    return { items, at: cache.at, errors, packCount: packs.length };
}

// Downloads every kind the cache has no entries for, saves the cache, and returns what went wrong.
async function downloadMissingKinds(cache) {
    const missing = KIND_IDS.filter(kind => !cache.kinds[kind]?.length);
    if (!missing.length) return [];
    const errors = [];
    const results = await Promise.allSettled(missing.map(downloadKind));
    results.forEach((result, index) => {
        const kind = missing[index];
        if (result.status === 'fulfilled' && result.value.length) {
            cache.kinds[kind] = libraryEntries(kind, result.value);
        } else {
            errors.push(downloadError(result, kind));
        }
    });
    if (Object.keys(cache.kinds).length) {
        cache.at = Date.now();
        await writeValue(CACHE_KEY, cache);
    }
    return errors;
}

function downloadError(result, kind) {
    if (result.status === 'fulfilled') return `${ENDPOINTS[kind]}: no results`;
    return result.reason?.message || String(result.reason);
}

// Custom pack format: [{ "kind": "spell|feat|race|class", "name": "...", "level": 0, "sub": "...", "desc": "..." }]
// A species can list its traits, and each trait can say what it does with an fx list (see library/traits.js):
// { "kind": "race", "name": "Stoneborn", "traits": [
//     { "n": "Stone Hide", "d": "...", "fx": [["ab", "con", 2], ["hp", "", 1]] },
//     { "n": "Deep Sight", "d": "...", "fx": [["sk", "?Perception|Survival", 1], ["adv", "Perception", 0]] }] }

/**
 * Adds a pasted pack to the saved packs. An entry with the same kind and name as one already saved replaces it.
 * Returns how many entries it had; throws an Error whose message says what's wrong with the pack.
 */
export async function importPack(text) {
    let pack;
    try {
        pack = JSON.parse(text);
    } catch {
        throw new Error('That is not valid JSON.');
    }
    if (!Array.isArray(pack) || !pack.length) {
        throw new Error('Expected a list like [{"kind":"feat","name":"...","desc":"..."}].');
    }
    const entries = pack.map(customEntry);
    const saved = (await readValue(PACKS_KEY)) || [];
    const kept = saved.filter(old => !entries.some(entry => isSameEntry(entry, old)));
    if (!(await writeValue(PACKS_KEY, [...kept, ...entries]))) {
        throw new Error('Could not save to this browser (storage is blocked).');
    }
    return entries.length;
}

const isSameEntry = (first, second) =>
    first.kind === second.kind && first.name.toLowerCase() === second.name.toLowerCase();

function customEntry(entry, index) {
    if (!entry || !KIND_IDS.includes(entry.kind) || !entry.name) {
        throw new Error(`Entry ${index + 1} needs a "name" and a "kind" of ${KIND_IDS.join(', ')}.`);
    }
    const level = Number(entry.level) || 0;
    const hasTraits = entry.kind === 'race' && Array.isArray(entry.traits);
    return {
        kind: entry.kind,
        name: String(entry.name),
        level,
        sub: String(entry.sub || defaultSummary(entry.kind, level, entry.level)),
        desc: String(entry.desc || ''),
        src: 'Custom',
        ...(hasTraits ? { traits: entry.traits.map(packTrait) } : {}),
    };
}

function defaultSummary(kind, level, levelAsGiven) {
    if (kind !== 'spell') return 'Custom';
    return level ? 'Level ' + levelAsGiven : 'Cantrip';
}

// A species trait from a custom pack, stored the way the sheet keeps traits: n (name), d (description) and,
// only if it has any, fx (effects). A pack may also spell the name and description out as "name" and "desc".
function packTrait(trait) {
    const stored = {
        n: String(trait.n || trait.name),
        d: String(trait.d || trait.desc || ''),
    };
    const effects = cleanEffects(trait.fx);
    if (effects.length) stored.fx = effects;
    return stored;
}

export async function clearPacks() {
    await writeValue(PACKS_KEY, []);
}

/**
 * The entries of one kind whose name or summary contains every word of the query. Names that start with the
 * query come first, then (for spells and class features) lower levels, then alphabetical order.
 */
export function search(entries, kind, query, limit = 80) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = entries.filter(entry => entry.kind === kind && matchesEveryWord(entry, words));
    const start = query.trim().toLowerCase();
    const startsWithQuery = entry => (entry.name.toLowerCase().startsWith(start) ? 0 : 1);
    const byLevel = kind === 'spell' || kind === 'class';
    matches.sort((first, second) => startsWithQuery(first) - startsWithQuery(second)
        || (byLevel ? first.level - second.level : 0)
        || first.name.localeCompare(second.name));
    return { shown: matches.slice(0, limit), total: matches.length };
}

function matchesEveryWord(entry, words) {
    const text = (entry.name + ' ' + entry.sub).toLowerCase();
    return words.every(word => text.includes(word));
}

// The saved SRD copy, or null when there is none or it's from an older version.
async function savedCopy() {
    const cache = await readValue(CACHE_KEY);
    return cache && cache.ver === CACHE_VERSION ? cache : null;
}

/**
 * Items from the saved Library copy, without downloading. Used to fill in data on gear that was added to a
 * sheet before the Library knew about it (see gearUpgrade.js).
 */
export async function cachedItems() {
    const cache = await savedCopy();
    return cache?.kinds.item || [];
}

/** Species (with their traits) from the saved Library copy and custom packs, for the Species drop-down. */
export async function cachedSpecies() {
    const cache = await savedCopy();
    const packs = (await readValue(PACKS_KEY)) || [];
    return [...(cache?.kinds.race || []), ...packs.filter(entry => entry.kind === 'race')];
}
