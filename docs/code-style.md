# Code style

Code here is written for the next person to read it, so it must read clearly without its author there to explain.
These rules came out of the refactor of `src/main.js` (#45). Lint checks what it can (see below); the rest is up
to the author and the reviewer.

## Names

- Whole words that a reader or a player would use: `oldSpecies`, not `ob`; `speciesName`, not `n`. No
  abbreviations, except ones the game itself uses (`hp`, `ac`, `dc`).
- Functions are verb phrases that say what they do: `takeDamage`, `fillGearFromLibrary`, `swapSaveProficiencies`.
- True/false values read as questions: `isLoaded`, `hasSpeciesToLose`, `castingAbilityCameFromOldClass`.
- No bare numbers or strings with a meaning: name them. `MAX_ATTUNED_ITEMS`, `GEAR_DATA_VERSION`,
  `NOTHING_TO_SAVE`.
- Names say what a value means, not where it sits: `attacks`, not `step`; `fromLevel`, not `level`.
- Element ids, `data-` attributes and `data-action` names are whole words too. Actions are kebab-case verb
  phrases: `add-spell`, `toggle-attunement`, `spend-hit-die`.

## Functions and where code goes

- One job per function. When a line does two things, give one of them a named helper (`packTrait`,
  `cleanScalingStep`, `classCastingNote`).
- A table of named handlers beats a long `if`/`else` chain: see `CLICK_ACTIONS` in `src/main.js`.
- Code goes where its job is:
  - `src/actions/`: what a button or picker changes on the sheet.
  - `src/sections/`: the HTML for a part of the page, written with the `html` tag from `src/html.js`.
  - `src/library/`: reading, filtering and storing Library content.
  - Plain modules (`rules.js`, `rolls.js`, `sheet.js`, `gearUpgrade.js`): logic that needs no browser, so it can
    have unit tests.
- HTML is built only in `src/sections/`, with the `html` tag, which escapes every value. Never build markup in a
  logic file or call `esc()` by hand: custom packs are pasted-in JSON, and one missed value puts their markup on
  the page.
- Return an object with named fields, not an array whose positions carry meaning: `{ list, index }`, not
  `[list, index]`.
- Pass `sheet` and `ui` in as arguments instead of reaching for globals, so a function says what it uses.

## Comments

- Say why, or which 2024 rule applies, not what the next line does: "Temporary hit points don't stack: the
  character keeps whichever amount is higher."
- Document a saved format where it's cleaned, key by key, as `src/sheet.js` does.
- A function's comment describes what it does for the player, in their words, before any detail of how.

## Saved data

- New keys saved in the sheet are whole words.
- The short keys already saved (`sv`, `sk`, `n`, `fx`, a spell's `r.a`, `r.s`, …) are known debt. Don't copy them
  into new code. Rename one only in its own PR, with an upgrade in `cleanSheet()` and a test that loads a sheet
  in the old format, because saved sheets, backups and history versions must still load.
- Element ids, `data-` attributes and `ui` fields aren't saved, so they can be renamed in any PR.

## What lint checks

Every file listed in `READABLE` in `eslint.config.js` must pass these rules. `npm run lint` runs them, and so does
CI:

- Lines of at most 120 characters, and one statement per line.
- Functions of at most 40 lines, a complexity of at most 12, and nesting at most 3 deep.
- No one-letter names except the loop counters `i` and `j` (`id-length`). Object keys are left alone because of
  the saved short keys.
- `const` over `let`, never `var`, and `===`.

A new file goes in `READABLE` from its first commit. A file that is rewritten is added in the same PR.

## Refactor PRs

- Behaviour is unchanged. No test is edited to make it pass. If a label changes on purpose, the PR says which
  test changed and why.
- One area per PR, under about 400 changed lines. Stack PRs when a change is bigger.
- Before asking for a merge, run `npm run lint`, `npm run build`, `npm run test:unit` and the full Playwright
  suite (`CI=1 npx playwright test`).

## Example

Before (#45, `src/main.js`): choosing a class, as it was written.

```js
function setClass(c){const o=CLS[knownClass(sheet.cls)],n=CLS[c],n0=ABN[sheet.cast];sheet.cls=c;if(!n)return;
    if(o)o.sv.forEach(a=>{if(!n.sv.includes(a))delete sheet.sv[a]});n.sv.forEach(a=>sheet.sv[a]=true);
    if(!sheet.cast||(o&&sheet.cast===o.ca))sheet.cast=n.ca;
```

After (`src/actions/character.js`):

```js
export function setClass(sheet, ui, className) {
    const oldClass = STANDARD_CLASSES[knownClass(sheet.cls)];
    const newClass = STANDARD_CLASSES[className];
    const hadCastingAbility = Boolean(ABILITY_NAMES[sheet.cast]);
    sheet.cls = className;
    if (!newClass) return;

    swapSaveProficiencies(sheet, oldClass, newClass);
    const castingAbilityCameFromOldClass = oldClass && sheet.cast === oldClass.spellcasting;
    if (!sheet.cast || castingAbilityCameFromOldClass) sheet.cast = newClass.spellcasting;
    ui.headerMessage = classMessage(sheet, className, newClass, hadCastingAbility);
}
```

The behaviour is the same and the same tests pass. The difference is that each line now says what it's for.
