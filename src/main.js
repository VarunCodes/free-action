import './style.css';
import { openLibrary } from './libraryui.js';
import { md } from './text.js';
const AB=['str','dex','con','int','wis','cha'];
const ABN={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
const SK=[['Acrobatics','dex'],['Animal Handling','wis'],['Arcana','int'],['Athletics','str'],['Deception','cha'],['History','int'],['Insight','wis'],['Intimidation','cha'],['Investigation','int'],['Medicine','wis'],['Nature','int'],['Perception','wis'],['Performance','cha'],['Persuasion','cha'],['Religion','int'],['Sleight of Hand','dex'],['Stealth','dex'],['Survival','wis']];
const DEF=()=>({name:'New Hero',cls:'',sub:'',species:'',bg:'',level:1,mode:'play',ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},sv:{},sk:{},hp:{cur:10,max:10,temp:0},ac:10,speed:30,init:0,cast:'',slots:Array.from({length:9},()=>({m:0,u:0})),spells:[],items:[],notes:'',insp:false,feats:[],race:[],vtt:'foundry',spc:false});
let S=DEF(),amt=1,io='';const OPEN=new Set();let RM='',LAST=null,COP=false,CX='',CRIT=null;const UP={};
const SR=()=>({a:false,s:'',d:'',b:'',t:'',h:false,m:false,by:'slot',up:[]});
try{const r=localStorage.getItem('sheet');if(r)S=Object.assign(DEF(),JSON.parse(r))}catch(e){}
const save=()=>{try{localStorage.setItem('sheet',JSON.stringify(S))}catch(e){}};
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
function doRoll(label,b){const r=[rd(20)];if(RM)r.push(rd(20));const pk=RM==='adv'?Math.max(...r):RM==='dis'?Math.min(...r):r[0];LAST={label,expr:(RM?'2d20'+(RM==='adv'?'kh1':'kl1'):'1d20')+(b?fmt(b):''),detail:(RM?'['+r.join(', ')+'] take '+pk:'['+pk+']')+(b?' '+(b>0?'+':'-')+' '+Math.abs(b):''),total:pk+b,crit:pk===20?'Natural 20':pk===1?'Natural 1':''}}
function doCustom(s){const m=s.replace(/\s/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);if(!m||+m[2]<1)return false;const n=Math.min(50,+m[1]||1),f=+m[2],b=+(m[3]||0),r=Array.from({length:n},()=>rd(f));LAST={label:'Roll',expr:n+'d'+f+(b?fmt(b):''),detail:'['+r.join(', ')+']'+(b?' '+(b>0?'+':'-')+' '+Math.abs(b):''),total:r.reduce((a,c)=>a+c,0)+b,crit:''};return true}
function rollExpr(label,e,crit){const ts=String(e).replace(/\s/g,'').match(/[+-]?[^+-]+/g)||[];let tot=0;const det=[],ex=[];for(const t of ts){const neg=t[0]==='-',q=t.replace(/^[+-]/,''),m=q.match(/^(\d*)d(\d+)$/i);if(m&&+m[2]>0){const n=Math.min(50,(+m[1]||1)*(crit?2:1)),f=+m[2],r=Array.from({length:n},()=>rd(f)),s=r.reduce((a,c)=>a+c,0);tot+=neg?-s:s;det.push((neg?'- ':det.length?'+ ':'')+'['+r.join(', ')+']');ex.push((neg?'-':'+')+n+'d'+f)}else if(/^\d+$/.test(q)){tot+=neg?-q:+q;det.push((neg?'- ':'+ ')+q);ex.push((neg?'-':'+')+q)}else return false}if(!ex.length)return false;LAST={label,expr:ex.join('').replace(/^\+/,''),detail:det.join(' '),total:Math.max(0,tot),crit:crit?'Critical hit, dice doubled':''};return true}
// Damage dice for a spell: cantrips scale with character level, other spells with the slot used.
// Scaling only applies while the dice still match what the Library gave, so hand edits win.
function spDice(x,slot){const r=x.r;let d=String(r.d).replace(/\s+/g,''),n=0;if(d&&d===r.b){const lv=r.by==='char'?S.level:slot;for(const[at,dd,nn]of r.up)if(at<=lv){if(dd)d=dd;if(nn)n=nn}}const cm=S.cast?mod(S.ab[S.cast]):0;if(d&&r.m&&cm)d+=fmt(cm);return{d,n}}
// Weapons: ranged use Dex, Finesse the better of Str and Dex, others Str; magic +N adds to both rolls.
const wMod=w=>{const s=mod(S.ab.str),d=mod(S.ab.dex);return (w.ab==='dex'?d:w.ab==='fin'?Math.max(s,d):s)+(+w.b||0)};
const withMod=(d,m)=>m?d+fmt(m):d;
function renderRoll(){const L=LAST,sg=(v,t)=>`<button data-a="rm" data-v="${v}" class="${RM===v?'on':''}">${t}</button>`,op=(v,t)=>`<option value="${v}" ${S.vtt===v?'selected':''}>${t}</option>`;
document.getElementById('roll').innerHTML=`<div class="rp"><div class="rpi"><div class="rr">${L?`<b class="tot">${L.total}</b><span>${esc(L.label)} ${esc(L.detail)}</span>${L.crit?`<span class="crit">${L.crit}</span>`:''}`:'<span class="sub">Tap any modifier to roll</span>'}</div><div class="rc"><div class="seg">${sg('','Normal')}${sg('adv','Adv')}${sg('dis','Dis')}</div><input id="cmd" readonly value="${esc(cmdFor())}" placeholder="Chat command" aria-label="Chat command"><button class="pri" data-a="cp">${COP?'Copied':'Copy'}</button></div><details data-id="more" ${OPEN.has('more')?'open':''}><summary>VTT format and custom roll</summary><div class="rc"><select data-k="vtt" aria-label="Chat format">${op('foundry','Foundry (/r)')}${op('roll20','Roll20 (/roll)')}${op('roll20t','Roll20 template')}</select><input id="cx" placeholder="2d6+3" value="${esc(CX)}" aria-label="Custom dice"><button data-a="cx">Roll</button></div></details></div></div>`}
const featSec=(t,k,typed,ed)=>{const L=S[k];let h=`<h2>${t}</h2>`;h+=L.length?L.map((x,i)=>{const id=k+'.'+i;return `<details class="ft" data-id="${id}" ${ed||OPEN.has(id)?'open':''}><summary><span class="g">${esc(x.n)}</span>${x.t?`<span class="pill">${esc(x.t)}</span>`:''}${ed?`<button class="x" data-a="delft" data-v="${id}" aria-label="Remove">\u2715</button>`:''}</summary>${ed?`<textarea data-k="${id}.d" placeholder="Description">${esc(x.d)}</textarea>`:`<p>${md(x.d)||'No description.'}</p>`}</details>`}).join(''):'<div class="empty">None yet.</div>';if(ed)h+=`<div class="add"><input class="n" id="ftn-${k}" placeholder="Name">${typed?`<select id="ftt-${k}"><option>Class feature</option><option>Feat</option></select>`:''}<button class="pri" data-a="addft" data-v="${k}">Add</button></div>`;return h};
function spRow(x,i,ed,p,cm){const r=x.r,k=`spells.${i}.r.`;
 if(ed)return `<div class="srl"><label class="row"><input type="checkbox" data-k="${k}a" ${r.a?'checked':''}> Attack</label><select data-k="${k}s" aria-label="Saving throw"><option value="">No save</option>${AB.map(a=>`<option value="${a}" ${r.s===a?'selected':''}>${ABN[a].slice(0,3)} save</option>`).join('')}</select>${inp(k+'d',r.d,'text','class="dmg" placeholder="Dice, e.g. 1d10" aria-label="Damage dice"')}${inp(k+'t',r.t,'text','class="dmt" placeholder="Type" aria-label="Damage type"')}<label class="row"><input type="checkbox" data-k="${k}m" ${r.m?'checked':''}> + modifier</label></div>`;
 const sl=UP[i]??x.l,{d,n}=spDice(x,sl);if(!r.a&&!ABN[r.s]&&!d)return'';
 return `<div class="srl">${r.a?`<button class="rb" data-a="satk" data-v="${i}">Hit ${fmt(p+cm)}</button>`:''}${ABN[r.s]?`<span class="pill">DC ${8+p+cm} ${ABN[r.s].slice(0,3)}</span>`:''}${d?`<button class="rb" data-a="sdmg" data-v="${i}">${esc(d)}${r.h||r.t?' '+esc(r.h?'healing':r.t):''}</button>`:''}${n>1?`<span class="a">&times;${n}</span>`:''}${r.by==='slot'&&r.up.length&&x.l>0?`<select data-up="${i}" aria-label="Slot level">${[1,2,3,4,5,6,7,8,9].filter(l=>l>=x.l).map(l=>`<option value="${l}" ${l===sl?'selected':''}>Slot ${l}</option>`).join('')}</select>`:''}</div>`}
