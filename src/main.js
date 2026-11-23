import './style.css';
import { openLibrary, swapSpecies } from './libraryui.js';
import { cachedItems, cachedSpecies, loadLibrary } from './library.js';
import { dateAndTime } from './text.js';
import { ABN, DEF, CLS, cleanSheet } from './sheet.js';
import {
    abilityMod, profBonus, knownClass, knownSpecies, averageHP, activeGear,
    effectsOf, effectTotal, advantageFrom, score, skillGranted, skillProf,
} from './rules.js';
import { sourcesText } from './html.js';
import { abilitiesSection, savesSection, skillsSection } from './sections/stats.js';
import { spellsSection } from './sections/spells.js';
import { inventorySection } from './sections/inventory.js';
import { featuresSection, racialFeaturesSection } from './sections/features.js';
import { headerSection } from './sections/header.js';
import { vitalsSection } from './sections/vitals.js';
import { notesSection, backupSection } from './sections/backup.js';
import { rollBarSection } from './sections/rollBar.js';
import { createUi, forgetListPlaces } from './ui.js';
import {
    rollCheck, rollSpellAttack, rollSpellEffect, rollWeaponAttack, rollWeaponDamage, spendHitDie,
    rollCustomDice, copyLastRoll, setRollMode, toggleRollOptions,
} from './actions/rolls.js';
import { loadSaved, saveSheet, snapshots, snapshot, markBackedUp, downloadSheet, readBackup } from './storage.js';
let sheet = loadSaved() || DEF();
const ui = createUi();
// A spell's roll settings when it has none yet (saved under short keys, renamed in a later step).
const newSpellRoll = () => ({ a: false, s: '', d: '', b: '', t: '', h: false, m: false, by: 'slot', up: [] });

function save() {
    sheet = saveSheet(sheet);
}

// Import, Restore and New character all replace the whole sheet. The current one goes into the history
// first, and anything that belonged to it (open sections, messages, a pending critical hit) is reset.
function replaceSheet(replacement, why) {
    snapshot(sheet, why, true);
    sheet = cleanSheet(replacement);
    ui.backupText = '';
    ui.backupMessage = null;
    ui.customClass = false;
    ui.customSpecies = false;
    ui.openSections.clear();
    forgetListPlaces(ui);
}

// Import (pasted JSON) and Open backup file. The result shows under the Backup buttons.
// Returns true if the sheet was replaced.
function importBackup(text) {
    const backup = readBackup(text);
    if (!backup) {
        ui.backupMessage = {
            isError: true,
            text: 'That is not a valid exported sheet. '
                + 'Use a file from Download backup, or paste the full JSON from Export.',
        };
        return false;
    }
    const name = cleanSheet(backup).name;
    const question = `Replace "${sheet.name}" with "${name}"? `
        + 'The current character can be brought back from "Restore an earlier version".';
    if (!confirm(question)) return false;
    replaceSheet(backup, 'before import');
    ui.backupMessage = { text: `Imported "${name}".` };
    return true;
}

// Restore the earlier version at this place in the list, after asking. Returns true if the sheet was replaced.
function restoreVersion(index) {
    const version = snapshots()[index];
    if (!version) return false;
    const savedAt = dateAndTime(version.at);
    if (!confirm(`Restore "${version.name}" from ${savedAt}? The current version is kept in the list.`)) return false;
    try {
        replaceSheet(JSON.parse(version.s), 'before restore');
    } catch {
        ui.backupMessage = { isError: true, text: 'That version could not be read.' };
        render();
        return false;
    }
    ui.backupMessage = { text: `Restored "${version.name}" from ${savedAt}.` };
    return true;
}

