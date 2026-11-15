# Seeded bugs: does the suite catch real mistakes?

The last step of the test plan (#28) before refactoring `src/main.js`. Each row is one small bug put into `src/` on
purpose, the kind a refactor could slip in. For each one, the whole Chromium suite ran against a fresh build
(`CI=1 npx playwright test --project=chromium`), the failing tests were recorded, and the code was put back.

Before any bug went in, all 172 Chromium tests passed (2026-11-15, at the commit that merged #44).

**Result: 20 of 21 caught.** The one that got through can't be seen in the app (see `heal` below). Two bugs
were missed at first, so this PR adds a test for each and they are now caught.

| Bug | Change made | Tests failed | Caught by |
|---|---|---|---|
| prof | Proficiency bonus uses `floor` instead of `ceil` | 47 | proficiency, checks, gear, rolls, effects, roll bar, Library, species |
| mod | Ability modifier rounds toward zero (9 gives +0, not −1) | 7 | abilities, checks, hp |
| medium | Medium armor lets Dex add up to +3 | 2 | armor |
| shield | A Shield is left out of AC | 5 | armor |
| attune | A 4th attuned item works | 1 | gear |
| strreq | Too little Strength for armor no longer costs 10 ft | 1 | gear |
| passive | Passive Perception starts at 8 | 4 | checks, effects |
| expertise | Expertise counts as plain proficiency | 5 | checks, effects |
| temp | Damage skips Temporary Hit Points | 2 | hp |
| heal | Healing isn't capped at max HP | 0 | **not caught**: can't be seen in the app, see below |
| hdmin | A hit die can heal less than 1 | 1 | hp |
| longhd | A long rest doesn't restore hit dice | 1 | hp |
| avghp | Average HP per level is 1 too low | 10 | hp, effects, Library |
| clssv | Picking a class doesn't add its saving throws | 15 | classes |
| toughness | Dwarven Toughness gives +1 HP in total, not per level | 3 | hp, effects, Library |
| species | Changing species keeps the old species' traits | 3 | species |
| advdis | Advantage and Disadvantage don't cancel out | 1 | effects |
| crit | A critical hit doesn't double the dice | 3 | rolls |
| hpclamp | Loading a sheet doesn't cap current HP at max | 2 | upgrade, hp |
| snapdup | History saves a version identical to the newest one | 1 | history (**new test**) |
| cache | The Library reuses a saved copy from an older app version | 1 | Library (**new test**) |

## Notes

- **heal can't be seen in the app.** `save()` runs the sheet through `cleanSheet()`, which caps current HP at
  max, before every render. So the cap in the Heal button is a second guard, and removing it changes nothing
  you can see. The existing test ("healing raises current HP but never above the maximum") still covers the
  rule. If the refactor moves saving after rendering, that test will catch it.
- **The two new tests:**
  - `persistence/history.spec.ts`: "a version identical to the newest saved one is not saved twice". The list
    holds six versions, so duplicates would push out real ones.
  - `library/library.spec.ts`: "a saved copy from an older version of the app is downloaded again".
- **Caught by one test only:** attune, strreq, hdmin, longhd, advdis, snapdup and cache. Each is covered, but
  one deleted or weakened test would hide it, so be careful with those tests during the refactor.
