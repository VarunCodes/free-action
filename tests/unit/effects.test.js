// How effects read on the sheet (src/effects.js). Run with `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectLabel, ITEM_EFFECT_CHOICES } from '../../src/effects.js';

test('an item that sets a score says what the score becomes', () => {
    assert.equal(effectLabel(['set', 'str', 19]), 'Strength becomes 19');
});

test('bonuses show their sign', () => {
    assert.equal(effectLabel(['chk', '', 1]), '+1 ability checks');
    assert.equal(effectLabel(['sv', '', -1]), '-1 saving throws');
    assert.equal(effectLabel(['sa', '', 2]), '+2 spell attacks');
    assert.equal(effectLabel(['dc', '', 1]), '+1 spell save DC');
    assert.equal(effectLabel(['hp', '', 1]), '+1 HP per level');
    assert.equal(effectLabel(['ab', 'con', 2]), '+2 Constitution');
});

test('a skill effect names the skill and whether it is proficiency or Expertise', () => {
    assert.equal(effectLabel(['sk', 'Insight', 1]), 'Insight proficiency');
    assert.equal(effectLabel(['sk', 'Insight', 2]), 'Insight expertise');
});

test('a skill choice not yet made says to choose, listing the options when there are some', () => {
    assert.equal(effectLabel(['sk', '', 1, '?']), 'Choose a skill in Edit');
    assert.equal(effectLabel(['sk', '', 1, '?Arcana|History']), 'Choose a skill (Arcana, History) in Edit');
});

test('Advantage names the roll, with Initiative spelled out', () => {
    assert.equal(effectLabel(['adv', 'init', 0]), 'Advantage on Initiative');
    assert.equal(effectLabel(['adv', 'Stealth', 0]), 'Advantage on Stealth');
});

test('an item can be given any score, the four bonuses, or Advantage on Initiative or any skill', () => {
    // 6 scores + 4 bonuses + Initiative + 18 skills.
    assert.equal(ITEM_EFFECT_CHOICES.length, 6 + 4 + 1 + 18);
    assert.deepEqual(ITEM_EFFECT_CHOICES[0], { value: 'set|str', label: 'Set Strength to (value)' });
    assert.ok(ITEM_EFFECT_CHOICES.some(choice => choice.value === 'adv|Stealth'));
});
