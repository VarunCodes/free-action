// The filter chips under the Library's search box, one row per tab. Each filter reads the entry's summary
// line (sub), so saved Library copies and custom packs work without a new download. 'all' lets everything
// through.
import { RARITY } from '../text.js';

/** A filter per tab, all starting on 'all'. Species have none. */
export const newFilters = () => ({ item: 'all', spell: 'all', feat: 'all', class: 'all' });

/** Whether an entry passes its tab's filter. */
export function passesFilter(entry, filters) {
    const filter = filters[entry.kind];
    if (!filter || filter === 'all') return true;
    if (entry.kind === 'item') return rarityMatches(entry, filter);
    if (entry.kind === 'spell') return schoolOf(entry) === filter;
    if (entry.kind === 'feat') return featMatches(entry, filter);
    return classOf(entry) === filter;
}

/**
 * The chip row for a tab: { label, current, chips: [{ value, text, className }] }, or null for none.
 * classNames are the classes the Library has features for, and the character's class is marked.
 */
export function chipRow(kind, filters, classNames, characterClass) {
    const current = filters[kind];
    if (kind === 'item') return { label: 'Filter by rarity', current, chips: rarityChips() };
    if (kind === 'spell') return { label: 'Filter by school of magic', current, chips: schoolChips() };
    if (kind === 'feat') return { label: 'Filter feats', current, chips: featChips() };
    if (kind === 'class') return { label: 'Filter by class', current, chips: classChips(classNames, characterClass) };
    return null;
}

const chip = (value, text, className = '') => ({ value, text, className });

// Items: all, mundane, magic, or one rarity by its rank ('1' Common to '6' Artifact).
function rarityChips() {
    const rarities = RARITY.slice(1).map((name, index) => chip(String(index + 1), name, ' r' + (index + 1)));
    return [chip('all', 'All'), chip('mundane', 'Mundane'), chip('magic', 'Magic'), ...rarities];
}

function rarityMatches(entry, filter) {
    if (filter === 'mundane') return !entry.rr;
    if (filter === 'magic') return entry.rr > 0;
    return entry.rr === Number(filter);
}

// Spells: a school of magic, read from the summary line ("Level 3 Necromancy (Cleric, Wizard)").
const SCHOOLS = [
    'Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

function schoolChips() {
    return [chip('all', 'All'), ...SCHOOLS.map(school => chip(school, school))];
}

function schoolOf(entry) {
    return SCHOOLS.find(school => new RegExp('\\b' + school + '\\b', 'i').test(entry.sub || '')) || '';
}

// Feats: feats or Epic Boons, or one feat category from the summary line ("Origin feat", "Epic boon feat").
const FEAT_CATEGORIES = [['origin', 'Origin'], ['general', 'General'], ['fighting style', 'Fighting Style']];

function featChips() {
    const categories = FEAT_CATEGORIES.map(([value, text]) => chip(value, text));
    return [chip('all', 'All'), chip('feat', 'Feats'), chip('boon', 'Boons'), ...categories];
}

function featMatches(entry, filter) {
    const summary = (entry.sub || '').toLowerCase();
    const isBoon = /\bboon\b/.test(summary) || /^boon of\b/i.test(entry.name);
    if (filter === 'boon') return isBoon;
    if (filter === 'feat') return !isBoon;
    return summary.startsWith(filter);
}

// Class features: the class, from the summary line ("Paladin, level 1", "Cleric: Life Domain, level 3").
// Subclass features count under their class.
function classChips(classNames, characterClass) {
    const classes = classNames.map(name => chip(name, name === characterClass ? name + ' (your class)' : name));
    return [chip('all', 'All'), ...classes];
}

export function classOf(entry) {
    return (entry.sub || '').split(/[:,]/)[0].trim();
}

/** The classes the Library has features for, in alphabetical order. */
export function classNamesIn(entries) {
    const classes = entries.filter(entry => entry.kind === 'class').map(classOf).filter(Boolean);
    return [...new Set(classes)].sort();
}

/** A feature of the character's class from a higher level than theirs. These are dimmed in the list. */
export function isLaterClassFeature(sheet, entry) {
    return entry.kind === 'class' && entry.level > sheet.level && classOf(entry) === sheet.cls;
}
