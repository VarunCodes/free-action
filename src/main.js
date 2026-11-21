import './style.css';
import { openLibrary, swapSpecies } from './libraryui.js';
import { cachedItems, cachedSpecies, loadLibrary } from './library.js';
import { esc, dateAndTime } from './text.js';
import { ABN, DEF, CLS, cleanSheet } from './sheet.js';
import {
    abilityMod, signed, profBonus, knownClass, knownSpecies, hitDie, hitDiceLeft, averageHP, activeGear,
    effectsOf, effectTotal, advantageFrom, score, skillGranted, skillProf,
} from './rules.js';
import { rollMode, rollD20, rollDice, customRollError, chatCommand, spellDice, weaponMod, withMod } from './rolls.js';
import { sourcesText } from './html.js';
import { abilitiesSection, savesSection, skillsSection } from './sections/stats.js';
import { spellsSection } from './sections/spells.js';
import { inventorySection } from './sections/inventory.js';
import { featuresSection, racialFeaturesSection } from './sections/features.js';
import { headerSection } from './sections/header.js';
import { vitalsSection } from './sections/vitals.js';
import { notesSection, backupSection } from './sections/backup.js';
import { readKey, writeKey, loadSaved, saveSheet, snapshots, snapshot, markBackedUp, downloadSheet, readBackup } from './storage.js';
let S=DEF(),amt=1,io='';const OPEN=new Set();let RM='',LAST=null,COP=false,CX='',CRIT=null,RERR='',IOMSG=null,ATTMSG=-1,CC=false,CS=false,CMSG='',SPC=[];const UP={};
const SR=()=>({a:false,s:'',d:'',b:'',t:'',h:false,m:false,by:'slot',up:[]});
S=loadSaved()||S;
function save(){
    S=saveSheet(S);
}

// Import, Restore and New character all replace the whole sheet. The current one goes into the history
// first, and anything that belonged to it (open sections, messages, a pending critical hit) is reset.
function replaceSheet(o,why){
    snapshot(S,why,true);
    S=cleanSheet(o);
    io='';
    IOMSG=null;
    CC=false;
    CS=false;
    OPEN.clear();
    Object.keys(UP).forEach(k=>delete UP[k]);
    CRIT=null;
}

// Import (pasted JSON) and Open backup file. The result shows under the Backup buttons.
// Returns true if the sheet was replaced.
function importBackup(text) {
    const backup = readBackup(text);
    if (!backup) {
        IOMSG = {
            isError: true,
            text: 'That is not a valid exported sheet. '
                + 'Use a file from Download backup, or paste the full JSON from Export.',
        };
        return false;
    }
    const name = cleanSheet(backup).name;
    const question = `Replace "${S.name}" with "${name}"? `
        + 'The current character can be brought back from "Restore an earlier version".';
    if (!confirm(question)) return false;
    replaceSheet(backup, 'before import');
    IOMSG = { text: `Imported "${name}".` };
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
        IOMSG = { isError: true, text: 'That version could not be read.' };
        render();
        return false;
    }
    IOMSG = { text: `Restored "${version.name}" from ${savedAt}.` };
    return true;
}

