import { KINDS, loadLibrary, search, importPack, clearPacks } from './library.js';
import { esc, md, rarityTag, RARITY, magicMark } from './text.js';

let dlg, data = null, status = 'idle', errors = [], kind = 'spell', query = '', open = new Set(), msg = '', packOpen = false;
// Items tab filter: all, mundane, magic, or a rarity rank ('1'-'6').
let rf = 'all';
const rfOk = it => rf === 'all' || (rf === 'mundane' ? !it.rr : rf === 'magic' ? it.rr > 0 : it.rr === Number(rf));
let getS, onChange;

// Where a Library entry sits on the sheet: [list, index], or null. Items are never "added" (they stack).
// Several classes share feature names (Spellcasting, Extra Attack), so a class feature only matches
// when its class tag or its text matches too.
const onSheet = (S, it) => {
  const n = it.name.toLowerCase(), at = (l, f = () => true) => { const i = l.findIndex(x => x.n.toLowerCase() === n && f(x)); return i < 0 ? null : [l, i]; };
  if (it.kind === 'spell') return at(S.spells);
  if (it.kind === 'class') return at(S.feats, x => x.t === clsOf(it) || x.d === it.desc);
  if (it.kind === 'feat') return at(S.feats);
  return null;
};
const has = (S, it) => it.kind === 'race' ? !!S.species && S.species.toLowerCase() === it.name.toLowerCase() : !!onSheet(S, it);
const traitsOf = it => (it.traits && it.traits.length ? it.traits : [{ n: it.name, d: it.desc }]);
// Take a species' own traits off the sheet. Each is matched by name; where several racial features
// share a name (two Darkvisions), only the one with this species' text goes.
function dropTraits(S, it) {
  for (const t of traitsOf(it)) {
    const same = S.race.filter(x => x.n.toLowerCase() === t.n.toLowerCase());
    const x = same.length > 1 ? same.find(x => x.d === t.d) : same[0];
    if (x) S.race.splice(S.race.indexOf(x), 1);
  }
}
// Undo an Add. A species also takes its traits with it.
function remove(it) {
  const S = getS();
  if (it.kind === 'race') { S.species = ''; dropTraits(S, it); }
  else { const o = onSheet(S, it); if (!o) return; o[0].splice(o[1], 1); }
  onChange(true);
}
// "Paladin, level 1" -> "Paladin"; "Cleric: Life Domain, level 3" -> "Cleric: Life Domain".
const clsOf = it => (it.sub || '').replace(/, level \d+$/, '') || 'Class feature';
const owned = (S, it) => it.kind === 'item' ? (S.items.find(x => x.n.toLowerCase() === it.name.toLowerCase())?.q || 0) : 0;

function add(it) {
  const S = getS();
  if (it.kind === 'spell') S.spells.push({ n: it.name, l: it.level, p: false, d: it.desc, ...(it.roll ? { r: { ...it.roll } } : {}) });
  else if (it.kind === 'feat') S.feats.push({ n: it.name, t: 'Feat', d: it.desc });
  else if (it.kind === 'class') S.feats.push({ n: it.name, t: clsOf(it), d: it.desc });
  else if (it.kind === 'item') {
    const x = S.items.find(o => o.n.toLowerCase() === it.name.toLowerCase());
    if (x) x.q = (Number(x.q) || 0) + 1;
    else S.items.push({ n: it.name, q: 1, d: it.desc, eq: !!it.eq, on: false, ...(it.w ? { w: { ...it.w } } : {}), ...(it.ar ? { ar: { ...it.ar } } : {}), ...(it.at ? { at: true } : {}), ...(it.fx ? { fx: it.fx.map(f => [...f]) } : {}), rr: it.rr || 0, v: 3 });
  }
  else {
    // A character has one species: picking another swaps out the old one's traits.
    const old = S.species && data.items.find(x => x.kind === 'race' && x.name.toLowerCase() === S.species.toLowerCase());
    if (old) dropTraits(S, old);
    S.species = it.name;
    for (const t of traitsOf(it)) if (!S.race.some(x => x.n.toLowerCase() === t.n.toLowerCase() && x.d === t.d)) S.race.push({ n: t.n, t: '', d: t.d });
    if (old) { onChange(true); return; }
  }
  onChange();
}

