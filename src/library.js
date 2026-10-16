// Library: loads the 2024 SRD (5.2, CC-BY 4.0) from the Open5e API, caches it in IndexedDB,
// and merges in any custom content packs the user has imported.
const BASE = 'https://api.open5e.com/v2';
const SOURCE = 'srd-2024';
const CACHE_VER = 1;

export const KINDS = [
  { id: 'spell', label: 'Spells' },
  { id: 'feat', label: 'Feats' },
  { id: 'race', label: 'Species' },
  { id: 'class', label: 'Class features' },
];
const RESOURCES = { spell: 'spells', feat: 'feats', race: 'species', class: 'classes' };

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
async function fetchAll(resource) {
  let url = `${BASE}/${resource}/?document__key=${SOURCE}&limit=100`;
  const out = [];
  for (let page = 0; url && page < 30; page++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let r;
    try { r = await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(timer); }
    if (!r.ok) throw new Error(`${resource}: HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j.results || []));
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
    desc, src: 'SRD',
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
    const res = await Promise.allSettled(missing.map(k => fetchAll(RESOURCES[k])));
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
      ...(d.kind === 'race' && Array.isArray(d.traits) ? { traits: d.traits.map(t => ({ n: String(t.n || t.name), d: String(t.d || t.desc || '') })) } : {}),
    };
  });
  const old = (await kvGet('packs')) || [];
  const keep = old.filter(o => !items.some(n => n.kind === o.kind && n.name.toLowerCase() === o.name.toLowerCase()));
  const ok = await kvSet('packs', [...keep, ...items]);
  if (!ok) throw new Error('Could not save to this browser (storage is blocked).');
  return items.length;
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
