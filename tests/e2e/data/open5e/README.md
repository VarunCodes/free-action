Saved Open5e API v2 responses for the Library tests. The `open5e` fixture in `tests/e2e/fixtures.ts`
replays them, so no test calls the real API.

They're a few real records, captured once with `name__iexact=` filters and trimmed to what the tests
use. The 2014 copies that the items and magicitems endpoints return alongside the 2024 ones are kept
on purpose: the app must drop them. `items-1.json` links to `items-2.json` over plain `http://`, as
Open5e does, to test following the next page.

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the
Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative
Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

This work includes material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the
Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

Data served by Open5e (https://open5e.com).
