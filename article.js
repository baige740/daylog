import {paintIcons} from './icons.js';
import {types,cleanHTML,hasMeaningfulContent,parseArticleDraft,hasArticleDraftContent,formatHTML,dateKey,write,validEntry,articleName,articleDraftPrefix,storedDrafts} from './journal.js';
import {smartType,pastePlain} from './writing.js';
import {
  DEFAULT_STYLE,
  applyDocumentStyle,
  contextBadgeMarkup,
  firstImageFiles,
  moodMarkup,
  moodPickerMarkup,
  normalizeContext,
  normalizeMood,
  normalizeStyle,
  requestRecordContext,
  updateContextButton,
  updateMoodPicker,
} from './extras.js';
import {
  addImagesToEditor,
  cleanupUnreferencedMedia,
  deleteMediaAssets,
  hydrateMedia,
  referencedMediaIds,
  saveImageAsset,
} from './media.js';
import {startJournalCloud} from './journal-cloud.js';

const $=selector=>document.querySelector(selector);
const body=$('#body'),title=$('#title'),category=$('#category'),when=$('#when');
const status=$('#status'),confirmDialog=$('#confirm'),contextButton=$('#locate-weather'),moodButtons=$('#entry-moods');
const count=$('#count'),inkCue=$('#ink-cue'),page=document.body;
const allowed=new Set(['note','trade','reflect','quote']);
const moodNames=['低落','疲惫','平静','愉快','开心'];
const uid=()=>globalThis.crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);

let id='',baseRevision=null,draftStamp=null,loadedDraftSignature='',editing=false,dirty=false,composing=false,timer=0,hasSavedDraft=false,split=false;
let countTimer=0,typingTimer=0,compositionText='',compositionInkTimer=0;
let pendingPhotos=0;
let smart=localStorage.getItem('daylog:smart')!=='off',initialAt='',locationBusy=false;
let currentContext=null,currentMood=null,currentStyle=normalizeStyle(null,DEFAULT_STYLE);

function message(text,problem=false){
  status.textContent=text;
  status.classList.toggle('problem',problem);
}

function setAddress(mode){
  history.replaceState(null,'','#'+mode+'/'+id);
}

function readRecord(){
  const raw=localStorage.getItem('daylog:entry:'+id);
  if(!raw)return null;
  try{return validEntry(JSON.parse(raw))}catch{return null}
}

function readDraft(){
  const raw=localStorage.getItem(articleDraftPrefix+id);
  return parseArticleDraft(raw);
}

function draftSignature(draft){
  if(!draft)return '';
  return JSON.stringify({
    title:typeof draft.title==='string'?draft.title:'',
    html:typeof draft.html==='string'?draft.html:'',
    type:draft.type??'',
    when:draft.when??'',
    initialAt:draft.initialAt??'',
    context:draft.context??null,
    mood:draft.mood??null,
    style:draft.style??null,
    baseRevision:draft.baseRevision??null,
    stamp:draft.stamp??null,
  });
}

function ownsCurrentDraft(draft){
  if(!draft)return false;
  if(draftStamp||draft.stamp)return draft.stamp===draftStamp;
  return hasSavedDraft&&draftSignature(draft)===loadedDraftSignature;
}

function timestampInput(at){
  const date=new Date(at);
  return dateKey(date)+'T'+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}

function wordCount(){
  const words=Array.from((body.textContent||'').replace(/[\s\u200b]/g,'')).length;
  const images=body.querySelectorAll('img[data-media-id]').length;
  count.textContent=words+' 字'+(images?' · '+images+' 张图':'');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  count.classList.remove('bump');
  void count.offsetWidth;
  count.classList.add('bump');
  clearTimeout(countTimer);
  countTimer=setTimeout(()=>count.classList.remove('bump'),190);
}

