// Library: loads the 2024 SRD (5.2, CC-BY 4.0) from the Open5e API, caches it in IndexedDB,
// and merges in any custom content packs the user has imported.
import { cleanEffects } from './sheet.js';
import { libraryItems } from './library/items.js';
import { ABILITY_KEYS } from './library/values.js';
const BASE = 'https://api.open5e.com/v2';
const SOURCE = 'srd-2024';
const CACHE_VER = 10;

export const KINDS = [
    { id: 'spell', label: 'Spells' },
    { id: 'feat', label: 'Feats' },
    { id: 'race', label: 'Species' },
    { id: 'class', label: 'Class features' },
    { id: 'item', label: 'Items' },
];
const RESOURCES = { spell: 'spells', feat: 'feats', race: 'species', class: 'classes', item: 'items' };
// Items come from two endpoints (gear and magic items).
const FETCH = {
    ...Object.fromEntries(Object.entries(RESOURCES).map(([k, r]) => [k, () => fetchAll(r)])),
    item: async () => {
        const [gear, magic] = await Promise.all([fetchAll('items', 500), fetchAll('magicitems', 500)]);
        return [...gear, ...magic];
    },
};

// ---------- tiny IndexedDB key/value store ----------
const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('dnd-sheet', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
});
async function kvGet(k) {
    try {
        const db = await open();
        return await new Promise((res, rej) => {
            const q = db.transaction('kv').objectStore('kv').get(k);
            q.onsuccess = () => res(q.result);
            q.onerror = () => rej(q.error);
        });
    } catch { return undefined; }
}
async function kvSet(k, v) {
    try {
        const db = await open();
        await new Promise((res, rej) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(v, k);
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
        });
        return true;
    } catch { return false; }
}

// ---------- fetching ----------
async function fetchAll(resource, limit = 100) {
    let url = `${BASE}/${resource}/?document__key=${SOURCE}&limit=${limit}`;
    const out = [];
    for (let page = 0; url && page < 30; page++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        let r;
        try { r = await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(timer); }
        if (!r.ok) throw new Error(`${resource}: HTTP ${r.status}`);
        const j = await r.json();
        // Some endpoints (items, magicitems) ignore document__key and mix in the 2014 SRD or
        // other books, which shows up as duplicates like two Plate Armors. Keep 2024 SRD only.
        out.push(...(j.results || []).filter(x => !x.document || x.document.key === SOURCE));
        url = j.next ? String(j.next).replace(/^http:/, 'https:') : null;
    }
    return out;
}

// ---------- normalising ----------
const txt = v => (v == null ? '' : typeof v === 'string' ? v : (v.name ?? v.display_name ?? ''));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const list = v => Array.isArray(v) ? v : [];

function normSpell(s) {
    const level = Number(s.level) || 0;
    const school = txt(s.school);
    const comps = [s.verbal && 'V', s.somatic && 'S', s.material && 'M'].filter(Boolean).join(', ');
    const head = [
        s.casting_time && `Casting time: ${String(s.casting_time).replace(/_/g, ' ')}`,
        (s.range_text || s.range != null) && `Range: ${s.range_text || s.range}`,
        comps && `Components: ${comps}${s.material && s.material_specified ? ` (${s.material_specified})` : ''}`,
        s.duration && `Duration: ${s.concentration ? 'Concentration, ' : ''}${s.duration}`,
        s.ritual && 'Ritual',
    ].filter(Boolean).join('\n');
    const desc = [head, s.desc, s.higher_level && `**Using a higher-level spell slot.** ${s.higher_level}`].filter(Boolean).join('\n\n');
    const classes = list(s.classes).map(txt).filter(Boolean).join(', ');
    return {
        kind: 'spell', name: s.name, level,
        sub: `${level ? 'Level ' + level : 'Cantrip'}${school ? ' ' + school : ''}${classes ? ' (' + classes + ')' : ''}`,
        desc, src: 'SRD', roll: spellRoll(s),
    };
}

