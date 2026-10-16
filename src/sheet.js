// The character sheet's shape, and cleanSheet(), which every sheet passes through on its way in
// (page load, Import, restoring a snapshot, another tab saving). Anything unexpected is dropped
// or coerced, so the page can trust that numbers are numbers and lists hold the right things.
export const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABN = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const SK = [['Acrobatics', 'dex'], ['Animal Handling', 'wis'], ['Arcana', 'int'], ['Athletics', 'str'], ['Deception', 'cha'], ['History', 'int'], ['Insight', 'wis'], ['Intimidation', 'cha'], ['Investigation', 'int'], ['Medicine', 'wis'], ['Nature', 'int'], ['Perception', 'wis'], ['Performance', 'cha'], ['Persuasion', 'cha'], ['Religion', 'int'], ['Sleight of Hand', 'dex'], ['Stealth', 'dex'], ['Survival', 'wis']];
export const DEF = () => ({ name: 'New Hero', cls: '', sub: '', species: '', bg: '', level: 1, mode: 'play', ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, sv: {}, sk: {}, hp: { cur: 10, max: 10, temp: 0 }, ac: 10, speed: 30, init: 0, cast: '', slots: Array.from({ length: 9 }, () => ({ m: 0, u: 0 })), spells: [], items: [], notes: '', insp: false, feats: [], race: [], vtt: 'foundry', spc: false, inc: false, acAuto: true, acb: 0 });

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const str = (v, max = 200, dflt = '') => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : dflt);
const int = (v, lo, hi, dflt) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const bool = v => v === true;
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);

const cleanRoll = r => {
  r = obj(r);
  return {
    a: bool(r.a), s: pick(r.s, AB, ''), d: str(r.d, 40), b: str(r.b, 40), t: str(r.t, 40), h: bool(r.h), m: bool(r.m),
    by: pick(r.by, ['char', 'slot'], 'slot'),
    up: arr(r.up, 20).filter(Array.isArray).map(u => [int(u[0], 0, 20, 0), str(u[1], 40), int(u[2], 0, 20, 0)]),
  };
};
const cleanWeapon = w => {
  w = obj(w);
  return { d: str(w.d, 40), t: str(w.t, 40), v: str(w.v, 40), b: int(w.b, -10, 10, 0), ab: pick(w.ab, ['str', 'dex', 'fin'], 'str') };
};
const cleanArmor = a => {
  a = obj(a);
  return { k: pick(a.k, ['light', 'medium', 'heavy', 'shield', 'bonus', 'unarm'], ''), ac: int(a.ac, -10, 30, 0), str: int(a.str, 0, 30, 0), nu: bool(a.nu), sb: int(a.sb, -5, 10, 0), stl: bool(a.stl) };
};
// Item effects: [type, target, value]. See effectsOf() in library.js.
const FX = ["set", "chk", "sv", "sa", "dc", "adv"];
const cleanFx = l => arr(l, 12).filter(Array.isArray).map(([t, a, v]) => {
  t = pick(t, FX, "");
  a = t === "set" ? pick(a, AB, "") : t === "adv" ? pick(a, ["init", ...SK.map(([n]) => n)], "") : "";
  return [t, a, int(v, t === "set" ? 1 : -10, 30, 0)];
}).filter(([t, a]) => t && (a || !["set", "adv"].includes(t)));
const cleanFeat = f => { f = obj(f); return { n: str(f.n), t: str(f.t, 60), d: str(f.d, 20000) }; };

export function cleanSheet(o) {
  o = obj(o);
  const d = DEF(), ab = obj(o.ab), sv = obj(o.sv), sk = obj(o.sk), hp = obj(o.hp), slots = arr(o.slots, 9);
  const hpMax = int(hp.max, 0, 9999, d.hp.max);
  return {
    name: str(o.name, 120, d.name), cls: str(o.cls, 120), sub: str(o.sub, 120), species: str(o.species, 120), bg: str(o.bg, 120),
    level: int(o.level, 1, 20, 1), mode: pick(o.mode, ['play', 'edit'], 'play'),
    ab: Object.fromEntries(AB.map(a => [a, int(ab[a], 1, 30, 10)])),
    sv: Object.fromEntries(AB.filter(a => bool(sv[a])).map(a => [a, true])),
    sk: Object.fromEntries(SK.map(([n]) => [n, int(sk[n], 0, 2, 0)]).filter(([, v]) => v)),
    hp: { cur: int(hp.cur, 0, 9999, hpMax), max: hpMax, temp: int(hp.temp, 0, 9999, 0) },
    ac: int(o.ac, 0, 50, d.ac), speed: int(o.speed, 0, 999, d.speed), init: int(o.init, -20, 20, 0),
    cast: pick(o.cast, AB, ''),
    slots: d.slots.map((_, i) => { const s = obj(slots[i]), m = int(s.m, 0, 9, 0); return { m, u: int(s.u, 0, m, 0) }; }),
    spells: arr(o.spells, 500).map(obj).filter(x => x.n).map(x => ({ n: str(x.n), l: int(x.l, 0, 9, 0), p: bool(x.p), d: str(x.d, 20000), r: cleanRoll(x.r) })),
    items: arr(o.items, 500).map(obj).filter(x => x.n).map(x => ({
      n: str(x.n), q: int(x.q, 0, 99999, 1), d: str(x.d, 20000),
      ...(x.eq === undefined ? {} : { eq: bool(x.eq) }), on: bool(x.on),
      ...(x.w ? { w: cleanWeapon(x.w) } : {}),
      ...(x.ar ? { ar: cleanArmor(x.ar) } : {}),
      ...(x.v ? { v: int(x.v, 0, 99, 0) } : {}),
      ...(x.rr ? { rr: int(x.rr, 0, 6, 0) } : {}),
      ...(x.at ? { at: true, ...(x.att === undefined ? {} : { att: bool(x.att) }) } : {}), ...(x.fx ? { fx: cleanFx(x.fx) } : {}),
    })),
    notes: str(o.notes, 100000), insp: bool(o.insp),
    feats: arr(o.feats, 500).map(cleanFeat).filter(f => f.n), race: arr(o.race, 200).map(cleanFeat).filter(f => f.n),
    vtt: pick(o.vtt, ['foundry', 'roll20', 'roll20t'], 'foundry'), spc: bool(o.spc), inc: bool(o.inc),
    // Sheets from before AC was calculated keep a hand-typed AC unless it was still the default.
    acAuto: o.acAuto === undefined ? (o.ac === undefined || Number(o.ac) === 10) : bool(o.acAuto), acb: int(o.acb, -10, 20, 0),
  };
}
