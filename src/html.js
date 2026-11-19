// Small pieces of HTML that several sections of the sheet use. Every value that comes from the sheet
// or the Library goes through esc() (or md() for descriptions) before it's put in the page.
import { esc } from './text.js';
import { signed } from './rules.js';

// Every bound field gets an id from its key (f-hp-max), so a visible label can point at it with for=.
export const fieldId = key => 'f-' + key.split('.').join('-');

// An input bound to a path in the sheet through data-k, such as 'hp.max' or 'ab.str'.
export const input = (key, value, type = 'text', extra = '') =>
  `<input id="${fieldId(key)}" data-k="${key}" type="${type}" value="${esc(value)}" ${extra}>`;

// An input with a visible label above it.
export const field = (label, key, value, type, extra) =>
  `<div><label class="lab" for="${fieldId(key)}">${label}</label>${input(key, value, type, extra)}</div>`;

// Proficiency marks by level (0 none, 1 proficient, 2 Expertise): an empty ring, the same ring with
// a dot inside, and a diamond. The labels say the same in words.
export const PROF_MARK = ['<i class="pm"></i>', '<i class="pm on"></i>', '◆'];
export const PROF_LABEL = ['Not proficient', 'Proficient', 'Expertise'];

// "Ring of Protection +1, Stone of Good Luck +1" from [[name, value], ...].
export const sourcesText = list => list.map(([name, value]) => `${name} ${signed(value)}`).join(', ');
