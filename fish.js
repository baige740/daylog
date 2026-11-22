import { createStaticApi } from './fish-static-api.js';

const byId = id => document.getElementById(id);
const presets = {
  deepseek:['https://api.deepseek.com/v1/chat/completions','deepseek-flash'],
  silicon:['https://api.siliconflow.cn/v1/chat/completions','deepseek-ai/DeepSeek-V3'],
  dashscope:['https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','qwen-plus'],
  zhipu:['https://open.bigmodel.cn/api/paas/v4/chat/completions','glm-4-flash'],
  ollama:['http://127.0.0.1:11434/v1/chat/completions','qwen2.5:7b'],
  openai:['https://api.openai.com/v1/chat/completions','gpt-4o-mini']
};
const staticMode =
  location.hostname === 'baige740.github.io' ||
  new URLSearchParams(location.search).has('static');
const staticApi = createStaticApi();
const stickers = ['🐟💨','🐳🌊','🐡💛','💙✨'];
const emojis = ['😀','😂','😊','😍','😎','🤔','😴','😭','👍','👏','🙏','💪','👀','🐟','🐳','✨'];
const kindLabels = {preference:'偏好',fact:'事实',goal:'目标',relationship:'关系',event:'事件'};
let mode = '';
let stateData = {};
let busy = false;
let webEnabled = true;
let deepEnabled = false;
let keyPrompted = false;
try {
  webEnabled = localStorage.getItem('fishWeb') !== '0';
  deepEnabled = localStorage.getItem('fishDeep') === '1';
} catch {}

async function api(path = '', payload) {
  if (staticMode) return staticApi(path, payload);
  let response;
  try {
    response = await fetch('/api/fish' + path, payload === undefined ? {cache:'no-store'} : {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
  } catch {
    throw Error(localServiceHint());
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error(localServiceHint());
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '请求失败，请重试。');
  return data;
}

function localServiceHint() {
  if (staticMode) return '静态页请求失败，请刷新页面后重试。';
  return ['127.0.0.1','localhost'].includes(location.hostname)
    ? '大肥鱼本地服务尚未启动，请在日记目录运行 python scripts/fish.py 后重试。'
    : '大肥鱼聊天需要在本机运行 scripts/fish.py。公开网页只展示界面，不会上传或暴露你的本地资料。';
}

function todayKey() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
}
function nowStamp() {
  const now = new Date();
  return todayKey() + 'T' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}
function clock(created) {
  const [date, time = ''] = created.split('T');
  const hour = time.slice(0,5);
  return date === todayKey() ? hour : date.slice(5) + ' ' + hour;
}
function isSticker(text) {
  return stickers.includes(text.trim());
}
function isEmojiOnly(text) {
  const clean = text.trim();
  if (!clean || clean.length > 12) return false;
  try {
    return /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s]*$/u.test(clean);
  } catch {
    return false;
  }
}
function scrollThread() {
  const thread = byId('thread');
  thread.scrollTop = thread.scrollHeight;
}

function sourcesBox(sources) {
  sources = Array.isArray(sources) ? sources : [];
  const box = document.createElement('div');
  box.className = 'sources';
  const label = document.createElement('span');
  label.className = 'sources-label';
  label.textContent = '网页来源';
  box.append(label);
  let count = 0;
  sources.forEach((source, index) => {
    let target;
    try {
      target = new URL(source.url);
      if (!['http:', 'https:'].includes(target.protocol)) return;
    } catch {
      return;
    }
    const link = document.createElement('a');
    link.className = 'source-link';
    link.href = target.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = [source.title, source.published, source.summary].filter(Boolean).join('｜').slice(0, 320);
    const cite = document.createElement('b');
    cite.textContent = '[' + (index + 1) + ']';
    const name = document.createElement('span');
    name.textContent = source.source || target.hostname.replace(/^www\./, '');
    link.append(cite, name);
    box.append(link);
    count += 1;
  });
  return count ? box : null;
}