// Open backup file. The input is cleared afterwards, so picking the same file again still imports it.
async function openBackupFile(input) {
    const file = input.files[0];
    if (!file) return;
    ui.backupMessage = null;
    const reading = file.text();
    input.value = '';
    try {
        if (importBackup(await reading)) save();
    } catch {
        ui.backupMessage = { isError: true, text: 'Could not read that file.' };
    }
    render();
}
function setPath(k,v){const p=k.split('.');let o=sheet;while(p.length>1)o=o[p.shift()];o[p[0]]=v}
// A species' walking speed, read from its Speed trait ("Your Speed is 35 feet."); 0 if it has none.
const spSpeed=it=>{const t=it&&(it.traits||[]).find(x=>/^speed$/i.test(x.n));const m=t&&/(\d+)\s*(feet|ft)/i.exec(t.d);return m?+m[1]:0};
// Picking a species swaps the old species' racial traits for the new one's ('' or Custom only removes them).
// The sheet is saved to "Restore an earlier version" first, since the old traits (and any rewording) go; only
// before the first of several swaps in a row, so trying species one after another can't push out older versions.
// Speed follows the species unless you typed your own: it changes only from the default or the old species' speed.
function setSpecies(n){const go=()=>{const it=n?ui.librarySpecies.find(x=>x.kind==='race'&&x.name===n):null;
    if(n&&!it){sheet.species=n;ui.headerMessage=`Couldn't load ${n}'s traits. Open the Library once to download them, then pick ${n} again.`;return}
    const ob=sheet.species&&ui.librarySpecies.find(x=>x.kind==='race'&&x.name.toLowerCase()===sheet.species.toLowerCase());
    if((sheet.species||sheet.race.length)&&snapshots()[0]?.why!=='before species change')snapshot(sheet,'before species change',true);
    const r=swapSpecies(sheet,ui.librarySpecies,it),o=r.old&&r.old!==n?r.old:'',sp0=sheet.speed,ns=spSpeed(it)||(it?0:DEF().speed);
    if(ns&&(sp0===DEF().speed||sp0===spSpeed(ob)))sheet.speed=ns;
    const tr=(k,x)=>`${k} ${x} trait${k===1?'':'s'}`,spd=sheet.speed!==sp0?` Speed set to ${sheet.speed} ft.`:'';
    ui.headerMessage=(it?(o?`Swapped ${tr(r.removed,o)} for ${tr(r.added,n)} in Racial features.`:`Added ${tr(r.added,n)} to Racial features.`):o&&r.removed?`Removed ${tr(r.removed,o)} from Racial features.`:'')+spd};
if(!n||ui.librarySpecies.some(x=>x.name===n)){go();return}
ui.headerMessage=`Loading ${n}'s traits…`;loadLibrary().then(d=>{ui.librarySpecies=d.items.filter(x=>x.kind==='race')}).catch(()=>{}).finally(()=>{go();save();render()})}
// Picking a standard class swaps the old class's save proficiencies and spellcasting ability for the new one's.
// Other saves, and an ability you chose by hand, stay; the sheet can't tell a hand-ticked save from one the old
// class gave, so those go with the old class. The Spellcasting drop-down can always override what was picked.
function setClass(c){const o=CLS[knownClass(sheet.cls)],n=CLS[c],n0=ABN[sheet.cast];sheet.cls=c;if(!n)return;
    if(o)o.sv.forEach(a=>{if(!n.sv.includes(a))delete sheet.sv[a]});n.sv.forEach(a=>sheet.sv[a]=true);
    if(!sheet.cast||(o&&sheet.cast===o.ca))sheet.cast=n.ca;
    const ca=sheet.cast===n.ca?(n.ca?`${ABN[n.ca]} for spellcasting`:n0?'no spellcasting ability (pick one below if your subclass casts spells)':''):`spellcasting stays ${ABN[sheet.cast]}${n.ca?` (${c}s usually use ${ABN[n.ca]})`:''}`;
    ui.headerMessage=`${c}: proficient in ${n.sv.map(a=>ABN[a]).join(' and ')} saving throws${ca?', '+ca:''}. You can change these below.`}

function renderRoll() {
    const rollBar = document.getElementById('roll');
    rollBar.innerHTML = rollBarSection(sheet, ui.roll, id => ui.openSections.has(id));
    // The page leaves room at the bottom for however tall the bar is now.
    document.documentElement.style.setProperty('--rollh', rollBar.firstChild.offsetHeight + 'px');
}
// Values several sections use, worked out once per render:
//   editing             true in Edit mode, false in Play
//   proficiency         the proficiency bonus for the character's level
//   castingAbility      the spellcasting ability ('int', 'wis', 'cha') or '' for none
//   castingModifier     that ability's modifier (0 without one)
//   checkBonus          bonuses to every ability check, from items and features
//   spellAttackBonus    bonuses to spell attacks
//   spellDcBonus        bonuses to spell save DCs
//   checkBonusSources   "Includes Stone of Good Luck +1", or '' with no check bonus
//   advantageSources    a function: what gives Advantage on a roll ('init' or a skill name), as text
function sheetView(){
    const castingAbility = sheet.cast;
    const checkBonus = effectTotal(sheet, 'chk');
    const checkSources = effectsOf(sheet, 'chk').map(([source, [, , value]]) => [source.n, value]);
    return {
        editing: sheet.mode === 'edit',
        proficiency: profBonus(sheet),
        castingAbility,
        castingModifier: castingAbility ? abilityMod(score(sheet, castingAbility)) : 0,
        checkBonus,
        spellAttackBonus: effectTotal(sheet, 'sa'),
        spellDcBonus: effectTotal(sheet, 'dc'),
        checkBonusSources: checkBonus ? `Includes ${sourcesText(checkSources)}` : '',
        advantageSources: roll => {
            const sources = advantageFrom(sheet, roll);
            return sources.length ? `Advantage from ${sources.map(source => source.n).join(', ')}` : '';
        },
    };
}