function typedInk(text){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const characters=Array.from(text||'').filter(character=>!/\s/.test(character));
  if(!characters.length)return;
  const selection=getSelection();
  if(!selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(!body.contains(range.commonAncestorContainer))return;
  let rect=range.getBoundingClientRect();
  const focus=selection.focusNode;
  let characterNode=null;
  let characterOffset=0;
  if(focus?.nodeType===Node.TEXT_NODE&&selection.focusOffset>0){
    characterNode=focus;
    characterOffset=selection.focusOffset;
  }else if(focus?.nodeType===Node.ELEMENT_NODE&&focus.childNodes.length){
    characterNode=focus.childNodes[Math.max(0,Math.min(selection.focusOffset-1,focus.childNodes.length-1))];
    while(characterNode?.lastChild)characterNode=characterNode.lastChild;
  }
  if(characterNode?.nodeType===Node.TEXT_NODE&&characterNode.data.length){
    characterOffset=characterOffset||characterNode.data.length;
    const characterRange=document.createRange();
    characterRange.setStart(characterNode,Math.max(0,characterOffset-1));
    characterRange.setEnd(characterNode,characterOffset);
    rect=Array.from(characterRange.getClientRects()).at(-1)||rect;
  }
  if(!Number.isFinite(rect.left)||!Number.isFinite(rect.top)||(!rect.width&&!rect.height))return;
  let ghost=characters.slice(-2).join('');
  if(Array.from(ghost).length<2&&focus?.textContent){
    const nearby=Array.from(focus.textContent.replace(/[\s\u200b]/g,''));
    ghost=nearby.slice(-2).join('')||ghost;
  }
  inkCue.textContent=ghost;
  inkCue.style.setProperty('--ink-x',Math.max(8,Math.min(innerWidth-8,rect.right+2))+'px');
  inkCue.style.setProperty('--ink-y',(rect.top+Math.min(rect.height||24,24)/2)+'px');
  inkCue.classList.remove('playing');
  void inkCue.offsetWidth;
  inkCue.classList.add('playing');
  body.classList.add('is-typing');
  clearTimeout(typingTimer);
  typingTimer=setTimeout(()=>body.classList.remove('is-typing'),420);
}

function scheduleCompositionInk(text){
  clearTimeout(compositionInkTimer);
  compositionText=text||compositionText;
  if(!compositionText)return;
  const committed=compositionText;
  compositionInkTimer=setTimeout(()=>requestAnimationFrame(()=>{
    typedInk(committed);
    if(compositionText===committed)compositionText='';
  }),0);
}

function styleOutputValue(key,value){
  if(key==='lineHeight')return Number(value).toFixed(2);
  if(key==='letterSpacing')return Number(value).toFixed(3);
  if(key==='fontSize')return String(Math.round(Number(value)));
  return Number(value).toFixed(1);
}

function applyEditorMeta(){
  currentStyle=applyDocumentStyle(body,currentStyle,DEFAULT_STYLE);
  document.querySelectorAll('[data-editor-font]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.editorFont===currentStyle.font));
  });
  document.querySelectorAll('[data-editor-bg]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.editorBg===currentStyle.background));
  });
  document.querySelectorAll('[data-style-range]').forEach(input=>{
    const key=input.dataset.styleRange;
    input.value=currentStyle[key];
    const output=document.querySelector('[data-style-output="'+key+'"]');
    if(output)output.textContent=styleOutputValue(key,currentStyle[key]);
  });
  updateMoodPicker(moodButtons,currentMood);
  updateContextButton(contextButton,currentContext);
}

function changeMode(mode){
  editing=mode==='edit';
  page.classList.toggle('is-editing',editing);
  $('#composer').hidden=!editing;
  $('#commit').hidden=!editing;
  $('#reader').hidden=mode!=='read';
  $('#edit').hidden=mode!=='read';
  $('#missing').hidden=mode!=='missing';
  $('#mode-name').textContent=editing?'深度记录':'阅读长文';
}

function showReader(record){
  dirty=false;
  clearTimeout(timer);
  if(!record||record.mode!=='article'){
    $('#read-context').replaceChildren();
    $('#read-mood').replaceChildren();
    changeMode('missing');
    message('');
    return;
  }
  setAddress('read');
  changeMode('read');
  document.title=articleName(record)+' · 日迹';
  $('#read-title').textContent=articleName(record);
  $('#read-meta').textContent=types[record.type]+' · '+timestampInput(record.at).replace('T',' ');
  $('#read-context').innerHTML=contextBadgeMarkup(record.context);
  currentMood=normalizeMood(record.mood);
  $('#read-mood').innerHTML=Number.isInteger(currentMood)
    ?moodMarkup(currentMood)+'<span>此刻心情 · '+moodNames[currentMood]+'</span>'
    :'';
  const readBody=$('#read-body');
  readBody.innerHTML=cleanHTML(record.html);
  applyDocumentStyle(readBody,record.style,DEFAULT_STYLE);
  hydrateMedia(readBody,{preview:true}).catch(()=>null);
  message('已保存到时间线');
  scrollTo(0,0);
}