// Open backup file. The input is cleared afterwards, so picking the same file again still imports it.
async function openBackupFile(input) {
    const file = input.files[0];
    if (!file) return;
    IOMSG = null;
    const reading = file.text();
    input.value = '';
    try {
        if (importBackup(await reading)) save();
    } catch {
        IOMSG = { isError: true, text: 'Could not read that file.' };
    }
    render();
}
function setPath(k,v){const p=k.split('.');let o=S;while(p.length>1)o=o[p.shift()];o[p[0]]=v}
// A species' walking speed, read from its Speed trait ("Your Speed is 35 feet."); 0 if it has none.
const spSpeed=it=>{const t=it&&(it.traits||[]).find(x=>/^speed$/i.test(x.n));const m=t&&/(\d+)\s*(feet|ft)/i.exec(t.d);return m?+m[1]:0};
// Picking a species swaps the old species' racial traits for the new one's ('' or Custom only removes them).
// The sheet is saved to "Restore an earlier version" first, since the old traits (and any rewording) go; only
// before the first of several swaps in a row, so trying species one after another can't push out older versions.
// Speed follows the species unless you typed your own: it changes only from the default or the old species' speed.
function setSpecies(n){const go=()=>{const it=n?SPC.find(x=>x.kind==='race'&&x.name===n):null;
    if(n&&!it){S.species=n;CMSG=`Couldn't load ${n}'s traits. Open the Library once to download them, then pick ${n} again.`;return}
    const ob=S.species&&SPC.find(x=>x.kind==='race'&&x.name.toLowerCase()===S.species.toLowerCase());
    if((S.species||S.race.length)&&snapshots()[0]?.why!=='before species change')snapshot(S,'before species change',true);
    const r=swapSpecies(S,SPC,it),o=r.old&&r.old!==n?r.old:'',sp0=S.speed,ns=spSpeed(it)||(it?0:DEF().speed);
    if(ns&&(sp0===DEF().speed||sp0===spSpeed(ob)))S.speed=ns;
    const tr=(k,x)=>`${k} ${x} trait${k===1?'':'s'}`,spd=S.speed!==sp0?` Speed set to ${S.speed} ft.`:'';
    CMSG=(it?(o?`Swapped ${tr(r.removed,o)} for ${tr(r.added,n)} in Racial features.`:`Added ${tr(r.added,n)} to Racial features.`):o&&r.removed?`Removed ${tr(r.removed,o)} from Racial features.`:'')+spd};
if(!n||SPC.some(x=>x.name===n)){go();return}
CMSG=`Loading ${n}'s traits…`;loadLibrary().then(d=>{SPC=d.items.filter(x=>x.kind==='race')}).catch(()=>{}).finally(()=>{go();save();render()})}
// Picking a standard class swaps the old class's save proficiencies and spellcasting ability for the new one's.
// Other saves, and an ability you chose by hand, stay; the sheet can't tell a hand-ticked save from one the old
// class gave, so those go with the old class. The Spellcasting drop-down can always override what was picked.
function setClass(c){const o=CLS[knownClass(S.cls)],n=CLS[c],n0=ABN[S.cast];S.cls=c;if(!n)return;
    if(o)o.sv.forEach(a=>{if(!n.sv.includes(a))delete S.sv[a]});n.sv.forEach(a=>S.sv[a]=true);
    if(!S.cast||(o&&S.cast===o.ca))S.cast=n.ca;
    const ca=S.cast===n.ca?(n.ca?`${ABN[n.ca]} for spellcasting`:n0?'no spellcasting ability (pick one below if your subclass casts spells)':''):`spellcasting stays ${ABN[S.cast]}${n.ca?` (${c}s usually use ${ABN[n.ca]})`:''}`;
    CMSG=`${c}: proficient in ${n.sv.map(a=>ABN[a]).join(' and ')} saving throws${ca?', '+ca:''}. You can change these below.`}

