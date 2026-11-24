// The Hit Points buttons: Damage, Heal, Set temp, Long rest and the average HP for the level.
// Spending a hit die is a roll, so it is in actions/rolls.js.
import { averageHP } from '../rules.js';

/** Damage comes off temporary hit points first, and current hit points never go below 0. */
export function takeDamage(sheet, amount) {
    const absorbed = Math.min(sheet.hp.temp, amount);
    sheet.hp.temp -= absorbed;
    sheet.hp.cur = Math.max(0, sheet.hp.cur - (amount - absorbed));
}

/** Healing never raises current hit points above the maximum. */
export function heal(sheet, amount) {
    sheet.hp.cur = Math.min(sheet.hp.max, sheet.hp.cur + amount);
}

/** Temporary hit points don't stack: the character keeps whichever amount is higher. */
export function setTemporaryHitPoints(sheet, amount) {
    sheet.hp.temp = Math.max(sheet.hp.temp, amount);
}

/** A long rest restores all hit points, every spent hit die and every spell slot, and ends temporary hit points. */
export function longRest(sheet) {
    sheet.hp.cur = sheet.hp.max;
    sheet.hp.temp = 0;
    sheet.hd = 0;
    for (const slotLevel of sheet.slots) slotLevel.u = 0;
}

/**
 * Sets the maximum to the fixed average for the level. When leveling up, the new maximum comes with the
 * hit points gained, so current hit points rise by the same amount.
 */
export function useAverageHitPoints(sheet) {
    const average = averageHP(sheet);
    if (average > sheet.hp.max) sheet.hp.cur += average - sheet.hp.max;
    sheet.hp.max = average;
}
