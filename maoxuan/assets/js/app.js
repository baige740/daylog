/* ===================== 毛泽东选集 · 学习版  app.js ===================== */
(function(){
  "use strict";
  const DATA = window.MAOXUAN_DATA;
  const ART_MAP = {};
  DATA.articles.forEach(a => ART_MAP[a.id] = a);

  const STORE_KEY = "mx_study_v1";
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ---------- 状态 ---------- */
  const defaultState = {
    notes: {}, bookmarks: {}, read: {}, highlights: {}, userGuides: {}, activity: {}, reviewed: {},
    settings: { theme:"paper", font:18, lh:1.95, measure:720 }
  };
  let state = loadState();
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if(!raw) return clone(defaultState);
      const s = JSON.parse(raw);
      return Object.assign(clone(defaultState), s,
        { settings: Object.assign({}, defaultState.settings, s.settings||{}) });
    }catch(e){ return clone(defaultState); }
  }
  function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  /* ---------- 工具 ---------- */
  function stripTags(html){ return html.replace(/<[^>]+>/g," "); }
  function plain(a){ return stripTags(a.html); }
  function esc(s){ return s.replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
  function lvBadge(id){
    const g = (window.MAOXUAN_GUIDES||{})[id];
    const lv = g && g.level;
    return lv ? `<span class="ai-lv" title="难度 ${lv}/5"><span class="lv lv-${lv}">★${lv}</span></span>`
              : `<span class="ai-lv"></span>`;
  }
  function toast(msg){
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.add("hidden"), 1800);
  }
  let currentId = null;

  /* ============ 侧边栏：目录 ============ */
  function buildTOC(){
    const root = $("#panel-toc"); root.innerHTML = "";
    DATA.volumes.forEach(vol=>{
      const volEl = document.createElement("div");
      volEl.className = "vol";
      const readInVol = vol.articles.filter(id=>state.read[id]).length;
      volEl.innerHTML = `<div class="vol-head"><span class="tw">▼</span>
        <span>${esc(vol.name)}</span><span class="vc">${readInVol}/${vol.articles.length}</span></div>
        <div class="vol-list"></div>`;
      const list = volEl.querySelector(".vol-list");
      vol.articles.forEach(id=>{
        const a = ART_MAP[id];
        const item = document.createElement("div");
        item.className = "art-item"; item.dataset.id = id;
        item.innerHTML = `<span class="ai-num">${a.num}</span>
          <span class="ai-title" title="${esc(a.title)}">${esc(a.title)}</span>
          ${lvBadge(id)}
          <span class="ai-flag"></span>`;
        item.addEventListener("click", ()=>openArticle(id));
        list.appendChild(item);
      });
      volEl.querySelector(".vol-head").addEventListener("click", ()=>volEl.classList.toggle("collapsed"));
      root.appendChild(volEl);
    });
    refreshTOCFlags();
  }
  function refreshTOCFlags(){
    $$("#panel-toc .art-item").forEach(it=>{
      const id = it.dataset.id;
      const flags = it.querySelector(".ai-flag");
      let s = "";
      if(state.read[id]) s += '<span class="ai-read" title="已读">✓</span>';
      if(state.bookmarks[id]) s += '<span class="ai-bm" title="书签">★</span>';
      flags.innerHTML = s;
      it.classList.toggle("active", id===currentId);
    });
    $$("#panel-toc .vol").forEach(volEl=>{
      const ids = Array.from(volEl.querySelectorAll(".art-item")).map(i=>i.dataset.id);
      const total = ids.length, rd = ids.filter(id=>state.read[id]).length;
      volEl.querySelector(".vc").textContent = `${rd}/${total}`;
    });
  }

  /* ============ 书签 / 笔记 面板 ============ */
  function renderBookmarks(){
    const p = $("#panel-bm"); p.innerHTML = "";
    const ids = Object.keys(state.bookmarks).filter(id=>state.bookmarks[id]);
    if(!ids.length){ p.innerHTML = `<div class="empty-hint">还没有书签。<br>打开文章后点 ☆ 即可收藏。</div>`; return; }
    ids.forEach(id=>{
      const a = ART_MAP[id]; if(!a) return;
      const el = document.createElement("div"); el.className="bm-item";
      el.innerHTML = `<div class="bi-title">${esc(a.title)}</div>
        <div class="bi-meta">${a.num} · ${esc(a.volName.split("（")[0])} · ${a.date||"未标明时间"}</div>`;
      el.addEventListener("click", ()=>openArticle(id));
      p.appendChild(el);
    });
    $("#bmCount").textContent = ids.length;
  }
  function renderNotes(){
    const p = $("#panel-notes"); p.innerHTML = "";
    let items = [];
    // 文章笔记
    Object.keys(state.notes).forEach(id=>{
      const t = (state.notes[id]||"").trim(); if(t) items.push({type:"note", id, text:t, ts:0});
    });
    // 划词高亮
    Object.keys(state.highlights).forEach(id=>{
      (state.highlights[id]||[]).forEach(h=> items.push({type:"hl", id, h}));
    });
    if(!items.length){ p.innerHTML = `<div class="empty-hint">还没有笔记。<br>用「✎ 笔记」写本篇心得，或划选正文做高亮批注。</div>`;
      $("#noteCount").textContent = 0; return; }
    items.sort((a,b)=> (b.h?b.h.ts:0)-(a.h?a.h.ts:0));
    items.forEach(it=>{
      const a = ART_MAP[it.id]; if(!a) return;
      const el = document.createElement("div"); el.className="note-item";
      if(it.type==="note"){
        el.innerHTML = `<span class="ni-del" data-del="${it.id}">✕</span>
          <div class="bi-title">${esc(a.title)}<span class="ni-kind">笔记</span></div>
          <div class="ni-text">${esc(it.text)}</div>`;
        el.addEventListener("click", e=>{ if(e.target.dataset.del) return delNote(it.id); openArticle(it.id, {note:true}); });
      }else{
        const h = it.h;
        el.innerHTML = `<span class="ni-del" data-del="${h.hid}">✕</span>
          <div class="bi-title">${esc(a.title)}<span class="ni-kind">批注</span></div>
          <div class="ni-quote">“${esc(h.text)}”</div>
          ${h.note?`<div class="ni-text">${esc(h.note)}</div>`:""}`;
        el.addEventListener("click", e=>{ if(e.target.dataset.del) return delHighlight(it.id, h.hid); openArticle(it.id, {hlId:h.hid}); });
      }
      p.appendChild(el);
    });
    $("#noteCount").textContent = items.length;
  }
  function delNote(id){
    delete state.notes[id]; save(); renderNotes();
    if(currentId===id) updateHeadButtons(); toast("已删除笔记");
  }
  function delHighlight(id, hid){
    state.highlights[id] = (state.highlights[id]||[]).filter(h=>h.hid!==hid);
    if(!state.highlights[id].length) delete state.highlights[id];
    save(); renderNotes();
    if(currentId===id) unwrapMarks($("#articleBody"), hid);
    window.__daylogBookBridge && window.__daylogBookBridge.onDeleteHighlight(id, hid);
    toast("已删除批注");
  }

  /* ============ 渲染文章 ============ */
  function openArticle(id, opts={}){
    const a = ART_MAP[id]; if(!a) return;
    stopTTS();
    currentId = id;
    $("#readerEmpty").classList.add("hidden");
    $("#article").style.display = "";
    $("#articleHead .ah-actions").style.display = "";
    $("#outline").classList.add("hidden");
    $("#volBadge").textContent = a.volName.split("（")[0];
    $("#artDate").textContent = a.date ? "写作时间：" + a.date : "写作时间：未标明";
    const _minsHead = Math.max(1, Math.round(a.words/350));
    $("#artWords").textContent = "约 " + a.words + " 字 · 约 " + _minsHead + " 分钟";
    $("#artTitle").textContent = a.title;
    const body = $("#articleBody");
    body.innerHTML = a.html;
    applyHighlights(id);
    buildOutline();
    renderGuide(id);
    updateHeadButtons();
    refreshTOCFlags();
    $("#reader").scrollTop = 0;
    updateProgress();
    recordActivity();
    // 搜索跳转
    if(opts.query){ markSearchHits(opts.query); }
    if(opts.hlId){
      const m = body.querySelector(`mark.hl[data-hl-id="${CSS.escape(opts.hlId)}"]`);
      if(m){ m.scrollIntoView({block:"center"}); flash(m); }
    }
    if(opts.note){ openNoteModal(id); }
    if(window.innerWidth <= 820) document.body.classList.remove("sidebar-open");
    closeSearch();
  }

  function updateHeadButtons(){
    const id = currentId; if(!id || !ART_MAP[id]) return;
    const rb = $("#btnRead"); rb.classList.toggle("on", !!state.read[id]);
    rb.textContent = state.read[id] ? "✓ 已读" : "○ 已读";
    const bm = $("#btnBm"); bm.classList.toggle("on", !!state.bookmarks[id]);
    bm.textContent = state.bookmarks[id] ? "★ 已收藏" : "☆ 书签";
    const nt = $("#btnNote"); nt.classList.toggle("on", !!(state.notes[id]||"").trim() || (state.highlights[id]||[]).length);
  }

  /* ============ 导读 ============ */
  function renderGuide(id){
    const box = $("#guideBox");
    const G = window.MAOXUAN_GUIDES || {};
    const built = G[id];
    const user = (state.userGuides||{})[id];
    if(!built && !user){ box.classList.add("hidden"); box.classList.remove("empty"); box.innerHTML=""; return; }
    let html = `<div class="gb-head"><span class="gb-badge">导读</span><span class="gb-title">${esc(ART_MAP[id].title)}</span></div>`;
    const _lv = built && built.level;
    const _mins = ART_MAP[id] && ART_MAP[id].words ? Math.max(1, Math.round(ART_MAP[id].words/350)) : null;
    if(_lv || _mins) html += `<div class="gb-meta">${_lv?`<span class="gb-stars" title="难度 ${_lv}/5">${'★'.repeat(_lv)}${'☆'.repeat(5-_lv)}</span>`:''}${_mins?`<span class="gb-mins">约 ${_mins} 分钟</span>`:''}</div>`;
    if(built){
      if(built.bg) html += `<div class="gb-sec"><h5>写作背景</h5><p>${esc(built.bg)}</p></div>`;
      if(built.points && built.points.length) html += `<div class="gb-sec"><h5>核心观点</h5><ul>${built.points.map(p=>`<li>${esc(p)}</li>`).join("")}</ul></div>`;
      if(built.status) html += `<div class="gb-sec"><h5>历史地位</h5><p>${esc(built.status)}</p></div>`;
    }
    if(user){
      html += `<div class="gb-sec"><h5>我的补充</h5>`;
      if(user.bg) html += `<p>${esc(user.bg)}</p>`;
      if(user.points && user.points.length) html += `<ul>${user.points.map(p=>`<li>${esc(p)}</li>`).join("")}</ul>`;
      if(user.status) html += `<p>${esc(user.status)}</p>`;
      html += `</div>`;
    }
    html += `<span class="gb-edit" id="gbEdit">✎ ${built?"补充 / 修改导读":"写导读"}</span>`;
    box.innerHTML = html; box.classList.remove("hidden","empty");
    box.querySelector("#gbEdit").addEventListener("click", ()=>openGuideEditor(id));
  }
  function openGuideEditor(id){
    const cur = (state.userGuides||{})[id] || {bg:"",points:[],status:""};
    openModal("导读 · " + ART_MAP[id].title,
      `<p style="font-size:13px;color:var(--text-faint);margin:0 0 10px">为这篇补充你自己的导读（与系统导读合并显示）。</p>
       <textarea id="gbBg" placeholder="写作背景…" style="min-height:64px">${esc(cur.bg||"")}</textarea>
       <textarea id="gbPts" placeholder="核心观点，每行一条…" style="min-height:88px;margin-top:8px">${esc((cur.points||[]).join("\n"))}</textarea>
       <textarea id="gbSt" placeholder="历史地位…" style="min-height:48px;margin-top:8px">${esc(cur.status||"")}</textarea>
       <div class="modal-foot"><button class="btn" id="gbCancel">取消</button><button class="btn primary" id="gbSave">保存</button></div>`);
    $("#gbSave").addEventListener("click", ()=>{
      const g = { bg:$("#gbBg").value.trim(),
        points:$("#gbPts").value.split("\n").map(s=>s.trim()).filter(Boolean),
        status:$("#gbSt").value.trim() };
      if(!g.bg && !g.points.length && !g.status) delete state.userGuides[id];
      else state.userGuides[id] = g;
      save(); renderGuide(id); closeModal(); toast("导读已保存");
    });
    $("#gbCancel").addEventListener("click", closeModal);
  }

  /* ============ 主题标签视图 ============ */
  function buildThemeTab(){
    const root = $("#panel-theme"); root.innerHTML="";
    const TAGS = window.MAOXUAN_TAGS || {};
    const ORDER = window.MAOXUAN_THEME_ORDER || [];
    ORDER.forEach(theme=>{
      const ids = DATA.articles.filter(a=>(TAGS[a.id]||[]).includes(theme)).map(a=>a.id);
      const g = document.createElement("div"); g.className="theme-group";
      g.innerHTML = `<div class="tg-head"><span class="tw">▼</span><span class="tg-dot"></span>
        <span>${esc(theme)}</span><span class="tc">${ids.length}</span></div><div class="tg-list"></div>`;
      const list = g.querySelector(".tg-list");
      ids.sort((x,y)=>+x-+y).forEach(id=>{
        const a = ART_MAP[id];
        const it = document.createElement("div"); it.className="art-item"; it.dataset.id=id;
        it.innerHTML = `<span class="ai-num">${a.num}</span><span class="ai-title" title="${esc(a.title)}">${esc(a.title)}</span>${lvBadge(id)}<span class="ai-flag"></span>`;
        it.addEventListener("click", ()=>openArticle(id));
        list.appendChild(it);
      });
      g.querySelector(".tg-head").addEventListener("click", ()=>g.classList.toggle("collapsed"));
      root.appendChild(g);
    });
  }

  /* ============ 时间线视图 ============ */
  function renderTimeTab(){
    const root = $("#panel-time"); root.innerHTML="";
    let summary = `<div class="time-summary">`;
    DATA.volumes.forEach(v=>{ summary += `<span class="ts-chip">${esc(v.name.split("（")[0])} <b>${v.articles.length}</b></span>`; });
    summary += `</div>`;
    root.innerHTML = summary + `<div class="timeline" id="tlInner"></div>`;
    const tl = root.querySelector("#tlInner");
    const EVENTS = window.MAOXUAN_EVENTS || [];
    const byYear = {};
    DATA.articles.forEach(a=>{ const y=a.year||0; (byYear[y]=byYear[y]||[]).push(a); });
    EVENTS.forEach(e=>{ const y=e.y||0; (byYear[y]=byYear[y]||[]); });
    Object.keys(byYear).map(Number).sort((x,y)=>x-y).forEach(y=>{
      const yEl = document.createElement("div"); yEl.className="tl-year"; yEl.textContent = y ? (y+" 年") : "年代未详";
      tl.appendChild(yEl);
      EVENTS.filter(e=>e.y===y).sort((a,b)=>a.m-b.m).forEach(e=>{
        const ev = document.createElement("div"); ev.className="tl-event";
        ev.innerHTML = `<div class="te-t">${e.m?"·"+e.m+"月 ":""}${esc(e.t)}</div><div class="te-d">${esc(e.d)}</div>`;
        tl.appendChild(ev);
      });
      byYear[y].sort((a,b)=>a.id.localeCompare(b.id)).forEach(a=>{
        const it = document.createElement("div"); it.className="tl-item"+(state.read[a.id]?" read":"");
        it.innerHTML = `<span class="tl-num">${a.num}</span>${esc(a.title)}`;
        it.addEventListener("click", ()=>openArticle(a.id));
        tl.appendChild(it);
      });
    });
  }

  /* ============ 总览 / 关于毛选 ============ */
  function showOverview(){
    stopTTS();
    currentId = "__overview__";
    $("#readerEmpty").classList.add("hidden");
    $("#article").style.display = "";
    $("#articleHead .ah-actions").style.display = "none";
    $("#guideBox").classList.add("hidden");
    $("#outline").classList.add("hidden");
    $("#volBadge").textContent = "总览";
    $("#artDate").textContent = "";
    $("#artWords").textContent = "";
    $("#artTitle").textContent = "关于《毛泽东选集》";
    const paths = (window.MAOXUAN_PATHS||[]).map(p=>{
      const arts = p.ids.map(id=>ART_MAP[id]).filter(Boolean)
        .map(a=>`<span class="pc-art" data-id="${a.id}">${a.num} ${esc(a.title)}</span>`).join("");
      return `<div class="path-card"><div class="pc-name">${esc(p.name)}</div>
        <div class="pc-desc">${esc(p.desc)}</div><div class="pc-arts">${arts}</div></div>`;
    }).join("");
    $("#articleBody").innerHTML = (window.MAOXUAN_OVERVIEW||"") +
      `<div class="ov-actions">
         <button class="btn primary" id="ovDaily">📅 今日一篇</button>
         <button class="btn" id="ovRandom">🎲 随机一篇</button>
       </div>` + renderStats() +
      `<div class="sec-title">专题阅读路线</div>` + paths +
      `<div class="sec-title">随机复习抽卡</div>` + reviewBoxHTML();
    $("#ovDaily").addEventListener("click", ()=>openDaily());
    $("#ovRandom").addEventListener("click", ()=>openRandom());
    $$("#articleBody .pc-art").forEach(el=> el.addEventListener("click", ()=>openArticle(el.dataset.id)));
    $("#revDraw").addEventListener("click", drawReview);
    $("#revTheme").addEventListener("change", drawReview);
    $("#revLevel").addEventListener("change", drawReview);
    drawReview();
    $("#reader").scrollTop = 0;
    updateProgress();
    closeSearch();
  }
  function reviewBoxHTML(){
    const themes = window.MAOXUAN_THEME_ORDER || [];
    const opts = `<option value="all">全部主题</option>` + themes.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
    const lvOpts = `<option value="all">全部难度</option>
      <option value="deep">只抽 ★4–★5 深文</option>
      <option value="classic">仅 ★5 经典</option>
      <option value="easy">只抽 ★1–★2 通俗</option>`;
    return `<div class="rev-box">
      <div class="rev-ctrl"><span class="rev-label">主题</span>
        <select id="revTheme" class="rev-sel">${opts}</select>
        <span class="rev-label">难度</span>
        <select id="revLevel" class="rev-sel">${lvOpts}</select>
        <button class="btn primary" id="revDraw">🎲 抽一篇</button>
      </div>
      <div id="revCard"></div>
    </div>`;
  }
  function drawReview(){
    const theme = $("#revTheme").value;
    const lvl = $("#revLevel").value;
    let ids = Object.keys(ART_MAP).filter(id=>{
      if(theme!=="all"){
        const t = (window.MAOXUAN_TAGS||{})[id] || [];
        if(!t.includes(theme)) return false;
      }
      const lv = ((window.MAOXUAN_GUIDES||{})[id]||{}).level;
      if(lvl==="deep") return lv>=4;
      if(lvl==="classic") return lv===5;
      if(lvl==="easy") return lv>=1 && lv<=2;
      return true;
    });
    if(!ids.length) ids = Object.keys(ART_MAP);
    const id = ids[Math.floor(Math.random()*ids.length)];
    renderReviewCard(id);
  }
  function renderReviewCard(id){
    const a = ART_MAP[id]; const g = (window.MAOXUAN_GUIDES||{})[id]||{};
    const lv = g.level;
    const mins = a.words ? Math.max(1, Math.round(a.words/350)) : null;
    const done = !!state.reviewed[id];
    const pts = (g.points||[]).slice(0,3).map(p=>`<li>${esc(p)}</li>`).join("");
    $("#revCard").innerHTML = `<div class="rev-card ${done?'done':''}">
      <div class="rev-top"><span class="rev-num">${a.num}</span>
        <span class="rev-title">${esc(a.title)}</span>
        ${lv?`<span class="rev-stars">${'★'.repeat(lv)}${'☆'.repeat(5-lv)}</span>`:''}
        ${mins?`<span class="rev-mins">约${mins}分</span>`:''}</div>
      ${g.bg?`<div class="rev-bg">${esc(g.bg)}</div>`:''}
      ${pts?`<ul class="rev-pts">${pts}</ul>`:''}
      <div class="rev-foot">
        <button class="btn sm" id="revAgain">换一篇</button>
        <button class="btn sm ${done?'on':''}" id="revDone">${done?'✓ 已复习':'标记已复习'}</button>
        <button class="btn sm primary" id="revRead">去阅读</button>
      </div></div>`;
    $("#revAgain").onclick = drawReview;
    $("#revDone").onclick = ()=>{ state.reviewed[id]=true; save(); renderReviewCard(id); toast("已标记复习"); };
    $("#revRead").onclick = ()=>openArticle(id);
  }
  function renderStats(){
    const readN = Object.keys(state.read).length;
    const noteN = Object.keys(state.notes).filter(k=>(state.notes[k]||"").trim()).length
                + Object.keys(state.highlights).reduce((s,k)=>s+(state.highlights[k]||[]).length,0);
    const bmN = Object.keys(state.bookmarks).filter(k=>state.bookmarks[k]).length;
    const revN = Object.keys(state.reviewed||{}).length;
    const streak = computeStreak();
    return `<div class="stats">
      <div class="stat-card"><div class="sc-num">${readN}</div><div class="sc-lab">已读 / ${DATA.total}</div></div>
      <div class="stat-card"><div class="sc-num">${streak}</div><div class="sc-lab">连续学习(天)</div></div>
      <div class="stat-card"><div class="sc-num">${noteN}</div><div class="sc-lab">笔记 / 批注</div></div>
      <div class="stat-card"><div class="sc-num">${revN}</div><div class="sc-lab">已复习 / ${DATA.total}</div></div>
      <div class="stat-card"><div class="sc-num">${bmN}</div><div class="sc-lab">书签</div></div>
    </div>`;
  }

  /* ============ 朗读 TTS ============ */
  let ttsUtter = null;
  function startTTS(){
    if(!('speechSynthesis' in window)){ toast("当前浏览器不支持朗读"); return; }
    const a = ART_MAP[currentId]; if(!a) return;
    const text = $("#articleBody").innerText.replace(/\s+/g," ").trim();
    if(!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN"; u.rate = 0.95;
    u.onend = ()=>stopTTS(); u.onerror = ()=>stopTTS();
    ttsUtter = u; window.speechSynthesis.speak(u);
    const btn = $("#btnTTS"); btn.classList.add("on-tts"); btn.textContent = "🔊 停止";
  }
  function stopTTS(){
    if('speechSynthesis' in window) window.speechSynthesis.cancel();
    ttsUtter = null;
    const btn = $("#btnTTS"); if(btn){ btn.classList.remove("on-tts"); btn.textContent = "🔊 朗读"; }
  }

  /* ============ 每日一篇 / 随机一篇 ============ */
  function dayKey(d){ return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }
  function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))|0; return Math.abs(h); }
  function openDaily(){
    const a = DATA.articles[hashStr(dayKey(new Date())) % DATA.articles.length];
    openArticle(a.id); toast("今日一篇：" + a.title);
  }
  function openRandom(){
    const unread = DATA.articles.filter(a=>!state.read[a.id]);
    const pool = unread.length ? unread : DATA.articles;
    const a = pool[Math.floor(Math.random()*pool.length)];
    openArticle(a.id); toast("随机一篇：" + a.title);
  }

  /* ============ 阅读活动 / 打卡 ============ */
  function recordActivity(){
    if(!state.activity) state.activity = {};
    const k = dayKey(new Date());
    if(!state.activity[k]){ state.activity[k] = true; save(); }
  }
  function computeStreak(){
    const act = state.activity || {};
    let streak = 0; const d = new Date();
    while(act[dayKey(d)]){ streak++; d.setDate(d.getDate()-1); }
    return streak;
  }

  /* ============ 大纲 ============ */
  function buildOutline(){
    const body = $("#articleBody");
    const heads = Array.from(body.querySelectorAll("h4,h5"));
    const ob = $("#outlineBody"); ob.innerHTML = "";
    if(!heads.length){ $("#btnOutline").style.display="none"; $("#outline").classList.add("hidden"); return; }
    $("#btnOutline").style.display = "";
    heads.forEach((h,i)=>{
      h.id = "sec-"+i;
      const el = document.createElement("div");
      el.className = "ol-item" + (h.tagName==="H5"?" lv5":"");
      el.textContent = h.textContent;
      el.addEventListener("click", ()=>{ h.scrollIntoView({block:"start"}); });
      el.dataset.sec = "sec-"+i;
      ob.appendChild(el);
    });
  }
  function syncOutline(){
    const heads = $$("#articleBody h4,#articleBody h5");
    if(!heads.length) return;
    const y = $("#reader").scrollTop;
    let cur = heads[0].id;
    heads.forEach(h=>{ if(h.offsetTop - 80 <= y) cur = h.id; });
    $$("#outlineBody .ol-item").forEach(el=>el.classList.toggle("active", el.dataset.sec===cur));
  }

  /* ============ 高亮 ============ */
  function applyHighlights(id){
    const list = state.highlights[id]||[];
    list.forEach(h=>wrapOccurrences($("#articleBody"), h.text, {id:h.hid, note:!!h.note}));
  }
  function wrapOccurrences(root, str, opts){
    if(!str || !str.trim()) return;
    const re = new RegExp(escapeReg(str), "g");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        if(!n.nodeValue || !n.nodeValue.includes(str)) return NodeFilter.FILTER_REJECT;
        if(n.parentElement && n.parentElement.closest("mark.hl")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = []; let tn;
    while((tn=walker.nextNode())) targets.push(tn);
    targets.forEach(node=>{
      const text = node.nodeValue; const frag = document.createDocumentFragment();
      let last = 0, m; re.lastIndex = 0;
      while((m=re.exec(text))){
        const idx = m.index;
        if(idx>last) frag.appendChild(document.createTextNode(text.slice(last,idx)));
        const mk = document.createElement("mark");
        mk.className = "hl" + (opts&&opts.note?" has-note":"");
        if(opts&&opts.id) mk.dataset.hlId = opts.id;
        mk.textContent = text.slice(idx, idx+str.length);
        frag.appendChild(mk);
        last = idx + str.length;
      }
      if(last<text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  function unwrapMarks(root, hid){
    root.querySelectorAll(`mark.hl[data-hl-id="${CSS.escape(hid)}"]`).forEach(m=>{
      m.replaceWith(document.createTextNode(m.textContent));
    });
    root.normalize();
  }
  function flash(el){ el.classList.add("sel"); setTimeout(()=>el.classList.remove("sel"), 900); }

  /* ============ 搜索 ============ */
  let searchTimer = null;
  function doSearch(q){
    q = q.trim();
    const box = $("#searchResults");
    if(!q){ box.classList.add("hidden"); return; }
    const lower = q.toLowerCase();
    const results = [];
    DATA.articles.forEach(a=>{
      const title = a.title;
      const tl = title.toLowerCase();
      let score = 0, hitIdx = -1, snippet = "";
      if(tl.includes(lower)){ score += 100; hitIdx = tl.indexOf(lower); }
      const txt = plain(a);
      const ti = txt.toLowerCase().indexOf(lower);
      if(ti>=0){
        score += 10;
        if(hitIdx<0) hitIdx = ti;
        const s = Math.max(0, ti-30);
        snippet = (s>0?"…":"") + txt.slice(s, ti+ q.length + 60);
      }
      if(score>0) results.push({a, score, hitIdx, snippet});
    });
    results.sort((x,y)=> y.score-x.score || x.hitIdx-y.hitIdx);
    if(!results.length){ box.innerHTML = `<div class="sr-empty">未找到与“${esc(q)}”相关的内容</div>`; box.classList.remove("hidden"); return; }
    box.innerHTML = `<div class="sr-stat">共 ${results.length} 条结果</div>` + results.slice(0,60).map(r=>{
      const a = r.a;
      const tHtml = highlightIn(a.title, q);
      const snip = r.snippet ? `<div class="sr-snippet">${highlightIn(r.snippet, q)}</div>` : "";
      return `<div class="sr-item" data-id="${a.id}">
        <div class="sr-title">${tHtml}</div>
        <div class="sr-meta">${a.num} · ${esc(a.volName.split("（")[0])} · ${a.date||"未标明时间"}</div>
        ${snip}</div>`;
    }).join("");
    box.classList.remove("hidden");
    $$("#searchResults .sr-item").forEach(el=>{
      el.addEventListener("click", ()=>openArticle(el.dataset.id, {query:q}));
    });
  }
  function highlightIn(text, q){
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if(i<0) return esc(text);
    return esc(text.slice(0,i)) + '<span class="hl">' + esc(text.slice(i,i+q.length)) + "</span>" + esc(text.slice(i+q.length));
  }
  function markSearchHits(q){
    // 在正文临时标记匹配并滚动到首个
    const body = $("#articleBody");
    wrapOccurrences(body, q, {});
    // 改成 search-hit 样式
    body.querySelectorAll("mark.hl").forEach(m=>{ m.classList.remove("hl"); m.classList.add("search-hit"); });
    const first = body.querySelector(".search-hit");
    if(first) setTimeout(()=>first.scrollIntoView({block:"center"}), 60);
  }
  function closeSearch(){ $("#searchResults").classList.add("hidden"); }

  /* ============ 划词工具条 ============ */
  function initSelection(){
    const body = $("#articleBody");
    const tb = $("#selToolbar");
    body.addEventListener("mouseup", ()=> setTimeout(showSelToolbar, 10));
    body.addEventListener("keyup", ()=> setTimeout(showSelToolbar, 10));
    document.addEventListener("mousedown", e=>{ if(!tb.contains(e.target)) {/* defer */} });
    $("#reader").addEventListener("scroll", ()=> tb.classList.add("hidden"));
    function showSelToolbar(){
      const sel = window.getSelection();
      if(!sel || sel.isCollapsed || !sel.toString().trim()){ tb.classList.add("hidden"); return; }
      const range = sel.getRangeAt(0);
      if(!body.contains(range.commonAncestorContainer)){ tb.classList.add("hidden"); return; }
      const rect = range.getBoundingClientRect();
      tb.classList.remove("hidden");
      const tbRect = tb.getBoundingClientRect();
      let top = rect.top - tbRect.height - 8 + window.scrollY;
      let left = rect.left + rect.width/2 - tbRect.width/2 + window.scrollX;
      tb.style.top = Math.max(60, top) + "px";
      tb.style.left = Math.max(8, left) + "px";
    }
    $("#selHighlight").addEventListener("click", ()=> createHighlight(false));
    $("#selNote").addEventListener("click", ()=> createHighlight(true));
    $("#selCopy").addEventListener("click", ()=>{
      const t = window.getSelection().toString();
      navigator.clipboard && navigator.clipboard.writeText(t);
      toast("已复制");
    });
  }
  function getSelectionText(){
    const sel = window.getSelection();
    return sel && !sel.isCollapsed ? sel.toString().trim() : "";
  }
  function createHighlight(withNote){
    const text = getSelectionText();
    if(!text || !currentId) return;
    const hid = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
    const h = { hid, text, note:"", ts:Date.now() };
    state.highlights[currentId] = state.highlights[currentId]||[];
    state.highlights[currentId].push(h);
    save();
    wrapOccurrences($("#articleBody"), text, {id:hid, note:withNote});
    window.getSelection().removeAllRanges();
    $("#selToolbar").classList.add("hidden");
    renderNotes(); updateHeadButtons();
    window.__daylogBookBridge && window.__daylogBookBridge.onHighlight(ART_MAP[currentId], h);
    if(withNote) openHighlightNote(currentId, hid);
    else toast("已高亮，并收录到日迹");
  }

  /* ============ 弹窗：文章笔记 / 批注 ============ */
  function openModal(title, html){
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    $("#modal").classList.remove("hidden");
  }
  function closeModal(){ $("#modal").classList.add("hidden"); }
  function openNoteModal(id){
    const a = ART_MAP[id];
    const val = state.notes[id] || "";
    openModal("笔记 · " + a.title,
      `<textarea id="noteArea" placeholder="写下你对本篇的阅读心得、疑问或摘抄…">${esc(val)}</textarea>
       <div class="modal-foot">
         <button class="btn" id="noteCancel">取消</button>
         <button class="btn primary" id="noteSave">保存</button>
       </div>`);
    const area = $("#noteArea");
    area.focus();
    $("#noteSave").addEventListener("click", ()=>{
      const v = area.value.trim();
      if(v) state.notes[id] = area.value; else delete state.notes[id];
      save(); renderNotes(); updateHeadButtons(); closeModal(); toast("笔记已保存");
    });
    $("#noteCancel").addEventListener("click", closeModal);
  }
  function openHighlightNote(id, hid){
    const h = (state.highlights[id]||[]).find(x=>x.hid===hid); if(!h) return;
    const a = ART_MAP[id];
    openModal("批注 · " + a.title,
      `<div class="ni-quote" style="margin-bottom:12px">“${esc(h.text)}”</div>
       <textarea id="hlArea" placeholder="为这段高亮写批注…">${esc(h.note||"")}</textarea>
       <div class="modal-foot">
         <button class="btn" id="hlDel">删除高亮</button>
         <button class="btn primary" id="hlSave">保存</button>
       </div>`);
    const area = $("#hlArea"); area.focus();
    const saveH = ()=>{
      h.note = area.value.trim(); h.ts = Date.now();
      save();
      window.__daylogBookBridge && window.__daylogBookBridge.onHighlight(ART_MAP[id], h);
      const mk = $(`#articleBody mark.hl[data-hl-id="${CSS.escape(hid)}"]`);
      if(mk) mk.classList.toggle("has-note", !!h.note);
      renderNotes(); updateHeadButtons(); closeModal(); toast("批注已保存");
    };
    $("#hlSave").addEventListener("click", saveH);
    $("#hlDel").addEventListener("click", ()=>{ delHighlight(id, hid); closeModal(); });
  }
  $("#articleBody").addEventListener("click", e=>{
    const mk = e.target.closest("mark.hl");
    if(mk && mk.dataset.hlId) openHighlightNote(currentId, mk.dataset.hlId);
  });

  /* ============ 阅读进度 ============ */
  function updateProgress(){
    const r = $("#reader"), bar = $("#progressBar > i");
    if(!currentId || !r.scrollHeight){ bar.style.width="0"; return; }
    const max = r.scrollHeight - r.clientHeight;
    const pct = max>0 ? Math.min(100, (r.scrollTop/max)*100) : 100;
    bar.style.width = pct + "%";
    if(pct>92 && !state.read[currentId]){ markRead(currentId, true); }
  }
  function markRead(id, on){
    if(on) state.read[id] = true; else delete state.read[id];
    save(); refreshTOCFlags(); updateHeadButtons();
    if(on) recordActivity();
    $("#readStat").textContent = `已读 ${Object.keys(state.read).length} / ${DATA.total}`;
  }

  /* ============ 设置 ============ */
  function applySettings(){
    const s = state.settings;
    document.body.dataset.theme = s.theme;
    const root = document.documentElement.style;
    root.setProperty("--font", s.font+"px");
    root.setProperty("--lh", s.lh);
    root.setProperty("--measure", s.measure+"px");
    $("#readStat").textContent = `已读 ${Object.keys(state.read).length} / ${DATA.total}`;
  }
  function openSettings(){
    const s = state.settings;
    openModal("阅读设置",
      `<div class="set-row"><label>主题</label>
        <div class="seg" id="setTheme">
          <button data-v="paper" class="${s.theme==='paper'?'on':''}">纸感</button>
          <button data-v="eye" class="${s.theme==='eye'?'on':''}">护眼</button>
          <button data-v="dark" class="${s.theme==='dark'?'on':''}">暗色</button>
        </div></div>
       <div class="set-row"><label>正文字号 <span id="fz">${s.font}px</span></label>
        <input type="range" class="range" id="setFont" min="15" max="24" step="1" value="${s.font}"></div>
       <div class="set-row"><label>行距 <span id="lh">${s.lh}</span></label>
        <input type="range" class="range" id="setLh" min="1.6" max="2.4" step="0.05" value="${s.lh}"></div>
       <div class="set-row"><label>版心宽度 <span id="mw">${s.measure}px</span></label>
        <input type="range" class="range" id="setMeasure" min="600" max="900" step="20" value="${s.measure}"></div>
       <div class="set-row"><label>学习记录</label>
        <div style="display:flex;gap:8px">
          <button class="btn" id="setExport">导出</button>
          <button class="btn" id="setImport">导入</button>
          <button class="btn" id="setReset" style="color:var(--accent)">清空</button>
        </div></div>
       <div class="modal-foot"><button class="btn primary" id="setClose">完成</button></div>`);
    $("#setTheme").addEventListener("click", e=>{
      const b = e.target.closest("button"); if(!b) return;
      s.theme = b.dataset.v; applySettings(); save();
      $$("#setTheme button").forEach(x=>x.classList.toggle("on", x===b));
    });
    $("#setFont").addEventListener("input", e=>{ s.font=+e.target.value; $("#fz").textContent=s.font+"px"; applySettings(); });
    $("#setFont").addEventListener("change", ()=>save());
    $("#setLh").addEventListener("input", e=>{ s.lh=+e.target.value; $("#lh").textContent=s.lh; applySettings(); });
    $("#setLh").addEventListener("change", ()=>save());
    $("#setMeasure").addEventListener("input", e=>{ s.measure=+e.target.value; $("#mw").textContent=s.measure+"px"; applySettings(); });
    $("#setMeasure").addEventListener("change", ()=>save());
    $("#setExport").addEventListener("click", exportData);
    $("#setImport").addEventListener("click", ()=>$("#importFile").click());
    $("#setReset").addEventListener("click", ()=>{
      if(confirm("确定清空全部书签、笔记、高亮与阅读进度？此操作不可撤销。")){
        state = clone(defaultState); save(); location.reload();
      }
    });
    $("#setClose").addEventListener("click", closeModal);
  }

  /* ============ 导出 / 导入 ============ */
  function exportData(){
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "毛泽东选集-学习记录.json";
    a.click(); URL.revokeObjectURL(url);
    toast("学习记录已导出");
  }
  function importData(file){
    const r = new FileReader();
    r.onload = ()=>{
      try{
        const s = JSON.parse(r.result);
        state = Object.assign(clone(defaultState), s,
          { settings: Object.assign({}, defaultState.settings, s.settings||{}) });
        save(); location.reload();
      }catch(e){ toast("导入失败：文件格式不正确"); }
    };
    r.readAsText(file);
  }

  /* ============ 事件绑定 ============ */
  function bind(){
    // 顶部搜索
    $("#globalSearch").addEventListener("input", e=>{
      $("#searchClear").classList.toggle("hidden", !e.target.value);
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(()=>doSearch(v), 160);
    });
    $("#globalSearch").addEventListener("keydown", e=>{
      if(e.key==="Enter"){ const f=$("#searchResults .sr-item"); if(f) f.click(); }
      if(e.key==="Escape"){ closeSearch(); }
    });
    $("#searchClear").addEventListener("click", ()=>{ $("#globalSearch").value=""; $("#searchClear").classList.add("hidden"); closeSearch(); });
    document.addEventListener("click", e=>{ if(!e.target.closest(".search-wrap")) closeSearch(); });

    // 侧边栏 tab
    $$(".sidebar-tabs .tab").forEach(t=>{
      t.addEventListener("click", ()=>{
        $$(".sidebar-tabs .tab").forEach(x=>x.classList.remove("active"));
        t.classList.add("active");
        const tab = t.dataset.tab;
        $$(".panel").forEach(p=>p.classList.remove("active"));
        $("#panel-"+tab).classList.add("active");
        if(tab==="bm") renderBookmarks();
        if(tab==="notes") renderNotes();
        if(tab==="theme") buildThemeTab();
        if(tab==="time") renderTimeTab();
      });
    });
    // 目录筛选
    $("#tocFilter").addEventListener("input", e=>{
      const q = e.target.value.trim().toLowerCase();
      $$("#panel-toc .art-item").forEach(it=>{
        const a = ART_MAP[it.dataset.id];
        const hit = !q || a.title.toLowerCase().includes(q) || a.num.includes(q);
        it.style.display = hit ? "" : "none";
      });
      // 隐藏空卷
      $$("#panel-toc .vol").forEach(v=>{
        const any = Array.from(v.querySelectorAll(".art-item")).some(i=>i.style.display!=="none");
        v.style.display = any ? "" : "none";
      });
    });

    // 文章操作
    $("#btnRead").addEventListener("click", ()=> markRead(currentId, !state.read[currentId]));
    $("#btnBm").addEventListener("click", ()=>{
      if(state.bookmarks[currentId]) delete state.bookmarks[currentId];
      else state.bookmarks[currentId] = true;
      save(); refreshTOCFlags(); renderBookmarks(); updateHeadButtons();
      toast(state.bookmarks[currentId]?"已加入书签":"已取消书签");
    });
    $("#btnNote").addEventListener("click", ()=> openNoteModal(currentId));
    $("#btnGuide").addEventListener("click", ()=>{
      const box = $("#guideBox");
      if(box.innerHTML.trim() && !box.classList.contains("hidden")){ box.classList.add("hidden"); return; }
      if(!box.innerHTML.trim()){ if(currentId && ART_MAP[currentId]) openGuideEditor(currentId); return; }
      box.classList.remove("hidden");
    });
    $("#btnTTS").addEventListener("click", ()=>{
      if($("#btnTTS").classList.contains("on-tts")) stopTTS(); else startTTS();
    });
    $("#btnOutline").addEventListener("click", ()=> $("#outline").classList.toggle("hidden"));

    // 顶栏
    $("#btnOverview").addEventListener("click", showOverview);
    $("#btnTheme").addEventListener("click", ()=>{
      const order = ["paper","eye","dark"];
      const i = (order.indexOf(state.settings.theme)+1)%3;
      state.settings.theme = order[i]; applySettings(); save(); toast("主题：" + ["纸感","护眼","暗色"][i]);
    });
    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnExport").addEventListener("click", exportData);
    $("#btnImport").addEventListener("click", ()=>$("#importFile").click());
    $("#importFile").addEventListener("change", e=>{ if(e.target.files[0]) importData(e.target.files[0]); });

    // 弹窗关闭
    $("#modalClose").addEventListener("click", closeModal);
    $("#modal").addEventListener("click", e=>{ if(e.target.id==="modal") closeModal(); });
    document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeModal(); });

    // 阅读区滚动
    $("#reader").addEventListener("scroll", ()=>{ updateProgress(); syncOutline();
      if($("#reader").scrollTop>300) $("#toTop").classList.remove("hidden"); else $("#toTop").classList.add("hidden"); });
    $("#toTop").addEventListener("click", ()=> $("#reader").scrollTo({top:0,behavior:"smooth"}));

    // 移动端侧栏
    $("#toggleSidebar").addEventListener("click", ()=> document.body.classList.toggle("sidebar-open"));
    // 移动端：操作菜单（⋯更多）
    const topActions = $("#topActions");
    $("#btnMore").addEventListener("click", e=>{ e.stopPropagation(); topActions.classList.toggle("open"); });
    topActions.querySelectorAll(".top-actions-menu .icon-btn").forEach(b=> b.addEventListener("click", ()=> topActions.classList.remove("open")));
    document.addEventListener("click", e=>{ if(topActions.classList.contains("open") && !topActions.contains(e.target)) topActions.classList.remove("open"); });
    // 侧栏遮罩：点击空白处收起抽屉
    $("#scrim").addEventListener("click", ()=> document.body.classList.remove("sidebar-open"));

    initSelection();
  }

  /* ============ 启动 ============ */
  function init(){
    applySettings();
    buildTOC();
    renderBookmarks();
    renderNotes();
    $("#readStat").textContent = `已读 ${Object.keys(state.read).length} / ${DATA.total}`;
    bind();
  }
  if(!DATA){ document.body.innerHTML = "<p style='padding:40px'>数据加载失败</p>"; return; }
  init();
})();