function copyText(t){try{navigator.clipboard.writeText(t).catch(()=>{});return true}catch(e){}try{const x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();const ok=document.execCommand('copy');x.remove();return ok}catch(e){return false}}
// A d20 roll (checks, saves, attacks). dis/adv are this roll's own Disadvantage or Advantage; the
// mode picked on the roll bar is added to them.
function doRoll(label,b,dis,adv){
    RERR='';
    LAST=rollD20(label,b,rollMode(RM,dis,adv));
}
// A roll that can't be made clears the last one, so its chat command can't be pasted by mistake.
const rollErr=t=>{LAST=null;RERR=t;COP=false};
// Custom rolls from the roll bar, like 2d6+3 or 1d20+1d4-1.
function doCustom(text){
    const error=customRollError(text);
    if(error)return rollErr(error);
    rollExpr('Roll',text.replace(/\s/g,''),false,true);
}
// Rolls dice and shows the result. Returns false, changing nothing, if the dice can't be read.
function rollExpr(label,e,crit,raw){
    const result=rollDice(label,e,crit,raw);
    if(!result)return false;
    RERR='';
    LAST=result;
    return true;
}
// The roll bar can shrink to just the last result; the choice is kept per device, not in the sheet.
let RMIN=readKey('roll-min')==='1';
function renderRoll(){const L=LAST,sg=(v,t)=>`<button data-a="rm" data-v="${v}" class="${RM===v?'on':''}" aria-pressed="${RM===v}">${t}</button>`,op=(v,t)=>`<option value="${v}" ${S.vtt===v?'selected':''}>${t}</option>`;
    document.getElementById('roll').innerHTML=`<div class="rp${RMIN?' min':''}"><div class="rpi"><button class="hd rt" data-a="rmin" aria-expanded="${!RMIN}" aria-label="${RMIN?'Show roll options':'Hide roll options'}" title="${RMIN?'Show roll options':'Hide roll options'}"></button><div class="rr">${L?`<output class="tot" aria-label="Roll total">${L.total}</output><span>${esc(L.label)} ${esc(L.detail)}</span>${L.crit?`<span class="crit">${L.crit}</span>`:''}`:RERR?`<span class="reqn" role="alert">${esc(RERR)}</span>`:'<span class="sub">Tap any modifier to roll</span>'}</div>${RMIN?'':`<div class="rc"><div class="seg" role="group" aria-label="Roll mode">${sg('','Normal')}${sg('adv','Adv')}${sg('dis','Dis')}</div><input id="cmd" readonly value="${esc(chatCommand(LAST,S.vtt))}" placeholder="Chat command" aria-label="Chat command"><button class="pri" data-a="cp" ${L?'':'disabled'}>${COP?'Copied':'Copy'}</button></div><details data-id="more" ${OPEN.has('more')?'open':''}><summary>VTT format and custom roll</summary><div class="rc"><select data-k="vtt" aria-label="Chat format">${op('foundry','Foundry (/r)')}${op('roll20','Roll20 (/roll)')}${op('roll20t','Roll20 template')}</select><input id="cx" placeholder="2d6+3" value="${esc(CX)}" aria-label="Custom dice"><button data-a="cx">Roll</button></div></details>`}</div></div>`;
    // The page leaves room at the bottom for however tall the bar is now.
    document.documentElement.style.setProperty('--rollh',document.getElementById('roll').firstChild.offsetHeight+'px')}
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
    const castingAbility = S.cast;
    const checkBonus = effectTotal(S, 'chk');
    const checkSources = effectsOf(S, 'chk').map(([source, [, , value]]) => [source.n, value]);
    return {
        editing: S.mode === 'edit',
        proficiency: profBonus(S),
        castingAbility,
        castingModifier: castingAbility ? abilityMod(score(S, castingAbility)) : 0,
        checkBonus,
        spellAttackBonus: effectTotal(S, 'sa'),
        spellDcBonus: effectTotal(S, 'dc'),
        checkBonusSources: checkBonus ? `Includes ${sourcesText(checkSources)}` : '',
        advantageSources: roll => {
            const sources = advantageFrom(S, roll);
            return sources.length ? `Advantage from ${sources.map(source => source.n).join(', ')}` : '';
        },
    };
}