// Roll data for the sheet. Open5e's attack_roll flag also marks buffs like Bless, so an
// attack is only assumed when the text asks for a spell attack and there is damage to roll.
const ATTACK_RE = /\b(melee|ranged) spell attack|make (a|one) spell attack|make (a|one) (melee|ranged) attack roll|spell attack (roll )?against/i;
function spellRoll(s) {
    const dmg = String(s.damage_roll || '').replace(/\s+/g, '');
    const types = list(s.damage_types).map(t => String(t).toLowerCase());
    const save = String(s.saving_throw_ability || '').slice(0, 3).toLowerCase();
    const up = list(s.casting_options)
        .map(o => ({ m: /^(player|slot)_level_(\d+)$/.exec(o.type || ''), d: String(o.damage_roll || '').replace(/\s+/g, ''), n: o.target_count }))
        .filter(o => o.m && (o.d || o.n))
        .map(o => [Number(o.m[2]), o.d, o.n || 0]);
    const by = list(s.casting_options).some(o => /^player_level/.test(o.type || '')) ? 'char' : 'slot';
    return {
        a: ATTACK_RE.test(s.desc || '') && !!dmg,
        s: save,
        d: dmg, b: dmg,
        t: types.join('/'),
        h: !!dmg && !types.length && /regain/i.test(s.desc || ''),
        m: /(plus|\+) your spellcasting ability modifier/i.test(s.desc || ''),
        by, up,
    };
}

function normFeat(f) {
    const benefits = list(f.benefits).map(b => (typeof b === 'string' ? b : b.desc || b.name || '')).filter(Boolean);
    const desc = [f.prerequisite && `Prerequisite: ${f.prerequisite}`, f.desc, ...benefits.map(b => `- ${b}`)].filter(Boolean).join('\n\n');
    return { kind: 'feat', name: f.name, level: 0, sub: f.type ? `${cap(String(f.type).toLowerCase())} feat` : 'Feat', desc, src: 'SRD' };
}

function normRace(s) {
    const traits = list(s.traits).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(t => ({ n: t.name, d: t.desc || '' }));
    const parent = txt(s.subspecies_of);
    return {
        kind: 'race', name: s.name, level: 0,
        sub: parent ? `Subspecies of ${parent}` : `${traits.length} traits`,
        desc: [s.desc, ...traits.map(t => `**${t.n}.** ${t.d}`)].filter(Boolean).join('\n\n'),
        traits, src: 'SRD',
    };
}

function normClass(c) {
    const parent = txt(c.subclass_of);
    const label = parent ? `${parent}: ${c.name}` : c.name;
    const out = [];
    for (const f of list(c.features)) {
        if (f.feature_type && f.feature_type !== 'CLASS_LEVEL_FEATURE') continue;
        const lv = list(f.gained_at).map(g => (typeof g === 'number' ? g : Number(g?.level))).filter(n => n > 0);
        const first = lv.length ? Math.min(...lv) : 0;
        out.push({
            kind: 'class', name: f.name, level: first,
            sub: `${label}${first ? ', level ' + first : ''}`,
            desc: f.desc || '', src: 'SRD',
        });
    }
    return out;
}

function normalise(kind, rows) {
    if (kind === 'spell') return rows.map(normSpell);
    if (kind === 'feat') return rows.map(normFeat);
    if (kind === 'item') return libraryItems(rows);
    if (kind === 'race') return rows.map(normRace);
    return rows.flatMap(normClass);
}

// ---------- public API ----------
export async function loadLibrary({ force = false } = {}) {
    let cache = await kvGet('srd-cache');
    if (!cache || cache.ver !== CACHE_VER || force) cache = { ver: CACHE_VER, at: 0, kinds: {} };
    const missing = KINDS.map(k => k.id).filter(k => !(cache.kinds[k] && cache.kinds[k].length));
    const errors = [];
    if (missing.length) {
        const res = await Promise.allSettled(missing.map(k => FETCH[k]()));
        res.forEach((r, i) => {
            const k = missing[i];
            if (r.status === 'fulfilled' && r.value.length) cache.kinds[k] = normalise(k, r.value);
            else errors.push(r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : `${RESOURCES[k]}: no results`);
        });
        if (Object.keys(cache.kinds).length) { cache.at = Date.now(); await kvSet('srd-cache', cache); }
    }
    const packs = (await kvGet('packs')) || [];
    const items = [...Object.values(cache.kinds).flat(), ...packs];
    return { items, at: cache.at, errors, packCount: packs.length };
}

