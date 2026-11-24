// What the Library's Add and Remove buttons do to the sheet, and swapping one species for another (which the
// Species picker uses too). Library entries are described in library.js; the sheet's keys in sheet.js.
import { GEAR_DATA_VERSION } from '../gearUpgrade.js';

/**
 * Adds a Library entry to the sheet. A spell, feat or class feature is added to its list, an item the sheet
 * already has gains one in quantity, and a species replaces the current one.
 * Returns true if something was also removed (the old species' traits), so list places may have moved.
 */
export function addToSheet(sheet, entry, libraryEntries) {
    if (entry.kind === 'spell') sheet.spells.push(spellFrom(entry));
    else if (entry.kind === 'feat') sheet.feats.push({ n: entry.name, t: 'Feat', d: entry.desc });
    else if (entry.kind === 'class') sheet.feats.push({ n: entry.name, t: classFeatureTag(entry), d: entry.desc });
    else if (entry.kind === 'item') addItem(sheet, entry);
    else return Boolean(swapSpecies(sheet, libraryEntries, entry).old);
    return false;
}

function spellFrom(entry) {
    return {
        n: entry.name,
        l: entry.level,
        p: false,
        d: entry.desc,
        ...(entry.roll ? { r: { ...entry.roll } } : {}),
    };
}

function addItem(sheet, entry) {
    const owned = findItem(sheet, entry);
    if (owned) {
        owned.q = (Number(owned.q) || 0) + 1;
        return;
    }
    sheet.items.push({
        n: entry.name,
        q: 1,
        d: entry.desc,
        eq: Boolean(entry.eq),
        on: false,
        ...(entry.w ? { w: { ...entry.w } } : {}),
        ...(entry.ar ? { ar: { ...entry.ar } } : {}),
        ...(entry.at ? { at: true } : {}),
        ...(entry.fx ? { fx: entry.fx.map(effect => [...effect]) } : {}),
        rr: entry.rr || 0,
        // Straight from the Library, so it already has all the data the gear upgrade would fill in.
        v: GEAR_DATA_VERSION,
    });
}

/**
 * Undoes an Add. A species also takes its traits with it. Returns false if the entry wasn't on the sheet.
 * Items are never removed here: the inventory changes their quantity.
 */
export function removeFromSheet(sheet, entry) {
    if (entry.kind === 'race') {
        sheet.species = '';
        removeSpeciesTraits(sheet, entry);
        return true;
    }
    const place = findOnSheet(sheet, entry);
    if (!place) return false;
    place.list.splice(place.index, 1);
    return true;
}

/** Whether the entry is on the sheet: the character's species, or a spell, feat or class feature in its list. */
export function isOnSheet(sheet, entry) {
    if (entry.kind === 'race') return Boolean(sheet.species) && sameName(sheet.species, entry.name);
    return Boolean(findOnSheet(sheet, entry));
}

/** How many of this item the sheet has (0 for anything that isn't an item). */
export function ownedCount(sheet, entry) {
    if (entry.kind !== 'item') return 0;
    return findItem(sheet, entry)?.q || 0;
}

const sameName = (first, second) => first.toLowerCase() === second.toLowerCase();
const findItem = (sheet, entry) => sheet.items.find(item => sameName(item.n, entry.name));

// Where an entry sits on the sheet: { list, index }, or null. Items aren't looked for, since they stack.
// Several classes share feature names (Spellcasting, Extra Attack), so a class feature only matches when
// its class tag or its text matches too.
function findOnSheet(sheet, entry) {
    if (entry.kind === 'spell') return findByName(sheet.spells, entry.name);
    if (entry.kind === 'feat') return findByName(sheet.feats, entry.name);
    if (entry.kind === 'class') {
        const sameClass = feature => feature.t === classFeatureTag(entry) || feature.d === entry.desc;
        return findByName(sheet.feats, entry.name, sameClass);
    }
    return null;
}

function findByName(list, name, alsoMatches = () => true) {
    const index = list.findIndex(element => sameName(element.n, name) && alsoMatches(element));
    return index < 0 ? null : { list, index };
}

// The tag a class feature gets on the sheet: "Paladin, level 1" -> "Paladin",
// "Cleric: Life Domain, level 3" -> "Cleric: Life Domain".
function classFeatureTag(entry) {
    return (entry.sub || '').replace(/, level \d+$/, '') || 'Class feature';
}

/**
 * A character has one species: the old one's traits come off before the new one's go on, so shared traits
 * (Size, Speed, Darkvision) end up with the new species' wording. A trait the new species has that is still
 * on the sheet under the same name (left by a custom species the Library doesn't know) is replaced, never
 * doubled. A species of null just clears it.
 * Returns { old: the old species' name ('' if the Library doesn't know it), removed, added } (trait counts).
 */
export function swapSpecies(sheet, libraryEntries, species) {
    const oldSpecies = sheet.species
        && libraryEntries.find(entry => entry.kind === 'race' && sameName(entry.name, sheet.species));
    const removed = oldSpecies ? removeSpeciesTraits(sheet, oldSpecies) : 0;
    sheet.species = species ? species.name : '';
    const newTraits = species ? speciesTraits(species) : [];
    for (const trait of newTraits) putTrait(sheet, trait);
    return { old: oldSpecies ? oldSpecies.name : '', removed, added: newTraits.length };
}

// A species with no traits listed (a custom one) counts as a single trait: its own name and description.
function speciesTraits(species) {
    return species.traits && species.traits.length ? species.traits : [{ n: species.name, d: species.desc }];
}

function putTrait(sheet, trait) {
    const racialFeature = {
        n: trait.n,
        t: '',
        d: trait.d,
        ...(trait.fx ? { fx: trait.fx.map(effect => [...effect]) } : {}),
    };
    const index = sheet.race.findIndex(feature => sameName(feature.n, trait.n));
    if (index < 0) sheet.race.push(racialFeature);
    else sheet.race[index] = racialFeature;
}

// Takes a species' own traits off the sheet. Each is matched by name, since every species has a Size and a
// Speed and most have a Darkvision (worded differently). Where several racial features share a name, the one
// with this species' text goes, or else the first, so a trait the player reworded still goes with its species.
// Returns how many were removed.
function removeSpeciesTraits(sheet, species) {
    let removed = 0;
    for (const trait of speciesTraits(species)) {
        const sameNamed = sheet.race.filter(feature => sameName(feature.n, trait.n));
        const match = sameNamed.find(feature => feature.d === trait.d) || sameNamed[0];
        if (match) {
            sheet.race.splice(sheet.race.indexOf(match), 1);
            removed++;
        }
    }
    return removed;
}
