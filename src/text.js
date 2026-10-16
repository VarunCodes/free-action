// Tiny, safe markdown-ish renderer for SRD descriptions.
export const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function md(src) {
  if (!src) return '';
  const isRule = l => l.includes('|') && l.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(l);
  const lines = String(src).split('\n').filter(l => !isRule(l));
  const out = lines.map(l => {
    const t = l.trim();
    if (t.startsWith('|')) return t.replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join(' / ');
    return l.replace(/^#{1,6}\s*/, '');
  });
  return esc(out.join('\n'))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>');
}

// Magic item rarity, by rank (0 = mundane gear, which gets no tag).
export const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
export const rarityTag = r => (r > 0 && r < 7 ? ` <span class="rar r${r}">${RARITY[r]}</span>` : '');
