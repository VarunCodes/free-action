// Text for the page: escaping, a small markdown renderer for SRD descriptions, and rarity marks.

// Makes any value safe to put in HTML, text or an attribute.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = value => String(value ?? '').replace(/[&<>"]/g, char => ENTITIES[char]);

// Tiny, safe markdown-ish renderer for SRD descriptions: escapes everything, then allows **bold**,
// *italic* and _italic_. Headings lose their #s, and table rows become "a / b / c".
export function md(src) {
    if (!src) return '';
    const isTableRule = line => line.includes('|') && line.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
    const lines = String(src).split('\n').filter(line => !isTableRule(line));
    const out = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('|')) {
            return trimmed.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()).join(' / ');
        }
        return line.replace(/^#{1,6}\s*/, '');
    });
    return esc(out.join('\n'))
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
        .replace(/_([^_\n]+)_/g, '<i>$1</i>');
}

// Magic item rarity, by rank (0 = mundane gear, which gets no tag).
export const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
export const rarityTag = rank => (rank > 0 && rank < 7 ? ` <span class="rar r${rank}">${RARITY[rank]}</span>` : '');
// A ✦ before magic item names, in the rarity's color. Hidden from screen readers: the tag says it.
export const magicMark = rank => (rank > 0 && rank < 7 ? `<span class="mm r${rank}" aria-hidden="true">✦</span>` : '');