function loadEditor(record,draft,defaultType){
  const data=draft||record||{};
  setAddress('edit');
  changeMode('edit');
  clearTimeout(timer);
  dirty=false;
  baseRevision=draft?(draft.baseRevision??record?.revision??null):record?.revision??null;
  draftStamp=draft?.stamp??null;
  hasSavedDraft=Boolean(draft);
  loadedDraftSignature=draftSignature(draft);
  split=false;
  initialAt=record?.at||draft?.initialAt||new Date().toISOString();
  title.value=data.title||'';
  body.innerHTML=cleanHTML(data.html||'');
  category.value=allowed.has(data.type)?data.type:defaultType;
  when.value=draft?.when??timestampInput(initialAt);
  currentContext=normalizeContext(data.context);
  currentMood=normalizeMood(data.mood);
  currentStyle=normalizeStyle(data.style,DEFAULT_STYLE);
  $('#discard').hidden=!draft;
  document.title=(title.value||'深度记录')+' · 日迹';
  applyEditorMeta();
  hydrateMedia(body).catch(()=>null);
  message(draft?'已恢复草稿':record?'已保存到时间线':'本机草稿');
  wordCount();
  scrollTo(0,0);
}

function protectOtherEdits(){
  const current=readRecord();
  const currentDraft=readDraft();
  if((current?.revision??null)===baseRevision&&(currentDraft?.stamp??null)===draftStamp)return;
  // Preserve both texts when another window saved, deleted or revised the same article.
  id=uid();
  setAddress('draft');
  baseRevision=null;
  draftStamp=null;
  loadedDraftSignature='';
  hasSavedDraft=false;
  split=true;
}

function persistDraft(){
  clearTimeout(timer);
  if(!editing||!dirty)return true;
  try{
    const nextTitle=title.value.replace(/[\u200b-\u200d\ufeff]/g,'').trim();
    const nextHTML=cleanHTML(body.innerHTML);
    if(!hasArticleDraftContent(nextTitle,nextHTML)){
      const currentDraft=readDraft();
      if(ownsCurrentDraft(currentDraft)){
        localStorage.removeItem(articleDraftPrefix+id);
      }
      draftStamp=null;
      loadedDraftSignature='';
      hasSavedDraft=false;
      dirty=false;
      split=false;
      $('#discard').hidden=true;
      message('空白内容不会保存为草稿');
      return true;
    }
    protectOtherEdits();
    const stamp=uid();
    const draft={
      title:nextTitle,
      html:nextHTML,
      type:category.value,
      when:when.value,
      initialAt,
      context:currentContext,
      mood:currentMood,
      style:currentStyle,
      baseRevision,
      stamp,
      changed:Date.now(),
    };
    localStorage.setItem(articleDraftPrefix+id,JSON.stringify(draft));
    draftStamp=stamp;
    loadedDraftSignature=draftSignature(draft);
    hasSavedDraft=true;
    dirty=false;
    $('#discard').hidden=false;
    message(split?'另一窗口已更改，草稿已另存':'草稿已保存');
    return true;
  }catch{
    message('草稿未保存，请复制正文备份',true);
    return false;
  }
}

function modified(){
  dirty=true;
  message('正在保存草稿…');
  wordCount();
  clearTimeout(timer);
  timer=setTimeout(persistDraft,260);
}

function cleanupMedia(){
  cleanupUnreferencedMedia(entriesSafe(),storedDrafts()).catch(()=>null);
}

function discardDraftMedia(draft){
  if(!draft)return;
  const candidates=Array.from(referencedMediaIds([], [draft]));
  if(!candidates.length)return;
  const remaining=referencedMediaIds(entriesSafe(),storedDrafts());
  deleteMediaAssets(candidates.filter(id=>!remaining.has(id))).catch(()=>null);
}

function entriesSafe(){
  const records=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(!key?.startsWith('daylog:entry:'))continue;
    try{records.push(validEntry(JSON.parse(localStorage.getItem(key))))}catch{}
  }
  return records;
}

function saveArticle(){
  if(!editing)return;
  if(pendingPhotos){message('照片正在处理，请稍候',true);return}
  composing=false;
  if(!when.reportValidity())return;
  if(!hasMeaningfulContent(body.innerHTML)){
    message('先写一段正文或添加一张图片',true);
    body.focus();
    return;
  }
  clearTimeout(timer);
  try{
    protectOtherEdits();
    const latest=readRecord();
    const at=when.value===timestampInput(initialAt)?initialAt:new Date(when.value).toISOString();
    const record=write({
      id,
      type:category.value,
      at,
      mode:'article',
      title:title.value.trim(),
      html:smart?formatHTML(body.innerHTML):cleanHTML(body.innerHTML),
      fav:latest?.fav||false,
      people:latest?.people||[],
      revision:uid(),
      context:currentContext,
      mood:currentMood,
      style:currentStyle,
    });
    localStorage.removeItem(articleDraftPrefix+id);
    loadedDraftSignature='';
    hasSavedDraft=false;
    dirty=false;
    showReader(record);
    cleanupMedia();
    if(split)message('已另存为新文章');
  }catch{
    dirty=true;
    message('文章未保存，请复制正文备份',true);
  }
}

