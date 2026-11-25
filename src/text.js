// Plain text for the page: dates and rarity names. Anything that builds HTML is in html.js.

// A date and time such as "21 Nov 2026, 14:05". The month is spelled out, so 03/04 can't be read two ways;
// the order follows the browser's language.
export function dateAndTime(time) {
    return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Magic item rarity, by rank (0 = mundane gear, which gets no tag).
export const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