// Custom pack format: [{ "kind": "spell|feat|race|class", "name": "...", "level": 0, "sub": "...", "desc": "..." }]
// A species can list its traits, and each trait can say what it does with an fx list (see traitEffects):
// { "kind": "race", "name": "Stoneborn", "traits": [{ "n": "Stone Hide", "d": "...", "fx": [["ab", "con", 2], ["hp", "", 1]] },
//   { "n": "Deep Sight", "d": "...", "fx": [["sk", "?Perception|Survival", 1], ["adv", "Perception", 0]] }] }
export async function importPack(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('That is not valid JSON.'); }
    if (!Array.isArray(data) || !data.length) throw new Error('Expected a list like [{"kind":"feat","name":"...","desc":"..."}].');
    const ids = KINDS.map(k => k.id);
    const items = data.map((d, i) => {
        if (!d || !ids.includes(d.kind) || !d.name) throw new Error(`Entry ${i + 1} needs a "name" and a "kind" of ${ids.join(', ')}.`);
        return {
            kind: d.kind, name: String(d.name), level: Number(d.level) || 0,
            sub: String(d.sub || (d.kind === 'spell' ? (Number(d.level) ? 'Level ' + d.level : 'Cantrip') : 'Custom')),
            desc: String(d.desc || ''), src: 'Custom',
            ...(d.kind === 'race' && Array.isArray(d.traits) ? { traits: d.traits.map(packTrait) } : {}),
        };
    });
    const old = (await kvGet('packs')) || [];
    const keep = old.filter(o => !items.some(n => n.kind === o.kind && n.name.toLowerCase() === o.name.toLowerCase()));
    const ok = await kvSet('packs', [...keep, ...items]);
    if (!ok) throw new Error('Could not save to this browser (storage is blocked).');
    return items.length;
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

export async function clearPacks() { await kvSet('packs', []); }

export function search(items, kind, query, limit = 80) {
    const toks = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = items.filter(i => i.kind === kind && toks.every(t => (i.name + ' ' + i.sub).toLowerCase().includes(t)));
    const q = query.trim().toLowerCase();
    hits.sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1, bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || (kind === 'spell' || kind === 'class' ? a.level - b.level : 0) || a.name.localeCompare(b.name);
    });
    return { shown: hits.slice(0, limit), total: hits.length };
}

// Items from the saved Library copy, without downloading. Used to fill in data on gear that was
// added to a sheet before the Library knew about it (e.g. armor added before AC was calculated).
export async function cachedItems() {
    const c = await kvGet('srd-cache');
    return c && c.ver === CACHE_VER ? (c.kinds.item || []) : [];
}
// What a species trait (or any feature) does to the numbers, in the same [type, target, value] form as magic
// item effects, plus three types of its own: hp (+value HP per level), ab (+value to an ability score) and
// sk (skill proficiency: target is a skill, '?' for any skill of your choice, or '?A|B|C' to choose from a list).
// Effects come from, in order: the trait's own fx (custom packs can give any trait effects), the SRD traits
// named below, or wording the SRD uses, so homebrew written the same way works without an fx list.
const TRAIT_FX = {
    'dwarven toughness': [['hp', '', 1]],
    'keen senses': [['sk', '?Insight|Perception|Survival', 1]],
    skillful: [['sk', '?', 1]],
};
const SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
export function traitEffects(t) {
    if (Array.isArray(t.fx) && t.fx.length) return t.fx;
    const named = TRAIT_FX[String(t.n || '').trim().toLowerCase()];
    if (named) return named;
    const d = String(t.d || '').replace(/\s+/g, ' '), fx = [];
    let m = /Hit Point maximum increases by (\d+),? and it increases by \1 again whenever you gain a level/i.exec(d);
    if (m) fx.push(['hp', '', Number(m[1])]);
    for (const a of d.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d+)/gi)) fx.push(['ab', ABILITY_KEYS[a[1].toLowerCase()], Number(a[2])]);
    for (const s of d.matchAll(/\bproficiency in the ([A-Z][a-z]+(?: [a-z]+ [A-Z][a-z]+| [A-Z][a-z]+)?) skill\b/g)) if (SKILLS.includes(s[1])) fx.push(['sk', s[1], 1]);
    if (/\bproficiency in one skill of your choice\b/i.test(d)) fx.push(['sk', '?', 1]);
    return fx;
}
// Species (with their traits) from the saved Library copy and custom packs, for the sheet's Species drop-down.
export async function cachedSpecies() {
    const c = await kvGet('srd-cache'), packs = (await kvGet('packs')) || [];
    return [...(c && c.ver === CACHE_VER ? c.kinds.race || [] : []), ...packs.filter(p => p.kind === 'race')];
}
