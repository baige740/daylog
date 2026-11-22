import {normalizeContext,normalizeMood,normalizeStyle,DEFAULT_STYLE} from './extras.js';

export const types={note:'随手记',trade:'炒股心得',reflect:'反思',quote:'名人名言',poop:'排便',pee:'排尿',water:'喝水',walk:'运动',mood:'心情'};
const prefix='daylog:entry:';
export const lightDraftPrefix='daylog:draft:';
export const articleDraftPrefix='daylog:article-draft:';
export const articleName=r=>r.title?.trim()||plain(r.html).slice(0,32)||(r.html?.includes('data-media-id=')?'图片日记':'未命名长文');
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cleanHTML(html){
  const source=document.createElement('template');source.innerHTML=String(html);
  const output=document.createElement('div');
  const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','MARK','UL','OL','LI','BLOCKQUOTE','H3','FIGURE','FIGCAPTION']);
  function copy(parent,child){
    if(child.nodeType===3){parent.append(document.createTextNode(child.data.replace(/\u200b/g,'')));return}
    if(child.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','TEMPLATE'].includes(child.tagName))return;
    if(child.tagName==='IMG'){
      const id=child.getAttribute('data-media-id')||'';
      if(!/^media_[a-zA-Z0-9-]{1,80}$/.test(id))return;
      const image=document.createElement('img');
      image.setAttribute('data-media-id',id);
      image.setAttribute('alt',(child.getAttribute('alt')||'日记照片').slice(0,80));
      parent.append(image);
      return;
    }
    let dest=parent;
    if(child.tagName==='SPAN'){
      const decoration=child.getAttribute('style')||'';
      const tag=/text-decoration[^;]*line-through/i.test(decoration)?'S'
        :/text-decoration[^;]*underline/i.test(decoration)?'U'
        :/background-color/i.test(decoration)?'MARK':null;
      if(tag){dest=document.createElement(tag);parent.append(dest)}
    }else if(child.tagName==='STRIKE'||child.tagName==='DEL'){
      dest=document.createElement('S');parent.append(dest)
    }else if(allowed.has(child.tagName)){
      dest=document.createElement(child.tagName);parent.append(dest)
    }
    for(const sub of child.childNodes)copy(dest,sub)
  }
  for(const node of source.content.childNodes)copy(output,node);
  return output.innerHTML
}
export function plain(html){
  const tmp=document.createElement('div');tmp.innerHTML=cleanHTML(html).replace(/<br>|<\/(?:div|p|li|blockquote|h3)>/gi,'$&\n');return tmp.textContent.trim()
}
export function hasMeaningfulContent(html){
  const cleaned=cleanHTML(html);
  if(plain(cleaned))return true;
  const tmp=document.createElement('div');tmp.innerHTML=cleaned;
  return Boolean(tmp.querySelector('img[data-media-id]'));
}
export function parseArticleDraft(raw){
  if(typeof raw!=='string'||!raw.trim())return null;
  let value=raw;
  for(let depth=0;depth<2&&typeof value==='string';depth+=1){
    const source=value.trim();
    if(!source)return null;
    try{
      value=JSON.parse(source);
    }catch{
      value=source;
      break;
    }
  }
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    return {
      ...value,
      title:typeof value.title==='string'?value.title:'',
      html:typeof value.html==='string'?value.html:'',
    };
  }
  return value===null||value===undefined?null:{html:String(value)};
}
export function hasArticleDraftContent(title,html){
  const visibleTitle=String(title||'').replace(/[\u200b-\u200d\ufeff]/g,'').trim();
  return Boolean(visibleTitle)||hasMeaningfulContent(html||'');
}
export function formatHTML(html){
  const tmp=document.createElement('div');tmp.innerHTML=cleanHTML(html);
  const walker=document.createTreeWalker(tmp,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    if(node.parentElement.closest('b,strong'))continue;
    const first=!node.previousSibling;
    const pattern=/\*\*([^*\n]+)\*\*|^(结论|原因|计划|反思|复盘|心得|观察|教训|明日计划|买入理由|卖出理由|风险|心情|收获|记录|事件)([：:])/g;
    const s=node.data,frag=document.createDocumentFragment();let last=0,matched=false;
    for(const m of s.matchAll(pattern)){
      if(m[2]&&!first)continue;
      frag.append(s.slice(last,m.index));const strong=document.createElement('strong');strong.textContent=m[1]||m[2]+m[3];frag.append(strong);last=m.index+m[0].length;matched=true
    }
    if(matched){frag.append(s.slice(last));node.replaceWith(frag)}
  }
  return tmp.innerHTML
}
export function dateKey(value){
  const date=value instanceof Date?value:new Date(value);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
export function validEntry(data){
  if(!data||typeof data.id!=='string'||!/^[\w-]{1,80}$/.test(data.id)||!Object.hasOwn(types,data.type)||!Number.isFinite(new Date(data.at).getTime())||typeof data.html!=='string')throw new Error('备份中的记录格式无效');
  const html=cleanHTML(data.html);if(!hasMeaningfulContent(html))throw new Error('备份中含有空记录');
  const record={id:data.id,type:data.type,at:new Date(data.at).toISOString(),html,fav:data.fav===true};
  if(data.mode==='article')Object.assign(record,{mode:'article',title:typeof data.title==='string'?data.title:'',revision:typeof data.revision==='string'?data.revision:''});
  const context=normalizeContext(data.context);if(context)record.context=context;
  const mood=normalizeMood(data.mood);if(mood!==null)record.mood=mood;
  const style=normalizeStyle(data.style,DEFAULT_STYLE);if(data.style&&typeof data.style==='object')record.style=style;
  if(data.schemaVersion===2)record.schemaVersion=2;
  return record
}
export function entries(){
  const result=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix)){try{result.push(validEntry(JSON.parse(localStorage.getItem(k))))}catch{}}}
  return result.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id))
}
export function write(data){const r=validEntry(data);localStorage.setItem(prefix+r.id,JSON.stringify(r));return r}
export function remove(id){localStorage.removeItem(prefix+id)}
export function create(type,html,extra={}){
  const base={id:globalThis.crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),type,html,at:new Date().toISOString(),fav:false};
  return write({...extra,...base,schemaVersion:2})
}

export function storedDraftEntries(){
  const drafts=[];
  for(let index=0;index<localStorage.length;index+=1){
    const key=localStorage.key(index);
    if(!key?.startsWith(lightDraftPrefix)&&!key?.startsWith(articleDraftPrefix))continue;
    const isArticleDraft=key.startsWith(articleDraftPrefix);
    const raw=localStorage.getItem(key);
    if(!raw)continue;
    if(isArticleDraft){
      const value=parseArticleDraft(raw);
      if(value&&hasArticleDraftContent(value.title,value.html))drafts.push({key,value});
      continue;
    }
    try{
      const value=JSON.parse(raw);
      if(value&&typeof value==='object'&&typeof value.html==='string')drafts.push({key,value});
    }catch{
      if(raw.trim())drafts.push({key,value:{html:raw}});
    }
  }
  return drafts;
}

export function storedDrafts(){
  return storedDraftEntries().map(draft=>draft.value);
}

