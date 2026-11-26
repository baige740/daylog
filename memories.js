import {entries,create,write,remove,plain,escapeHTML as esc,dateKey} from './journal.js';
import {listLedger} from './life-data.js';
import {hydrateMedia} from './media.js';

const all=()=>entries({includeSpecial:true});
const people=()=>all().filter(r=>r.person);
const today=()=>dateKey(new Date());
const e=esc;
const recordLabel=r=>e((r.title? r.title+' · ':'')+(plain(r.html).slice(0,75)||'图片记录'));
const row=r=>'<button class="memory-row" type="button" data-memory-record="'+e(r.id)+'"><b>'+dateKey(r.at)+'</b><span>'+recordLabel(r)+'</span></button>';
const id=()=>crypto.randomUUID();
const bytesTo64=bytes=>btoa(String.fromCharCode(...bytes));
const from64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function keyFor(password,salt){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptVault(text,password){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await keyFor(password,salt),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text));
 return {salt:bytesTo64(salt),iv:bytesTo64(iv),cipher:bytesTo64(new Uint8Array(cipher))};
}
async function decryptVault(vault,password){
 const key=await keyFor(password,from64(vault.salt));
 const result=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(vault.iv)},key,from64(vault.cipher));
 return new TextDecoder().decode(result);
}
function bindRows(root,cb){
 root.querySelectorAll('[data-memory-record]').forEach(b=>b.onclick=()=>{const r=entries().find(x=>x.id===b.dataset.memoryRecord);if(r)cb.openRecord(r)});
}
export function openPeopleLink(record,cb){
 const persons=people();
 cb.dialog('关联人物',persons.length?'<p>选择与这条日记有关的人，可多选。</p><div class="people-choices">'+persons.map(p=>'<label><input type="checkbox" value="'+e(p.id)+'" '+(record.people?.includes(p.id)?'checked':'')+'> '+e(p.person.name)+'</label>').join('')+'</div><div class="dialog-actions"><button id="people-link-save" class="primary">保存关联</button></div>':'<p>还没有人物档案，请先在「生活回忆」创建。</p>');
 const save=document.querySelector('#people-link-save');if(save)save.onclick=()=>{const latest=entries().find(r=>r.id===record.id);if(!latest){cb.notify('原记录已删除');cb.close();return}write({...latest,people:[...document.querySelectorAll('.people-choices input:checked')].map(x=>x.value)});cb.close();cb.refresh();cb.notify('人物关联已保存')};
}
function editPerson(record,cb){
 const p=record?.person||{};
 cb.dialog(record?'编辑人物':'添加人物','<form id="person-form" class="memory-form"><label>姓名<input name="name" maxlength="80" required value="'+e(p.name||'')+'"></label><label>生日<input name="birthday" type="date" value="'+e(p.birthday||'')+'"></label><label>喜好<textarea name="likes" maxlength="2000">'+e(p.likes||'')+'</textarea></label><label>备注<textarea name="notes" maxlength="4000">'+e(p.notes||'')+'</textarea></label><button class="primary">保存人物</button></form>');
 document.querySelector('#person-form').onsubmit=event=>{event.preventDefault();const f=event.currentTarget;const person={...p,name:f.elements.namedItem('name').value.trim(),birthday:f.birthday.value,likes:f.likes.value.trim(),notes:f.notes.value.trim()};if(!person.name)return;try{if(record)write({...record,html:e('人物档案：'+person.name),person});else create('note',e('人物档案：'+person.name),{person});cb.close();cb.refresh();cb.notify('人物档案已保存')}catch{cb.notify('保存失败，请检查存储空间')}};
}
function vault(record,cb){
 const has=Boolean(record.person.vault);
 cb.dialog('加密账号密码','<p>单独设置加密口令，至少 8 位。忘记口令无法找回；口令与日迹访问密码互不关联。资料仅在解锁后显示，备份中保存密文。</p><form id="vault-unlock" class="memory-form"><label>加密口令<input name="password" type="password" minlength="8" autocomplete="off" required></label>'+(has?'':'<label>再次输入口令<input name="confirm" type="password" minlength="8" autocomplete="off" required></label>')+'<button class="primary">'+(has?'解锁':'创建加密区')+'</button><p id="vault-error" role="status"></p></form>');
 document.querySelector('#vault-unlock').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget,password=f.password.value;f.querySelector('button').disabled=true;try{if(!has&&password!==f.confirm.value)throw new Error('两次口令不一致');const value=has?await decryptVault(record.person.vault,password):'';cb.dialog('编辑加密资料','<p>可记录账号、密码和备注。保存后自动加密；关闭页面后需重新输入口令。</p><form id="vault-edit" class="memory-form"><label>账号密码<textarea name="secret" rows="8" maxlength="12000" autocomplete="off"></textarea></label><button class="primary">加密保存</button><p id="vault-error" role="status"></p></form>');const form=document.querySelector('#vault-edit');form.secret.value=value;form.onsubmit=async ev=>{ev.preventDefault();form.querySelector('button').disabled=true;try{const encrypted=await encryptVault(form.secret.value,password);const latest=all().find(x=>x.id===record.id);if(!latest)throw new Error('人物已删除');write({...latest,person:{...latest.person,vault:encrypted}});form.secret.value='';cb.close();cb.refresh();cb.notify('加密资料已保存')}catch(err){document.querySelector('#vault-error').textContent=err.message||'加密保存失败';form.querySelector('button').disabled=false}}}catch(err){document.querySelector('#vault-error').textContent=has?'口令不正确或资料已损坏':err.message;f.querySelector('button').disabled=false}};
}
function renderPersonDetail(root,record,cb){
 const p=record.person,linked=entries().filter(r=>r.people?.includes(record.id));
 root.innerHTML='<button class="secondary" id="memory-back">← 返回生活回忆</button><section class="memory-panel"><h1>'+e(p.name)+'</h1><p>生日：'+e(p.birthday||'未填写')+'</p><p>喜好：'+e(p.likes||'未填写')+'</p><p class="memory-pre">'+e(p.notes||'')+'</p><div class="memory-buttons"><button class="secondary" id="person-edit">编辑</button><button class="secondary" id="person-vault">'+(p.vault?'解锁账号密码':'添加加密账号密码')+'</button><button class="secondary danger" id="person-delete">删除人物</button></div><h2>共同回忆 · '+linked.length+'</h2>'+(linked.length?linked.map(row).join(''):'<p>在日记条目的“关联人物”按钮中选择此人。</p>')+'</section>';
 root.querySelector('#memory-back').onclick=()=>renderMemoryPage(root,cb);root.querySelector('#person-edit').onclick=()=>editPerson(record,cb);root.querySelector('#person-vault').onclick=()=>vault(record,cb);root.querySelector('#person-delete').onclick=async()=>{if(await cb.confirm('删除人物？','人物档案和其中的加密资料将被删除，关联日记会保留。','确认删除')){remove(record.id);cb.refresh();cb.notify('人物已删除')}};bindRows(root,cb);
}
function weekStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function priorMatches(records){const now=new Date(),year=now.getFullYear(),t=Date.UTC(2000,now.getMonth(),now.getDate());return records.filter(r=>{const d=new Date(r.at);if(d.getFullYear()>=year)return false;const v=Date.UTC(2000,d.getMonth(),d.getDate());return Math.min(Math.abs(t-v),366*86400000-Math.abs(t-v))<=3*86400000}).slice(0,8)}
function capsuleForm(cb){cb.dialog('写给未来的自己','<p>在指定日期前，内容不会在日记和搜索中展示。时间胶囊是展示限制，本机存储与导出的备份中仍能读取内容。</p><form id="capsule-form" class="memory-form"><label>开启日期<input name="openDate" type="date" min="'+today()+'" required></label><label>想说的话<textarea name="content" rows="8" maxlength="10000" required></textarea></label><button class="primary">封存</button></form>');document.querySelector('#capsule-form').onsubmit=event=>{event.preventDefault();const f=event.currentTarget,content=f.content.value.trim();if(!content||f.openDate.value<=today()){cb.notify('请选择明天或更晚的日期并写下内容');return}try{create('note',e(content).replace(/\n/g,'<br>'),{capsule:{openDate:f.openDate.value}});cb.close();cb.refresh();cb.notify('时间胶囊已封存')}catch{cb.notify('封存失败，请检查存储空间')}}}
export function renderMemoryPage(root,cb){
 const records=entries(),persons=people(),capsules=all().filter(r=>r.capsule),past=priorMatches(records),start=weekStart(),end=new Date();
 const week=records.filter(r=>new Date(r.at)>=start&&new Date(r.at)<=end),moods=week.filter(r=>Number.isInteger(r.mood)||r.type==='mood').reverse();
 const expenses=listLedger().filter(x=>x.type==='expense'&&new Date(x.at)>=start&&new Date(x.at)<=end),tasks=records.filter(r=>r.task&&!r.task.done),sum=expenses.reduce((a,b)=>a+b.amount,0);
 const places=[...new Set(records.map(r=>r.context?.place).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 const images=records.filter(r=>r.html.includes('data-media-id='));
 root.innerHTML='<header class="memory-title"><h1>生活回忆</h1><p>把人与地方、过去和未来，慢慢连起来。</p></header><section class="memory-panel" id="memory-week"><h2>本周生活回顾</h2><p>'+dateKey(start)+' 至 '+today()+' · '+week.length+' 条日记 · 支出 ¥'+sum.toFixed(2)+' · '+tasks.length+' 项待办</p><h3>这一周的事</h3>'+(week.length?week.map(row).join(''):'<p>这周还没有记录。</p>')+'<h3>心情变化</h3>'+(moods.length?moods.map(r=>'<button class="memory-row" data-memory-record="'+e(r.id)+'">'+dateKey(r.at)+' · '+e(r.type==='mood'?plain(r.html):['低落','疲惫','平静','愉快','开心'][r.mood])+'</button>').join(''):'<p>本周还没有心情记录。</p>')+'<h3>支出明细</h3>'+(expenses.length?expenses.map(x=>'<button class="memory-row" data-memory-ledger="'+e(x.id)+'">'+dateKey(x.at)+' · '+e(x.payee||x.category)+' · ¥'+x.amount.toFixed(2)+'</button>').join(''):'<p>本周还没有支出。</p>')+'<h3>未完成的事</h3>'+(tasks.length?tasks.map(row).join(''):'<p>没有未完成的待办。</p>')+'<h3>写给自己的问题</h3><p>这周最值得记住的瞬间是什么？哪件事让你开心或疲惫？下周想为自己做什么？</p></section>'+
 '<section class="memory-panel"><div class="memory-heading"><h2>重要人物</h2><button class="secondary" id="person-add">＋ 添加人物</button></div>'+(persons.length?persons.map(p=>'<button class="memory-row" data-person="'+e(p.id)+'"><b>'+e(p.person.name)+'</b><span>'+(p.person.birthday?'生日 '+e(p.person.birthday):'查看档案与共同回忆')+'</span></button>').join(''):'<p>记录家人和朋友的生日、喜好与共同回忆。</p>')+'</section>'+
 '<section class="memory-panel"><h2>照片与地点</h2><p>日记支持多张照片，地点可在编辑日记时填写。</p><label>按地点查看 <select id="memory-place"><option value="">全部地点</option>'+places.map(p=>'<option value="'+e(p)+'">'+e(p)+'</option>').join('')+'</select></label><div id="memory-photos"></div></section>'+
 '<section class="memory-panel"><h2>往年今日附近</h2><p>前后 3 天的旧记录。</p>'+(past.length?past.map(row).join(''):'<p>这个时间附近还没有往年记录。</p>')+'</section>'+
 '<section class="memory-panel"><div class="memory-heading"><h2>时间胶囊</h2><button class="secondary" id="capsule-add">＋ 写一封信</button></div>'+(capsules.length?capsules.map(r=>'<div class="capsule-row"><b>'+e(r.capsule.openDate)+'</b> '+(r.capsule.openDate<=today()?'<button data-capsule-open="'+e(r.id)+'">打开来信</button>':'<span>等待开启</span>')+' <button data-capsule-delete="'+e(r.id)+'">删除</button></div>').join(''):'<p>写一封信，在未来某一天打开。</p>')+'</section>';
 root.querySelector('#person-add').onclick=()=>editPerson(null,cb);root.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{const r=people().find(x=>x.id===b.dataset.person);if(r)renderPersonDetail(root,r,cb)});
 root.querySelectorAll('[data-memory-ledger]').forEach(b=>b.onclick=()=>{const x=expenses.find(x=>x.id===b.dataset.memoryLedger);if(x)cb.openLedger(x)});
 root.querySelector('#capsule-add').onclick=()=>capsuleForm(cb);root.querySelectorAll('[data-capsule-open]').forEach(b=>b.onclick=()=>{const r=all().find(x=>x.id===b.dataset.capsuleOpen);if(r&&r.capsule.openDate<=today()){write({...r,capsule:{...r.capsule,opened:true}});cb.refresh();cb.dialog('来自过去的信','<p class="memory-pre">'+e(plain(r.html))+'</p>')}});root.querySelectorAll('[data-capsule-delete]').forEach(b=>b.onclick=async()=>{if(await cb.confirm('删除时间胶囊？','删除后这封信将无法在日迹中找回。','确认删除')){remove(b.dataset.capsuleDelete);cb.refresh()}});
 const updatePhotos=()=>{const place=root.querySelector('#memory-place').value;const filtered=place?records.filter(r=>r.context?.place===place):images;const target=root.querySelector('#memory-photos');target.innerHTML=filtered.length?filtered.map(r=>'<div class="memory-photo-row">'+row(r)+(r.html.includes('data-media-id=')?'<div class="memory-thumbs">'+[...new DOMParser().parseFromString(r.html,'text/html').querySelectorAll('img[data-media-id]')].map(x=>x.outerHTML).join('')+'</div>':'')+'</div>').join(''):'<p>这里还没有相关记录。</p>';hydrateMedia(target,{preview:true}).catch(()=>{});bindRows(target,cb)};
 root.querySelector('#memory-place').onchange=updatePhotos;updatePhotos();bindRows(root,cb);
}

