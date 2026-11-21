import {smartType,pastePlain} from './writing.js';
import {icon,paintIcons} from './icons.js';
import {startMarket} from './market.js';
import {types,escapeHTML as esc,cleanHTML,plain,formatHTML,dateKey,entries,write,remove,create,validEntry,articleDraftPrefix,articleName} from './journal.js';
const $=s=>document.querySelector(s);
const editor=$('#editor'),dialog=$('#dialog'),dialogBody=$('#dialog-content');
const tabs=[['note','dotpen'],['trade','activity'],['reflect','bulb'],['quote','quote']];
const places={
  home:['今日总览','grid'],history:['记录时间线','history'],favorites:['我的收藏','bookmark'],
  trading:['交易与反思','#799e83',['trade','reflect']],life:['日常生活','#c9ac77',['note','poop','pee','water','walk']],feelings:['心情日记','#c58d7f',['mood']],quotes:['金句摘录','#9794b3',['quote']]
};
const placeholders={note:'此刻，在想些什么？',trade:'今天观察到了什么？写下判断和理由…',reflect:'回看今天，哪件事值得再想一想？',quote:'摘下一句话，记下它的出处…'};
const quick=[['poop','poop','#966c4d','#f8f1e9','#eee3d6'],['pee','oil','#ae8c42','#faf6e8','#eee6cc'],['water','glass','#588da0','#ecf4f6','#dce9ed'],['walk','walk','#64976b','#edf5eb','#dfebdb']];
const feelings=['低落','疲惫','平静','愉快','开心'];
const colors=[['#e7e9f2','#8991ad'],['#e7eef0','#839da4'],['#e9eddb','#93a278'],['#f7e7b0','#ba963c'],['#fbdfae','#bc8b3c']];
const quotes=[['知之者不如好之者，好之者不如乐之者。','孔子'],['不积跬步，无以至千里。','荀子'],['知人者智，自知者明。','老子'],['吾日三省吾身。','曾子'],['学而不思则罔，思而不学则殆。','孔子']];
let view='home',dayFilter='',typeFilter='',query='',activeTab='note',smart=localStorage.getItem('daylog:smart')!=='off',month=new Date(),records=[],toastTimer,activeDate=dateKey(new Date());
month.setDate(1);
const clock=v=>new Date(v).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function openDialog(title,html){$('#dialog-title').textContent=title;dialogBody.innerHTML=html;if(!dialog.open)dialog.showModal()}
$('#dialog-close').onclick=()=>dialog.close();
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
function setMenu(open){document.body.classList.toggle('nav-open',open);$('#veil').hidden=!open;$('#menu').setAttribute('aria-expanded',open)}
$('#menu').onclick=()=>setMenu(true);$('#veil').onclick=()=>setMenu(false);
function headerDate(){
  const now=new Date(),parts=now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).replace('星期',' · 星期');
  $('#hero-date').innerHTML=icon('calendar')+esc(parts);
  const q=quotes[Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86400000)%quotes.length];
  $('#day-quote').innerHTML='“'+q[0]+'” <small>— '+q[1]+'</small>'
}
function renderNav(){
  for(const [k,container] of [['main','#main-nav'],['cat','#category-nav']]){
    $(container).innerHTML=Object.entries(places).filter(([,v])=>(v.length===2)===(k==='main')).map(([id,[label,glyph]])=>'<button class="nav-item '+(view===id?'selected':'')+'" data-view="'+id+'"'+(view===id?' aria-current="page"':'')+'>'+(k==='main'?icon(glyph):'<span class="cat-dot" style="--cat:'+glyph+'"></span>')+label+'</button>').join('')
  }
}
function navigate(next,date=''){
  view=Object.hasOwn(places,next)?next:'home';query='';typeFilter='';dayFilter=date;setMenu(false);
  $('#dashboard').hidden=view!=='home';$('#archive').hidden=view==='home';$('#crumb').textContent=places[view][0];document.title='日迹 Daylog · '+places[view][0];
  renderNav();renderRecords();if(view!=='home')renderArchive();window.scrollTo(0,0)
}
function renderCal(){
  const y=month.getFullYear(),m=month.getMonth(),offset=(new Date(y,m,1).getDay()+6)%7;
  let cells=['一','二','三','四','五','六','日'].map(v=>'<label>'+v+'</label>').join('')+'<span></span>'.repeat(offset);
  const dates=new Set(records.map(r=>dateKey(r.at)));
  for(let d=1;d<=new Date(y,m+1,0).getDate();d++){
    const key=dateKey(new Date(y,m,d));
    cells+='<button aria-label="查看 '+key+' 的记录" data-day="'+key+'" class="'+(key===activeDate?'is-today ':'')+(dayFilter===key?'is-selected ':'')+(dates.has(key)?'has-entry':'')+'">'+d+'</button>'
  }
  $('#calendar').innerHTML='<div class="month-head"><strong>'+y+' 年 '+(m+1)+' 月</strong><button aria-label="上个月" data-month="-1">'+icon('chevronL')+'</button><button aria-label="下个月" data-month="1">'+icon('chevronR')+'</button></div><div class="calendar-grid">'+cells+'</div>'
}
function empty(title,hint){return '<div class="feed-empty"><span class="empty-icon">'+icon('journal')+'</span><div><b>'+title+'</b><p>'+hint+'</p></div></div>'}
function articleLink(r,mode,content,cls){
  return '<a class="'+cls+'" aria-label="'+(mode==='edit'?'编辑长文':'阅读全文')+'" href="article.html#'+mode+'/'+r.id+'" target="_blank" rel="noopener">'+content+'</a>'
}
function entry(r){
  const isArticle=r.mode==='article';
  const edit=isArticle?articleLink(r,'edit',icon('pen'),'icon-btn'):'<button class="icon-btn" data-action="edit" aria-label="编辑" title="编辑">'+icon('pen')+'</button>';
  const content=isArticle?'<h3 class="article-entry-title">'+articleLink(r,'read',esc(articleName(r)),'article-title-link')+'</h3><p class="article-excerpt">'+esc(plain(r.html).slice(0,220))+'</p>'+articleLink(r,'read','阅读全文','article-read'):'<div class="entry-text">'+r.html+'</div>';

  return '<article class="entry" data-id="'+r.id+'"><div class="entry-head"><time>'+clock(r.at)+'</time><span class="entry-type">'+types[r.type]+(isArticle?' · 长文':'')+'</span><div class="entry-buttons"><button class="icon-btn '+(r.fav?'liked':'')+'" data-action="fav" aria-label="'+(r.fav?'取消收藏':'收藏')+'" title="'+(r.fav?'取消收藏':'收藏')+'">'+icon('bookmark')+'</button>'+edit+'<button class="icon-btn" data-action="delete" aria-label="删除" title="删除">'+icon('trash')+'</button></div></div>'+content+'</article>'
}
function renderArticleDrafts(){
  const drafts=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith(articleDraftPrefix))continue;
    try{
      const d=JSON.parse(localStorage.getItem(key)),id=key.slice(articleDraftPrefix.length);
      if(/^[\w-]{1,80}$/.test(id))drafts.push({id,title:d.title,changed:d.changed})
    }catch{}
  }
  drafts.sort((a,b)=>b.changed-a.changed);
  const list=$('#article-drafts');list.hidden=!drafts.length;
  list.innerHTML=drafts.map(d=>'<a href="article.html#edit/'+d.id+'" target="_blank" rel="noopener">'+icon('pen')+'继续草稿 · '+esc(d.title||'未命名长文')+'</a>').join('')
}
function renderRecords(){
  activeDate=dateKey(new Date());records=entries();const today=records.filter(r=>dateKey(r.at)===activeDate);
  $('#today-count').textContent=today.length;$('#today-list').innerHTML=today.length?today.slice(0,5).map(entry).join(''):empty('今天的第一页，等你写下','写一条手记，或点击速记，记录就会出现在这里。');
  const lastMood=today.find(r=>r.type==='mood');document.querySelectorAll('.mood').forEach(b=>b.classList.toggle('active',Boolean(lastMood)&&plain(lastMood.html)===feelings[Number(b.dataset.mood)]));
  renderArticleDrafts();renderCal();if(view!=='home'&&$('#archive-list'))renderArchiveList()
}
function renderArchive(){
  const options=Object.entries(types).filter(([t])=>!places[view][2]||places[view][2].includes(t));
  $('#archive').innerHTML='<h1 class="archive-title">'+places[view][0]+'</h1><div class="archive-controls"><input class="field" id="query" type="search" aria-label="搜索当前记录" placeholder="搜索记录内容"><input class="field" style="flex:0 1 auto" type="date" id="date-filter" aria-label="按日期筛选" value="'+esc(dayFilter)+'"><select aria-label="按记录类型筛选" id="type-filter"><option value="">全部类型</option>'+options.map(([id,text])=>'<option value="'+id+'">'+text+'</option>').join('')+'</select><button class="secondary" id="clear-filters">重置</button></div><div id="archive-list"></div>';
  $('#query').oninput=e=>{query=e.target.value;renderArchiveList()};$('#date-filter').oninput=e=>{dayFilter=e.target.value;renderArchiveList();renderCal()};$('#type-filter').onchange=e=>{typeFilter=e.target.value;renderArchiveList()};
  $('#clear-filters').onclick=()=>navigate(view);renderArchiveList()
}
function renderArchiveList(){
  const rows=records.filter(r=>(view!=='favorites'||r.fav)&&(!places[view][2]||places[view][2].includes(r.type))&&(!typeFilter||r.type===typeFilter)&&(!dayFilter||dateKey(r.at)===dayFilter)&&(!query||((r.title||'')+' '+plain(r.html)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  let last='',html='';for(const r of rows){const date=dateKey(r.at);if(date!==last){html+='<h3 class="date-title">'+date+'</h3>';last=date}html+=entry(r)}
  $('#archive-list').innerHTML=html||empty(view==='favorites'?'还没有匹配的收藏':'这里还没有匹配的记录',view==='favorites'?'点记录上的书签，就可以在这里回看。':'调整筛选条件，或回到今日总览写下一条记录。')
}
function safeAction(fn){try{return fn()}catch(error){toast(error.name==='QuotaExceededError'?'本机存储空间不足，请先导出备份':'操作未完成，请检查浏览器存储或备份文件');return null}}
function recordQuick(type,text){safeAction(()=>{create(type,esc(text));renderRecords();toast('已记录 · '+text)})}
function moodIcon(i){
  const mouths=['M9 21q7-8 14 0','M10 20q6-3 12 0','M10 20q6 2 12 0','M9 18q7 9 14 0','M9 18q7 12 14 0z'];
  const eyes=i===4?'<path d="M8 13q2-3 4 0m8 0q2-3 4 0"/>':'<circle cx="10.5" cy="13" r="1" fill="currentColor"/><circle cx="21.5" cy="13" r="1" fill="currentColor"/>';
  return '<svg viewBox="0 0 32 32" aria-hidden="true" style="color:'+colors[i][1]+'"><circle cx="16" cy="16" r="14" fill="'+colors[i][0]+'" stroke="currentColor" stroke-width="1.3"/><g stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round">'+eyes+'<path d="'+mouths[i]+'"/></g></svg>'
}
function renderButtons(){
  $('#editor-tabs').innerHTML=tabs.map(([t,g])=>'<button class="tab" data-tab="'+t+'" aria-pressed="'+(activeTab===t)+'">'+icon(g)+types[t]+'</button>').join('');
  $('#quick-actions').innerHTML=quick.map(([t,g,tone,light,edge])=>'<button class="quick" data-quick="'+t+'" style="--tone:'+tone+';--light:'+light+';--edge:'+edge+'">'+icon(g)+types[t]+'<span class="tiny-plus">+</span></button>').join('');
  $('#moods').innerHTML=feelings.map((v,i)=>'<button class="mood" data-mood="'+i+'">'+moodIcon(i)+v+'</button>').join('');
  $('#smart').setAttribute('aria-pressed',smart)
}
function countWords(){const count=Array.from(plain(editor.innerHTML).replace(/\s/g,'')).length;$('#word-count').textContent=count+' 字';return count}
function draftInfo(label){$('#draft-state').innerHTML=icon('shield')+esc(label)}
function storeDraft(){
  if(!editor.textContent.trim()&&!editor.querySelector('li'))editor.replaceChildren();
  const count=countWords();
  try{if(count)localStorage.setItem('daylog:draft:'+activeTab,cleanHTML(editor.innerHTML));else localStorage.removeItem('daylog:draft:'+activeTab);draftInfo(count?'草稿已保存':'本机草稿')}
  catch{draftInfo('草稿存储失败，请导出或复制正文')}
}
function selectTab(tab,focus=true){
  activeTab=tab;$('#open-deep').href='article.html#new/'+tab;localStorage.setItem('daylog:tab',tab);editor.innerHTML=cleanHTML(localStorage.getItem('daylog:draft:'+tab)||'');editor.dataset.placeholder=placeholders[tab];
  $('#editor-tabs').querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',tab===b.dataset.tab));
  const n=countWords();draftInfo(n?'已恢复草稿':'本机草稿');if(focus)editor.focus()
}
let composing=false;editor.oncompositionstart=()=>{composing=true};editor.oncompositionend=()=>{composing=false;smartType(editor,smart);storeDraft()};
editor.oninput=e=>{if(!e.isComposing&&!composing)smartType(editor,smart);if(!composing)storeDraft()};
editor.addEventListener('paste',pastePlain);editor.addEventListener('drop',e=>e.preventDefault());
$('#smart').onclick=()=>{smart=!smart;localStorage.setItem('daylog:smart',smart?'on':'off');$('#smart').setAttribute('aria-pressed',smart);toast(smart?'智能排版已开启：段首“结论：”和 **重点** 会自动加粗':'智能排版已关闭')};
document.querySelectorAll('[data-format]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{editor.focus();const cmd=b.dataset.format;
  if(cmd==='quote'){document.execCommand('formatBlock',false,getSelection().anchorNode?.parentElement?.closest('blockquote')?'div':'blockquote')}else document.execCommand(cmd,false,null);storeDraft()
}});
function save(){
  if(composing)return;if(!plain(editor.innerHTML)){toast('先写下想记录的内容');editor.focus();return}
  safeAction(()=>{create(activeTab,smart?formatHTML(editor.innerHTML):cleanHTML(editor.innerHTML));editor.replaceChildren();storeDraft();renderRecords();toast('已保存到今日时间线')})
}
$('#save').onclick=save;$('#all-entries').onclick=()=>navigate('history');
function editRecord(r){
  openDialog('编辑记录','<label class="when">事件时间<input class="field" id="edit-when" required type="datetime-local" value="'+dateKey(r.at)+'T'+clock(r.at)+'"></label><div id="edit-text" class="edit-box" contenteditable="true" role="textbox" aria-label="编辑记录正文">'+r.html+'</div><div class="dialog-actions"><button class="secondary" id="cancel-edit">取消</button><button class="primary" id="apply-edit">保存修改</button></div>');
  const box=$('#edit-text');box.addEventListener('paste',pastePlain);box.addEventListener('drop',e=>e.preventDefault());$('#cancel-edit').onclick=()=>dialog.close();
  $('#apply-edit').onclick=()=>{
    if(!plain(box.innerHTML)){box.focus();return}
    const when=$('#edit-when');if(!when.reportValidity())return;
    safeAction(()=>{
      const latest=entries().find(item=>item.id===r.id);if(!latest){dialog.close();renderRecords();toast('这条记录已删除');return}
      const at=when.value===dateKey(r.at)+'T'+clock(r.at)?r.at:new Date(when.value).toISOString();
      write({...latest,at,html:smart?formatHTML(box.innerHTML):cleanHTML(box.innerHTML)});dialog.close();renderRecords();toast('修改已保存')
    })
  }
}
function openSearch(){
  openDialog('搜索记录','<input class="field" type="search" id="global-query" placeholder="搜索内容或记录类型…" aria-label="搜索全部记录"><div class="search-results" id="search-results"></div>');
  const input=$('#global-query');function list(){const value=input.value.trim().toLowerCase(),matches=records.filter(r=>(types[r.type]+' '+(r.title||'')+' '+plain(r.html)).toLowerCase().includes(value));
    $('#search-results').innerHTML=matches.slice(0,80).map(r=>r.mode==='article'?articleLink(r,'read','<small>'+dateKey(r.at)+' · '+types[r.type]+' · 长文</small>'+esc(articleName(r)),'search-item'):'<button class="search-item" data-result="'+r.id+'"><small>'+dateKey(r.at)+' '+clock(r.at)+' · '+types[r.type]+'</small>'+esc(plain(r.html).slice(0,100))+'</button>').join('')||'<p>'+(value?'没有找到匹配的记录':'写下第一条记录后，即可在这里搜索。')+'</p>'
  }input.oninput=list;list();input.focus()
}
$('#search-open').onclick=openSearch;
function openBackup(){
  openDialog('我的手记本','<p>这台设备的浏览器中保存了 '+records.length+' 条记录。导出备份后，可以在另一台设备上导入，已有记录会自动跳过。</p><div class="backup-row"><button class="primary" id="export">'+icon('download')+'导出备份</button><button class="secondary" id="import">'+icon('upload')+'导入备份</button><input type="file" id="backup-file" hidden accept=".json,application/json"></div><p>手机上可从浏览器菜单添加到主屏幕，随时打开记录。</p><div id="backup-status" role="status"></div>');
  $('#export').onclick=()=>{const blob=new Blob([JSON.stringify({app:'daylog',version:1,entries:entries()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='日迹-'+dateKey(new Date())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('#import').onclick=()=>$('#backup-file').click();$('#backup-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;let added=0;
    try{const data=JSON.parse(await f.text());if(data.app!=='daylog'||data.version!==1||!Array.isArray(data.entries))throw Error();const incoming=data.entries.map(validEntry),existing=new Set(entries().map(r=>r.id));for(const r of incoming){if(existing.has(r.id))continue;write(r);existing.add(r.id);added++}$('#backup-status').textContent='导入 '+added+' 条，跳过 '+(incoming.length-added)+' 条重复记录。'}
    catch{$('#backup-status').textContent='导入未完成，已写入 '+added+' 条。请检查备份格式和本机存储空间。'}renderRecords();e.target.value=''
  }
}
$('#profile').onclick=openBackup;
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.view)navigate(d.view);else if(d.tab)selectTab(d.tab);else if(d.quick)recordQuick(d.quick,types[d.quick]+'一次');else if(d.mood!==undefined)recordQuick('mood',feelings[Number(d.mood)]);
  else if(d.month){month.setMonth(month.getMonth()+Number(d.month));renderCal()}else if(d.day)navigate('history',d.day);
  else if(d.result){const r=records.find(r=>r.id===d.result);if(r)editRecord(r)}
  else if(d.action){
    const id=b.closest('[data-id]')?.dataset.id,r=entries().find(v=>v.id===id);if(!r){renderRecords();return}
    if(d.action==='fav')safeAction(()=>{write({...r,fav:!r.fav});renderRecords();toast(r.fav?'已取消收藏':'已加入我的收藏')});
    if(d.action==='edit')editRecord(r);
    if(d.action==='delete'){openDialog('删除这条记录？','<p>'+esc(plain(r.html).slice(0,100))+'</p><div class="dialog-actions"><button class="secondary" id="keep">保留记录</button><button class="secondary danger" id="erase">确认删除</button></div>');$('#keep').onclick=()=>dialog.close();$('#erase').onclick=()=>safeAction(()=>{remove(r.id);localStorage.removeItem(articleDraftPrefix+r.id);dialog.close();renderRecords();toast('记录已删除')})}
  }
});
document.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&document.activeElement===editor){e.preventDefault();save()}if(e.key==='Escape')setMenu(false)});
window.addEventListener('storage',e=>{if(!e.key||e.key.startsWith('daylog:entry:'))renderRecords();else if(e.key.startsWith(articleDraftPrefix))renderArticleDrafts()});
function changeDay(){if(activeDate!==dateKey(new Date())){headerDate();renderRecords()}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)changeDay()});setInterval(changeDay,30000);
paintIcons();headerDate();renderButtons();const lastTab=localStorage.getItem('daylog:tab');selectTab(tabs.some(([t])=>t===lastTab)?lastTab:'note',false);navigate('home');startMarket(openDialog,toast);
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});