// Sections go into three columns: stats, inventory and spells, everything else. On phones the columns
// dissolve and each section's order puts them back into one reading order.
function render(){
    const view=sheetView();
    S.spells.forEach(spell=>{spell.r=Object.assign(SR(),spell.r)});
    const isOpen=id=>OPEN.has(id);
    const header=headerSection(S,view,{customClass:CC,customSpecies:CS,librarySpecies:SPC,message:CMSG});
    const vitals=vitalsSection(S,view,{amount:amt});
    const abilities=abilitiesSection(S,view);
    const saves=savesSection(S,view);
    const skills=skillsSection(S,view);
    const features=featuresSection(S,view,{isOpen});
    const racialFeatures=racialFeaturesSection(S,view,{isOpen});
    const spells=spellsSection(S,view,{isOpen,slotFor:index=>UP[index]});
    const inventory=inventorySection(S,view,{isOpen,attunementRefused:ATTMSG});
    const notes=notesSection(S);
    const backup=backupSection({backupText:io,message:IOMSG});

    const section=(order,content)=>`<section class="c" style="order:${order}">${content}</section>`;
    const column=(...sections)=>`<div class="col">${sections.join('')}</div>`;
    const statsColumn=column(section(1,vitals),section(2,abilities),section(3,saves),section(4,skills));
    const gearColumn=column(section(7,inventory),section(8,spells));
    const otherColumn=column(section(5,features),section(6,racialFeatures),section(9,notes),section(10,backup));
    document.getElementById('app').innerHTML=header+`<div class="grid">${statsColumn}${gearColumn}${otherColumn}</div>`;
    renderRoll();
    document.title=`${S.name.trim()||'Unnamed'} · Character Sheet`;
}

