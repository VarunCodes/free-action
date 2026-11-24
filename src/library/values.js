// Reading Open5e's fields, which are not always the same shape.

/** Open5e gives some fields as text and others as objects with a name; this reads either as text. */
export function textOf(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return value.name ?? value.display_name ?? '';
}

/** A field that should be a list, or an empty list when it's missing. */
export const listOf = value => (Array.isArray(value) ? value : []);

export const ABILITY_KEYS = {
    strength: 'str',
    dexterity: 'dex',
    constitution: 'con',
    intelligence: 'int',
    wisdom: 'wis',
    charisma: 'cha',
};

/** Splits a description into sentences, keeping each sentence's full stop. */
export const sentencesOf = text => text.split(/(?<=\.)\s+/);