async function locateWeather(){
  if(locationBusy)return;
  locationBusy=true;
  contextButton.dataset.state='loading';
  contextButton.textContent='正在定位并获取天气…';
  try{
    currentContext=await requestRecordContext();
    applyEditorMeta();
    modified();
    message('已记录当前地点和天气');
  }catch(error){
    contextButton.dataset.state='error';
    contextButton.textContent='定位天气';
    message(error instanceof Error?error.message:'定位天气获取失败',true);
  }finally{
    locationBusy=false;
  }
}

async function addImages(files){
  const selected=Array.from(files||[]).filter(file=>file?.type?.startsWith('image/'));
  if(!selected.length)return;
  const room=12-body.querySelectorAll('img[data-media-id]').length;
  if(room<=0){
    message('一条记录最多添加 12 张图片',true);
    return;
  }
  pendingPhotos++;$('#commit').disabled=true;message('照片正在处理，请稍候');
  try{
    const added=await addImagesToEditor(body,selected.slice(0,room),modified);
    if(added)message('已添加 '+added+' 张图片');
    if(selected.length>room)message('已保留前 '+room+' 张，单条记录最多 12 张',true);
  }catch(error){
    message(error instanceof Error?error.message:'图片添加失败，请检查本机存储空间',true);
  }finally{pendingPhotos--;$('#commit').disabled=pendingPhotos>0}
}

async function setCustomBackground(file){
  if(!file)return;
  try{
    const asset=await saveImageAsset(file,{kind:'background'});
    currentStyle=normalizeStyle({...currentStyle,background:'custom',backgroundAssetId:asset.id},DEFAULT_STYLE);
    applyEditorMeta();
    modified();
    message('自定义背景已应用');
  }catch(error){
    message(error instanceof Error?error.message:'背景图保存失败',true);
  }
}

function start(){
  const [action,param,initialType]=location.hash.slice(1).split('/');
  if(!action||action==='new'){
    id=uid();
    loadEditor(null,null,allowed.has(param)?param:'note');
    history.replaceState(null,'','#draft/'+id+'/'+category.value);
    return;
  }
  if(!['edit','read','draft'].includes(action)||!/^[\w-]{1,80}$/.test(param||'')){
    showReader(null);
    return;
  }
  id=param;
  const record=readRecord();
  if(action==='read'){
    showReader(record);
    return;
  }
  let draft=readDraft();
  if(draft&&!hasArticleDraftContent(draft.title,draft.html)){
    try{localStorage.removeItem(articleDraftPrefix+id)}catch{}
    draft=null;
    cleanupMedia();
  }
  if((record&&record.mode!=='article')||(!record&&!draft)){
    // A blank composer has an address before the first keystroke creates its draft.
    if(action==='draft'&&!record&&!draft){
      loadEditor(null,null,allowed.has(initialType)?initialType:'note');
      history.replaceState(null,'','#draft/'+id+'/'+category.value);
      return;
    }
    showReader(null);
    return;
  }
  loadEditor(record,draft,'note');
}

paintIcons();
moodButtons.innerHTML=moodPickerMarkup(currentMood);
$('#smart').setAttribute('aria-pressed',smart);
$('#smart').onclick=()=>{
  smart=!smart;
  localStorage.setItem('daylog:smart',smart?'on':'off');
  $('#smart').setAttribute('aria-pressed',smart);
};

body.addEventListener('paste',event=>{
  const files=firstImageFiles(event.clipboardData);
  if(files.length){event.preventDefault();addImages(files)}else pastePlain(event);
});
body.addEventListener('dragover',event=>{
  if(firstImageFiles(event.dataTransfer).length){
    event.preventDefault();
    body.classList.add('is-dragging-image');
  }
});
body.addEventListener('dragleave',()=>body.classList.remove('is-dragging-image'));
body.addEventListener('drop',event=>{
  event.preventDefault();
  body.classList.remove('is-dragging-image');
  const files=firstImageFiles(event.dataTransfer);
  if(files.length)addImages(files);
});