document.addEventListener('change',e=>{
    const t=e.target;
    if(t.id==='amt'){amt=Math.max(0,parseInt(t.value)||0);return}
    if(t.id==='cx'){CX=t.value;return}
    if(t.dataset.up!==undefined){UP[t.dataset.up]=+t.value;render();return}
    if(t.dataset.ch){const[k,i,j]=t.dataset.ch.split('.'),x=S[k]?.[+i];if(x){x.ch=x.ch||[];x.ch[+j]=t.value}CMSG='';save();render();return}
    // Picking Custom clears a standard class so the box starts empty; a typed name that is a standard class snaps to it.
    // The note on what a class set stays until the next change anywhere on the sheet.
    if(t.id==='f-clsp'){CMSG='';CC=t.value==='*';if(!CC)setClass(t.value);else if(knownClass(S.cls))S.cls='';save();render();if(CC)document.getElementById('f-cls')?.focus();return}
    if(t.dataset.k==='cls'&&knownClass(t.value)){CMSG='';setClass(knownClass(t.value));CC=false;save();render();return}
    if(t.id==='f-spp'){CMSG='';CS=t.value==='*';setSpecies(CS?'':t.value);save();render();if(CS)document.getElementById('f-species')?.focus();return}
    if(t.dataset.k==='species'&&knownSpecies(t.value,SPC)){CMSG='';CS=false;setSpecies(knownSpecies(t.value,SPC));save();render();return}
    if(!t.dataset.k)return;
    CMSG='';
    // A blank or non-numeric number box puts the old value back instead of becoming 0.
    const n=parseInt(t.value);if(t.type==='number'&&!Number.isFinite(n)){render();return}
    setPath(t.dataset.k,t.type==='number'?n:t.type==='checkbox'?t.checked:t.value);
    save();render();
});
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.id&&(S.mode!=='edit'||d.dataset.id==='more')){d.open?OPEN.add(d.dataset.id):OPEN.delete(d.dataset.id)}},true);
document.addEventListener('click',e=>{
    const b=e.target.closest('[data-a]');
    // The attunement-limit message goes away on the next click anywhere.
    if(ATTMSG>=0&&!(b&&b.dataset.a==='att')){ATTMSG=-1;if(!b){render();return}}if(!b)return;
    const a=b.dataset.a,v=b.dataset.v,g=id=>document.getElementById(id);
    const n=Math.max(0,parseInt(g('amt')?.value)||0);amt=n||amt;
    if(a==='mode'){S.mode=v;CMSG=''}
    else if(a==='dmg'){let d=n,t=Math.min(S.hp.temp,d);S.hp.temp-=t;d-=t;S.hp.cur=Math.max(0,S.hp.cur-d)}
    else if(a==='heal')S.hp.cur=Math.min(S.hp.max,S.hp.cur+n);
    else if(a==='temp')S.hp.temp=Math.max(S.hp.temp,n);
    else if(a==='long'){S.hp.cur=S.hp.max;S.hp.temp=0;S.hd=0;S.slots.forEach(s=>s.u=0)}
    else if(a==='hd'){const d=hitDie(S),c=abilityMod(score(S,'con'));if(d&&hitDiceLeft(S)&&rollExpr(`Hit die (d${d})`,`1d${d}${signed(c)}`,false,true)){const g=Math.max(1,LAST.total);LAST.total=g;LAST.detail+=` · healed ${Math.min(g,S.hp.max-S.hp.cur)}`;S.hp.cur=Math.min(S.hp.max,S.hp.cur+g);S.hd++;CRIT=null;COP=copyText(chatCommand(LAST,S.vtt))}}
    // Leveling up: the new max comes with the HP gained, so current HP rises by the same amount.
    else if(a==='avghp'){const m=averageHP(S);if(m>S.hp.max)S.hp.cur+=m-S.hp.max;S.hp.max=m}
    else if(a==='sv')S.sv[v]=!S.sv[v];
    // A trait-granted skill cycles between its granted level and Expertise; only what you add on top is stored,
    // so changing species never leaves a proficiency behind that you didn't pick.
    else if(a==='sk'){const g=skillGranted(S,v),nx=(skillProf(S,v)+1)%3;S.sk[v]=nx>g?nx:0}
    else if(a==='slot'){const[i,j]=v.split('.').map(Number),s=S.slots[i];s.u=(j<s.u)?j:j+1}
    else if(a==='addsp'){const nm=g('spn').value.trim();if(!nm)return;S.spells.push({n:nm,l:+g('spl').value,p:false})}
    else if(a==='delsp'){S.spells.splice(+v,1);[...OPEN].filter(k=>k.startsWith('sp')).forEach(k=>OPEN.delete(k));Object.keys(UP).forEach(k=>delete UP[k]);CRIT=null}
    else if(a==='satk'){const x=S.spells[+v],cm=S.cast?abilityMod(score(S,S.cast)):0;doRoll(x.n+' attack',profBonus(S)+cm+effectTotal(S,'sa'));CRIT=LAST.crit==='Natural 20'?'s'+v:null;COP=copyText(chatCommand(LAST,S.vtt))}
    else if(a==='sdmg'){const x=S.spells[+v],{dice:d}=spellDice(S,x,UP[v]??x.l);if(!rollExpr(x.n+(x.r.h?' healing':' damage'),d,CRIT==='s'+v))rollErr(`${x.n} has no valid dice. Use dice like 1d10 or 2d6+3; fix them in Edit.`);else COP=copyText(chatCommand(LAST,S.vtt));CRIT=null}
    else if(a==='iatk'){const x=S.items[+v];doRoll(x.n+' attack',profBonus(S)+weaponMod(S,x));CRIT=LAST.crit==='Natural 20'?'i'+v:null;COP=copyText(chatCommand(LAST,S.vtt))}
    else if(a==='idmg'){const x=S.items[+v],tw=b.dataset.t==='v';if(!rollExpr(x.n+' damage'+(tw?' (two-handed)':''),withMod(tw?x.w.v:x.w.d,weaponMod(S,x)),CRIT==='i'+v))rollErr(`${x.n} has no valid damage dice.`);else COP=copyText(chatCommand(LAST,S.vtt));CRIT=null}
    else if(a==='addfx'){const x=S.items[+v],[t,k]=g('fxt-'+v).value.split('|');let n=parseInt(g('fxv-'+v).value)||0;if(t==='set')n=Math.min(30,Math.max(1,n||19));if(t==='adv')n=0;x.fx=[...(x.fx||[]).filter(f=>!(f[0]===t&&f[1]===k)),[t,k,n]]}
    else if(a==='delfx'){const[i,j]=v.split('.').map(Number);S.items[i].fx.splice(j,1)}
    else if(a==='itd'){const k='it'+v;OPEN.has(k)?OPEN.delete(k):OPEN.add(k)}
    else if(a==='spc')S.spc=!S.spc;
    else if(a==='inc')S.inc=!S.inc;
    else if(a==='att'){const x=S.items[+v];if(!x.att&&activeGear(S).attuned>=3){ATTMSG=+v;render();return}x.att=!x.att}
    else if(a==='spd'){const k='sp'+v;OPEN.has(k)?OPEN.delete(k):OPEN.add(k)}
    // The Library may have just downloaded (or imported) species, so the drop-down re-reads them afterwards.
    else if(a==='lib'){openLibrary(()=>S,removed=>{if(removed){OPEN.clear();Object.keys(UP).forEach(k=>delete UP[k]);CRIT=null}save();render();cachedSpecies().then(l=>{SPC=l;render()}).catch(()=>{})});return}
    else if(a==='addit'){const nm=g('itn').value.trim();if(!nm)return;S.items.push({n:nm,q:parseInt(g('itq').value)||1})}
    else if(a==='delit'){S.items.splice(+v,1);[...OPEN].filter(k=>k.startsWith('it')).forEach(k=>OPEN.delete(k));CRIT=null}
    else if(a==='addft'){const nm=g('ftn-'+v).value.trim();if(!nm)return;const t=g('ftt-'+v);S[v].push({n:nm,t:t?t.value:'',d:''})}
    else if(a==='delft'){const[k,i]=v.split('.');S[k].splice(+i,1);OPEN.clear()}
    else if(a==='roll'){doRoll(b.dataset.l,+b.dataset.b,b.dataset.dis==='1',b.dataset.adv==='1');CRIT=null;COP=copyText(chatCommand(LAST,S.vtt))}
    else if(a==='rm')RM=v;
    else if(a==='rmin'){RMIN=!RMIN;writeKey('roll-min',RMIN?'1':'0');renderRoll();return}
    else if(a==='cx'){CX=g('cx').value;doCustom(CX);CRIT=null;if(LAST)COP=copyText(chatCommand(LAST,S.vtt))}
    else if(a==='cp'){if(LAST)COP=copyText(chatCommand(LAST,S.vtt))}
    else if(a==='exp'){IOMSG=null;io=JSON.stringify(S,null,1);markBackedUp();save();render();const ta=g('io');ta.select();try{navigator.clipboard.writeText(io).catch(()=>{})}catch(x){}return}
    else if(a==='dl'){IOMSG=null;downloadSheet(S)}
    else if(a==='imp'){io=g('io').value;IOMSG=null;if(!importBackup(io)){render();return}}
    else if(a==='rst'){if(!restoreVersion(+g('snp').value))return}
    else if(a==='reset'){if(!confirm('Start a new character? The current one can be brought back from "Restore an earlier version".'))return;replaceSheet({},'before new character')}
    save();render();
});
document.addEventListener('change', event => {
    if (event.target.id === 'imf') openBackupFile(event.target);
});
// Another tab saved: take its version, so this tab never writes a stale copy over it.
window.addEventListener('storage',e=>{if(e.key!=='sheet'||!e.newValue)return;try{S=cleanSheet(JSON.parse(e.newValue));render()}catch(x){}});
// Ask the browser not to clear this site's data under storage pressure (granted silently or not at all).
try{navigator.storage?.persisted?.().then(p=>p||navigator.storage.persist()).catch(()=>{})}catch(e){}
snapshot(S,'opened',true);
// Gear added before the Library knew about AC, save bonuses or Stealth gets that data filled in
// from the saved Library copy, matched by name. Each item is filled once per data version (v), so
// later hand edits stick. v2 adds attunement, magic effects and the Mithral fix; v3 adds rarity.
async function backfill(){let lib;try{lib=await cachedItems()}catch(e){return}if(!lib.length)return;
    const by=new Map(lib.map(x=>[x.name.toLowerCase(),x]));let ch=false;
    for(const x of S.items){const l=by.get(x.n.toLowerCase());if(!l||(x.v||0)>=3)continue;
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
cachedSpecies().then(l=>{SPC=l;if(S.mode==='edit')render()}).catch(()=>{});
render();