function message(name, text, mine, created, turnId, sources = [], deep = false, elapsedMs = 0) {
  sources = Array.isArray(sources) ? sources : [];
  const row = document.createElement('article');
  row.className = 'msg ' + (mine ? 'mine' : 'bot');
  const avatar = mine ? document.createElement('span') : document.createElement('img');
  avatar.className = 'msg-avatar' + (mine ? ' me' : '');
  if (mine) {
    avatar.textContent = '我';
  } else {
    avatar.src = 'fish-avatar.webp';
    avatar.alt = '';
  }
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  const meta = document.createElement('small');
  meta.textContent = name + (created ? ' · ' + clock(created) : '');
  if (!mine && deep) {
    const badge = document.createElement('span');
    badge.className = 'think-badge';
    const seconds = elapsedMs > 0 ? ' · ' + Math.max(1, Math.round(elapsedMs / 1000)) + 's' : '';
    badge.textContent = '深度思考' + seconds;
    badge.title = '这条回答使用了深度思考模式';
    meta.append(badge);
  }
  const bubble = document.createElement('p');
  bubble.className = 'bubble';
  if (isSticker(text)) bubble.classList.add('sticker');
  else if (isEmojiOnly(text)) bubble.classList.add('emoji-only');
  bubble.textContent = text;
  wrap.append(meta, bubble);
  if (!mine && sources.length) {
    const links = sourcesBox(sources);
    if (links) wrap.append(links);
  }
  if (turnId !== undefined) {
    const collect = document.createElement('button');
    collect.className = 'collect';
    collect.textContent = '收藏这段对话';
    collect.onclick = async () => {
      collect.disabled = true;
      try {
        await api('/collect',{id:turnId});
        collect.textContent = staticMode ? '已下载 Markdown' : '已收入资料库';
        byId('status').textContent = staticMode
          ? '对话已下载为 Markdown，可在本机保存或导入资料库。'
          : '这段对话已经可以在资料里查到。';
      } catch (error) {
        byId('status').textContent = error.message;
        collect.disabled = false;
      }
    };
    wrap.append(collect);
  }
  row.append(...(mine ? [wrap, avatar] : [avatar, wrap]));
  byId('thread').append(row);
  return row;
}
function turn([id, question, answer, created, sources = [], deep = 0, elapsedMs = 0]) {
  byId('empty').hidden = true;
  message('我', question, true, created);
  message('大肥鱼', answer, false, created, id, Array.isArray(sources) ? sources : [], Boolean(deep), Number(elapsedMs) || 0);
}
function showTyping() {
  const row = document.createElement('article');
  row.className = 'msg bot typing';
  row.innerHTML = '<img class="msg-avatar" src="fish-avatar.webp" alt=""><div class="bubble-wrap"><small>大肥鱼</small><p class="bubble"><i></i><i></i><i></i></p></div>';
  byId('thread').append(row);
  scrollThread();
  return row;
}
function presenceText() {
  if (staticMode) return stateData.model ? '在线 · 浏览器直连' : '待接入模型';
  return stateData.model ? '在线' : '资料检索模式';
}
function updateMode(note) {
  const base = staticMode
    ? stateData.model
      ? '静态页 · 浏览器直连 · 记录只存本机'
      : '静态页 · 请填写 DeepSeek Key'
    : stateData.model
      ? '角色对话 · 自动保存'
      : '资料检索模式 · 接入模型后可按角色自由对话';
  mode = base + ' · ' + (deepEnabled ? '深度思考' : '快速回复') + (webEnabled ? ' · 联网搜索' : ' · 未联网');
  byId('status').textContent = note === undefined ? mode : note;
}
function setWeb(enabled, announce = false) {
  webEnabled = enabled;
  try {
    localStorage.setItem('fishWeb', enabled ? '1' : '0');
  } catch {}
  const button = byId('web');
  button.setAttribute('aria-pressed', String(enabled));
  button.title = enabled ? '联网搜索已开启，点击关闭' : '联网搜索已关闭，点击开启';
  updateMode();
  if (announce) byId('status').textContent = enabled ? '联网搜索已开启' : '联网搜索已关闭';
}
function setDeep(enabled, announce = false) {
  deepEnabled = enabled;
  try {
    localStorage.setItem('fishDeep', enabled ? '1' : '0');
  } catch {}
  const button = byId('deep');
  button.setAttribute('aria-pressed', String(enabled));
  button.title = enabled ? '深度思考已开启，点击关闭' : '深度思考已关闭，点击开启';
  updateMode();
  if (announce) byId('status').textContent = enabled ? '深度思考已开启' : '深度思考已关闭';
}

