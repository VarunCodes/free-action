// Gear added before the Library knew about armor class, save bonuses, Stealth, attunement, magic effects or
// rarity gets that data filled in from the saved Library copy, matched by name. Each item records the data
// version it was filled to (item.v), so it's filled only once per version and later hand edits stick:
//   version 1  weapon dice, armor (AC, save bonus, Stealth Disadvantage)
//   version 2  attunement, magic effects, and the Mithral fix
//   version 3  rarity
// Only what the item is missing is filled; nothing the player typed is overwritten.
export const GEAR_DATA_VERSION = 3;

/** Fills the sheet's items from the Library's items. Returns true if any item changed. */
export function fillGearFromLibrary(sheet, libraryItems) {
    const libraryByName = new Map(libraryItems.map(entry => [entry.name.toLowerCase(), entry]));
    let changed = false;
    for (const item of sheet.items) {
        const libraryItem = libraryByName.get(item.n.toLowerCase());
        const version = item.v || 0;
        if (!libraryItem || version >= GEAR_DATA_VERSION) continue;
        fillItem(item, libraryItem, version);
        item.v = GEAR_DATA_VERSION;
        changed = true;
    }
    return changed;
}

function fillItem(item, libraryItem, version) {
    fillMissingFields(item, libraryItem);
    if (version < 1 && libraryItem.ar) fillArmor(item, libraryItem.ar);
    fixMithral(item);
}

// Equippable, weapon dice, rarity, needs attunement and magic effects.
function fillMissingFields(item, libraryItem) {
    if (libraryItem.eq && !item.eq) item.eq = true;
    if (libraryItem.w && !item.w) item.w = { ...libraryItem.w };
    if (libraryItem.rr && !item.rr) item.rr = libraryItem.rr;
    if (libraryItem.at && item.at === undefined) item.at = true;
    if (libraryItem.fx && !item.fx) item.fx = libraryItem.fx.map(effect => [...effect]);
}

// Mithral armor has no Strength requirement and no Disadvantage on Stealth, whatever the base armor has.
function fixMithral(item) {
    if (!/^Mithral Armor/i.test(item.n) || !item.ar) return;
    item.ar.str = 0;
    item.ar.stl = false;
}

// Armor without a kind is replaced whole. Armor the player set up keeps its numbers and only gains a save
// bonus or Stealth Disadvantage it was missing.
function fillArmor(item, libraryArmor) {
    if (!item.ar || !item.ar.k) {
        item.ar = { ...libraryArmor };
        return;
    }
    if (!item.ar.sb && libraryArmor.sb) item.ar.sb = libraryArmor.sb;
    if (!item.ar.stl && libraryArmor.stl) item.ar.stl = true;
}
