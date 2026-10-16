import { KINDS, loadLibrary, search, importPack, clearPacks } from './library.js';
import { esc, md } from './text.js';

let dlg, data = null, status = 'idle', errors = [], kind = 'spell', query = '', open = new Set(), msg = '', packOpen = false;
let getS, onChange;

const has = (S, it) => {
  const n = it.name.toLowerCase();
  const inList = l => l.some(x => x.n.toLowerCase() === n);
  if (it.kind === 'spell') return inList(S.spells);
  if (it.kind === 'race') return S.species && S.species.toLowerCase() === n;
  if (it.kind === 'item') return false;
  return inList(S.feats);
};
const owned = (S, it) => it.kind === 'item' ? (S.items.find(x => x.n.toLowerCase() === it.name.toLowerCase())?.q || 0) : 0;

function add(it) {
  const S = getS();
  if (it.kind === 'spell') S.spells.push({ n: it.name, l: it.level, p: false, d: it.desc, ...(it.roll ? { r: { ...it.roll } } : {}) });
  else if (it.kind === 'feat') S.feats.push({ n: it.name, t: 'Feat', d: it.desc });
  else if (it.kind === 'class') S.feats.push({ n: it.name, t: 'Class feature', d: it.desc });
  else if (it.kind === 'item') {
    const x = S.items.find(o => o.n.toLowerCase() === it.name.toLowerCase());
    if (x) x.q = (Number(x.q) || 0) + 1;
    else S.items.push({ n: it.name, q: 1, d: it.desc, eq: !!it.eq, on: false, ...(it.w ? { w: { ...it.w } } : {}), ...(it.ar ? { ar: { ...it.ar } } : {}), ...(it.at ? { at: true } : {}), ...(it.fx ? { fx: it.fx.map(f => [...f]) } : {}), v: 2 });
  }
  else {
    if (!S.species) S.species = it.name;
    const traits = it.traits && it.traits.length ? it.traits : [{ n: it.name, d: it.desc }];
    for (const t of traits) if (!S.race.some(x => x.n.toLowerCase() === t.n.toLowerCase())) S.race.push({ n: t.n, t: '', d: t.d });
  }
  onChange();
}

function draw() {
  const S = getS();
  const { shown, total } = data ? search(data.items, kind, query) : { shown: [], total: 0 };
  const rows = shown.map((it, idx) => {
    const id = kind + ':' + it.name + ':' + idx;
    const done = has(S, it);
    return `<div class="lrow"><div class="lhd"><button class="lk" data-lo="${esc(id)}" aria-expanded="${open.has(id)}"><span>${esc(it.name)}</span><small>${esc(it.sub)}${it.src === 'Custom' ? ' (custom)' : ''}</small></button>
      <button class="${done ? '' : 'pri'}" data-la="${idx}" ${done ? 'disabled' : ''}>${done ? 'Added' : kind === 'race' ? 'Add species' : owned(S, it) ? `Add (have ${owned(S, it)})` : 'Add'}</button></div>
      ${open.has(id) ? `<p class="sd">${md(it.desc) || 'No description.'}</p>` : ''}</div>`;
  }).join('');
  const stamp = data && data.at ? `SRD data saved ${new Date(data.at).toLocaleDateString()}` : '';
  dlg.innerHTML = `<div class="dh"><h2>Library</h2><button data-lc>Close</button></div>
  <div class="seg" role="tablist">${KINDS.map(k => `<button role="tab" data-lk="${k.id}" class="${k.id === kind ? 'on' : ''}">${k.label}</button>`).join('')}</div>
  <input id="lq" type="search" placeholder="Search ${KINDS.find(k => k.id === kind).label.toLowerCase()} (${kind === 'item' ? 'try weapon, armor or rare' : 'try a class name or level'})" value="${esc(query)}" aria-label="Search">
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
  getS = stateGetter; onChange = () => { changed(); draw(); };
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
      else if (b.dataset.lo) { open.has(b.dataset.lo) ? open.delete(b.dataset.lo) : open.add(b.dataset.lo); draw(); }
      else if (b.dataset.la) add(dlg._shown[+b.dataset.la]);
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