document.addEventListener('compositionstart',()=>{
  composing=true;
  compositionText='';
  clearTimeout(timer);
  clearTimeout(compositionInkTimer);
},true);
document.addEventListener('compositionupdate',event=>{
  compositionText=event.data||compositionText;
},true);
document.addEventListener('compositionend',event=>{
  composing=false;
  if(title.contains(event.target)){
    modified();
    document.title=(title.value.trim()||'深度记录')+' · 日迹';
    return;
  }
  if(!body.contains(event.target))return;
  smartType(body,smart);
  modified();
  if(event.data)scheduleCompositionInk(event.data);
},true);

body.oninput=event=>{
  if(event.isComposing||composing)return;
  smartType(body,smart);
  modified();
  if(event.inputType==='insertText')typedInk(event.data);
  else if(event.inputType==='insertCompositionText')scheduleCompositionInk(event.data);
};
title.oninput=event=>{
  if(event.isComposing||composing)return;
  modified();
  document.title=(title.value.trim()||'深度记录')+' · 日迹';
};
category.onchange=modified;
when.oninput=modified;

document.querySelectorAll('[data-format]').forEach(button=>{
  button.onmousedown=event=>event.preventDefault();
  button.onclick=()=>{
    body.focus();
    const command=button.dataset.format;
    const tag=command==='heading'?'h3':command==='quote'?'blockquote':'';
    if(tag){
      document.execCommand('formatBlock',false,getSelection().anchorNode?.parentElement?.closest(tag)?'div':tag);
    }else{
      document.execCommand(command==='list'?'insertUnorderedList':command,false,null);
    }
    modified();
  };
});

contextButton.onclick=locateWeather;
moodButtons.addEventListener('click',event=>{
  const button=event.target.closest('[data-entry-mood]');
  if(!button)return;
  const next=Number(button.dataset.entryMood);
  currentMood=currentMood===next?null:next;
  updateMoodPicker(moodButtons,currentMood);
  modified();
});
document.querySelectorAll('[data-editor-font]').forEach(button=>{
  button.onclick=()=>{
    currentStyle=normalizeStyle({...currentStyle,font:button.dataset.editorFont},DEFAULT_STYLE);
    applyEditorMeta();
    modified();
  };
});
document.querySelectorAll('[data-editor-bg]').forEach(button=>{
  button.onclick=()=>{
    currentStyle=normalizeStyle({
      ...currentStyle,
      background:button.dataset.editorBg,
      backgroundAssetId:button.dataset.editorBg==='custom'?currentStyle.backgroundAssetId:'',
    },DEFAULT_STYLE);
    applyEditorMeta();
    modified();
  };
});
document.querySelectorAll('[data-style-range]').forEach(input=>{
  input.oninput=()=>{
    currentStyle=normalizeStyle({...currentStyle,[input.dataset.styleRange]:Number(input.value)},DEFAULT_STYLE);
    applyEditorMeta();
    modified();
  };
});

$('#pick-photo').onclick=()=>$('#photo-picker').click();
$('#take-photo').onclick=()=>$('#camera-picker').click();
$('#photo-picker').onchange=async event=>{
  await addImages(event.target.files);
  event.target.value='';
};
$('#camera-picker').onchange=async event=>{
  await addImages(event.target.files);
  event.target.value='';
};
$('#background-picker-button').onclick=()=>$('#background-picker').click();
$('#background-picker').onchange=async event=>{
  await setCustomBackground(event.target.files[0]);
  event.target.value='';
};

$('#commit').onclick=saveArticle;
$('#edit').onclick=()=>{
  const record=readRecord();
  if(record)loadEditor(record,readDraft(),'note');
  else showReader(null);
};
$('#discard').onclick=()=>confirmDialog.showModal();
$('#keep').onclick=()=>confirmDialog.close();
$('#drop').onclick=()=>{
  clearTimeout(timer);
  dirty=false;
  const draft=readDraft();
  if(hasSavedDraft&&draft?.stamp===draftStamp)localStorage.removeItem(articleDraftPrefix+id);
  confirmDialog.close();
  discardDraftMedia(draft);
  cleanupMedia();
  const record=readRecord();
  if(record)showReader(record);
  else location.replace('./');
};

document.addEventListener('keydown',event=>{
  if(editing&&(event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!event.isComposing){
    event.preventDefault();
    saveArticle();
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)persistDraft();
});
window.addEventListener('pagehide',persistDraft);
window.addEventListener('beforeunload',event=>{
  if(!persistDraft()){
    event.preventDefault();
    event.returnValue='';
  }
});
window.addEventListener('hashchange',()=>{
  if(persistDraft())start();
});
window.addEventListener('storage',event=>{
  if(!editing&&event.key==='daylog:entry:'+id)showReader(readRecord());
});

start();
cleanupMedia();
startJournalCloud();
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});