async function sendText(text) {
  const content = text.trim();
  if (!content || busy) return;
  busy = true;
  byId('send').disabled = true;
  byId('presence').textContent = '正在输入…';
  byId('status').textContent = deepEnabled && webEnabled
    ? '正在检索最新网页并深度分析…'
    : deepEnabled
      ? '正在深度思考…'
      : webEnabled
        ? '正在检索最新网页并整理…'
        : '正在思考…';
  const input = byId('question');
  input.value = '';
  input.style.height = '';
  byId('empty').hidden = true;
  const mine = message('我', content, true, nowStamp());
  const dots = showTyping();
  try {
    const [id, , answer, created, sources = [], deep = 0, elapsedMs = 0] = await api('/chat', {text:content, web:webEnabled, deep:deepEnabled});
    const sourceCount = Array.isArray(sources) ? sources.length : 0;
    dots.remove();
    message('大肥鱼', answer, false, created, id, sources, Boolean(deep), Number(elapsedMs) || 0);
    byId('presence').textContent = presenceText();
    const notes = [];
    if (sourceCount) notes.push('已联网检索 · ' + sourceCount + ' 个来源');
    if (deep) notes.push('深度思考完成');
    updateMode(notes.join(' · ') || undefined);
  } catch (error) {
    dots.remove();
    mine.remove();
    if (!input.value.trim()) input.value = content;
    byId('presence').textContent = '连接异常';
    byId('status').textContent = error.message;
  } finally {
    busy = false;
    byId('send').disabled = false;
    scrollThread();
    input.focus();
  }
}

function library(data) {
  const updated = (data.updated || '').slice(0,16).replace('T',' ');
  if (staticMode) {
    const files = Number(data.file_count) || 0;
    const passages = Number(data.passage_count ?? data.count) || 0;
    byId('library').textContent = files + ' 个文件 · ' + passages + ' 段可检索资料 · 发布 ' + updated;
    return;
  }
  byId('library').textContent = data.count + ' 份资料 · 最近同步 ' + updated;
}
function renderModel(data, note) {
  byId('model-url').value = data.model_url || '';
  byId('model-name').value = data.model_name || '';
  byId('model-key').value = '';
  byId('model-key').placeholder = data.key_saved
    ? '已保存，留空则保持不变'
    : staticMode
      ? '输入 DeepSeek API Key'
      : '本机服务可留空';
  byId('model-state').textContent = note || (data.model
    ? '已接入 ' + data.model_name
    : staticMode
      ? '填写 DeepSeek Key 后会自动验证 Key 和模型名。'
      : '尚未接入模型，当前只查资料');
}
function renderMemories(items) {
  items = Array.isArray(items) ? items : [];
  const list = byId('memory-list');
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'memory-empty';
    empty.textContent = '还没有长期记忆。可以手动添加，或点「整理最近对话」。';
    list.append(empty);
    return;
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'memory-item';
    const tag = document.createElement('span');
    tag.className = 'memory-tag';
    tag.textContent = kindLabels[item.kind] || '事实';
    const text = document.createElement('div');
    text.className = 'memory-text';
    text.textContent = item.text;
    const note = document.createElement('small');
    note.textContent = (item.source === 'auto' ? '自动整理' : '手动添加') + (item.updated ? ' · ' + clock(item.updated) : '');
    text.append(note);
    const buttons = document.createElement('div');
    buttons.className = 'memory-buttons';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = '修改';
    edit.onclick = async () => {
      const next = window.prompt('修改这条长期记忆：', item.text);
      if (next === null || !next.trim() || next.trim() === item.text) return;
      await memoryAction('/memory/update', {id:item.id, text:next.trim(), kind:item.kind}, '记忆已更新');
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除';
    remove.onclick = async () => {
      if (!window.confirm('删除这条长期记忆？')) return;
      await memoryAction('/memory/delete', {id:item.id}, '记忆已删除');
    };
    buttons.append(edit, remove);
    row.append(tag, text, buttons);
    list.append(row);
  });
}
function memoryResult(data) {
  if (Array.isArray(data.memories)) renderMemories(data.memories);
  if (data.memory_last) byId('memory-last').textContent = '上次整理 ' + clock(data.memory_last);
}
function renderMemoryPanel(data) {
  byId('memory-enabled').checked = data.memory_enabled !== false;
  byId('memory-last').textContent = data.memory_last ? '上次整理 ' + clock(data.memory_last) : '尚未整理';
  renderMemories(data.memories);
}
async function memoryAction(path, payload, success) {
  byId('memory-state').textContent = '正在保存…';
  try {
    const data = await api(path, payload);
    memoryResult(data);
    byId('memory-state').textContent = success;
  } catch (error) {
    byId('memory-state').textContent = error.message;
  }
}
async function refreshMemories() {
  try {
    const data = await api('/state', {});
    stateData = data;
    renderMemoryPanel(data);
  } catch (error) {
    byId('memory-state').textContent = error.message;
  }
}
async function loadState(renderTurns = true) {
  try {
    const data = await api('/state', {});
    stateData = data;
    updateMode();
    byId('presence').textContent = presenceText();
    byId('role').value = data.role;
    library(data);
    renderModel(data);
    renderMemoryPanel(data);
    if (renderTurns) {
      data.turns.forEach(turn);
      scrollThread();
    }
    byId('send').disabled = staticMode && !data.model;
    if (staticMode && !data.model && !keyPrompted) {
      keyPrompted = true;
      if (!byId('panel').open) byId('panel').showModal();
      refreshMemories();
    }
  } catch (error) {
    byId('status').textContent = error.message;
    byId('presence').textContent = '连接失败';
  }
}

