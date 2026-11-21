export const types={note:'随手记',trade:'炒股心得',reflect:'反思',quote:'名人名言',poop:'排便',pee:'排尿',water:'喝水',walk:'运动',mood:'心情'};
const prefix='daylog:entry:';
export const articleDraftPrefix='daylog:article-draft:';
export const articleName=r=>r.title?.trim()||plain(r.html).slice(0,32)||'未命名长文';
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cleanHTML(html){
  const source=document.createElement('template');source.innerHTML=String(html);
  const output=document.createElement('div');
  function copy(parent,child){
    if(child.nodeType===3){parent.append(document.createTextNode(child.data.replace(/\u200b/g,'')));return}
    if(child.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','TEMPLATE'].includes(child.tagName))return;
    let dest=parent;
    if(['DIV','P','BR','B','STRONG','I','EM','UL','OL','LI','BLOCKQUOTE','H3'].includes(child.tagName)){dest=document.createElement(child.tagName);parent.append(dest)}
    for(const sub of child.childNodes)copy(dest,sub)
  }
  for(const node of source.content.childNodes)copy(output,node);
  return output.innerHTML
}
export function plain(html){
  const tmp=document.createElement('div');tmp.innerHTML=cleanHTML(html).replace(/<br>|<\/(?:div|p|li|blockquote|h3)>/gi,'$&\n');return tmp.textContent.trim()
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
  const html=cleanHTML(data.html);if(!plain(html))throw new Error('备份中含有空记录');
  const record={id:data.id,type:data.type,at:new Date(data.at).toISOString(),html,fav:data.fav===true};
  if(data.mode==='article')Object.assign(record,{mode:'article',title:typeof data.title==='string'?data.title:'',revision:typeof data.revision==='string'?data.revision:''});
  return record
}
export function entries(){
  const result=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix)){try{result.push(validEntry(JSON.parse(localStorage.getItem(k))))}catch{}}}
  return result.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id))
}
export function write(data){const r=validEntry(data);localStorage.setItem(prefix+r.id,JSON.stringify(r));return r}
export function remove(id){localStorage.removeItem(prefix+id)}
export function create(type,html){return write({id:globalThis.crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),type,html,at:new Date().toISOString(),fav:false})}

