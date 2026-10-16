import './style.css';
import { openLibrary } from './libraryui.js';
import { cachedItems } from './library.js';
import { md, rarityTag } from './text.js';
import { AB, ABN, SK, DEF, cleanSheet } from './sheet.js';
let S=DEF(),amt=1,io='';const OPEN=new Set();let RM='',LAST=null,COP=false,CX='',CRIT=null;const UP={};
const SR=()=>({a:false,s:'',d:'',b:'',t:'',h:false,m:false,by:'slot',up:[]});
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}};
try{const r=lsGet('sheet');if(r)S=cleanSheet(JSON.parse(r))}catch(e){}
// Earlier versions kept in this browser: one when the page opens, one per 30 minutes of editing,
// and one right before Import, Restore or New character replaces the sheet.
const snaps=()=>{try{const a=JSON.parse(lsGet('sheet-history')||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.s==='string'):[]}catch(e){return[]}};
function snapshot(why,force){const a=snaps(),now=Date.now(),s=JSON.stringify(S);if(a[0]&&a[0].s===s)return;if(!force&&a[0]&&now-a[0].at<30*60e3)return;a.unshift({at:now,why,name:S.name,s});while(a.length&&!lsSet('sheet-history',JSON.stringify(a.slice(0,6))))a.pop()}
const save=()=>{lsSet('sheet',JSON.stringify(S));snapshot('autosave')};
function replaceSheet(o,why){snapshot(why,true);S=cleanSheet(o);io='';OPEN.clear();Object.keys(UP).forEach(k=>delete UP[k]);CRIT=null}
const ago=t=>{const d=Math.floor((Date.now()-t)/864e5);return d<1?'today':d===1?'yesterday':d+' days ago'};
function downloadSheet(){const u=URL.createObjectURL(new Blob([JSON.stringify(S,null,1)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=(S.name||'character').replace(/[^\w-]+/g,'-')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);lsSet('sheet-exported',String(Date.now()))}
function importText(t){let o;try{o=JSON.parse(t);if(!o||typeof o!=='object'||!o.ab)throw 0}catch(x){alert('That is not a valid exported sheet. Use a file from Download backup, or paste the full JSON from Export.');return false}
 if(!confirm(`Replace "${S.name}" with "${cleanSheet(o).name}"? The current character can be brought back from "Restore an earlier version".`))return false;replaceSheet(o,'before import');return true}
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mod=n=>Math.floor((n-10)/2), fmt=n=>(n>=0?'+':'')+n;
const prof=()=>Math.ceil(Math.max(1,S.level)/4)+1;
const PM=['\u25CB','\u25CF','\u25C6'];
function setPath(k,v){const p=k.split('.');let o=S;while(p.length>1)o=o[p.shift()];o[p[0]]=v}
const inp=(k,v,t='text',x='')=>`<input data-k="${k}" type="${t}" value="${esc(v)}" ${x}>`;
const fld=(l,k,v,t,x)=>`<div><label class="lab">${l}</label>${inp(k,v,t,x)}</div>`;

const cmdFor=()=>{if(!LAST)return'';const{label,expr}=LAST,v=S.vtt;return v==='roll20t'?`&{template:default} {{name=${label}}} {{Roll=[[${expr}]]}}`:v==='roll20'?`/roll ${expr}`:`/r ${expr} # ${label}`};
function copyText(t){try{navigator.clipboard.writeText(t).catch(()=>{});return true}catch(e){}try{const x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();const ok=document.execCommand('copy');x.remove();return ok}catch(e){return false}}
const rd=m=>1+Math.floor(Math.random()*m);
// Gear whose magic is working: equipped and, if it needs attunement, attuned. You choose what to
// attune to (up to 3). If a sheet somehow has more (an import), the first three count and the rest
// are flagged.
function gear(){const att=S.items.filter(x=>x.at&&x.att),ok=new Set(att.slice(0,3));return{live:S.items.filter(x=>x.eq&&x.on&&(!x.at||ok.has(x))),over:att.slice(3),attuned:att.length}}
const fxOf=t=>gear().live.flatMap(x=>(x.fx||[]).filter(f=>f[0]===t).map(f=>[x,f]));
const fxSum=t=>fxOf(t).reduce((n,[,f])=>n+f[2],0);
const fxAdv=k=>fxOf('adv').filter(([,f])=>f[1]===k).map(([x])=>x);
// Ability score after items: a "your Strength is 19" item raises it, never lowers it.
const scBy=a=>fxOf('set').filter(([,f])=>f[1]===a&&f[2]>S.ab[a]).sort((p,q)=>q[1][2]-p[1][2])[0];
const sc=a=>scBy(a)?.[1][2]??S.ab[a];
// Equipped gear whose Strength requirement isn't met. While any is equipped, every d20 roll is
// made with Disadvantage and the Normal/Adv choices are locked.
const unmet=()=>S.items.filter(x=>x.eq&&x.on&&x.ar&&x.ar.str>sc('str'));
const rollMode=()=>unmet().length?'dis':RM;
// Armor class from equipped gear: the best body armor (or 10 + Dex, or a better unarmored base),
// plus the best shield, plus every equipped AC bonus item, plus the sheet's own bonus.
function acCalc(){const dx=mod(sc('dex')),on=gear().live.filter(x=>x.ar&&x.ar.k),best=(l,f)=>l.map(x=>({x,v:f(x)})).sort((a,b)=>b.v-a.v)[0];
 const arm=best(on.filter(x=>['light','medium','heavy'].includes(x.ar.k)),x=>x.ar.ac+(x.ar.k==='light'?dx:x.ar.k==='medium'?Math.min(dx,2):0));
 const sh=best(on.filter(x=>x.ar.k==='shield'),x=>x.ar.ac),un=Math.max(10,...on.filter(x=>x.ar.k==='unarm').map(x=>x.ar.ac));
 const parts=[arm?[arm.x.n,arm.v]:[un>10?'Unarmored base '+un+' + Dex':'Unarmored (10 + Dex)',un+dx]];if(sh)parts.push([sh.x.n,sh.v]);
 for(const x of on.filter(x=>x.ar.k==='bonus'&&(!x.ar.nu||(!arm&&!sh))))parts.push([x.n,x.ar.ac]);if(S.acb)parts.push(['Other bonus',S.acb]);
 return{ac:parts.reduce((n,[,v])=>n+v,0),parts,used:new Set([arm?.x,sh?.x])}}
const fxLabel=([t,a,v])=>t==='set'?`${ABN[a]} becomes ${v}`:t==='chk'?`${fmt(v)} ability checks`:t==='sv'?`${fmt(v)} saving throws`:t==='sa'?`${fmt(v)} spell attacks`:t==='dc'?`${fmt(v)} spell save DC`:`Advantage on ${a==='init'?'Initiative':a}`;
const FXO=[...AB.map(a=>[`set|${a}`,`Set ${ABN[a]} to (value)`]),['chk|','Bonus to ability checks'],['sv|','Bonus to saving throws'],['sa|','Bonus to spell attacks'],['dc|','Bonus to spell save DC'],['adv|init','Advantage on Initiative'],...SK.map(([n])=>[`adv|${n}`,`Advantage on ${n}`])].map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
const acNow=()=>S.acAuto?acCalc().ac:S.ac;
const worn=f=>gear().live.filter(x=>x.ar&&f(x.ar));
// Saving throw bonus: protection items (+AC and saves) and magic items like the Luckstone, with sources.
const saveSrc=()=>[...worn(a=>a.sb).map(x=>[x.n,x.ar.sb]),...fxOf('sv').map(([x,f])=>[x.n,f[2]])];
const saveBonus=()=>saveSrc().reduce((n,[,v])=>n+v,0);
const srcText=l=>l.map(([n,v])=>`${n} ${fmt(v)}`).join(', ');
// dis/adv: this roll's own Disadvantage (Stealth in noisy armor) or Advantage (Cloak of Elvenkind).
// Any Advantage and any Disadvantage cancel out. An unmet Strength requirement still forces Disadvantage.
function doRoll(label,b,dis,adv){let RM=rollMode();if(!unmet().length){const A=RM==='adv'||adv,D=RM==='dis'||dis;RM=A&&D?'':A?'adv':D?'dis':''}const r=[rd(20)];if(RM)r.push(rd(20));const pk=RM==='adv'?Math.max(...r):RM==='dis'?Math.min(...r):r[0];LAST={label,expr:(RM?'2d20'+(RM==='adv'?'kh1':'kl1'):'1d20')+(b?fmt(b):''),detail:(RM?'['+r.join(', ')+'] take '+pk:'['+pk+']')+(b?' '+(b>0?'+':'-')+' '+Math.abs(b):''),total:pk+b,crit:pk===20?'Natural 20':pk===1?'Natural 1':''}}
function doCustom(s){const m=s.replace(/\s/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);if(!m||+m[2]<1)return false;const n=Math.min(50,+m[1]||1),f=+m[2],b=+(m[3]||0),r=Array.from({length:n},()=>rd(f));LAST={label:'Roll',expr:n+'d'+f+(b?fmt(b):''),detail:'['+r.join(', ')+']'+(b?' '+(b>0?'+':'-')+' '+Math.abs(b):''),total:r.reduce((a,c)=>a+c,0)+b,crit:''};return true}
function rollExpr(label,e,crit){const ts=String(e).replace(/\s/g,'').match(/[+-]?[^+-]+/g)||[];let tot=0;const det=[],ex=[];for(const t of ts){const neg=t[0]==='-',q=t.replace(/^[+-]/,''),m=q.match(/^(\d*)d(\d+)$/i);if(m&&+m[2]>0){const n=Math.min(50,(+m[1]||1)*(crit?2:1)),f=+m[2],r=Array.from({length:n},()=>rd(f)),s=r.reduce((a,c)=>a+c,0);tot+=neg?-s:s;det.push((neg?'- ':det.length?'+ ':'')+'['+r.join(', ')+']');ex.push((neg?'-':'+')+n+'d'+f)}else if(/^\d+$/.test(q)){tot+=neg?-q:+q;det.push((neg?'- ':'+ ')+q);ex.push((neg?'-':'+')+q)}else return false}if(!ex.length)return false;LAST={label,expr:ex.join('').replace(/^\+/,''),detail:det.join(' '),total:Math.max(0,tot),crit:crit?'Critical hit, dice doubled':''};return true}
// Damage dice for a spell: cantrips scale with character level, other spells with the slot used.
// Scaling only applies while the dice still match what the Library gave, so hand edits win.
function spDice(x,slot){const r=x.r;let d=String(r.d).replace(/\s+/g,''),n=0;if(d&&d===r.b){const lv=r.by==='char'?S.level:slot;for(const[at,dd,nn]of r.up)if(at<=lv){if(dd)d=dd;if(nn)n=nn}}const cm=S.cast?mod(sc(S.cast)):0;if(d&&r.m&&cm)d+=fmt(cm);return{d,n}}
// Weapons: ranged use Dex, Finesse the better of Str and Dex, others Str; magic +N adds to both rolls.
// x is the inventory item; a magic weapon that needs attunement only gets its +N once attuned.
const wMod=x=>{const w=x.w,s=mod(sc('str')),d=mod(sc('dex'));return (w.ab==='dex'?d:w.ab==='fin'?Math.max(s,d):s)+(x.at&&!x.att?0:(+w.b||0))};
const withMod=(d,m)=>m?d+fmt(m):d;
function renderRoll(){const L=LAST,bad=unmet(),rm=rollMode(),sg=(v,t)=>`<button data-a="rm" data-v="${v}" class="${rm===v?'on':''}" ${bad.length&&v!=='dis'?'disabled':''}>${t}</button>`,op=(v,t)=>`<option value="${v}" ${S.vtt===v?'selected':''}>${t}</option>`;
document.getElementById('roll').innerHTML=`<div class="rp"><div class="rpi"><div class="rr">${L?`<b class="tot">${L.total}</b><span>${esc(L.label)} ${esc(L.detail)}</span>${L.crit?`<span class="crit">${L.crit}</span>`:''}`:'<span class="sub">Tap any modifier to roll</span>'}</div>${bad.length?`<p class="reqn">Disadvantage on every d20 roll: ${esc(bad.map(x=>`${x.n} needs Str ${x.ar.str}`).join(', '))}. Unequip it or raise Strength.</p>`:''}<div class="rc"><div class="seg">${sg('','Normal')}${sg('adv','Adv')}${sg('dis','Dis')}</div><input id="cmd" readonly value="${esc(cmdFor())}" placeholder="Chat command" aria-label="Chat command"><button class="pri" data-a="cp">${COP?'Copied':'Copy'}</button></div><details data-id="more" ${OPEN.has('more')?'open':''}><summary>VTT format and custom roll</summary><div class="rc"><select data-k="vtt" aria-label="Chat format">${op('foundry','Foundry (/r)')}${op('roll20','Roll20 (/roll)')}${op('roll20t','Roll20 template')}</select><input id="cx" placeholder="2d6+3" value="${esc(CX)}" aria-label="Custom dice"><button data-a="cx">Roll</button></div></details></div></div>`}
const featSec=(t,k,typed,ed)=>{const L=S[k];let h=`<h2>${t}</h2>`;h+=L.length?L.map((x,i)=>{const id=k+'.'+i;return `<details class="ft" data-id="${id}" ${ed||OPEN.has(id)?'open':''}><summary><span class="g">${esc(x.n)}</span>${x.t?`<span class="pill">${esc(x.t)}</span>`:''}${ed?`<button class="x" data-a="delft" data-v="${id}" aria-label="Remove">\u2715</button>`:''}</summary>${ed?`<textarea data-k="${id}.d" placeholder="Description">${esc(x.d)}</textarea>`:`<p>${md(x.d)||'No description.'}</p>`}</details>`}).join(''):'<div class="empty">None yet.</div>';if(ed)h+=`<div class="add"><input class="n" id="ftn-${k}" placeholder="Name">${typed?`<select id="ftt-${k}"><option>Class feature</option><option>Feat</option></select>`:''}<button class="pri" data-a="addft" data-v="${k}">Add</button></div>`;return h};
function spRow(x,i,ed,p,cm){const r=x.r,k=`spells.${i}.r.`;
 if(ed)return `<div class="srl"><label class="row"><input type="checkbox" data-k="${k}a" ${r.a?'checked':''}> Attack</label><select data-k="${k}s" aria-label="Saving throw"><option value="">No save</option>${AB.map(a=>`<option value="${a}" ${r.s===a?'selected':''}>${ABN[a].slice(0,3)} save</option>`).join('')}</select>${inp(k+'d',r.d,'text','class="dmg" placeholder="Dice, e.g. 1d10" aria-label="Damage dice"')}${inp(k+'t',r.t,'text','class="dmt" placeholder="Type" aria-label="Damage type"')}<label class="row"><input type="checkbox" data-k="${k}m" ${r.m?'checked':''}> + modifier</label></div>`;
 const sl=UP[i]??x.l,{d,n}=spDice(x,sl);if(!r.a&&!ABN[r.s]&&!d)return'';
 return `<div class="srl">${r.a?`<button class="rb" data-a="satk" data-v="${i}">Hit ${fmt(p+cm+fxSum('sa'))}</button>`:''}${ABN[r.s]?`<span class="pill">DC ${8+p+cm+fxSum('dc')} ${ABN[r.s].slice(0,3)}</span>`:''}${d?`<button class="rb" data-a="sdmg" data-v="${i}">${esc(d)}${r.h||r.t?' '+esc(r.h?'healing':r.t):''}</button>`:''}${n>1?`<span class="a">&times;${n}</span>`:''}${r.by==='slot'&&r.up.length&&x.l>0?`<select data-up="${i}" aria-label="Slot level">${[1,2,3,4,5,6,7,8,9].filter(l=>l>=x.l).map(l=>`<option value="${l}" ${l===sl?'selected':''}>Slot ${l}</option>`).join('')}</select>`:''}</div>`}
function render(){
 const ed=S.mode==='edit',p=prof(),ca=S.cast,cm=ca?mod(sc(ca)):0;
 const CK=fxSum('chk'),SA=fxSum('sa'),DCB=fxSum('dc'),ckT=CK?`Includes ${srcText(fxOf('chk').map(([x,f])=>[x.n,f[2]]))}`:'';
 const advT=k=>{const l=fxAdv(k);return l.length?`Advantage from ${l.map(x=>x.n).join(', ')}`:''};
 S.spells.forEach(x=>{x.r=Object.assign(SR(),x.r)});
 const MK=[],cut=k=>MK.push([k,h.length]);
 const pct=Math.max(0,Math.min(100,S.hp.max?S.hp.cur/S.hp.max*100:0));
 let h=`<div class="top"><div><h1>${esc(S.name)||'Unnamed'}</h1><p class="sub">${esc([S.species,S.cls&&(S.cls+(S.sub?' ('+S.sub+')':'')),'Level '+S.level].filter(Boolean).join(', '))}</p></div>
 <div class="seg"><button data-a="mode" data-v="play" class="${ed?'':'on'}">Play</button><button data-a="mode" data-v="edit" class="${ed?'on':''}">Edit</button></div><button data-a="lib">Library</button></div>`;
 if(ed)h+=`<div class="id">${fld('Name','name',S.name)}${fld('Level','level',S.level,'number','min=1 max=20')}${fld('Class','cls',S.cls)}${fld('Subclass','sub',S.sub)}${fld('Species','species',S.species)}${fld('Background','bg',S.bg)}</div>`;
 cut('vit');
 h+=`<h2>Vitals</h2><div class="vitals">
 <div class="vit" title="${esc(S.acAuto?acCalc().parts.map(([n,v])=>n+' '+(v<0?v:'+'+v)).join('\n'):'Typed in by hand')}">${ed&&!S.acAuto?fld('AC','ac',S.ac,'number'):`<b>${acNow()}</b><span class="lab">Armor class</span>`}</div>
 <div class="vit">${ed?fld('Init bonus','init',S.init,'number'):`<button class="bigb" data-a="roll" data-l="Initiative" data-b="${mod(sc('dex'))+S.init+CK}" ${advT('init')?`data-adv="1"`:''} title="${esc([ckT,advT('init')].filter(Boolean).join('. '))}">${fmt(mod(sc('dex'))+S.init+CK)}</button><span class="lab">Initiative${advT('init')?' <span class="pill adv">Adv</span>':''}</span>`}</div>
 <div class="vit">${ed?fld('Speed','speed',S.speed,'number'):`<b>${S.speed}</b><span class="lab">Speed</span>`}</div>
 <div class="vit"><b>${fmt(p)}</b><span class="lab">Proficiency</span></div></div>
 <div class="hp"><div class="hpn"><b>${S.hp.cur}</b><span>/ ${S.hp.max} HP</span>${S.hp.temp?`<span class="pill">+${S.hp.temp} temp</span>`:''}</div>
 <div class="bar ${pct<25?'low':''}"><i style="width:${pct}%"></i></div>
 <div class="row"><input id="amt" type="number" min="0" value="${amt}" aria-label="Amount"><button class="bad" data-a="dmg">Damage</button><button class="pri" data-a="heal">Heal</button><button data-a="temp">Set temp</button></div>
 ${ed?`<div class="row" style="margin-top:8px">${fld('Max HP','hp.max',S.hp.max,'number')}${fld('Current HP','hp.cur',S.hp.cur,'number')}</div>`:''}
 <div class="row" style="margin-top:8px"><button data-a="long">Long rest</button>
 <label class="row" style="margin-left:auto"><input type="checkbox" data-k="insp" ${S.insp?'checked':''}> Heroic Inspiration</label></div></div>`;
 if(ed)h+=`<div class="row acset"><label class="row"><input type="checkbox" data-k="acAuto" ${S.acAuto?'checked':''}> Calculate AC from equipped gear</label>${S.acAuto?`<label class="row">Other AC bonus ${inp('acb',S.acb,'number','min=-10 max=20 style="width:72px" aria-label="Other AC bonus"')}</label>`:''}</div>`;
 cut('abil');
 h+=`<h2>Abilities ${!ed&&CK?`<small>${esc(ckT)} on checks</small>`:''}</h2><div class="abs">${AB.map(a=>{const by=scBy(a);return `<div class="ab${by?' boost':''}" ${by?`title="${esc(`${by[0].n} sets ${ABN[a]} to ${by[1][2]} (yours: ${S.ab[a]})`)}"`:''}><div class="n">${ABN[a].slice(0,3)}</div><button class="rb m" data-a="roll" data-l="${ABN[a]} check" data-b="${mod(sc(a))+CK}">${fmt(mod(sc(a))+CK)}</button>${ed?inp('ab.'+a,S.ab[a],'number','min=1 max=30'):`<div class="s">${sc(a)}${by?` <span class="up">${esc(by[0].n)}</span>`:''}</div>`}</div>`}).join('')}</div>`;
 cut('save');
 const sb=saveBonus(),sbT=sb?`Includes ${srcText(saveSrc())}`:'';
 h+=`<h2>Saving throws ${ed?'<small>tap circles to set proficiency</small>':sb?`<small>${esc(sbT)}</small>`:''}</h2><div class="list two">${AB.map(a=>{const pr=S.sv[a]?1:0,v=mod(sc(a))+pr*p+sb;return `<div class="ln"><button class="pr" data-a="sv" data-v="${a}" ${ed?'':'disabled'}>${PM[pr]}</button><span class="g">${ABN[a]}</span><button class="rb" data-a="roll" data-l="${ABN[a]} save" data-b="${v}" title="${esc(sbT)}">${fmt(v)}</button></div>`}).join('')}</div>`;
 const sd=worn(a=>a.stl),sdT=sd.length?`Disadvantage from ${sd.map(x=>x.n).join(', ')}`:'';
 cut('skill');h+=`<h2>Skills ${ed?'<small>tap to cycle: none, proficient, expertise</small>':CK?`<small>${esc(ckT)}</small>`:''}</h2><div class="list two">${SK.map(([n,a])=>{const pr=S.sk[n]||0;return `<div class="ln"><button class="pr" data-a="sk" data-v="${n}" ${ed?'':'disabled'}>${PM[pr]}</button><span class="g">${n} <span class="a">${a}</span>${n==='Stealth'&&sd.length?` <span class="pill dis" title="${esc(sdT)}">Dis</span>`:''}${advT(n)?` <span class="pill adv" title="${esc(advT(n))}">Adv</span>`:''}</span><button class="rb" data-a="roll" data-l="${n}" data-b="${mod(sc(a))+pr*p+CK}" ${n==='Stealth'&&sd.length?`data-dis="1"`:''} ${advT(n)?`data-adv="1"`:''} title="${esc([n==='Stealth'?sdT:'',advT(n),ckT].filter(Boolean).join('. '))}">${fmt(mod(sc(a))+pr*p+CK)}</button></div>`}).join('')}</div>
 <div class="ln"><span class="g">Passive Perception</span><span class="v" title="${esc([ckT,advT('Perception')?'+5 for Advantage':''].filter(Boolean).join('. '))}">${10+mod(sc('wis'))+(S.sk.Perception||0)*p+CK+(advT('Perception')?5:0)}</span></div>`;
 cut('feat');h+=featSec('Features and feats','feats',true,ed);cut('race');h+=featSec('Racial features','race',false,ed);
 cut('spell');
 h+=`<h2><button class="hd" data-a="spc" aria-expanded="${!S.spc}">Spellcasting</button>${S.spc?`<small>${S.spells.length} spell${S.spells.length===1?'':'s'}${ca?`, save DC ${8+p+cm+DCB}`:''}</small>`:''}</h2>`;const sp0=h.length;
 h+=`<div class="row" style="margin-bottom:8px"><div style="flex:1"><label class="lab">Spellcasting ability</label><select data-k="cast"><option value="">None</option>${AB.map(a=>`<option value="${a}" ${ca===a?'selected':''}>${ABN[a]}</option>`).join('')}</select></div></div>`;
 if(ca)h+=`<div class="cast"><span>Save DC <b>${8+p+cm+DCB}</b></span><span>Attack <button class="rb" data-a="roll" data-l="Spell attack" data-b="${p+cm+SA}">${fmt(p+cm+SA)}</button></span>${SA||DCB?`<span class="a">${esc(srcText([...fxOf('sa'),...fxOf('dc')].map(([x,f])=>[`${x.n} (${f[0]==='sa'?'attack':'DC'})`,f[2]])))}</span>`:''}<span>Modifier <b>${fmt(cm)}</b></span></div>`;
 const sl=S.slots.map((s,i)=>({s,i})).filter(o=>ed||o.s.m>0);
 h+=`<div class="slots">${sl.length?sl.map(({s,i})=>`<div class="sl"><span class="lv">Lvl ${i+1}</span><div class="pips">${Array.from({length:s.m},(_,j)=>`<button class="pip ${j<s.u?'used':''}" data-a="slot" data-v="${i}.${j}" aria-label="Slot ${j+1}"></button>`).join('')}</div>${ed?inp(`slots.${i}.m`,s.m,'number','min=0 max=9 aria-label="Max slots"'):''}</div>`).join(''):'<div class="empty">No spell slots. Switch to Edit to set them.</div>'}</div>`;
 const sp=S.spells.map((x,i)=>({x,i})).sort((a,b)=>a.x.l-b.x.l||a.x.n.localeCompare(b.x.n));
 let last=-1;
 // Cantrips are always ready, so only leveled spells get a Prepared box. Once anything is
 // prepared, Play mode dims the rest; a caster who never ticks boxes sees nothing dimmed.
 const lv=S.spells.filter(x=>x.l>0),np=lv.filter(x=>x.p).length;
 if(lv.length)h+=`<p class="sub prep">Prepared <b>${np}</b> of ${lv.length} leveled spells. Tick the box next to a spell to prepare it.</p>`;
 h+=sp.length?sp.map(({x,i})=>{let g='';if(x.l!==last){last=x.l;g=`<div class="grp">${x.l?'Level '+x.l:'Cantrips'}</div>`}const dim=!ed&&np&&x.l>0&&!x.p;return g+`<div class="spi${dim?' unp':''}"><div class="ln">${x.l>0?`<input type="checkbox" data-k="spells.${i}.p" ${x.p?'checked':''} aria-label="Prepared" title="Prepared">`:'<span class="pk"></span>'}<span class="g">${x.d?`<button class="lk" data-a="spd" data-v="${i}" aria-expanded="${OPEN.has('sp'+i)}">${esc(x.n)}</button>`:esc(x.n)}</span>${ed?`<button class="x" data-a="delsp" data-v="${i}" aria-label="Remove">\u2715</button>`:''}</div>${spRow(x,i,ed,p,cm)}${x.d&&OPEN.has('sp'+i)?`<p class="sd">${md(x.d)}</p>`:''}</div>`}).join(''):'<div class="empty">No spells yet.</div>';
 if(ed)h+=`<div class="add"><input class="n" id="spn" placeholder="Spell name"><select id="spl">${[0,1,2,3,4,5,6,7,8,9].map(n=>`<option value="${n}">${n?'Lvl '+n:'Cantrip'}</option>`).join('')}</select><button class="pri" data-a="addsp">Add</button></div>`;
 if(S.spc)h=h.slice(0,sp0);
 cut('inv');
 // Only gear you wear or wield gets an Equipped box; it works like Prepared for spells.
 // Sheets from before attuning was a separate choice: whatever was equipped stays attuned.
 S.items.forEach(x=>{if(x.eq===undefined)x.eq=!!x.w;if(!x.eq)x.on=false;if(x.eq&&!x.ar)x.ar={k:'',ac:0,str:0,nu:false};if(x.at&&x.att===undefined)x.att=!!x.on;if(!x.at)delete x.att});
 const eqs=S.items.filter(x=>x.eq),ne=eqs.filter(x=>x.on).length,AC=acCalc(),G=gear();
 // Collapsed, Inventory keeps only what's equipped (with its roll buttons), plus the AC and attunement lines.
 h+=`<h2><button class="hd" data-a="inc" aria-expanded="${!S.inc}">Inventory</button>${S.inc?`<small>${S.items.length} item${S.items.length===1?'':'s'}, ${ne} equipped</small>`:''}</h2>`;
 if(eqs.length&&!S.inc)h+=`<p class="sub prep">Equipped <b>${ne}</b> of ${eqs.length} equippable item${eqs.length===1?'':'s'}. Tick the box next to gear you are wearing or wielding.</p>`;
 if(S.items.some(x=>x.at)&&!S.inc)h+=`<p class="sub prep">Attuned <b>${Math.min(3,G.attuned)}</b> of 3${G.over.length?` <span class="reqm">${G.over.length} more than you can attune to</span>`:''}. A magic item that needs attunement only works while equipped and attuned.</p>`;
 if(S.acAuto&&eqs.length&&!S.inc)h+=`<p class="sub prep">Armor class <b>${AC.ac}</b>: ${esc(AC.parts.map(([n,v])=>`${n} ${v<0?v:'+'+v}`).join(', ').replace(/^(.*?) \+(\d+)/,'$1 $2'))}.</p>`;
 const AK=[['','No AC effect'],['light','Light armor (+ Dex)'],['medium','Medium armor (+ Dex, max 2)'],['heavy','Heavy armor'],['shield','Shield (adds AC)'],['bonus','AC bonus (adds AC)'],['unarm','Unarmored base (+ Dex)']];
 const shownIt=S.items.map((x,i)=>[x,i]).filter(([x])=>!S.inc||(x.eq&&x.on));
 h+=shownIt.length?shownIt.map(([x,i])=>{const w=x.w,m=w?wMod(x):0,dim=!ed&&ne&&x.eq&&!x.on,bad=x.eq&&x.on&&x.ar&&x.ar.str>sc('str'),spare=x.on&&x.ar&&['light','medium','heavy','shield'].includes(x.ar.k)&&!AC.used.has(x),over=G.over.includes(x);return `<div class="spi${dim?' unp':''}${bad||over?' req':''}"><div class="ln">${x.eq?`<input type="checkbox" data-k="items.${i}.on" ${x.on?'checked':''} aria-label="Equipped" title="Equipped">`:'<span class="pk"></span>'}<span class="g">${x.d?`<button class="lk" data-a="itd" data-v="${i}" aria-expanded="${OPEN.has('it'+i)}">${esc(x.n)}</button>`:esc(x.n)}${rarityTag(x.rr)}${bad?` <span class="reqm">Needs Str ${x.ar.str} (you have ${sc('str')})</span>`:''}${x.at?` <button class="pill att${x.att?' on':''}" data-a="att" data-v="${i}" aria-pressed="${!!x.att}" title="${x.att?'Attuned. Click to end attunement':'Needs attunement. Click to attune'}">${x.att?'Attuned':'Attune'}</button>`:''}${over?' <span class="reqm">Over the 3-item attunement limit</span>':''}${x.at&&x.on&&!x.att?' <span class="a">not attuned, no effect</span>':''}${spare&&S.acAuto?' <span class="a">not counted, a better one is equipped</span>':''}</span>${ed?inp(`items.${i}.q`,x.q,'number','style="width:64px"'):`<span class="v">&times;${x.q}</span>`}${ed?`<button class="x" data-a="delit" data-v="${i}" aria-label="Remove">\u2715</button>`:''}</div>${!ed&&x.fx&&x.fx.length?`<div class="srl fxl">${esc(x.fx.map(fxLabel).join(' \u00b7 '))}</div>`:''}${ed&&x.eq?`<div class="srl"><label class="row"><input type="checkbox" data-k="items.${i}.at" ${x.at?'checked':''}> Needs attunement</label>${(x.fx||[]).map((f,j)=>`<span class="pill">${esc(fxLabel(f))} <button class="x" data-a="delfx" data-v="${i}.${j}" aria-label="Remove effect">\u2715</button></span>`).join('')}<select id="fxt-${i}" aria-label="Effect">${FXO}</select><input id="fxv-${i}" type="number" value="1" style="width:64px" aria-label="Effect value"><button data-a="addfx" data-v="${i}">Add effect</button></div>`:''}${ed?`<div class="srl"><label class="row"><input type="checkbox" data-k="items.${i}.eq" ${x.eq?'checked':''}> Equippable</label>${x.eq?`<select data-k="items.${i}.ar.k" aria-label="Armor class effect">${AK.map(([v,t])=>`<option value="${v}" ${x.ar.k===v?'selected':''}>${t}</option>`).join('')}</select>${x.ar.k?`<label class="row">AC ${inp(`items.${i}.ar.ac`,x.ar.ac,'number','min=-10 max=30 style="width:64px" aria-label="AC value"')}</label><label class="row">Str needed ${inp(`items.${i}.ar.str`,x.ar.str,'number','min=0 max=30 style="width:64px" aria-label="Strength needed"')}</label><label class="row">Save bonus ${inp(`items.${i}.ar.sb`,x.ar.sb||0,'number','min=-5 max=10 style="width:64px" aria-label="Saving throw bonus"')}</label><label class="row"><input type="checkbox" data-k="items.${i}.ar.stl" ${x.ar.stl?'checked':''}> Stealth Disadvantage</label>`:''}`:''}</div>`:''}${w&&!ed?`<div class="srl"><button class="rb" data-a="iatk" data-v="${i}">Hit ${fmt(p+m)}</button><button class="rb" data-a="idmg" data-v="${i}">${esc(withMod(w.d,m))} ${esc(w.t)}</button>${w.v?`<button class="rb" data-a="idmg" data-v="${i}" data-t="v">${esc(withMod(w.v,m))} two-handed</button>`:''}</div>`:''}${x.d&&OPEN.has('it'+i)?`<p class="sd">${md(x.d)}</p>`:''}</div>`}).join(''):(S.inc&&S.items.length?'<div class="empty">Nothing equipped.</div>':'<div class="empty">Nothing carried.</div>');
 if(ed&&!S.inc)h+=`<div class="add"><input class="n" id="itn" placeholder="Item name"><input class="q" id="itq" type="number" value="1" min="0"><button class="pri" data-a="addit">Add</button></div>`;
 cut('notes');h+=`<h2>Notes</h2><textarea data-k="notes" placeholder="Features, backstory, session notes">${esc(S.notes)}</textarea>`;
 cut('backup');
 const ex=+lsGet('sheet-exported')||0,hist=snaps();
 h+=`<h2>Backup</h2><p class="sub" style="margin:0 0 8px">Saves automatically in this browser only. Browsers can clear saved data (Safari after 7 days without a visit), so keep a backup file. <b>${ex?`Last backup ${ago(ex)}.`:'No backup downloaded yet.'}</b></p>
 <div class="row" style="margin-bottom:8px"><button class="pri" data-a="dl">Download backup</button><label class="btn">Open backup file<input type="file" id="imf" class="vh" accept=".json,application/json"></label></div>
 <textarea id="io" placeholder="Exported JSON appears here. Paste JSON here to import.">${esc(io)}</textarea>
 <div class="row" style="margin-top:8px"><button data-a="exp">Export</button><button data-a="imp">Import</button><button class="bad" data-a="reset">New character</button></div>
 ${hist.length?`<div class="row" style="margin-top:8px"><select id="snp" aria-label="Earlier version" style="flex:1">${hist.map((x,i)=>`<option value="${i}">${esc(new Date(x.at).toLocaleString())}: ${esc(x.name)}${x.why==='autosave'?'':` (${esc(x.why)})`}</option>`).join('')}</select><button data-a="rst">Restore an earlier version</button></div>`:''}`;
 // Sections go into three columns: stats, inventory and spells, everything else. On phones the columns
 // dissolve and the order values put the sections back into one reading order.
 cut('end');const part=k=>{const i=MK.findIndex(m=>m[0]===k);return h.slice(MK[i][1],MK[i+1][1])};
 const secOf=(k,o)=>`<section class="c" style="order:${o}">${part(k)}</section>`;
 h=h.slice(0,MK[0][1])+`<div class="grid"><div class="col">${secOf('vit',1)}${secOf('abil',2)}${secOf('save',3)}${secOf('skill',4)}</div><div class="col">${secOf('inv',7)}${secOf('spell',8)}</div><div class="col">${secOf('feat',5)}${secOf('race',6)}${secOf('notes',9)}${secOf('backup',10)}</div></div>`;
 document.getElementById('app').innerHTML=h;renderRoll();
}

document.addEventListener('change',e=>{
 const t=e.target;
 if(t.id==='amt'){amt=Math.max(0,parseInt(t.value)||0);return}
 if(t.id==='cx'){CX=t.value;return}
 if(t.dataset.up!==undefined){UP[t.dataset.up]=+t.value;render();return}
 if(!t.dataset.k)return;
 setPath(t.dataset.k,t.type==='number'?(parseInt(t.value)||0):t.type==='checkbox'?t.checked:t.value);
 if(t.dataset.k==='level')S.level=Math.min(20,Math.max(1,S.level));
 save();render();
});
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.id&&(S.mode!=='edit'||d.dataset.id==='more')){d.open?OPEN.add(d.dataset.id):OPEN.delete(d.dataset.id)}},true);
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-a]');if(!b)return;
 const a=b.dataset.a,v=b.dataset.v,g=id=>document.getElementById(id);
 const n=Math.max(0,parseInt(g('amt')?.value)||0);amt=n||amt;
 if(a==='mode')S.mode=v;
 else if(a==='dmg'){let d=n,t=Math.min(S.hp.temp,d);S.hp.temp-=t;d-=t;S.hp.cur=Math.max(0,S.hp.cur-d)}
 else if(a==='heal')S.hp.cur=Math.min(S.hp.max,S.hp.cur+n);
 else if(a==='temp')S.hp.temp=Math.max(S.hp.temp,n);
 else if(a==='long'){S.hp.cur=S.hp.max;S.hp.temp=0;S.slots.forEach(s=>s.u=0)}
 else if(a==='short'){}
 else if(a==='sv')S.sv[v]=!S.sv[v];
 else if(a==='sk')S.sk[v]=((S.sk[v]||0)+1)%3;
 else if(a==='slot'){const[i,j]=v.split('.').map(Number),s=S.slots[i];s.u=(j<s.u)?j:j+1}
 else if(a==='addsp'){const nm=g('spn').value.trim();if(!nm)return;S.spells.push({n:nm,l:+g('spl').value,p:false})}
 else if(a==='delsp'){S.spells.splice(+v,1);[...OPEN].filter(k=>k.startsWith('sp')).forEach(k=>OPEN.delete(k));Object.keys(UP).forEach(k=>delete UP[k]);CRIT=null}
 else if(a==='satk'){const x=S.spells[+v],cm=S.cast?mod(sc(S.cast)):0;doRoll(x.n+' attack',prof()+cm+fxSum('sa'));CRIT=LAST.crit==='Natural 20'?'s'+v:null;COP=copyText(cmdFor())}
 else if(a==='sdmg'){const x=S.spells[+v],{d}=spDice(x,UP[v]??x.l);if(!rollExpr(x.n+(x.r.h?' healing':' damage'),d,CRIT==='s'+v)){alert('Use dice like 1d10 or 2d6+3. Fix them in Edit.');return}CRIT=null;COP=copyText(cmdFor())}
 else if(a==='iatk'){const x=S.items[+v];doRoll(x.n+' attack',prof()+wMod(x));CRIT=LAST.crit==='Natural 20'?'i'+v:null;COP=copyText(cmdFor())}
 else if(a==='idmg'){const x=S.items[+v],tw=b.dataset.t==='v';if(!rollExpr(x.n+' damage'+(tw?' (two-handed)':''),withMod(tw?x.w.v:x.w.d,wMod(x)),CRIT==='i'+v)){alert('This weapon has no valid damage dice.');return}CRIT=null;COP=copyText(cmdFor())}
 else if(a==='addfx'){const x=S.items[+v],[t,k]=g('fxt-'+v).value.split('|');let n=parseInt(g('fxv-'+v).value)||0;if(t==='set')n=Math.min(30,Math.max(1,n||19));if(t==='adv')n=0;x.fx=[...(x.fx||[]).filter(f=>!(f[0]===t&&f[1]===k)),[t,k,n]]}
 else if(a==='delfx'){const[i,j]=v.split('.').map(Number);S.items[i].fx.splice(j,1)}
 else if(a==='itd'){const k='it'+v;OPEN.has(k)?OPEN.delete(k):OPEN.add(k)}
 else if(a==='spc')S.spc=!S.spc;
 else if(a==='inc')S.inc=!S.inc;
 else if(a==='att'){const x=S.items[+v];if(!x.att&&S.items.filter(o=>o.at&&o.att).length>=3){alert('You are already attuned to 3 items. End attunement to one of them first.');return}x.att=!x.att}
 else if(a==='spd'){const k='sp'+v;OPEN.has(k)?OPEN.delete(k):OPEN.add(k)}
 else if(a==='lib'){openLibrary(()=>S,()=>{save();render()});return}
 else if(a==='addit'){const nm=g('itn').value.trim();if(!nm)return;S.items.push({n:nm,q:parseInt(g('itq').value)||1})}
 else if(a==='delit'){S.items.splice(+v,1);[...OPEN].filter(k=>k.startsWith('it')).forEach(k=>OPEN.delete(k));CRIT=null}
 else if(a==='addft'){const nm=g('ftn-'+v).value.trim();if(!nm)return;const t=g('ftt-'+v);S[v].push({n:nm,t:t?t.value:'',d:''})}
 else if(a==='delft'){const[k,i]=v.split('.');S[k].splice(+i,1);OPEN.clear()}
 else if(a==='roll'){doRoll(b.dataset.l,+b.dataset.b,b.dataset.dis==='1',b.dataset.adv==='1');CRIT=null;COP=copyText(cmdFor())}
 else if(a==='rm')RM=v;
 else if(a==='cx'){if(!doCustom(g('cx').value)){alert('Use a format like 2d6+3.');return}CRIT=null;COP=copyText(cmdFor())}
 else if(a==='cp')COP=copyText(cmdFor());
 else if(a==='exp'){io=JSON.stringify(S,null,1);lsSet('sheet-exported',String(Date.now()));save();render();const ta=g('io');ta.select();try{navigator.clipboard.writeText(io)}catch(x){}return}
 else if(a==='dl')downloadSheet();
 else if(a==='imp'){if(!importText(g('io').value))return}
 else if(a==='rst'){const x=snaps()[+g('snp').value];if(!x||!confirm(`Restore "${x.name}" from ${new Date(x.at).toLocaleString()}? The current version is kept in the list.`))return;try{replaceSheet(JSON.parse(x.s),'before restore')}catch(e){alert('That version could not be read.');return}}
 else if(a==='reset'){if(!confirm('Start a new character? The current one can be brought back from "Restore an earlier version".'))return;replaceSheet({},'before new character')}
 save();render();
});
document.addEventListener('change',e=>{const f=e.target.id==='imf'&&e.target.files[0];if(!f)return;f.text().then(t=>{if(importText(t)){save();render()}}).catch(()=>alert('Could not read that file.'));e.target.value=''});
// Another tab saved: take its version, so this tab never writes a stale copy over it.
window.addEventListener('storage',e=>{if(e.key!=='sheet'||!e.newValue)return;try{S=cleanSheet(JSON.parse(e.newValue));render()}catch(x){}});
// Ask the browser not to clear this site's data under storage pressure (granted silently or not at all).
try{navigator.storage?.persisted?.().then(p=>p||navigator.storage.persist()).catch(()=>{})}catch(e){}
snapshot('opened',true);
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
backfill();
render();