function buildTray() {
  byId('sticker-grid').innerHTML = stickers.map(sticker =>
    '<button type="button" class="sticker-btn" data-sticker="' + sticker + '" aria-label="发送贴纸 ' + sticker + '">' + sticker + '</button>'
  ).join('');
  byId('emoji-grid').innerHTML = emojis.map(emoji =>
    '<button type="button" class="emoji-btn" data-emoji="' + emoji + '" aria-label="' + emoji + '">' + emoji + '</button>'
  ).join('');
}
function closeTray() {
  byId('tray').hidden = true;
  byId('emoji').setAttribute('aria-expanded','false');
}
function insertEmoji(emoji) {
  const input = byId('question');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(emoji, start, end, 'end');
  input.dispatchEvent(new Event('input'));
  input.focus();
}
function growInput(input) {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight,128) + 'px';
}

byId('chat').onsubmit = event => {
  event.preventDefault();
  sendText(byId('question').value);
};
byId('question').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    byId('chat').requestSubmit();
  }
};
byId('question').addEventListener('input', event => growInput(event.target));
byId('emoji').onclick = () => {
  const tray = byId('tray');
  tray.hidden = !tray.hidden;
  byId('emoji').setAttribute('aria-expanded', String(!tray.hidden));
};
byId('sticker-grid').onclick = event => {
  const button = event.target.closest('[data-sticker]');
  if (!button) return;
  closeTray();
  sendText(button.dataset.sticker);
};
byId('emoji-grid').onclick = event => {
  const button = event.target.closest('[data-emoji]');
  if (button) insertEmoji(button.dataset.emoji);
};
document.addEventListener('click', event => {
  if (event.target.closest('#tray') || event.target.closest('#emoji')) return;
  closeTray();
});

