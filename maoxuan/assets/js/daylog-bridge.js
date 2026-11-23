/* 日迹 × 毛选 桥接：把划线/批注同步写进日迹日记（localStorage 同源共享） */
(function () {
  "use strict";
  if (window.__daylogBookBridge) return;

  var ENTRY_PREFIX = "daylog:entry:";
  var INDEX_KEY = "daylog:bookquotes";
  var BOOK_KEY = "maoxuan";

  function uid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || {}; }
    catch { return {}; }
  }
  function writeIndex(idx) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  }
  function escAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function buildHtml(article, text, note) {
    var src = "《毛泽东选集》 · " + escAttr(article.volName || "") + " · 《" + escAttr(article.title) + "》";
    var html = "<blockquote>“" + escAttr(text) + "”</blockquote>" +
      "<p><small>— " + src + "</small></p>";
    if (note) html += "<p>批注：" + escAttr(note) + "</p>";
    return html;
  }
  function upsertEntry(entryId, atIso, html) {
    var record = { id: entryId, type: "quote", at: atIso, html: html, fav: false, schemaVersion: 2 };
    localStorage.setItem(ENTRY_PREFIX + entryId, JSON.stringify(record));
    return record;
  }

  function onHighlight(article, h) {
    if (!article || !h || !h.text) return null;
    try {
      var idx = readIndex();
      if (!idx[BOOK_KEY]) idx[BOOK_KEY] = {};
      if (!idx[BOOK_KEY][article.id]) idx[BOOK_KEY][article.id] = {};
      var map = idx[BOOK_KEY][article.id];
      var entryId = map[h.hid];
      var atIso;
      if (entryId) {
        var existing = JSON.parse(localStorage.getItem(ENTRY_PREFIX + entryId) || "null");
        atIso = (existing && existing.at) || new Date(h.ts || Date.now()).toISOString();
      } else {
        entryId = uid();
        map[h.hid] = entryId;
        atIso = new Date(h.ts || Date.now()).toISOString();
      }
      writeIndex(idx);
      upsertEntry(entryId, atIso, buildHtml(article, h.text, h.note));
      return entryId;
    } catch (e) {
      console.warn("[daylog-bridge] 写日记失败：", e);
      return null;
    }
  }

  function onDeleteHighlight(articleId, hid) {
    try {
      var idx = readIndex();
      var entryId = idx && idx[BOOK_KEY] && idx[BOOK_KEY][articleId] && idx[BOOK_KEY][articleId][hid];
      if (!entryId) return;
      localStorage.removeItem(ENTRY_PREFIX + entryId);
      delete idx[BOOK_KEY][articleId][hid];
      if (!Object.keys(idx[BOOK_KEY][articleId]).length) delete idx[BOOK_KEY][articleId];
      writeIndex(idx);
    } catch (e) {
      console.warn("[daylog-bridge] 删日记失败：", e);
    }
  }

  window.__daylogBookBridge = {
    onHighlight: onHighlight,
    onDeleteHighlight: onDeleteHighlight
  };
})();
