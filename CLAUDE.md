# free-action

A D&D 5.5e (2024 rules) character sheet in plain HTML, CSS and JS. Vite builds it and GitHub Pages hosts it. Pushing to `main` deploys the site.

## Commands

- Dev server: `npm run dev`, then open http://localhost:5173/
- Build (CI runs this, so it must pass): `npm run build`
- Serve the build: `npm run serve` (http://localhost:4173/)
- All e2e tests: `npx playwright test`. They reuse a running dev server; `CI=1` tests the build instead, as CI does.
- One file: `npx playwright test tests/e2e/smoke.spec.ts`. One browser: `--project=chromium` (also `webkit`, `phone`).
- Only what changed vs main: `npx playwright test --only-changed=main`
- Debug a failure: `npx playwright test --debug=cli`, or `npx playwright show-trace <trace.zip>`

## Rules

- Follow the 2024 PHB / SRD 5.2, never 2014. For example, ability score increases come from the background, not the species.
- Add no runtime dependencies without asking. Dev tools need approval too.
- Never commit non-SRD book text. It belongs in the user's own custom packs.

## Git and PRs

- Never commit to `main`. Branch names start with `feat/`, `fix/`, `test/`, `ci/`, `chore/` or `docs/`.
- Use Conventional Commits (`feat:`, `fix:`, `test:`, `ci:`, `chore:`, `docs:`).
- One concern per PR, under about 400 changed lines. Open it with `gh pr create`. The description says what changed, why, which rule it follows, and how it was tested.
- Test on localhost before asking for a merge. The user merges.

## Testing

- IMPORTANT: never weaken an assertion, add a timeout, or update a snapshot to make a failing test pass. Report the failure and why.
- A known app bug gets `test.fail()` with an issue annotation, not a deleted test.
- Playwright conventions are in `.claude/rules/testing.md`.

## Gotchas

- State is one object, `S`, in `src/main.js`. It's saved to localStorage under `sheet`, with up to 6 snapshots in `sheet-history`. The SRD cache and custom packs live in IndexedDB (`dnd-sheet`).
- Every field must be handled in `cleanSheet()` (`src/sheet.js`). A field it doesn't handle is silently dropped on the next save.
- Sheets saved before a change must still load. Upgrade them in `cleanSheet()` or in `backfill()`.
- `render()` rebuilds the whole page with `innerHTML`. Pass every user or API value through `esc()`, or through `md()` for descriptions.
- Inputs bind to state through `data-k="path"`. Buttons dispatch through `data-a="action"`.
- Items, feats and traits change numbers only through effects: `[type, target, value]`. A new effect type must be added to `FX` and `cleanFx`, to `fxLabel`, and wherever its sum is used.
- In `src/main.js`, new code goes in normally formatted functions. Don't extend the long one-liners.
