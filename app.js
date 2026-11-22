import {appVersion} from './version.js';
import {smartType,pastePlain} from './writing.js';
import {icon,paintIcons} from './icons.js';
import {startMarket} from './market.js';
import {types,escapeHTML as esc,cleanHTML,plain,hasMeaningfulContent,parseArticleDraft,hasArticleDraftContent,formatHTML,dateKey,entries,write,remove,create,validEntry,articleDraftPrefix,lightDraftPrefix,articleName,storedDrafts,storedDraftEntries} from './journal.js';
import {consumeRecoveryNotice,lockNow,openPasswordSettings} from './auth.js';
import {DEFAULT_STYLE,applyDocumentStyle,contextBadgeMarkup,firstImageFiles,moodMarkup,moodPickerMarkup,normalizeContext,normalizeMood,normalizeStyle,requestRecordContext,updateContextButton,updateMoodPicker} from './extras.js';
import {addImagesToEditor,cleanupUnreferencedMedia,deleteMediaAssets,exportMediaBundle,hydrateMedia,importMediaAssets,referencedMediaIds,saveImageAsset} from './media.js';
import {renderStatsPage} from './insights.js';
const $=s=>document.querySelector(s);
const editor=$('#editor'),dialog=$('#dialog'),dialogBody=$('#dialog-content');
const editorSurface=$('#editor-surface'),contextButton=$('#locate-weather'),moodButtons=$('#entry-moods');
const tabs=[['note','dotpen'],['trade','activity'],['reflect','bulb'],['quote','quote']];
const places={
  home:['今日总览','grid'],history:['记录时间线','history'],favorites:['我的收藏','bookmark'],
  stats:['记录统计','chart'],
  trading:['交易与反思','#799e83',['trade','reflect']],life:['日常生活','#c9ac77',['note','poop','pee','water','walk']],feelings:['心情日记','#c58d7f',['mood']],quotes:['金句摘录','#9794b3',['quote']]
};
const placeholders={note:'此刻，在想些什么？',trade:'今天观察到了什么？写下判断和理由…',reflect:'回看今天，哪件事值得再想一想？',quote:'摘下一句话，记下它的出处…'};
const quick=[['poop','poop','#966c4d','#f8f1e9','#eee3d6'],['pee','oil','#ae8c42','#faf6e8','#eee6cc'],['water','glass','#588da0','#ecf4f6','#dce9ed'],['walk','walk','#64976b','#edf5eb','#dfebdb']];
const feelings=['低落','疲惫','平静','愉快','开心'];
const colors=[['#e7e9f2','#8991ad'],['#e7eef0','#839da4'],['#e9eddb','#93a278'],['#f7e7b0','#ba963c'],['#fbdfae','#bc8b3c']];
const quotes=[['知之者不如好之者，好之者不如乐之者。','孔子'],['不积跬步，无以至千里。','荀子'],['知人者智，自知者明。','老子'],['吾日三省吾身。','曾子'],['学而不思则罔，思而不学则殆。','孔子']];
const lightStyleBase={...DEFAULT_STYLE,fontSize:17,lineHeight:1.9,paragraphGap:.82};
let view='home',dayFilter='',typeFilter='',query='',activeTab='note',smart=localStorage.getItem('daylog:smart')!=='off',month=new Date(),statsMonth=new Date(),records=[],toastTimer,activeDate=dateKey(new Date());
let currentContext=null,currentMood=null,currentStyle=normalizeStyle(null,lightStyleBase),locationBusy=false;
let dialogCleanup=null;
month.setDate(1);
statsMonth.setDate(1);
const clock=v=>new Date(v).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function openDialog(title,html){dialogCleanup=null;$('#dialog-title').textContent=title;dialogBody.innerHTML=html;if(!dialog.open)dialog.showModal()}
$('#dialog-close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{const cleanup=dialogCleanup;dialogCleanup=null;cleanup?.()});
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
  $('#mobile-nav').querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('selected',button.dataset.view===view));
}
function navigate(next,date=''){
  view=Object.hasOwn(places,next)?next:'home';query='';typeFilter='';dayFilter=date;setMenu(false);
  $('#dashboard').hidden=view!=='home';
  $('#archive').hidden=!(view!=='home'&&view!=='stats');
  $('#stats').hidden=view!=='stats';
  $('#crumb').textContent=places[view][0];document.title='日迹 Daylog · '+places[view][0];
  renderNav();renderRecords();
  if(view==='stats')renderStats();else if(view!=='home')renderArchive();
  window.scrollTo(0,0)
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
  return '<a class="'+cls+'" aria-label="'+(mode==='edit'?'在当前页编辑长文':'在当前页阅读全文')+'" href="article.html#'+mode+'/'+r.id+'">'+content+'</a>'
}
function recordMoodMarkup(r){
  return Number.isInteger(r.mood)?'<span class="entry-mood" title="心情：'+esc(['低落','疲惫','平静','愉快','开心'][r.mood]||'')+'">'+moodMarkup(r.mood,{compact:true})+'</span>':''
}
function searchText(r){
  const media=document.createElement('div');
  media.innerHTML=cleanHTML(r.html);
  const imageText=Array.from(media.querySelectorAll('img[alt]'),image=>image.alt).join(' ');
  const mood=Number.isInteger(r.mood)?feelings[r.mood]:'';
  return [types[r.type],r.title||'',plain(r.html),imageText,mood,r.context?.place||'',r.context?.weather||''].join(' ').toLocaleLowerCase();
}
function articlePhotos(html){
  const template=document.createElement('template');
  template.innerHTML=html;
  const photos=Array.from(template.content.querySelectorAll('img[data-media-id]'));
  return photos.length?'<div class="article-photos">'+photos.map(photo=>photo.outerHTML).join('')+'</div>':'';
}
function entry(r){
  const isArticle=r.mode==='article';
  const edit=isArticle?articleLink(r,'edit',icon('pen'),'icon-btn'):'<button class="icon-btn" data-action="edit" aria-label="编辑" title="编辑">'+icon('pen')+'</button>';
  const excerpt=plain(r.html).slice(0,220)||'图片日记';
  const content=isArticle?'<h3 class="article-entry-title">'+articleLink(r,'read',esc(articleName(r)),'article-title-link')+'</h3><p class="article-excerpt record-styled-copy">'+esc(excerpt)+'</p>'+articlePhotos(r.html)+articleLink(r,'read','阅读全文','article-read'):'<div class="entry-text record-styled-copy">'+r.html+'</div>';
  const environment=(r.context||Number.isInteger(r.mood))
    ?'<div class="entry-context-line">'+recordMoodMarkup(r)+contextBadgeMarkup(r.context,{compact:true})+'</div>':'';

  return '<article class="entry" data-id="'+r.id+'"><div class="entry-head"><time>'+clock(r.at)+'</time><span class="entry-type">'+types[r.type]+(isArticle?' · 长文':'')+'</span><div class="entry-buttons"><button class="icon-btn '+(r.fav?'liked':'')+'" data-action="fav" aria-label="'+(r.fav?'取消收藏':'收藏')+'" title="'+(r.fav?'取消收藏':'收藏')+'">'+icon('bookmark')+'</button>'+edit+'<button class="icon-btn" data-action="delete" aria-label="删除" title="删除">'+icon('trash')+'</button></div></div>'+environment+content+'</article>'
}
function decorateEntries(root=document){
  root.querySelectorAll('.entry[data-id]').forEach(node=>{
    const record=records.find(item=>item.id===node.dataset.id);
    if(!record)return;
    node.querySelectorAll('.record-styled-copy').forEach(copy=>applyDocumentStyle(copy,record.style,DEFAULT_STYLE));
    hydrateMedia(node,{preview:true}).catch(()=>null);
  });
}
function draftChangedAt(value){
  if(value===null||value===undefined||value==='')return null;
  const numeric=Number(value);
  if(Number.isFinite(numeric))return numeric;
  const parsed=Date.parse(String(value));
  return Number.isFinite(parsed)?parsed:null;
}
function formatDraftEditedAt(value){
  const changed=draftChangedAt(value);
  if(changed===null)return '时间未知';
  const date=new Date(changed);
  const now=new Date(),today=dateKey(now),day=dateKey(date),clock=String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
  if(day===today)return '今天 '+clock;
  const previous=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
  if(day===dateKey(previous))return '昨天 '+clock;
  if(date.getFullYear()===now.getFullYear())return (date.getMonth()+1)+'月'+date.getDate()+'日 '+clock;
  return date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日 '+clock;
}
function firstGraphemes(text,limit){
  const characters=[];
  if(globalThis.Intl?.Segmenter){
    const segmenter=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
    for(const item of segmenter.segment(text)){
      characters.push(item.segment);
      if(characters.length>limit)break;
    }
  }else{
    characters.push(...Array.from(text));
  }
  return {preview:characters.slice(0,limit).join(''),truncated:characters.length>limit};
}
function renderArticleDrafts(){
  const drafts=[],keys=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith(articleDraftPrefix))keys.push(key);
  }
  for(const key of keys){
    const raw=localStorage.getItem(key),id=key.slice(articleDraftPrefix.length);
    if(!raw||!/^[\w-]{1,80}$/.test(id))continue;
    const d=parseArticleDraft(raw);
    if(!d)continue;
    const title=typeof d.title==='string'?d.title.replace(/[\u200b-\u200d\ufeff]/g,'').trim():'',html=typeof d.html==='string'?d.html:'';
    if(!hasArticleDraftContent(title,html)){
      try{localStorage.removeItem(key)}catch{}
      continue;
    }
    const text=plain(html).replace(/\s+/g,' ').trim();
    const excerpt=firstGraphemes(text,6);
    const bodyPreview=text?excerpt.preview+(excerpt.truncated?'…':''):'图片草稿';
    const label=title||bodyPreview;
    drafts.push({id,label,changed:draftChangedAt(d.changed)});
  }
  drafts.sort((a,b)=>(Number.isFinite(b.changed)?b.changed:0)-(Number.isFinite(a.changed)?a.changed:0));
  const list=$('#article-drafts');list.hidden=!drafts.length;
  list.innerHTML=drafts.map(d=>{
    const datetime=Number.isFinite(d.changed)?new Date(d.changed).toISOString():'';
    const timeMarkup='<time class="article-draft-time"'+(datetime?' datetime="'+datetime+'"':'')+'>最后编辑 · '+esc(formatDraftEditedAt(d.changed))+'</time>';
    return '<a href="article.html#edit/'+d.id+'" title="继续编辑：'+esc(d.label)+'" aria-label="继续编辑草稿 '+esc(d.label)+'"><span class="article-draft-icon">'+icon('pen')+'</span><span class="article-draft-copy"><span class="article-draft-label">'+esc(d.label)+'</span>'+timeMarkup+'</span></a>'
  }).join('')
}
function renderRecords(){
  activeDate=dateKey(new Date());records=entries();const today=records.filter(r=>dateKey(r.at)===activeDate);
  $('#today-count').textContent=today.length;$('#today-list').innerHTML=today.length?today.map(entry).join(''):empty('今天的第一页，等你写下','写一条手记，或点击速记，记录就会出现在这里。');
  const lastMood=today.find(r=>r.type==='mood');document.querySelectorAll('.mood').forEach(b=>b.classList.toggle('active',Boolean(lastMood)&&plain(lastMood.html)===feelings[Number(b.dataset.mood)]));
  decorateEntries($('#today-list'));
  renderArticleDrafts();renderCal();
  if(view==='stats')renderStats();else if(view!=='home'&&$('#archive-list'))renderArchiveList()
}
function renderArchive(){
  const options=Object.entries(types).filter(([t])=>!places[view][2]||places[view][2].includes(t));
  $('#archive').innerHTML='<h1 class="archive-title">'+places[view][0]+'</h1><div class="archive-controls"><input class="field" id="query" type="search" aria-label="搜索当前记录" placeholder="搜索记录内容"><input class="field" style="flex:0 1 auto" type="date" id="date-filter" aria-label="按日期筛选" value="'+esc(dayFilter)+'"><select aria-label="按记录类型筛选" id="type-filter"><option value="">全部类型</option>'+options.map(([id,text])=>'<option value="'+id+'">'+text+'</option>').join('')+'</select><button class="secondary" id="clear-filters">重置</button></div><div id="archive-list"></div>';
  $('#query').oninput=e=>{query=e.target.value;renderArchiveList()};$('#date-filter').oninput=e=>{dayFilter=e.target.value;renderArchiveList();renderCal()};$('#type-filter').onchange=e=>{typeFilter=e.target.value;renderArchiveList()};
  $('#clear-filters').onclick=()=>navigate(view);renderArchiveList()
}
function renderArchiveList(){
  const rows=records.filter(r=>(view!=='favorites'||r.fav)&&(!places[view][2]||places[view][2].includes(r.type))&&(!typeFilter||r.type===typeFilter)&&(!dayFilter||dateKey(r.at)===dayFilter)&&(!query||searchText(r).includes(query.trim().toLocaleLowerCase())));
  let last='',html='';for(const r of rows){const date=dateKey(r.at);if(date!==last){html+='<h3 class="date-title">'+date+'</h3>';last=date}html+=entry(r)}
  $('#archive-list').innerHTML=html||empty(view==='favorites'?'还没有匹配的收藏':'这里还没有匹配的记录',view==='favorites'?'点记录上的书签，就可以在这里回看。':'调整筛选条件，或回到今日总览写下一条记录。')
  decorateEntries($('#archive-list'));
}
function renderStats(){
  renderStatsPage($('#stats'),records,statsMonth);
}
function actionFailed(error){
  toast(error?.name==='QuotaExceededError'?'本机存储空间不足，请先导出备份':'操作未完成，请检查浏览器存储或备份文件');
  return null;
}
function safeAction(fn){
  try{
    const result=fn();
    if(result&&typeof result.then==='function')return result.catch(actionFailed);
    return result;
  }catch(error){return actionFailed(error)}
}
function recordQuick(type,text,extra={}){safeAction(()=>{create(type,esc(text),extra);renderRecords();toast('已记录 · '+text)})}
function moodIcon(i){
  const mouths=['M9 21q7-8 14 0','M10 20q6-3 12 0','M10 20q6 2 12 0','M9 18q7 9 14 0','M9 18q7 12 14 0z'];
  const eyes=i===4?'<path d="M8 13q2-3 4 0m8 0q2-3 4 0"/>':'<circle cx="10.5" cy="13" r="1" fill="currentColor"/><circle cx="21.5" cy="13" r="1" fill="currentColor"/>';
  return '<svg viewBox="0 0 32 32" aria-hidden="true" style="color:'+colors[i][1]+'"><circle cx="16" cy="16" r="14" fill="'+colors[i][0]+'" stroke="currentColor" stroke-width="1.3"/><g stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round">'+eyes+'<path d="'+mouths[i]+'"/></g></svg>'
}
function renderButtons(){
  $('#editor-tabs').innerHTML=tabs.map(([t,g])=>'<button class="tab" data-tab="'+t+'" aria-pressed="'+(activeTab===t)+'">'+icon(g)+types[t]+'</button>').join('');
  $('#quick-actions').innerHTML=quick.map(([t,g,tone,light,edge])=>'<button class="quick" data-quick="'+t+'" style="--tone:'+tone+';--light:'+light+';--edge:'+edge+'">'+icon(g)+types[t]+'<span class="tiny-plus">+</span></button>').join('');
  $('#moods').innerHTML=feelings.map((v,i)=>'<button class="mood" data-mood="'+i+'">'+moodIcon(i)+v+'</button>').join('');
  moodButtons.innerHTML=moodPickerMarkup(currentMood);
  $('#smart').setAttribute('aria-pressed',smart)
}
function countWords(){const count=Array.from(plain(editor.innerHTML).replace(/\s/g,'')).length;$('#word-count').textContent=count+' 字';return count}
function draftInfo(label){$('#draft-state').innerHTML=icon('shield')+esc(label)}
function editorHasContent(){return hasMeaningfulContent(editor.innerHTML)}
function applyEditorStyle(){
  currentStyle=applyDocumentStyle(editorSurface,currentStyle,lightStyleBase);
  document.querySelectorAll('[data-editor-font]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorFont===currentStyle.font)));
  document.querySelectorAll('[data-editor-bg]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorBg===currentStyle.background)));
  document.querySelectorAll('[data-style-range]').forEach(input=>{
    const key=input.dataset.styleRange;input.value=currentStyle[key];
    const output=document.querySelector('[data-style-output="'+key+'"]');
    if(output)output.textContent=key==='lineHeight'?Number(currentStyle[key]).toFixed(2)
      :key==='letterSpacing'?Number(currentStyle[key]).toFixed(3)
      :key==='fontSize'?String(Math.round(Number(currentStyle[key])))
      :Number(currentStyle[key]).toFixed(1)
  });
}
function applyDraftMeta(){
  applyEditorStyle();
  updateMoodPicker(moodButtons,currentMood);
  updateContextButton(contextButton,currentContext);
}
function readLightDraft(tab){
  const raw=localStorage.getItem('daylog:draft:'+tab);
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw);
    if(parsed&&typeof parsed==='object'&&typeof parsed.html==='string'){
      return {html:parsed.html,context:parsed.context||null,mood:parsed.mood,style:parsed.style}
    }
  }catch{}
  return {html:raw,context:null,mood:null,style:null}
}
function storeDraft(){
  if(!editorHasContent())editor.replaceChildren();
  const count=countWords();
  const imageCount=editor.querySelectorAll('img[data-media-id]').length;
  try{
    if(editorHasContent())localStorage.setItem('daylog:draft:'+activeTab,JSON.stringify({html:cleanHTML(editor.innerHTML),context:currentContext,mood:currentMood,style:currentStyle,changed:Date.now()}));
    else localStorage.removeItem('daylog:draft:'+activeTab);
    draftInfo(editorHasContent()?(count?'草稿已保存':imageCount+' 张图片已保存'):'本机草稿')
  }
  catch{draftInfo('草稿存储失败，请导出或复制正文')}
}
function selectTab(tab,focus=true){
  activeTab=tab;$('#open-deep').href='article.html#new/'+tab;localStorage.setItem('daylog:tab',tab);
  const draft=readLightDraft(tab)||{html:'',context:null,mood:null,style:null};
  editor.innerHTML=cleanHTML(draft.html||'');
  currentContext=normalizeContext(draft.context);
  currentMood=normalizeMood(draft.mood);
  currentStyle=normalizeStyle(draft.style,lightStyleBase);
  editor.dataset.placeholder=placeholders[tab];
  $('#editor-tabs').querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',tab===b.dataset.tab));
  applyDraftMeta();
  hydrateMedia(editor).catch(()=>null);
  const n=countWords();draftInfo(editorHasContent()?(n?'已恢复草稿':'图片草稿已恢复'):'本机草稿');if(focus)editor.focus()
}
async function locateWeather(){
  if(locationBusy)return;
  locationBusy=true;updateContextButton(contextButton,null,'loading');
  contextButton.innerHTML=icon('weather')+'<span>正在定位并获取天气…</span>';
  try{
    currentContext=await requestRecordContext();
    applyDraftMeta();storeDraft();
    toast('已记录当前地点和天气');
  }catch(error){
    contextButton.innerHTML=icon('pin')+'<span>定位天气</span>';
    contextButton.dataset.state='error';
    toast(error instanceof Error?error.message:'定位天气获取失败');
  }finally{locationBusy=false}
}
async function addImages(files){
  const selected=Array.from(files||[]).filter(file=>file.type.startsWith('image/'));
  if(!selected.length)return;
  const room=12-editor.querySelectorAll('img[data-media-id]').length;
  if(room<=0){toast('一条记录最多添加 12 张图片');return}
  try{
    const added=await addImagesToEditor(editor,selected.slice(0,room),storeDraft);
    if(added)toast('已添加 '+added+' 张图片');
    if(selected.length>room)toast('已保留前 '+room+' 张，单条记录最多 12 张');
  }catch(error){toast(error instanceof Error?error.message:'图片添加失败，请检查本机存储空间')}
}
async function setCustomBackground(file){
  if(!file)return;
  try{
    const asset=await saveImageAsset(file,{kind:'background'});
    currentStyle=normalizeStyle({...currentStyle,background:'custom',backgroundAssetId:asset.id},lightStyleBase);
    applyEditorStyle();storeDraft();toast('自定义背景已应用');
  }catch(error){toast(error instanceof Error?error.message:'背景图保存失败')}
}
let composing=false;editor.oncompositionstart=()=>{composing=true};editor.oncompositionend=()=>{composing=false;smartType(editor,smart);storeDraft()};
editor.oninput=e=>{if(!e.isComposing&&!composing)smartType(editor,smart);if(!composing)storeDraft()};
editor.addEventListener('paste',event=>{
  const files=firstImageFiles(event.clipboardData);
  if(files.length){event.preventDefault();addImages(files)}
  else pastePlain(event)
});
editor.addEventListener('dragover',event=>{
  if(firstImageFiles(event.dataTransfer).length){event.preventDefault();editor.classList.add('is-dragging-image')}
});
editor.addEventListener('dragleave',()=>editor.classList.remove('is-dragging-image'));
editor.addEventListener('drop',event=>{
  event.preventDefault();editor.classList.remove('is-dragging-image');
  const files=firstImageFiles(event.dataTransfer);
  if(files.length)addImages(files)
});
$('#smart').onclick=()=>{smart=!smart;localStorage.setItem('daylog:smart',smart?'on':'off');$('#smart').setAttribute('aria-pressed',smart);toast(smart?'智能排版已开启：段首“结论：”和 **重点** 会自动加粗':'智能排版已关闭')};
document.querySelectorAll('[data-format]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{editor.focus();const cmd=b.dataset.format;
  if(cmd==='quote'){document.execCommand('formatBlock',false,getSelection().anchorNode?.parentElement?.closest('blockquote')?'div':'blockquote')}else document.execCommand(cmd,false,null);storeDraft()
}});
contextButton.onclick=locateWeather;
moodButtons.addEventListener('click',event=>{
  const button=event.target.closest('[data-entry-mood]');
  if(!button)return;
  const next=Number(button.dataset.entryMood);
  currentMood=currentMood===next?null:next;
  updateMoodPicker(moodButtons,currentMood);storeDraft();
});
document.querySelectorAll('[data-editor-font]').forEach(button=>{
  button.onclick=()=>{currentStyle=normalizeStyle({...currentStyle,font:button.dataset.editorFont},lightStyleBase);applyEditorStyle();storeDraft()}
});
document.querySelectorAll('[data-editor-bg]').forEach(button=>{
  button.onclick=()=>{currentStyle=normalizeStyle({...currentStyle,background:button.dataset.editorBg,backgroundAssetId:button.dataset.editorBg==='custom'?currentStyle.backgroundAssetId:''},lightStyleBase);applyEditorStyle();storeDraft()}
});
document.querySelectorAll('[data-style-range]').forEach(input=>{
  input.oninput=()=>{
    currentStyle=normalizeStyle({...currentStyle,[input.dataset.styleRange]:Number(input.value)},lightStyleBase);
    applyEditorStyle();storeDraft()
  }
});
$('#pick-photo').onclick=()=>$('#photo-picker').click();
$('#take-photo').onclick=()=>$('#camera-picker').click();
$('#photo-picker').onchange=async event=>{await addImages(event.target.files);event.target.value=''};
$('#camera-picker').onchange=async event=>{await addImages(event.target.files);event.target.value=''};
$('#background-picker-button').onclick=()=>$('#background-picker').click();
$('#background-picker').onchange=async event=>{await setCustomBackground(event.target.files[0]);event.target.value=''};
function save(){
  if(composing)return;if(!editorHasContent()){toast('先写下文字或添加一张图片');editor.focus();return}
  safeAction(()=>{
    create(activeTab,smart?formatHTML(editor.innerHTML):cleanHTML(editor.innerHTML),{context:currentContext,mood:currentMood,style:currentStyle});
    editor.replaceChildren();currentContext=null;currentMood=null;applyDraftMeta();storeDraft();renderRecords();
    cleanupUnreferencedMedia(entries(),storedDrafts()).catch(()=>null);
    toast('已保存到今日时间线')
  })
}
$('#save').onclick=save;$('#all-entries').onclick=()=>navigate('history');
function editRecord(r){
  openDialog('编辑记录','<label class="when">事件时间<input class="field" id="edit-when" required type="datetime-local" value="'+dateKey(r.at)+'T'+clock(r.at)+'"></label><div id="edit-text" class="edit-box" contenteditable="true" role="textbox" aria-label="编辑记录正文">'+r.html+'</div><div class="dialog-actions"><button class="secondary" id="cancel-edit">取消</button><button class="primary" id="apply-edit">保存修改</button></div>');
  const box=$('#edit-text');
  const addedMediaIds=[];
  applyDocumentStyle(box,r.style,lightStyleBase);
  hydrateMedia(box).catch(()=>null);
  async function addEditImages(files){
    const selected=firstImageFiles({files});
    if(!selected.length)return;
    const before=new Set(Array.from(box.querySelectorAll('img[data-media-id]'),image=>image.dataset.mediaId));
    try{
      await addImagesToEditor(box,selected);
      toast('已添加图片');
    }catch(error){
      toast(error instanceof Error?error.message:'图片添加失败');
    }finally{
      box.querySelectorAll('img[data-media-id]').forEach(image=>{
        if(!before.has(image.dataset.mediaId)&&!addedMediaIds.includes(image.dataset.mediaId))addedMediaIds.push(image.dataset.mediaId);
      });
    }
  }
  box.addEventListener('paste',event=>{
    const files=firstImageFiles(event.clipboardData);
    if(files.length){event.preventDefault();addEditImages(files)}else pastePlain(event)
  });
  box.addEventListener('drop',event=>{
    const files=firstImageFiles(event.dataTransfer);
    if(!files.length){event.preventDefault();return}
    event.preventDefault();addEditImages(files)
  });
  dialogCleanup=()=>deleteMediaAssets(addedMediaIds).catch(()=>null);
  $('#cancel-edit').onclick=()=>dialog.close();
  $('#apply-edit').onclick=()=>{
    if(!hasMeaningfulContent(box.innerHTML)){box.focus();return}
    const when=$('#edit-when');if(!when.reportValidity())return;
    safeAction(()=>{
      const latest=entries().find(item=>item.id===r.id);if(!latest){dialog.close();renderRecords();toast('这条记录已删除');return}
      const at=when.value===dateKey(r.at)+'T'+clock(r.at)?r.at:new Date(when.value).toISOString();
      write({...latest,at,html:smart?formatHTML(box.innerHTML):cleanHTML(box.innerHTML)});
      const refs=referencedMediaIds(entries(),storedDrafts());
      deleteMediaAssets(addedMediaIds.filter(id=>!refs.has(id))).catch(()=>null);
      dialogCleanup=null;dialog.close();renderRecords();toast('修改已保存')
    })
  }
}
function openSearch(){
  openDialog('搜索记录','<input class="field" type="search" id="global-query" placeholder="搜索内容、地点或记录类型…" aria-label="搜索全部记录"><div class="search-results" id="search-results"></div>');
  const input=$('#global-query');function list(){const value=input.value.trim().toLowerCase(),matches=records.filter(r=>searchText(r).includes(value));
    $('#search-results').innerHTML=matches.slice(0,80).map(r=>r.mode==='article'?articleLink(r,'read','<small>'+dateKey(r.at)+' · '+types[r.type]+' · 长文</small>'+esc(articleName(r)),'search-item'):'<button class="search-item" data-result="'+r.id+'"><small>'+dateKey(r.at)+' '+clock(r.at)+' · '+types[r.type]+'</small>'+esc(plain(r.html).slice(0,100)||'图片日记')+'</button>').join('')||'<p>'+(value?'没有找到匹配的记录':'写下第一条记录后，即可在这里搜索。')+'</p>'
  }input.oninput=list;list();input.focus()
}
$('#search-open').onclick=openSearch;
function validBackupDraft(item){
  if(!item||typeof item.key!=='string'||!item.value||typeof item.value.html!=='string')throw new Error('backup draft format');
  const isArticle=item.key.startsWith(articleDraftPrefix)
  const isLight=item.key.startsWith(lightDraftPrefix)
  if(!isArticle&&!isLight)throw new Error('backup draft key')
  const suffix=item.key.slice((isArticle?articleDraftPrefix:lightDraftPrefix).length)
  if(!/^[\w-]{1,80}$/.test(suffix))throw new Error('backup draft id')
  const source=item.value
  if(isArticle&&!hasArticleDraftContent(source.title,source.html))return null
  const value={html:cleanHTML(source.html)}
  if(isArticle){
    value.title=typeof source.title==='string'?source.title.slice(0,160):''
    value.type=['note','trade','reflect','quote'].includes(source.type)?source.type:'note'
    value.when=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(source.when||'')?source.when:''
    value.initialAt=Number.isFinite(new Date(source.initialAt).getTime())?new Date(source.initialAt).toISOString():new Date().toISOString()
    value.baseRevision=typeof source.baseRevision==='string'?source.baseRevision:''
    value.stamp=typeof source.stamp==='string'?source.stamp:''
  }
  const context=normalizeContext(source.context);if(context)value.context=context
  const mood=normalizeMood(source.mood);if(mood!==null)value.mood=mood
  if(source.style&&typeof source.style==='object')value.style=normalizeStyle(source.style,DEFAULT_STYLE)
  value.changed=Number.isFinite(Number(source.changed))?Number(source.changed):Date.now()
  return {key:item.key,value}
}
function openBackup(){
  openDialog('我的手记本','<p>这台设备的浏览器中保存了 '+records.length+' 条记录。导出备份会同时包含未完成草稿、照片和自定义背景，已有内容会自动跳过。</p><div class="backup-row"><button class="primary" id="export">'+icon('download')+'导出备份</button><button class="secondary" id="import">'+icon('upload')+'导入备份</button><input type="file" id="backup-file" hidden accept=".json,application/json"></div><p>访问密码只在本机校验，不会随备份上传。</p><div class="backup-row"><button class="secondary" id="change-password">修改访问密码</button><button class="secondary" id="lock-now">立即锁定</button></div><p>手机上可从浏览器菜单添加到主屏幕，随时打开记录。</p><p>当前版本 · '+appVersion+'</p><div id="backup-status" role="status"></div>');
  const backupStatus=$('#backup-status');
  $('#export').onclick=()=>safeAction(async()=>{
    backupStatus.textContent='正在整理记录和图片…';
    try{
      const current=entries();
      const drafts=storedDraftEntries();
      const {media,missingIds}=await exportMediaBundle(current,drafts.map(item=>item.value));
      const payload={app:'daylog',version:3,exportedAt:new Date().toISOString(),entries:current,drafts,media,missingMedia:missingIds};
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='日迹-'+dateKey(new Date())+'.json';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      backupStatus.textContent='已导出 '+current.length+' 条记录、'+drafts.length+' 份草稿和 '+media.length+' 张图片。'
        +(missingIds.length?' 另有 '+missingIds.length+' 张旧图片在当前浏览器中已缺失，备份会如实标记。':'');
    }catch(error){
      backupStatus.textContent='导出失败，请检查本机存储空间后重试。';
      throw error;
    }
  });
  $('#import').onclick=()=>$('#backup-file').click();
  $('#backup-file').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    const addedIds=[],addedDraftKeys=[];
    let importedMediaIds=[],missingMediaCount=0;
    try{
      backupStatus.textContent='正在检查备份…';
      const data=JSON.parse(await file.text());
      if(data.app!=='daylog'||![1,2,3].includes(data.version)||!Array.isArray(data.entries))throw new Error('backup format');
      const incoming=data.entries.map(validEntry);
      const incomingDrafts=data.version===3&&Array.isArray(data.drafts)?data.drafts.map(validBackupDraft).filter(Boolean):[];
      if(data.version===3&&!Array.isArray(data.drafts))throw new Error('backup drafts missing');
      if(data.version>=2){
        if(!Array.isArray(data.media))throw new Error('backup media missing');
        const provided=new Set(data.media.map(item=>String(item?.id||'')));
        const missing=Array.from(referencedMediaIds(incoming,incomingDrafts.map(item=>item.value))).filter(id=>!provided.has(id));
        missingMediaCount=missing.length;
        const declared=new Set(Array.isArray(data.missingMedia)?data.missingMedia.map(String):[]);
        const undeclared=missing.filter(id=>!declared.has(id));
        if(data.version===2&&missing.length)throw new Error('backup media incomplete');
        if(data.version===3&&undeclared.length)throw new Error('backup media incomplete');
        importedMediaIds=(await importMediaAssets(data.media)).addedIds;
      }
      const existing=new Set(entries().map(record=>record.id));
      for(const record of incoming){
        if(existing.has(record.id))continue;
        write(record);existing.add(record.id);addedIds.push(record.id);
      }
      for(const draft of incomingDrafts){
        if(localStorage.getItem(draft.key)!==null)continue;
        localStorage.setItem(draft.key,JSON.stringify(draft.value));addedDraftKeys.push(draft.key);
      }
      backupStatus.textContent='导入 '+addedIds.length+' 条记录、'+addedDraftKeys.length+' 份草稿，跳过 '
        +(incoming.length-addedIds.length)+' 条重复记录'+(missingMediaCount?'，其中 '+missingMediaCount+' 张图片在原备份中已标记缺失。':'。');
      renderRecords();
    }catch(error){
      for(const id of addedIds)remove(id);
      for(const key of addedDraftKeys)localStorage.removeItem(key);
      const remaining=referencedMediaIds(entries(),storedDrafts());
      await deleteMediaAssets(importedMediaIds.filter(id=>!remaining.has(id))).catch(()=>null);
      backupStatus.textContent='导入未完成，未新增记录。请检查备份是否完整、图片格式和本机存储空间。';
      renderRecords();
    }finally{event.target.value=''}
  };
  $('#change-password').onclick=()=>{dialog.close();openPasswordSettings()};
  $('#lock-now').onclick=lockNow;
}
$('#profile').onclick=openBackup;
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.view)navigate(d.view);else if(d.tab)selectTab(d.tab);else if(d.quick)recordQuick(d.quick,types[d.quick]+'一次');else if(d.mood!==undefined)recordQuick('mood',feelings[Number(d.mood)]);
  else if(d.month){month.setMonth(month.getMonth()+Number(d.month));renderCal()}else if(d.day)navigate('history',d.day);
  else if(d.statDay)navigate('history',d.statDay);else if(d.statsMonth){statsMonth.setMonth(statsMonth.getMonth()+Number(d.statsMonth));renderStats()}
  else if(d.result){const r=records.find(r=>r.id===d.result);if(r)editRecord(r)}
  else if(d.action){
    const id=b.closest('[data-id]')?.dataset.id,r=entries().find(v=>v.id===id);if(!r){renderRecords();return}
    if(d.action==='fav')safeAction(()=>{write({...r,fav:!r.fav});renderRecords();toast(r.fav?'已取消收藏':'已加入我的收藏')});
    if(d.action==='edit')editRecord(r);
    if(d.action==='delete'){openDialog('删除这条记录？','<p>'+esc(plain(r.html).slice(0,100)||'这条图片记录')+'</p><div class="dialog-actions"><button class="secondary" id="keep">保留记录</button><button class="secondary danger" id="erase">确认删除</button></div>');$('#keep').onclick=()=>dialog.close();$('#erase').onclick=()=>safeAction(()=>{remove(r.id);localStorage.removeItem(articleDraftPrefix+r.id);dialog.close();renderRecords();cleanupUnreferencedMedia(entries(),storedDrafts()).catch(()=>null);toast('记录已删除')})}
  }
});
document.addEventListener('keydown',e=>{if(e.isComposing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&document.activeElement===editor){e.preventDefault();save()}if(e.key==='Escape')setMenu(false)});
window.addEventListener('storage',e=>{if(!e.key||e.key.startsWith('daylog:entry:'))renderRecords();else if(e.key.startsWith(articleDraftPrefix))renderArticleDrafts()});
function changeDay(){if(activeDate!==dateKey(new Date())){headerDate();renderRecords()}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)changeDay()});setInterval(changeDay,30000);
paintIcons();headerDate();renderButtons();const lastTab=localStorage.getItem('daylog:tab');selectTab(tabs.some(([t])=>t===lastTab)?lastTab:'note',false);navigate('home');startMarket(openDialog,toast);
$('#mobile-profile').onclick=openBackup;
cleanupUnreferencedMedia(entries(),storedDrafts()).catch(()=>null);
if(consumeRecoveryNotice())toast('已使用找回词语进入，请在“我的手记本”中修改访问密码');
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});