function render(){
 const ed=S.mode==='edit',p=prof(),ca=S.cast,cm=ca?mod(S.ab[ca]):0;
 S.spells.forEach(x=>{x.r=Object.assign(SR(),x.r)});
 const MK=[],cut=k=>MK.push([k,h.length]);
 const pct=Math.max(0,Math.min(100,S.hp.max?S.hp.cur/S.hp.max*100:0));
 let h=`<div class="top"><div><h1>${esc(S.name)||'Unnamed'}</h1><p class="sub">${esc([S.species,S.cls&&(S.cls+(S.sub?' ('+S.sub+')':'')),'Level '+S.level].filter(Boolean).join(', '))}</p></div>
 <div class="seg"><button data-a="mode" data-v="play" class="${ed?'':'on'}">Play</button><button data-a="mode" data-v="edit" class="${ed?'on':''}">Edit</button></div><button data-a="lib">Library</button></div>`;
 if(ed)h+=`<div class="id">${fld('Name','name',S.name)}${fld('Level','level',S.level,'number','min=1 max=20')}${fld('Class','cls',S.cls)}${fld('Subclass','sub',S.sub)}${fld('Species','species',S.species)}${fld('Background','bg',S.bg)}</div>`;
 cut('vit');
 h+=`<h2>Vitals</h2><div class="vitals">
 <div class="vit">${ed?fld('AC','ac',S.ac,'number'):`<b>${S.ac}</b><span class="lab">Armor class</span>`}</div>
 <div class="vit">${ed?fld('Init bonus','init',S.init,'number'):`<button class="bigb" data-a="roll" data-l="Initiative" data-b="${mod(S.ab.dex)+S.init}">${fmt(mod(S.ab.dex)+S.init)}</button><span class="lab">Initiative</span>`}</div>
 <div class="vit">${ed?fld('Speed','speed',S.speed,'number'):`<b>${S.speed}</b><span class="lab">Speed</span>`}</div>
 <div class="vit"><b>${fmt(p)}</b><span class="lab">Proficiency</span></div></div>
 <div class="hp"><div class="hpn"><b>${S.hp.cur}</b><span>/ ${S.hp.max} HP</span>${S.hp.temp?`<span class="pill">+${S.hp.temp} temp</span>`:''}</div>
 <div class="bar ${pct<25?'low':''}"><i style="width:${pct}%"></i></div>
 <div class="row"><input id="amt" type="number" min="0" value="${amt}" aria-label="Amount"><button class="bad" data-a="dmg">Damage</button><button class="pri" data-a="heal">Heal</button><button data-a="temp">Set temp</button></div>
 ${ed?`<div class="row" style="margin-top:8px">${fld('Max HP','hp.max',S.hp.max,'number')}${fld('Current HP','hp.cur',S.hp.cur,'number')}</div>`:''}
 <div class="row" style="margin-top:8px"><button data-a="long">Long rest</button>
 <label class="row" style="margin-left:auto"><input type="checkbox" data-k="insp" ${S.insp?'checked':''}> Heroic Inspiration</label></div></div>`;
 cut('abil');
 h+=`<h2>Abilities</h2><div class="abs">${AB.map(a=>`<div class="ab"><div class="n">${ABN[a].slice(0,3)}</div><button class="rb m" data-a="roll" data-l="${ABN[a]} check" data-b="${mod(S.ab[a])}">${fmt(mod(S.ab[a]))}</button>${ed?inp('ab.'+a,S.ab[a],'number','min=1 max=30'):`<div class="s">${S.ab[a]}</div>`}</div>`).join('')}</div>`;
 cut('save');
 h+=`<h2>Saving throws ${ed?'<small>tap circles to set proficiency</small>':''}</h2><div class="list two">${AB.map(a=>{const pr=S.sv[a]?1:0;return `<div class="ln"><button class="pr" data-a="sv" data-v="${a}" ${ed?'':'disabled'}>${PM[pr]}</button><span class="g">${ABN[a]}</span><button class="rb" data-a="roll" data-l="${ABN[a]} save" data-b="${mod(S.ab[a])+pr*p}">${fmt(mod(S.ab[a])+pr*p)}</button></div>`}).join('')}</div>`;
 cut('skill');h+=`<h2>Skills ${ed?'<small>tap to cycle: none, proficient, expertise</small>':''}</h2><div class="list two">${SK.map(([n,a])=>{const pr=S.sk[n]||0;return `<div class="ln"><button class="pr" data-a="sk" data-v="${n}" ${ed?'':'disabled'}>${PM[pr]}</button><span class="g">${n} <span class="a">${a}</span></span><button class="rb" data-a="roll" data-l="${n}" data-b="${mod(S.ab[a])+pr*p}">${fmt(mod(S.ab[a])+pr*p)}</button></div>`}).join('')}</div>
 <div class="ln"><span class="g">Passive Perception</span><span class="v">${10+mod(S.ab.wis)+(S.sk.Perception||0)*p}</span></div>`;
 cut('feat');h+=featSec('Features and feats','feats',true,ed);cut('race');h+=featSec('Racial features','race',false,ed);
 cut('spell');
 h+=`<h2><button class="hd" data-a="spc" aria-expanded="${!S.spc}">Spellcasting</button>${S.spc?`<small>${S.spells.length} spell${S.spells.length===1?'':'s'}${ca?`, save DC ${8+p+cm}`:''}</small>`:''}</h2>`;const sp0=h.length;
 h+=`<div class="row" style="margin-bottom:8px"><div style="flex:1"><label class="lab">Spellcasting ability</label><select data-k="cast"><option value="">None</option>${AB.map(a=>`<option value="${a}" ${ca===a?'selected':''}>${ABN[a]}</option>`).join('')}</select></div></div>`;
 if(ca)h+=`<div class="cast"><span>Save DC <b>${8+p+cm}</b></span><span>Attack <button class="rb" data-a="roll" data-l="Spell attack" data-b="${p+cm}">${fmt(p+cm)}</button></span><span>Modifier <b>${fmt(cm)}</b></span></div>`;
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
 h+=`<h2>Inventory</h2>`;
 h+=S.items.length?S.items.map((x,i)=>{const w=x.w,m=w?wMod(w):0;return `<div class="ln"><span class="g">${x.d?`<button class="lk" data-a="itd" data-v="${i}" aria-expanded="${OPEN.has('it'+i)}">${esc(x.n)}</button>`:esc(x.n)}</span>${ed?inp(`items.${i}.q`,x.q,'number','style="width:64px"'):`<span class="v">&times;${x.q}</span>`}${ed?`<button class="x" data-a="delit" data-v="${i}" aria-label="Remove">\u2715</button>`:''}</div>${w&&!ed?`<div class="srl"><button class="rb" data-a="iatk" data-v="${i}">Hit ${fmt(p+m)}</button><button class="rb" data-a="idmg" data-v="${i}">${esc(withMod(w.d,m))} ${esc(w.t)}</button>${w.v?`<button class="rb" data-a="idmg" data-v="${i}" data-t="v">${esc(withMod(w.v,m))} two-handed</button>`:''}</div>`:''}${x.d&&OPEN.has('it'+i)?`<p class="sd">${md(x.d)}</p>`:''}`}).join(''):'<div class="empty">Nothing carried.</div>';
 if(ed)h+=`<div class="add"><input class="n" id="itn" placeholder="Item name"><input class="q" id="itq" type="number" value="1" min="0"><button class="pri" data-a="addit">Add</button></div>`;
 cut('notes');h+=`<h2>Notes</h2><textarea data-k="notes" placeholder="Features, backstory, session notes">${esc(S.notes)}</textarea>`;
 cut('backup');
 h+=`<h2>Backup</h2><p class="sub" style="margin:0 0 8px">Saves automatically in this browser. Export to copy your sheet, import to restore it.</p>
 <textarea id="io" placeholder="Exported JSON appears here. Paste JSON here to import.">${esc(io)}</textarea>
 <div class="row" style="margin-top:8px"><button data-a="exp">Export</button><button data-a="imp">Import</button><button class="bad" data-a="reset">New character</button></div>`;
 // Sections go into three columns: stats, inventory and spells, everything else. On phones the columns
 // dissolve and the order values put the sections back into one reading order.
 cut('end');const part=k=>{const i=MK.findIndex(m=>m[0]===k);return h.slice(MK[i][1],MK[i+1][1])};
 const sc=(k,o)=>`<section class="c" style="order:${o}">${part(k)}</section>`;
 h=h.slice(0,MK[0][1])+`<div class="grid"><div class="col">${sc('vit',1)}${sc('abil',2)}${sc('save',3)}${sc('skill',4)}</div><div class="col">${sc('inv',7)}${sc('spell',8)}</div><div class="col">${sc('feat',5)}${sc('race',6)}${sc('notes',9)}${sc('backup',10)}</div></div>`;
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
 else if(a==='satk'){const x=S.spells[+v],cm=S.cast?mod(S.ab[S.cast]):0;doRoll(x.n+' attack',prof()+cm);CRIT=LAST.crit==='Natural 20'?'s'+v:null;COP=copyText(cmdFor())}
 else if(a==='sdmg'){const x=S.spells[+v],{d}=spDice(x,UP[v]??x.l);if(!rollExpr(x.n+(x.r.h?' healing':' damage'),d,CRIT==='s'+v)){alert('Use dice like 1d10 or 2d6+3. Fix them in Edit.');return}CRIT=null;COP=copyText(cmdFor())}
 else if(a==='iatk'){const x=S.items[+v];doRoll(x.n+' attack',prof()+wMod(x.w));CRIT=LAST.crit==='Natural 20'?'i'+v:null;COP=copyText(cmdFor())}
 else if(a==='idmg'){const x=S.items[+v],tw=b.dataset.t==='v';if(!rollExpr(x.n+' damage'+(tw?' (two-handed)':''),withMod(tw?x.w.v:x.w.d,wMod(x.w)),CRIT==='i'+v)){alert('This weapon has no valid damage dice.');return}CRIT=null;COP=copyText(cmdFor())}
 else if(a==='itd'){const k='it'+v;OPEN.has(k)?OPEN.delete(k):OPEN.add(k)}
 else if(a==='spc')S.spc=!S.spc;
 else if(a==='spd'){const k='sp'+v;OPEN.has(k)?OPEN.delete(k):OPEN.add(k)}
 else if(a==='lib'){openLibrary(()=>S,()=>{save();render()});return}
 else if(a==='addit'){const nm=g('itn').value.trim();if(!nm)return;S.items.push({n:nm,q:parseInt(g('itq').value)||1})}
 else if(a==='delit'){S.items.splice(+v,1);[...OPEN].filter(k=>k.startsWith('it')).forEach(k=>OPEN.delete(k));CRIT=null}
 else if(a==='addft'){const nm=g('ftn-'+v).value.trim();if(!nm)return;const t=g('ftt-'+v);S[v].push({n:nm,t:t?t.value:'',d:''})}
 else if(a==='delft'){const[k,i]=v.split('.');S[k].splice(+i,1);OPEN.clear()}
 else if(a==='roll'){doRoll(b.dataset.l,+b.dataset.b);CRIT=null;COP=copyText(cmdFor())}
 else if(a==='rm')RM=v;
 else if(a==='cx'){if(!doCustom(g('cx').value)){alert('Use a format like 2d6+3.');return}CRIT=null;COP=copyText(cmdFor())}
 else if(a==='cp')COP=copyText(cmdFor());
 else if(a==='exp'){io=JSON.stringify(S,null,1);save();render();const ta=g('io');ta.select();try{navigator.clipboard.writeText(io)}catch(x){}return}
 else if(a==='imp'){try{const o=JSON.parse(g('io').value);if(typeof o!=='object'||!o||!o.ab)throw 0;S=Object.assign(DEF(),o);io=''}catch(x){alert('That is not a valid exported sheet. Paste the full JSON from Export.');return}}
 else if(a==='reset'){if(!confirm('Delete this character and start a new one?'))return;S=DEF();io=''}
 save();render();
});
render();