// Sections go into three columns: stats, inventory and spells, everything else. On phones the columns
// dissolve and each section's order puts them back into one reading order.
function render(){
    const view=sheetView();
    sheet.spells.forEach(spell=>{spell.r=Object.assign(newSpellRoll(),spell.r)});
    const isOpen=id=>ui.openSections.has(id);
    const header=headerSection(sheet,view,{customClass:ui.customClass,customSpecies:ui.customSpecies,librarySpecies:ui.librarySpecies,message:ui.headerMessage});
    const vitals=vitalsSection(sheet,view,{amount:ui.hitPointAmount});
    const abilities=abilitiesSection(sheet,view);
    const saves=savesSection(sheet,view);
    const skills=skillsSection(sheet,view);
    const features=featuresSection(sheet,view,{isOpen});
    const racialFeatures=racialFeaturesSection(sheet,view,{isOpen});
    const spells=spellsSection(sheet,view,{isOpen,slotFor:index=>ui.spellSlotLevels[index]});
    const inventory=inventorySection(sheet,view,{isOpen,attunementRefused:ui.attunementRefused});
    const notes=notesSection(sheet);
    const backup=backupSection({backupText:ui.backupText,message:ui.backupMessage});

    const section=(order,content)=>`<section class="c" style="order:${order}">${content}</section>`;
    const column=(...sections)=>`<div class="col">${sections.join('')}</div>`;
    const statsColumn=column(section(1,vitals),section(2,abilities),section(3,saves),section(4,skills));
    const gearColumn=column(section(7,inventory),section(8,spells));
    const otherColumn=column(section(5,features),section(6,racialFeatures),section(9,notes),section(10,backup));
    document.getElementById('app').innerHTML=header+`<div class="grid">${statsColumn}${gearColumn}${otherColumn}</div>`;
    renderRoll();
    document.title=`${sheet.name.trim()||'Unnamed'} · Character Sheet`;
}