byId('web').onclick = () => setWeb(!webEnabled, true);
byId('deep').onclick = () => setDeep(!deepEnabled, true);
byId('settings').onclick = () => {
  byId('panel').showModal();
  refreshMemories();
};
byId('close').onclick = () => byId('panel').close();
byId('memory-enabled').onchange = async event => {
  const enabled = event.target.checked;
  event.target.disabled = true;
  byId('memory-state').textContent = '正在保存…';
  try {
    await api('/memory/settings', {enabled});
    byId('memory-state').textContent = enabled
      ? '自动记忆已开启：每 3 轮左右整理一次，也可以立即整理。'
      : '自动记忆已关闭，已有记忆仍会保留。';
  } catch (error) {
    event.target.checked = !enabled;
    byId('memory-state').textContent = error.message;
  } finally {
    event.target.disabled = false;
  }
};
byId('memory-extract').onclick = async () => {
  const button = byId('memory-extract');
  button.disabled = true;
  button.textContent = '整理中…';
  byId('memory-state').textContent = '正在阅读最近的对话并整理长期记忆…';
  try {
    const data = await api('/memory/extract', {});
    memoryResult(data);
    byId('memory-state').textContent = data.added
      ? '整理完成，新增 ' + data.added + ' 条长期记忆。' + (byId('memory-enabled').checked ? '' : ' 自动记忆已关闭，暂不会带入对话。')
      : '整理完成，没有发现新的长期信息。';
  } catch (error) {
    byId('memory-state').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '整理最近对话';
  }
};
byId('memory-add').onclick = async () => {
  const input = byId('memory-text');
  const text = input.value.trim();
  if (!text) {
    byId('memory-state').textContent = '先写一条要记住的内容。';
    input.focus();
    return;
  }
  const button = byId('memory-add');
  button.disabled = true;
  try {
    const data = await api('/memory/add', {text, kind:byId('memory-kind').value});
    memoryResult(data);
    input.value = '';
    byId('memory-state').textContent = byId('memory-enabled').checked
      ? '已添加，下一条消息就会带上这条记忆。'
      : '已添加，但自动记忆关闭，暂时不会带入对话。';
  } catch (error) {
    byId('memory-state').textContent = error.message;
  } finally {
    button.disabled = false;
    input.focus();
  }
};
byId('memory-text').onkeydown = event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    byId('memory-add').click();
  }
};
byId('preset').onchange = () => {
  const preset = presets[byId('preset').value];
  if (preset) {
    byId('model-url').value = preset[0];
    byId('model-name').value = preset[1];
    byId('model-key').focus();
  }
};
async function saveModel(payload, note) {
  ['save-model','disconnect'].forEach(id => byId(id).disabled = true);
  byId('model-state').textContent = staticMode ? '正在验证 Key 和模型名…' : '正在保存…';
  try {
    const data = await api('/model', payload);
    Object.assign(stateData, data, {model_url:payload.url});
    updateMode();
    byId('presence').textContent = presenceText();
    renderModel(stateData, note);
    byId('send').disabled = staticMode && !data.model;
  } catch (error) {
    byId('model-state').textContent = error.message;
  } finally {
    ['save-model','disconnect'].forEach(id => byId(id).disabled = false);
  }
}
byId('save-model').onclick = () => saveModel({
  url:byId('model-url').value.trim(), name:byId('model-name').value.trim(), key:byId('model-key').value.trim()
}, staticMode ? 'Key 已验证，模型已保存在这台设备' : '模型已保存，现在可以自由对话');
byId('disconnect').onclick = () => saveModel({url:'',name:'',key:''}, '已断开模型，恢复资料检索');
async function manage(action, success) {
  const controls = ['files','save','sync'].map(byId);
  controls.forEach(control => control.disabled = true);
  byId('feedback').textContent = '正在处理…';
  try {
    await action();
    library(await api('/state', {}));
    byId('feedback').textContent = success;
  } catch (error) {
    byId('feedback').textContent = error.message;
  } finally {
    controls.forEach(control => control.disabled = false);
  }
}
byId('save').onclick = () => manage(() => api('/role',{text:byId('role').value}), '角色已保存');
byId('sync').onclick = () => manage(() => api('/refresh',{}), '资料已同步');
byId('files').onchange = () => manage(async () => {
  for (const file of byId('files').files) {
    if (file.size > 7000000) throw Error(file.name + ' 超过 7 MB，请拆分后导入。');
    await api('/import',{name:file.name,text:await file.text()});
  }
  byId('files').value = '';
}, '导入完成，可以提问了');

buildTray();
setDeep(deepEnabled);
setWeb(webEnabled);
loadState();
