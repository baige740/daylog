import {paintIcons} from './icons.js';
import {types,cleanHTML,plain,formatHTML,dateKey,write,validEntry,articleName,articleDraftPrefix} from './journal.js';
import {smartType,pastePlain} from './writing.js';
const $=s=>document.querySelector(s);
const body=$('#body'),title=$('#title'),category=$('#category'),when=$('#when');
const status=$('#status'),confirmDialog=$('#confirm');
const count=$('#count'),inkCue=$('#ink-cue'),page=document.body;
const allowed=new Set(['note','trade','reflect','quote']);
const uid=()=>globalThis.crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
let id='',baseRevision=null,draftStamp=null,editing=false,dirty=false,composing=false,timer=0,hasSavedDraft=false,split=false;
let countTimer=0,typingTimer=0,compositionText='',compositionInkTimer=0;
let smart=localStorage.getItem('daylog:smart')!=='off',initialAt='';
function message(text,problem=false){status.textContent=text;status.classList.toggle('problem',problem)}
function setAddress(mode){history.replaceState(null,'','#'+mode+'/'+id)}
function readRecord(){
  const raw=localStorage.getItem('daylog:entry:'+id);
  if(!raw)return null;
  try{return validEntry(JSON.parse(raw))}catch{return null}
}
function readDraft(){
  const raw=localStorage.getItem(articleDraftPrefix+id);
  if(!raw)return null;
  try{
    const draft=JSON.parse(raw);
    return draft&&typeof draft==='object'&&typeof draft.html==='string'?draft:null
  }catch{return null}
}
function timestampInput(at){const d=new Date(at);return dateKey(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function wordCount(){
  const n=Array.from((body.textContent||'').replace(/[\s\u200b]/g,'')).length;
  count.textContent=n+' 字';
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  count.classList.remove('bump');void count.offsetWidth;count.classList.add('bump');
  clearTimeout(countTimer);countTimer=setTimeout(()=>count.classList.remove('bump'),190)
}
function typedInk(text){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const characters=Array.from(text||'').filter(char=>!/\s/.test(char));
  if(!characters.length)return;
  const selection=getSelection();
  if(!selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(!body.contains(range.commonAncestorContainer))return;
  let rect=range.getBoundingClientRect();
  const focus=selection.focusNode;
  let characterNode=null,characterOffset=0;
  if(focus?.nodeType===Node.TEXT_NODE&&selection.focusOffset>0){
    characterNode=focus;characterOffset=selection.focusOffset;
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
    ghost=nearby.slice(-2).join('')||ghost
  }
  inkCue.textContent=ghost;
  inkCue.style.setProperty('--ink-x',Math.max(8,Math.min(innerWidth-8,rect.right+2))+'px');
  inkCue.style.setProperty('--ink-y',(rect.top+Math.min(rect.height||24,24)/2)+'px');
  inkCue.classList.remove('playing');void inkCue.offsetWidth;inkCue.classList.add('playing');
  body.classList.add('is-typing');clearTimeout(typingTimer);
  typingTimer=setTimeout(()=>body.classList.remove('is-typing'),420)
}
function scheduleCompositionInk(text){
  clearTimeout(compositionInkTimer);
  compositionText=text||compositionText;
  if(!compositionText)return;
  const committed=compositionText;
  compositionInkTimer=setTimeout(()=>requestAnimationFrame(()=>{
    typedInk(committed);
    if(compositionText===committed)compositionText='';
  }),0)
}
function changeMode(mode){
  editing=mode==='edit';
  page.classList.toggle('is-editing',editing);
  $('#composer').hidden=!editing;$('#commit').hidden=!editing;$('#reader').hidden=mode!=='read';$('#edit').hidden=mode!=='read';$('#missing').hidden=mode!=='missing';
  $('#mode-name').textContent=editing?'深度记录':'阅读长文'
}
function showReader(r){
  dirty=false;clearTimeout(timer);
  if(!r||r.mode!=='article'){changeMode('missing');message('');return}
  setAddress('read');changeMode('read');document.title=articleName(r)+' · 日迹';
  $('#read-title').textContent=articleName(r);$('#read-meta').textContent=types[r.type]+' · '+timestampInput(r.at).replace('T',' ');
  $('#read-body').innerHTML=r.html;message('已保存到时间线');scrollTo(0,0)
}
function loadEditor(r,d,defaultType){
  const data=d||r||{};setAddress('edit');changeMode('edit');clearTimeout(timer);dirty=false;
  baseRevision=d?d.baseRevision:r?.revision??null;draftStamp=d?.stamp??null;hasSavedDraft=Boolean(d);split=false;
  initialAt=r?.at||d?.initialAt||new Date().toISOString();
  title.value=data.title||'';body.innerHTML=cleanHTML(data.html||'');category.value=allowed.has(data.type)?data.type:defaultType;
  when.value=d?.when??timestampInput(initialAt);$('#discard').hidden=!d;
  document.title=(title.value||'深度记录')+' · 日迹';message(d?'已恢复草稿':r?'已保存到时间线':'本机草稿');wordCount();scrollTo(0,0)
}
function protectOtherEdits(){
  const current=readRecord(),currentDraft=readDraft();
  if((current?.revision??null)===baseRevision&&(currentDraft?.stamp??null)===draftStamp)return;
  // Preserve both texts when another window saved, deleted or revised the same article.
  id=uid();setAddress('draft');baseRevision=null;draftStamp=null;hasSavedDraft=false;split=true
}
function persistDraft(){
  clearTimeout(timer);if(!editing||!dirty)return true;
  try{
    protectOtherEdits();const stamp=uid();
    const d={title:title.value,html:cleanHTML(body.innerHTML),type:category.value,when:when.value,initialAt,baseRevision,stamp,changed:Date.now()};
    localStorage.setItem(articleDraftPrefix+id,JSON.stringify(d));
    draftStamp=stamp;hasSavedDraft=true;dirty=false;$('#discard').hidden=false;
    message(split?'另一窗口已更改，草稿已另存':'草稿已保存');return true
  }catch{message('草稿未保存，请复制正文备份',true);return false}
}
function modified(){
  dirty=true;message('正在保存草稿…');wordCount();clearTimeout(timer);timer=setTimeout(persistDraft,260)
}
function saveArticle(){
  if(!editing||composing)return;
  if(!when.reportValidity())return;
  if(!plain(body.innerHTML)){message('先写一段正文',true);body.focus();return}
  clearTimeout(timer);
  try{
    protectOtherEdits();const latest=readRecord();const at=when.value===timestampInput(initialAt)?initialAt:new Date(when.value).toISOString();
    const r=write({id,type:category.value,at,mode:'article',title:title.value.trim(),html:smart?formatHTML(body.innerHTML):cleanHTML(body.innerHTML),fav:latest?.fav||false,revision:uid()});
    localStorage.removeItem(articleDraftPrefix+id);hasSavedDraft=false;showReader(r);if(split)message('已另存为新文章')
  }catch{dirty=true;message('文章未保存，请复制正文备份',true)}
}
function start(){
  const [action,param,initialType]=location.hash.slice(1).split('/');
  if(!action||action==='new'){
    id=uid();loadEditor(null,null,allowed.has(param)?param:'note');history.replaceState(null,'','#draft/'+id+'/'+category.value);return
  }
  if(!['edit','read','draft'].includes(action)||!/^[\w-]{1,80}$/.test(param||'')){showReader(null);return}
  id=param;const r=readRecord();
  if(action==='read'){showReader(r);return}
  const draft=readDraft();if((r&&r.mode!=='article')||(!r&&!draft)){
    // A blank composer has an address before the first keystroke creates its draft.
    if(action==='draft'&&!r&&!draft){loadEditor(null,null,allowed.has(initialType)?initialType:'note');history.replaceState(null,'','#draft/'+id+'/'+category.value);return}
    showReader(null);return
  }
  loadEditor(r,draft,'note')
}
paintIcons();$('#smart').setAttribute('aria-pressed',smart);
$('#smart').onclick=()=>{smart=!smart;localStorage.setItem('daylog:smart',smart?'on':'off');$('#smart').setAttribute('aria-pressed',smart)};
body.addEventListener('paste',pastePlain);body.addEventListener('drop',e=>e.preventDefault());
document.addEventListener('compositionstart',()=>{composing=true;compositionText='';clearTimeout(compositionInkTimer)},true);
document.addEventListener('compositionupdate',e=>{compositionText=e.data||compositionText},true);
document.addEventListener('compositionend',e=>{
  composing=false;
  if(!body.contains(e.target))return;
  smartType(body,smart);modified();
  if(e.data)scheduleCompositionInk(e.data)
},true);
body.oninput=e=>{
  if(e.isComposing||composing)return;
  smartType(body,smart);modified();
  if(e.inputType==='insertText')typedInk(e.data);
  else if(e.inputType==='insertCompositionText')scheduleCompositionInk(e.data)
};
title.oninput=modified;category.onchange=modified;when.oninput=modified;
document.querySelectorAll('[data-format]').forEach(b=>{
  b.onmousedown=e=>e.preventDefault();b.onclick=()=>{
    body.focus();const cmd=b.dataset.format;const tag=cmd==='heading'?'h3':cmd==='quote'?'blockquote':'';
    if(tag){document.execCommand('formatBlock',false,getSelection().anchorNode?.parentElement?.closest(tag)?'div':tag)}
    else document.execCommand(cmd==='list'?'insertUnorderedList':cmd,false,null);
    modified()
  }
});
$('#commit').onclick=saveArticle;
$('#edit').onclick=()=>{const r=readRecord();if(r)loadEditor(r,readDraft(),'note');else showReader(null)};
$('#discard').onclick=()=>confirmDialog.showModal();$('#keep').onclick=()=>confirmDialog.close();
$('#drop').onclick=()=>{
  clearTimeout(timer);dirty=false;
  if(hasSavedDraft&&readDraft()?.stamp===draftStamp)localStorage.removeItem(articleDraftPrefix+id);
  confirmDialog.close();const r=readRecord();if(r)showReader(r);else location.replace('./')
};
document.addEventListener('keydown',e=>{if(editing&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();saveArticle()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft()});
window.addEventListener('pagehide',persistDraft);
window.addEventListener('hashchange',()=>{if(persistDraft())start()});
window.addEventListener('storage',e=>{if(!editing&&e.key==='daylog:entry:'+id)showReader(readRecord())});
start();
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});

