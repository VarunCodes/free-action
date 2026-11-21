// Which species the Species drop-down offers and recognises (src/rules.js). Run with `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownSpecies, speciesNames } from '../../src/rules.js';

const library = [{ name: 'Tiefling' }, { name: 'Elf' }, { name: 'Elf' }, { name: 'Kobold' }];

test('before the Library is downloaded, the SRD 5.2 species are offered', () => {
    assert.deepEqual(speciesNames([]),
        ['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling']);
});

test("the Library's species are offered in alphabetical order, each once", () => {
    assert.deepEqual(speciesNames(library), ['Elf', 'Kobold', 'Tiefling']);
});

test('a typed name matches a species whatever its case and spacing', () => {
    assert.equal(knownSpecies(' elf ', []), 'Elf');
    assert.equal(knownSpecies('KOBOLD', library), 'Kobold');
});

test('a name that is not on offer is a custom species', () => {
    assert.equal(knownSpecies('Kobold', []), undefined);
    assert.equal(knownSpecies('', library), undefined);
});
