import {appVersion} from './version.js';
import {entries,plain,dateKey} from './journal.js';
import { createStaticApi } from './fish-static-api.js?v=20261126a';

const byId = id => document.getElementById(id);
const versionLabel = byId('app-version');
if (versionLabel) versionLabel.textContent = appVersion;
function localSavedRole() {
  try {
    const direct = JSON.parse(localStorage.getItem('daylog:fish:role:v1') || '""');
    if (typeof direct === 'string' && direct.trim()) return direct;
    const settings = JSON.parse(localStorage.getItem('daylog:fish:settings:v1') || '{}');
    return typeof settings?.role === 'string' ? settings.role : '';
  } catch {
    return '';
  }
}
let roleDirty = false;
const roleInput = byId('role');
const initialRole = localSavedRole();
if (initialRole) roleInput.value = initialRole;
roleInput.addEventListener('input', () => { roleDirty = true; });
function showFallbackRole(role) {
  if (roleDirty || localSavedRole() || typeof role !== 'string' || !role.trim()) return;
  roleInput.value = role;
}
const viewport = window.visualViewport;
let fitFrame = 0;
let fitTimers = [];
let pinThreadOnFocus = false;
function applyVisibleViewport() {
  fitFrame = 0;
  const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
  const top = Math.max(0, Math.round(viewport?.offsetTop || 0));
  if (height > 0) document.documentElement.style.setProperty('--chat-visible-height', height + 'px');
  document.documentElement.style.setProperty('--chat-visible-top', top + 'px');
  const keyboardOpen = Boolean(viewport) && window.innerHeight - viewport.height > 120;
  document.body.classList.toggle('chat-keyboard', keyboardOpen);
  if (keyboardOpen && pinThreadOnFocus) {
    pinThreadOnFocus = false;
    scrollThread();
  }
}
function fitChat() {
  if (!fitFrame) fitFrame = requestAnimationFrame(applyVisibleViewport);
}
function scheduleFitChat() {
  fitChat();
  fitTimers.forEach(timer => clearTimeout(timer));
  fitTimers = [80, 180, 320, 520].map(delay => setTimeout(fitChat, delay));
}
if (viewport) {
  // iOS and Android report keyboard changes differently. Follow both viewports.
  viewport.addEventListener('resize', scheduleFitChat, {passive:true});
  viewport.addEventListener('scroll', scheduleFitChat, {passive:true});
}
window.addEventListener('resize', scheduleFitChat, {passive:true});
window.addEventListener('orientationchange', scheduleFitChat);
window.addEventListener('pageshow', scheduleFitChat);
document.addEventListener('focusin', event => {
  if (event.target !== byId('question')) return;
  const thread = byId('thread');
  pinThreadOnFocus = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
  scheduleFitChat();
});
document.addEventListener('focusout', scheduleFitChat);
scheduleFitChat();

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
let lastRenderedDate = '';
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
function createdDateKey(created) {
  const match = String(created || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[1] + '-' + match[2] + '-' + match[3] : todayKey();
}
function dateLabel(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  if (!match) return '日期未知';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return key;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const difference = Math.round((today.getTime() - date.getTime()) / 86400000);
  const weekday = '日一二三四五六'[date.getDay()];
  const dayText = year === now.getFullYear() ? month + '月' + day + '日' : year + '年' + month + '月' + day + '日';
  const prefix = difference === 0 ? '今天 · ' : difference === 1 ? '昨天 · ' : '';
  return prefix + dayText + ' 周' + weekday;
}
function shortDateLabel(key) {
  return dateLabel(key).replace(/\s+周[日一二三四五六]$/, '');
}
function isSticker(text) {
  return stickers.includes(String(text || '').trim());
}
function splitStickerMessage(text) {
  const value = String(text || '').trim();
  if (isSticker(value)) return {body:'', sticker:value};
  const lines = value.split(/\r?\n/);
  const last = (lines[lines.length - 1] || '').trim();
  if (stickers.includes(last)) {
    return {body:lines.slice(0, -1).join('\n').trim(), sticker:last};
  }
  return {body:value, sticker:''};
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
function ensureDateDivider(created) {
  const key = createdDateKey(created);
  if (key === lastRenderedDate) return;
  lastRenderedDate = key;
  const divider = document.createElement('div');
  divider.className = 'day-divider';
  divider.setAttribute('role','separator');
  const label = document.createElement('span');
  label.textContent = dateLabel(key);
  divider.append(label);
  byId('thread').append(divider);
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
  ensureDateDivider(created || nowStamp());
  const reply = splitStickerMessage(text);
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
  wrap.append(meta);
  if (reply.body || !reply.sticker) {
    const bubble = document.createElement('p');
    bubble.className = 'bubble';
    if (isEmojiOnly(reply.body)) bubble.classList.add('emoji-only');
    bubble.textContent = reply.body;
    wrap.append(bubble);
  }
  if (reply.sticker) {
    const bubble = document.createElement('p');
    bubble.className = 'bubble sticker' + (reply.body ? ' extra-sticker' : '');
    bubble.textContent = reply.sticker;
    wrap.append(bubble);
  }
  if (!mine && sources.length) {
    const links = sourcesBox(sources);
    if (links) wrap.append(links);
  }
  if (turnId !== undefined) {
    const collect = document.createElement('button');
    collect.className = 'collect';
    const savedId = 'daylog:entry:fish-chat-' + turnId;
    const alreadySaved = staticMode && Boolean(localStorage.getItem(savedId));
    collect.textContent = alreadySaved ? '已在速记' : '收藏到速记';
    collect.title = alreadySaved ? '这段问答已经存入速记' : '把问题和回答一起存入今天的随手记';
    collect.disabled = alreadySaved;
    collect.onclick = async () => {
      collect.disabled = true;
      try {
        const data = await api('/collect',{id:turnId});
        if (staticMode) {
          const created = !data || data.created !== false;
          collect.textContent = created ? '已存入速记' : '已在速记';
          byId('status').textContent = created
            ? '问题和回答已一起存入今天的随手记，可在首页时间线查看。'
            : '这段对话已经在速记里，没有重复添加。';
        } else {
          collect.textContent = '已收入资料库';
          byId('status').textContent = '这段对话已经可以在资料里查到。';
        }
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
function renderTurns(turns) {
  const thread = byId('thread');
  thread.querySelectorAll('.msg, .day-divider').forEach(node => node.remove());
  lastRenderedDate = '';
  const rows = Array.isArray(turns) ? turns.filter(Array.isArray) : [];
  byId('empty').hidden = rows.length > 0;
  rows.forEach(turn);
  scrollThread();
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
  }
}

function library(data) {
  const updated = (data.updated || '').slice(0,16).replace('T',' ');
  if (staticMode) {
    if (data.library_loading) {
      byId('library').textContent = '资料正在后台加载，聊天记录和角色已经恢复。';
      return;
    }
    if (data.library_unavailable) {
      byId('library').textContent = '资料暂未加载，仍可聊天。点「重新加载资料」可重试。';
      return;
    }
    const files = Number(data.file_count) || 0;
    const passages = Number(data.passage_count ?? data.count) || 0;
    byId('library').textContent = files + ' 个文件 · ' + passages + ' 段可检索资料 · 发布 ' + updated;
    return;
  }
  byId('library').textContent = data.count + ' 份资料 · 最近同步 ' + updated;
}
async function refreshLibraryStatus(force = false) {
  if (!staticMode) return;
  const button = byId('sync');
  if (force) {
    button.disabled = true;
    button.textContent = '正在加载…';
    byId('feedback').textContent = '正在重新下载资料，聊天记录和角色不会受影响…';
    byId('library').textContent = '资料正在后台加载，聊天记录和角色已经恢复。';
  }
  try {
    const data = await api('/library', force ? {refresh:true} : {});
    Object.assign(stateData, data);
    library(data);
    showFallbackRole(data.role);
    if (force) byId('feedback').textContent = '资料已重新加载，可以继续检索。';
  } catch (error) {
    byId('library').textContent = '资料暂未加载，仍可聊天。点「重新加载资料」可重试。';
    if (force) byId('feedback').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '重新加载资料';
  }
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
    const source = item.source === 'auto' ? '模型整理' : item.source === 'local' ? '本地整理' : '手动添加';
    note.textContent = source + (item.updated ? ' · ' + clock(item.updated) : '');
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
async function loadState(showTurns = true) {
  try {
    const data = await api('/state', {});
    stateData = data;
    updateMode();
    byId('presence').textContent = presenceText();
    showFallbackRole(data.role);
    library(data);
    renderModel(data);
    renderMemoryPanel(data);
    if (showTurns) renderTurns(data.turns);
    if (staticMode) refreshLibraryStatus();
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

let historyGroups = [];
let selectedHistoryDate = '';
function analyzeHistory(turns) {
  const grouped = new Map();
  (Array.isArray(turns) ? turns : []).filter(Array.isArray).forEach(item => {
    const key = createdDateKey(item[3]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  return [...grouped.entries()].sort((left, right) => right[0].localeCompare(left[0]));
}
function historyMessage(parent, name, text, kind) {
  const row = document.createElement('div');
  row.className = 'history-message ' + kind;
  const who = document.createElement('b');
  who.textContent = name;
  const reply = splitStickerMessage(text);
  if (reply.body) {
    const body = document.createElement('p');
    body.textContent = reply.body;
    row.append(who, body);
  } else {
    row.append(who);
  }
  if (reply.sticker) {
    const sticker = document.createElement('span');
    sticker.className = 'history-sticker';
    sticker.textContent = reply.sticker;
    row.append(sticker);
  }
  parent.append(row);
}
function renderHistoryDates() {
  const nav = byId('history-dates');
  nav.replaceChildren();
  historyGroups.forEach(([key, turns], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-date';
    button.dataset.date = key;
    button.setAttribute('aria-pressed', String(key === selectedHistoryDate));
    const label = document.createElement('span');
    label.textContent = shortDateLabel(key);
    const count = document.createElement('small');
    count.textContent = turns.length + ' 轮' + (index === 0 ? ' · 最近' : '');
    button.append(label, count);
    nav.append(button);
  });
}
function renderHistoryDay(key) {
  const section = byId('history-turns');
  const turns = historyGroups.find(item => item[0] === key)?.[1] || [];
  section.replaceChildren();
  if (!turns.length) return;
  turns.forEach(([id, question, answer, created], index) => {
    const card = document.createElement('article');
    card.className = 'history-turn';
    const head = document.createElement('header');
    const time = document.createElement('time');
    time.textContent = String(created || '').split('T')[1]?.slice(0,5) || '--:--';
    const sequence = document.createElement('span');
    sequence.textContent = '第 ' + (index + 1) + ' 轮 · #' + id;
    head.append(time, sequence);
    historyMessage(card, '我', question, 'mine');
    historyMessage(card, '大肥鱼', answer, 'bot');
    card.prepend(head);
    section.append(card);
  });
}
function setHistorySelection(key) {
  selectedHistoryDate = key;
  renderHistoryDates();
  renderHistoryDay(key);
  const count = historyGroups.find(item => item[0] === key)?.[1].length || 0;
  byId('history-state').textContent = dateLabel(key) + ' · ' + count + ' 轮 · 只保存在这台设备';
}
function useHistoryTurns(turns, note = '') {
  historyGroups = analyzeHistory(turns);
  byId('history-turns').replaceChildren();
  if (!historyGroups.length) {
    selectedHistoryDate = '';
    renderHistoryDates();
    byId('history-state').textContent = '还没有聊天记录。开始聊天后，这里会按日期整理。';
    return;
  }
  if (!historyGroups.some(item => item[0] === selectedHistoryDate)) {
    selectedHistoryDate = historyGroups[0][0];
  }
  renderHistoryDates();
  renderHistoryDay(selectedHistoryDate);
  const count = historyGroups.find(item => item[0] === selectedHistoryDate)?.[1].length || 0;
  byId('history-state').textContent = note || (dateLabel(selectedHistoryDate) + ' · ' + count + ' 轮 · 只保存在这台设备');
}
async function openHistory() {
  const dialog = byId('history-panel');
  if (!dialog.open) dialog.showModal();
  const button = byId('history');
  button.disabled = true;
  byId('history-state').textContent = '正在读取聊天历史…';
  try {
    const data = await api('/history', {});
    useHistoryTurns(data.turns);
  } catch (error) {
    if (Array.isArray(stateData.turns) && stateData.turns.length) {
      useHistoryTurns(stateData.turns, '完整历史暂时读取失败，先显示最近的记录。');
    } else {
      byId('history-state').textContent = error.message;
    }
  } finally {
    button.disabled = false;
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
  input.focus({preventScroll:true});
}
function growInput(input) {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight,128) + 'px';
}

// Keep the keyboard and hit area stable even while the native button is disabled.
const sendTarget = byId('send').closest('.send-target') || byId('send');
let touchOrigin;
let lastSendTap = -Infinity;
sendTarget.addEventListener('touchstart', event => {
  touchOrigin = event.touches.length === 1 ? event.touches[0] : null;
}, {passive:true});
sendTarget.addEventListener('touchcancel', () => { touchOrigin = null; });
sendTarget.addEventListener('touchend', event => {
  const start = touchOrigin;
  touchOrigin = null;
  if (!start || event.touches.length) return;
  event.preventDefault();
  const end = event.changedTouches[0];
  if (end.identifier !== start.identifier || Math.hypot(end.clientX-start.clientX,end.clientY-start.clientY) > 12) return;
  const now = performance.now();
  if (now - lastSendTap > 400 && !byId('send').disabled) byId('chat').requestSubmit(byId('send'));
  lastSendTap = now;
}, {passive:false});

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
byId('history').onclick = openHistory;
byId('history-close').onclick = () => byId('history-panel').close();
byId('history-dates').onclick = event => {
  const button = event.target.closest('[data-date]');
  if (button) setHistorySelection(button.dataset.date);
};
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
    const scanned = Number(data.scanned) || 0;
    if (data.model_error) {
      byId('memory-state').textContent = '模型整理失败，已用本地规则新增 ' + data.added + ' 条。原因：' + data.model_error;
    } else if (data.added) {
      byId('memory-state').textContent = '已检查最近 ' + scanned + ' 轮对话，新增 ' + data.added + ' 条长期记忆。'
        + (byId('memory-enabled').checked ? '' : ' 自动记忆已关闭，暂不会带入对话。');
    } else if (data.reason === 'no_turns') {
      byId('memory-state').textContent = '还没有聊天记录，先和大肥鱼聊几句再来整理。';
    } else if (data.reason === 'no_stable_info') {
      byId('memory-state').textContent = '已检查最近 ' + scanned + ' 轮对话，但没有找到适合长期保存的信息。'
        + '行情、新闻和一次性问题不会写入；可以手动添加。';
    } else {
      byId('memory-state').textContent = '已检查最近 ' + scanned + ' 轮对话，没有新增；这些信息已经存在。';
    }
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
byId('save').onclick = () => manage(async () => {
  const result = await api('/role',{text:byId('role').value});
  roleDirty = false;
  return result;
}, '角色已保存');
byId('sync').onclick = () => staticMode
  ? refreshLibraryStatus(true)
  : manage(() => api('/refresh',{}), '资料已同步');
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
if (staticMode) {
  byId('sync').hidden = false;
  byId('sync').disabled = false;
  byId('sync').textContent = '重新加载资料';
}
loadState();

const journalPanel=byId('journal-panel');
byId('journal-find').onclick=()=>{journalPanel.showModal();byId('journal-search').focus()};
byId('journal-close').onclick=()=>journalPanel.close();
byId('journal-search-form').onsubmit=e=>{
  e.preventDefault();const q=byId('journal-search').value.trim().toLocaleLowerCase(),box=byId('journal-results');box.replaceChildren();
  if(!q){box.textContent='请输入关键词';return}
  const found=entries().filter(r=>(String(r.title||'')+' '+plain(r.html)).toLocaleLowerCase().includes(q)).slice(0,30);
  if(!found.length){box.textContent='没有找到匹配的日记';return}
  found.forEach(r=>{const button=document.createElement('button');button.type='button';button.className='journal-result';const date=document.createElement('b');date.textContent=dateKey(r.at);const snippet=document.createElement('span');snippet.textContent=(r.title?r.title+'：':'')+plain(r.html).slice(0,300);button.append(date,snippet);button.onclick=()=>{const input=byId('question'),excerpt='日记（'+dateKey(r.at)+'）：'+(r.title?r.title+'：':'')+plain(r.html).slice(0,1500);input.value=(input.value.trim()?input.value.trim()+'\n\n':'')+excerpt+'\n请结合这条日记回答：';input.dispatchEvent(new Event('input',{bubbles:true}));journalPanel.close();input.focus()};box.append(button)});
};
