# free-action

A D&D 5.5e (2024 rules) character sheet that runs in the browser with no backend. It is hosted on GitHub Pages at https://varuncodes.github.io/free-action/.

## Ground rules

- **Use the 2024 Player's Handbook (SRD 5.2), not 2014.** For example: ability score increases come from the background, not the species. Species give traits only. Weapon Mastery, Heroic Inspiration and Origin feats are all 2024 rules.
- **No runtime dependencies.** Vite is the only package, and it is a dev/build tool. Ask before adding any library, framework or CDN script.
- **Keep non-SRD book text out of the repo.** Players import that content into their own browser as custom packs.

## Run and test

    npm install
    npm run dev      # http://localhost:5173/free-action/
    npm run build    # what CI runs; must pass

There are no automated tests. Test every change by hand on localhost in Play and Edit mode, and at phone width (~375px). If you change saved data, check that an older sheet still loads: import a JSON backup made before the change.

Pushing to `main` deploys through `.github/workflows/deploy.yml`.

## Workflow

- Use one branch per change: `feat/…`, `fix/…`, `docs/…`. Never commit to `main` directly.
- Open a PR with a detailed description: what changed, why, which 2024 rule it follows, and how it was tested on localhost.
- Test on localhost before merging. The user merges.

## Files

| File | What it holds |
|---|---|
| `src/sheet.js` | The data model. `DEF()` creates a blank sheet. `cleanSheet()` validates and coerces every field. It also has the constants: `AB`, `ABN`, `SK` (skills), `CLS` (the 12 classes: saves, casting ability, hit die). |
| `src/main.js` | Everything on the sheet page: state, derived numbers, `render()`, event handlers, rolling, backup and restore. |
| `src/library.js` | Fetches the SRD from the Open5e API (`srd-2024`), caches it in IndexedDB, and turns API rows into Library entries. Reads item and trait effects out of their text. |
| `src/libraryui.js` | The Library dialog: search, filters, Add/Remove. `swapSpecies()` swaps one species' traits for another's. |
| `src/text.js` | `esc()` for HTML escaping, `md()` as a small markdown renderer, rarity tags. |
| `src/style.css` | All styles. |

## How the sheet works

**State and storage.** There is one mutable object, `S`, in `main.js`.
- `save()` runs `cleanSheet(S)` and writes the result to localStorage under `sheet`.
- `snapshot()` keeps up to 6 earlier versions in `sheet-history`: one when the page opens, at most one per 30 minutes of editing, and one before import, restore, new character or a species change.
- Other localStorage keys: `sheet-exported` (time of the last backup) and `roll-min` (whether the roll bar is collapsed).
- IndexedDB database `dnd-sheet`, store `kv`: `srd-cache` holds the SRD and is versioned by `CACHE_VER` in `library.js`. `packs` holds custom content.
- A `storage` event from another tab replaces `S` with that tab's copy.

**Rendering.** `render()` rebuilds the whole page as one HTML string and sets it with `innerHTML`. No part of the page is updated on its own.
- `data-k="path.to.field"` binds an input to `S`. The global `change` handler calls `setPath()`, then `save()`, then `render()`.
- `data-a="action"` (with an optional `data-v`) marks a button. The global `click` handler is one long `if/else` on the action name.
- Other attributes: `data-ch` (a skill pick for a trait), `data-up` (upcast slot level), `data-id` (which `<details>` are open, tracked in `OPEN`). The Library dialog uses its own `data-l*` attributes.
- Escape every value from the user or the API with `esc()`, or with `md()` for descriptions. Everything ends up in `innerHTML`.
- `cut()` marks where each section starts in the HTML string. The end of `render()` slices the string at those marks and places the sections in three columns. On phones the CSS `order` puts them back into one column.

**Data changes.** Every new field must be handled in `cleanSheet()`, with type, range and a default. Otherwise it disappears on the next save. Old sheets must keep loading. Upgrade them in `cleanSheet()`, as `acAuto` does, or in `backfill()` for gear.

**Classes.** `CLS[name]` gives `{ sv, ca, hd }`.
- `setClass()` swaps the old class's save proficiencies and casting ability for the new class's. A casting ability the player picked by hand is kept.
- A custom class is any name not in `CLS`. It shows a text box and a hit-die picker (`hdie`).
- Hit dice: `hd` is the number spent. A long rest resets it.
- `avgHP()` uses the fixed-average rule.

**Species.** `S.species` holds the name. `S.race` holds the racial traits as `{ n, t, d, fx?, ch? }`.
- `setSpecies()` in `main.js` takes a snapshot, then calls `swapSpecies()`. It also sets Speed, unless the player typed their own.
- The drop-down lists the Library's species (`SPC`). Before the Library has downloaded, it falls back to the SRD names in `SPN`.

**Effects** are the single route by which items, feats and traits change numbers. Each effect is a triple, `[type, target, value]`.
- Types: `set` (an ability score becomes the value), `ab` (+value to an ability), `chk` (ability checks), `sv` (saving throws), `sa` (spell attack), `dc` (spell save DC), `adv` (Advantage on a skill, or on `init`), `hp` (+value HP per level), `sk` (skill proficiency; the value is 1 for proficiency, 2 for Expertise).
- An `sk` target is a skill name, `?` (any skill) or `?A|B|C` (one from a list). The player's picks are stored in the feature's `ch` array, one per choice, in order.
- Item effects come from `effectsOf()`. Trait effects come from `traitEffects()`, which tries three sources in order: the trait's own `fx`, the `TRAIT_FX` table of names, and patterns in the trait's text.
- `cleanFx()` in `sheet.js` validates effects. Add a new type in all of these places: `FX` and `cleanFx`, `fxLabel`, and wherever its sum is used (`fxSum` / `fxOf`).
- Live gear is gear that is equipped and, where it needs attunement, attuned (at most 3 items). See `gear()`.

## Code style

- `sheet.js`, `library.js` and `libraryui.js` use normal formatting: one statement per line and descriptive names. **Write new code in that style.**
- `main.js` is written in a dense style: long one-line functions and short global names (`S`, `CC`, `CS`, `CMSG`, `SPC`, `UP`, `RM`). When you change existing lines there, keep their style. Put new logic in a normally formatted function, or in a new module, rather than adding to the one-liners.
- Comments explain *why* in plain English, and often name the rule involved. Keep them that way.
- UI text is short, plain and specific. It says what happened and what to do next, like the messages set in `CMSG` and `IOMSG`.

## Next up: lineage and ancestry choices

Several 2024 species have a choice that the sheet doesn't model yet:
- Elf: Elven Lineage (Drow, High, Wood)
- Gnome: Gnomish Lineage (Forest, Rock)
- Tiefling: Fiendish Legacy (Abyssal, Chthonic, Infernal)
- Dragonborn: Draconic Ancestry (damage type)
- Goliath: Giant Ancestry

Some species also choose a size (Small or Medium). Check how Open5e's `srd-2024` species data represents these options (a table in the trait text, or subspecies?) before designing the stored shape. The choice should be stored on the sheet, and changing species should clear it. The choice should go through `cleanSheet()` and the existing trait and effect path, not around them.
