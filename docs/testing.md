# Playwright conventions

- Import `test`, `expect` and `loadSheet` from `tests/e2e/fixtures.ts`, never from `@playwright/test`. Its auto fixtures block the internet, fix the dice and fail on page errors. Don't work around them.
- Locators: getByRole, then getByLabel, then getByText. getByTestId only with a comment saying why. No CSS or XPath.
- Web-first assertions (`await expect(locator).toHave…`). For saved state use `await expect.poll(savedSheet).toMatchObject(…)`. No waitForTimeout, no `isVisible()` in conditions.
- Seed the starting state with `seedSheet(loadSheet('…'))` before `page.goto`; click only the behaviour the test is about. Seed characters live in `tests/e2e/data/sheets/`. Library content (custom species, feats) is seeded the same way with `seedPacks([...])`.
- Switch between Play and Edit with `switchMode(page, 'Edit')`, not a bare click: it waits until the mode has changed.
- Mock the Open5e API with saved responses in `tests/e2e/data/open5e/` by using the `open5e` fixture (it records requests and can make a part fail); never call the real API.
- Expected numbers come from the 2024 rules, worked out by hand, with a comment naming the rule. Never copy them from the app's output.
- Tests are independent: they pass with `--shuffle --repeat-each=3`.
- Title = the behaviour in plain English ("medium armor adds at most +2 Dex").
- Tag the fast subset `{ tag: '@smoke' }`. Folders give the category; don't tag them.
- Specs in `tests/e2e/rules/` run in Chromium only, because they check arithmetic. Anything that can differ by browser or screen size (storage, downloads, dialogs, layout) goes outside `rules/`, so it runs in all three projects.
- Wrap flows of several actions in `test.step` with a readable title.
- Known app bug: mark the test `test.fail()` and link the issue (`annotation: { type: 'issue', description: '<issue URL>' }`). It still runs. Once the bug is fixed it passes, Playwright reports that as a failure, and the fix PR removes the marker.
- Broken or flaky test: `test.fixme()` with an issue link. It is skipped until fixed.