document.addEventListener('change',e=>{
    const t=e.target;
    if(t.id==='amt'){ui.hitPointAmount=Math.max(0,parseInt(t.value)||0);return}
    if(t.id==='cx'){ui.roll.customDice=t.value;return}
    if(t.dataset.up!==undefined){ui.spellSlotLevels[t.dataset.up]=+t.value;render();return}
    if(t.dataset.ch){const[k,i,j]=t.dataset.ch.split('.'),x=sheet[k]?.[+i];if(x){x.ch=x.ch||[];x.ch[+j]=t.value}ui.headerMessage='';save();render();return}
    // Picking Custom clears a standard class so the box starts empty; a typed name that is a standard class snaps to it.
    // The note on what a class set stays until the next change anywhere on the sheet.
    if(t.id==='f-clsp'){ui.headerMessage='';ui.customClass=t.value==='*';if(!ui.customClass)setClass(t.value);else if(knownClass(sheet.cls))sheet.cls='';save();render();if(ui.customClass)document.getElementById('f-cls')?.focus();return}
    if(t.dataset.k==='cls'&&knownClass(t.value)){ui.headerMessage='';setClass(knownClass(t.value));ui.customClass=false;save();render();return}
    if(t.id==='f-spp'){ui.headerMessage='';ui.customSpecies=t.value==='*';setSpecies(ui.customSpecies?'':t.value);save();render();if(ui.customSpecies)document.getElementById('f-species')?.focus();return}
    if(t.dataset.k==='species'&&knownSpecies(t.value,ui.librarySpecies)){ui.headerMessage='';ui.customSpecies=false;setSpecies(knownSpecies(t.value,ui.librarySpecies));save();render();return}
    if(!t.dataset.k)return;
    ui.headerMessage='';
    // A blank or non-numeric number box puts the old value back instead of becoming 0.
    const n=parseInt(t.value);if(t.type==='number'&&!Number.isFinite(n)){render();return}
    setPath(t.dataset.k,t.type==='number'?n:t.type==='checkbox'?t.checked:t.value);
    save();render();
});
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.id&&(sheet.mode!=='edit'||d.dataset.id==='more')){d.open?ui.openSections.add(d.dataset.id):ui.openSections.delete(d.dataset.id)}},true);
document.addEventListener('click',e=>{
    const b=e.target.closest('[data-a]');
    // The attunement-limit message goes away on the next click anywhere.
    if(ui.attunementRefused>=0&&!(b&&b.dataset.a==='att')){ui.attunementRefused=-1;if(!b){render();return}}if(!b)return;
    const a=b.dataset.a,v=b.dataset.v,g=id=>document.getElementById(id);
    const n=Math.max(0,parseInt(g('amt')?.value)||0);ui.hitPointAmount=n||ui.hitPointAmount;
    if(a==='mode'){sheet.mode=v;ui.headerMessage=''}
    else if(a==='dmg'){let d=n,t=Math.min(sheet.hp.temp,d);sheet.hp.temp-=t;d-=t;sheet.hp.cur=Math.max(0,sheet.hp.cur-d)}
    else if(a==='heal')sheet.hp.cur=Math.min(sheet.hp.max,sheet.hp.cur+n);
    else if(a==='temp')sheet.hp.temp=Math.max(sheet.hp.temp,n);
    else if(a==='long'){sheet.hp.cur=sheet.hp.max;sheet.hp.temp=0;sheet.hd=0;sheet.slots.forEach(s=>s.u=0)}
    else if(a==='hd')spendHitDie(sheet,ui);
    // Leveling up: the new max comes with the HP gained, so current HP rises by the same amount.
    else if(a==='avghp'){const m=averageHP(sheet);if(m>sheet.hp.max)sheet.hp.cur+=m-sheet.hp.max;sheet.hp.max=m}
    else if(a==='sv')sheet.sv[v]=!sheet.sv[v];
    // A trait-granted skill cycles between its granted level and Expertise; only what you add on top is stored,
    // so changing species never leaves a proficiency behind that you didn't pick.
    else if(a==='sk'){const g=skillGranted(sheet,v),nx=(skillProf(sheet,v)+1)%3;sheet.sk[v]=nx>g?nx:0}
    else if(a==='slot'){const[i,j]=v.split('.').map(Number),s=sheet.slots[i];s.u=(j<s.u)?j:j+1}
    else if(a==='addsp'){const nm=g('spn').value.trim();if(!nm)return;sheet.spells.push({n:nm,l:+g('spl').value,p:false})}
    else if(a==='delsp'){sheet.spells.splice(+v,1);[...ui.openSections].filter(k=>k.startsWith('sp')).forEach(k=>ui.openSections.delete(k));forgetListPlaces(ui)}
    else if(a==='satk')rollSpellAttack(sheet,ui,+v);
    else if(a==='sdmg')rollSpellEffect(sheet,ui,+v);
    else if(a==='iatk')rollWeaponAttack(sheet,ui,+v);
    else if(a==='idmg')rollWeaponDamage(sheet,ui,+v,b.dataset.t==='v');
    else if(a==='addfx'){const x=sheet.items[+v],[t,k]=g('fxt-'+v).value.split('|');let n=parseInt(g('fxv-'+v).value)||0;if(t==='set')n=Math.min(30,Math.max(1,n||19));if(t==='adv')n=0;x.fx=[...(x.fx||[]).filter(f=>!(f[0]===t&&f[1]===k)),[t,k,n]]}
    else if(a==='delfx'){const[i,j]=v.split('.').map(Number);sheet.items[i].fx.splice(j,1)}
    else if(a==='itd'){const k='it'+v;ui.openSections.has(k)?ui.openSections.delete(k):ui.openSections.add(k)}
    else if(a==='spc')sheet.spc=!sheet.spc;
    else if(a==='inc')sheet.inc=!sheet.inc;
    else if(a==='att'){const x=sheet.items[+v];if(!x.att&&activeGear(sheet).attuned>=3){ui.attunementRefused=+v;render();return}x.att=!x.att}
    else if(a==='spd'){const k='sp'+v;ui.openSections.has(k)?ui.openSections.delete(k):ui.openSections.add(k)}
    // The Library may have just downloaded (or imported) species, so the drop-down re-reads them afterwards.
    else if(a==='lib'){openLibrary(()=>sheet,removed=>{if(removed){ui.openSections.clear();forgetListPlaces(ui)}save();render();cachedSpecies().then(l=>{ui.librarySpecies=l;render()}).catch(()=>{})});return}
    else if(a==='addit'){const nm=g('itn').value.trim();if(!nm)return;sheet.items.push({n:nm,q:parseInt(g('itq').value)||1})}
    else if(a==='delit'){sheet.items.splice(+v,1);[...ui.openSections].filter(k=>k.startsWith('it')).forEach(k=>ui.openSections.delete(k));ui.roll.criticalHit=null}
    else if(a==='addft'){const nm=g('ftn-'+v).value.trim();if(!nm)return;const t=g('ftt-'+v);sheet[v].push({n:nm,t:t?t.value:'',d:''})}
    else if(a==='delft'){const[k,i]=v.split('.');sheet[k].splice(+i,1);ui.openSections.clear()}
    else if(a==='roll')rollCheck(sheet,ui,b);
    else if(a==='rm')setRollMode(ui,v);
    else if(a==='rmin'){toggleRollOptions(ui);renderRoll();return}
    else if(a==='cx')rollCustomDice(sheet,ui,g('cx').value);
    else if(a==='cp')copyLastRoll(sheet,ui);
    else if(a==='exp'){ui.backupMessage=null;ui.backupText=JSON.stringify(sheet,null,1);markBackedUp();save();render();const ta=g('io');ta.select();try{navigator.clipboard.writeText(ui.backupText).catch(()=>{})}catch(x){}return}
    else if(a==='dl'){ui.backupMessage=null;downloadSheet(sheet)}
    else if(a==='imp'){ui.backupText=g('io').value;ui.backupMessage=null;if(!importBackup(ui.backupText)){render();return}}
    else if(a==='rst'){if(!restoreVersion(+g('snp').value))return}
    else if(a==='reset'){if(!confirm('Start a new character? The current one can be brought back from "Restore an earlier version".'))return;replaceSheet({},'before new character')}
    save();render();
});
document.addEventListener('change', event => {
    if (event.target.id === 'imf') openBackupFile(event.target);
});
// Another tab saved: take its version, so this tab never writes a stale copy over it.
window.addEventListener('storage',e=>{if(e.key!=='sheet'||!e.newValue)return;try{sheet=cleanSheet(JSON.parse(e.newValue));render()}catch(x){}});
// Ask the browser not to clear this site's data under storage pressure (granted silently or not at all).
try{navigator.storage?.persisted?.().then(p=>p||navigator.storage.persist()).catch(()=>{})}catch(e){}
snapshot(sheet,'opened',true);
// Gear added before the Library knew about AC, save bonuses or Stealth gets that data filled in
// from the saved Library copy, matched by name. Each item is filled once per data version (v), so
// later hand edits stick. v2 adds attunement, magic effects and the Mithral fix; v3 adds rarity.
async function backfill(){let lib;try{lib=await cachedItems()}catch(e){return}if(!lib.length)return;
    const by=new Map(lib.map(x=>[x.name.toLowerCase(),x]));let ch=false;
    for(const x of sheet.items){const l=by.get(x.n.toLowerCase());if(!l||(x.v||0)>=3)continue;
        if(l.eq&&!x.eq)x.eq=true;if(l.w&&!x.w)x.w={...l.w};
        if((x.v||0)<1&&l.ar){if(!x.ar||!x.ar.k)x.ar={...l.ar};else{if(!x.ar.sb&&l.ar.sb)x.ar.sb=l.ar.sb;if(!x.ar.stl&&l.ar.stl)x.ar.stl=true}}
        if(l.rr&&!x.rr)x.rr=l.rr;
        if(l.at&&x.at===undefined)x.at=true;if(l.fx&&!x.fx)x.fx=l.fx.map(f=>[...f]);
        if(/^Mithral Armor/i.test(x.n)&&x.ar){x.ar.str=0;x.ar.stl=false}
        x.v=3;ch=true}
    if(ch){save();render()}}
window.addEventListener('library-loaded',backfill);
// Keep the bottom room right when the roll bar rewraps (window resized, phone rotated).
window.addEventListener('resize',()=>{const r=document.getElementById('roll').firstChild;if(r)document.documentElement.style.setProperty('--rollh',r.offsetHeight+'px')});
backfill();
cachedSpecies().then(l=>{ui.librarySpecies=l;if(sheet.mode==='edit')render()}).catch(()=>{});
render();