function draw() {
  const S = getS();
  const pool = data ? (kind === 'item' ? data.items.filter(it => it.kind !== 'item' || rfOk(it)) : data.items) : [];
  const { shown, total } = data ? search(pool, kind, query) : { shown: [], total: 0 };
  const chips = kind === 'item' ? `<div class="chips" role="group" aria-label="Filter by rarity">${[['all', 'All'], ['mundane', 'Mundane'], ['magic', 'Magic'], ...RARITY.slice(1).map((r, i) => [String(i + 1), r])].map(([v, t]) => `<button class="chip${rf === v ? ' on' : ''}${/^\d$/.test(v) ? ' r' + v : ''}" data-lrf="${v}" aria-pressed="${rf === v}">${t}</button>`).join('')}</div>` : '';
  const rows = shown.map((it, idx) => {
    const id = kind + ':' + it.name + ':' + idx;
    const done = has(S, it);
    return `<div class="lrow"><div class="lhd"><button class="lk" data-lo="${esc(id)}" aria-expanded="${open.has(id)}"><span>${magicMark(it.rr)}${esc(it.name)}${rarityTag(it.rr)}</span><small>${esc(it.sub)}${it.src === 'Custom' ? ' (custom)' : ''}</small></button>
      ${done ? `<button class="bad" data-lrm="${idx}" title="On your sheet. Click to remove it.">${kind === 'race' ? 'Remove species' : 'Remove'}</button>` : `<button class="pri" data-la="${idx}">${kind === 'race' ? (S.species ? 'Switch species' : 'Add species') : owned(S, it) ? `Add (have ${owned(S, it)})` : 'Add'}</button>`}</div>
      ${open.has(id) ? `<p class="sd">${md(it.desc) || 'No description.'}</p>` : ''}</div>`;
  }).join('');
  const stamp = data && data.at ? `SRD data saved ${new Date(data.at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : '';
  dlg.innerHTML = `<div class="dh"><h2>Library</h2><button data-lc>Close</button></div>
  <div class="seg" role="tablist">${KINDS.map(k => `<button role="tab" data-lk="${k.id}" class="${k.id === kind ? 'on' : ''}">${k.label}</button>`).join('')}</div>
  <input id="lq" type="search" placeholder="Search ${KINDS.find(k => k.id === kind).label.toLowerCase()} (${kind === 'item' ? 'try weapon, armor or rare' : 'try a class name or level'})" value="${esc(query)}" aria-label="Search">
  ${chips}
  <div class="lbody">
  ${status === 'loading' ? '<p class="empty">Loading the 2024 SRD&hellip;</p>' : ''}
  ${errors.length ? `<p class="err">Could not load: ${esc(errors.join('; '))}. Check your connection, then <button data-lr>Retry</button></p>` : ''}
  ${status === 'ready' && !errors.length && !total ? `<p class="empty">No matches. Try a shorter search.</p>` : ''}
  ${rows}
  ${total > shown.length ? `<p class="empty">Showing ${shown.length} of ${total}. Narrow the search to see the rest.</p>` : ''}
  </div>
  <details class="pack" ${packOpen ? 'open' : ''}><summary>Custom content ${data && data.packCount ? `(${data.packCount} saved)` : ''}</summary>
    <p class="sub">Paste JSON for homebrew or books you own. It stays in this browser and appears in search above.</p>
    <textarea id="lp" placeholder='[{"kind":"feat","name":"My Feat","sub":"General feat","desc":"What it does"}]'></textarea>
    <div class="row"><button data-lp>Import</button><button class="bad" data-lx>Remove all custom content</button></div>
    ${msg ? `<p class="sub" role="status">${esc(msg)}</p>` : ''}
  </details>
  <p class="sub foot">${esc(stamp)}${stamp ? ' &middot; ' : ''}Rules content: SRD 5.2 by Wizards of the Coast, CC-BY 4.0, via Open5e. ${data ? '<button data-lf>Re-download</button>' : ''}</p>`;
  const q = dlg.querySelector('#lq');
  if (dlg._focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); dlg._focusQ = false; }
  dlg._shown = shown;
}

async function load(force) {
  status = 'loading'; errors = []; draw();
  try {
    data = await loadLibrary({ force });
    errors = data.errors;
    window.dispatchEvent(new Event('library-loaded'));
  } catch (e) { errors = [e.message || 'unknown error']; }
  status = 'ready';
  draw();
}

export function openLibrary(stateGetter, changed) {
  getS = stateGetter; onChange = removed => { changed(!!removed); draw(); };
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'lib';
    dlg.setAttribute('aria-label', 'Library');
    document.body.appendChild(dlg);
    dlg.addEventListener('toggle', e => { if (e.target.classList.contains('pack')) packOpen = e.target.open; }, true);
    dlg.addEventListener('input', e => { if (e.target.id === 'lq') { query = e.target.value; dlg._focusQ = true; draw(); } });
    // Clicking the backdrop closes the Library. Only when the press also started there,
    // so dragging a text selection out of the search box doesn't close it, and never
    // while unimported custom content is sitting in the textarea.
    const outside = e => {
      const r = dlg.getBoundingClientRect();
      return e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    };
    dlg.addEventListener('pointerdown', e => { dlg._downOut = outside(e); });
    dlg.addEventListener('click', async e => {
      if (outside(e) && dlg._downOut) {
        const pending = dlg.querySelector('#lp')?.value || '';
        if (pending.trim()) {
          msg = 'Import or clear the custom content before closing.'; packOpen = true; draw();
          dlg.querySelector('#lp').value = pending;
        }
        else dlg.close();
        return;
      }
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lc !== undefined) dlg.close();
      else if (b.dataset.lk) { kind = b.dataset.lk; draw(); }
      else if (b.dataset.lrf) { rf = b.dataset.lrf; draw(); }
      else if (b.dataset.lo) { open.has(b.dataset.lo) ? open.delete(b.dataset.lo) : open.add(b.dataset.lo); draw(); }
      else if (b.dataset.la) add(dlg._shown[+b.dataset.la]);
      // Add and Remove share a spot, so the second click of a double-click doesn't undo the first.
      else if (b.dataset.lrm) { if (e.detail < 2) remove(dlg._shown[+b.dataset.lrm]); }
      else if (b.dataset.lr !== undefined) load(false);
      else if (b.dataset.lf !== undefined) load(true);
      else if (b.dataset.lp !== undefined) {
        try { const n = await importPack(dlg.querySelector('#lp').value); msg = `Imported ${n} entries.`; data = await loadLibrary(); }
        catch (x) { msg = x.message; }
        draw();
      } else if (b.dataset.lx !== undefined) {
        if (!confirm('Remove all custom content from the library? Entries already on your sheet stay.')) return;
        await clearPacks(); msg = 'Custom content removed.'; data = await loadLibrary(); draw();
      }
    });
  }
  if (!dlg.open) dlg.showModal();
  dlg._focusQ = true;
  if (!data) load(false); else draw();
}
