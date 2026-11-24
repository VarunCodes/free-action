// Turning Open5e's feats, species and classes into Library entries. A class becomes one entry per feature
// it gains with a level, so features can be added to the sheet one at a time.
import { textOf, listOf } from './values.js';

export function libraryFeat(row) {
    const benefits = listOf(row.benefits).map(benefitText).filter(Boolean);
    const prerequisite = row.prerequisite && `Prerequisite: ${row.prerequisite}`;
    return {
        kind: 'feat',
        name: row.name,
        level: 0,
        sub: row.type ? `${capitalized(String(row.type).toLowerCase())} feat` : 'Feat',
        desc: [prerequisite, row.desc, ...benefits.map(benefit => `- ${benefit}`)].filter(Boolean).join('\n\n'),
        src: 'SRD',
    };
}

const benefitText = benefit => (typeof benefit === 'string' ? benefit : benefit.desc || benefit.name || '');
const capitalized = text => (text ? text[0].toUpperCase() + text.slice(1) : text);

// A species keeps its traits, in Open5e's order, as { n: name, d: description } for the sheet's Racial features.
export function librarySpecies(row) {
    const traits = [...listOf(row.traits)]
        .sort((first, second) => (first.order ?? 0) - (second.order ?? 0))
        .map(trait => ({ n: trait.name, d: trait.desc || '' }));
    const parent = textOf(row.subspecies_of);
    return {
        kind: 'race',
        name: row.name,
        level: 0,
        sub: parent ? `Subspecies of ${parent}` : `${traits.length} traits`,
        desc: [row.desc, ...traits.map(trait => `**${trait.n}.** ${trait.d}`)].filter(Boolean).join('\n\n'),
        traits,
        src: 'SRD',
    };
}

// "Cleric: Life Domain, level 3". Features that aren't gained with a level (tables, notes) are skipped.
export function libraryClassFeatures(row) {
    const parent = textOf(row.subclass_of);
    const className = parent ? `${parent}: ${row.name}` : row.name;
    return listOf(row.features)
        .filter(feature => !feature.feature_type || feature.feature_type === 'CLASS_LEVEL_FEATURE')
        .map(feature => {
            const level = firstLevel(feature);
            return {
                kind: 'class',
                name: feature.name,
                level,
                sub: className + (level ? ', level ' + level : ''),
                desc: feature.desc || '',
                src: 'SRD',
            };
        });
}

// The lowest level the feature is gained at, or 0 if Open5e doesn't say.
function firstLevel(feature) {
    const levels = listOf(feature.gained_at)
        .map(gained => (typeof gained === 'number' ? gained : Number(gained?.level)))
        .filter(level => level > 0);
    return levels.length ? Math.min(...levels) : 0;
}
