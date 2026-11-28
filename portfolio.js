import { icon } from "./icons.js";
import { escapeHTML as esc } from "./journal.js";
import {
  DEFAULT_STOCK_ACCOUNT, STOCK_TYPES, calculateStockPositions, deleteStockTrade,
  readStockData, saveStockQuotes, saveStockTrade, stockSymbol,
} from "./stock-data.js";

const amountFormat = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });
const priceFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const countFormat = new Intl.NumberFormat("zh-CN");
const quoteDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const tradeDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const historyStep = 40;
const selected = { account: "", historyAccount: "", symbol: "", limit: historyStep };
let refreshing = false;
let updateCurrentPage;

function money(cents, signed = false) {
  return cents === null ? "—" : `${signed && cents > 0 ? "+" : ""}${amountFormat.format(cents / 100)}`;
}

function tone(cents) {
  return cents > 0 ? "stock-gain" : cents < 0 ? "stock-loss" : "";
}

function stockTitle(item) {
  return item.name || item.symbol.slice(2);
}

function localDateTime(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function metric(label, value, color = "", detail = "") {
  return `<div class="stock-metric"><dt>${label}</dt><dd class="${color}">${value}${detail ? `<small>${detail}</small>` : ""}</dd></div>`;
}

function summaryMarkup(positions, holdings) {
  const cost = holdings.reduce((sum, position) => sum + position.cost, 0);
  const realized = positions.reduce((sum, position) => sum + position.realized, 0);
  const priced = holdings.filter(position => position.market !== null);
  const complete = priced.length === holdings.length;
  const market = priced.reduce((sum, position) => sum + position.market, 0);
  const floating = priced.reduce((sum, position) => sum + position.floating, 0);
  const coverage = !complete && priced.length ? `已报价 ${priced.length}/${holdings.length} 项` : "";
  return metric("持仓市值", money(complete || priced.length ? market : null), "", coverage)
    + metric("剩余成本", money(cost))
    + metric("浮动盈亏", money(complete || priced.length ? floating : null, true), tone(floating), coverage)
    + metric("已实现盈亏", money(realized, true), tone(realized), "含现金分红");
}

function holdingMarkup(position, index) {
  const { symbol, quote, shares, average, market, floating, cost } = position;
  const rate = floating !== null && cost ? floating / cost * 100 : null;
  const floatingText = rate === null ? "" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
  const quoteInfo = quote
    ? `<span>${quote.source === "manual" ? "手动估价" : "腾讯行情"} · 北京时间</span><time datetime="${quote.asOf}">${quoteDate.format(new Date(quote.asOf))}</time>`
    : "<span>暂无报价</span>";
  return `<article class="stock-holding" data-stock-symbol="${symbol}">
    <header><div class="stock-identity"><h3>${esc(stockTitle(position))}</h3><p>${symbol.toUpperCase()}</p><p>${esc(position.account)}</p></div>
      <div class="stock-current"><strong>${quote ? `¥${priceFormat.format(quote.price)}` : "—"}</strong>${quoteInfo}</div></header>
    <dl class="stock-holding-metrics">
      ${metric("股数 / 份数", countFormat.format(shares))}${metric("每股成本", `¥${priceFormat.format(average)}`)}
      ${metric("市值", money(market))}${metric("浮动盈亏", money(floating, true), tone(floating), floatingText)}
    </dl>
    <div class="stock-holding-actions">
      <button type="button" class="life-soft-button" data-holding="${index}" data-stock-action="buy">买入</button>
      <button type="button" class="life-soft-button" data-holding="${index}" data-stock-action="sell">卖出</button>
      <button type="button" class="life-soft-button" data-holding="${index}" data-stock-action="price">估价</button>
      <button type="button" class="life-soft-button" data-holding="${index}" data-stock-action="history">流水</button>
    </div></article>`;
}

function entryMarkup(item, name) {
  const details = item.type === "dividend" ? "实收分红" : `${countFormat.format(item.shares)} 股/份 × ¥${priceFormat.format(item.price)}${item.fee ? ` · 费 ${money(Math.round(item.fee * 100))}` : ""}`;
  return `<article class="stock-entry" data-trade-id="${item.id}">
    <div><div class="stock-entry-title"><b>${esc(item.name || name || item.symbol.slice(2))}</b><span class="stock-type is-${item.type}">${STOCK_TYPES[item.type]}</span></div>
      <p>${item.symbol.toUpperCase()} · ${esc(item.account)} · ${tradeDate.format(new Date(item.at))}</p><p>${details}</p>
      ${item.note ? `<p class="stock-entry-note">${esc(item.note)}</p>` : ""}</div>
    <div class="stock-entry-end"><strong>${money(item.net)}</strong>${item.realized === null ? "" : `<small class="${tone(item.realized)}">已实现 ${money(item.realized, true)}</small>`}
      <div><button type="button" data-stock-action="edit" data-id="${item.id}" aria-label="编辑这笔交易">${icon("pen")}</button>
      <button type="button" data-stock-action="delete" data-id="${item.id}" aria-label="删除这笔交易">${icon("trash")}</button></div></div></article>`;
}

function parseQuotes(body, symbols) {
  const requested = new Set(symbols);
  return [...body.matchAll(/v_([a-z]{2}\d{6})="([^"\r\n]*)"/g)].flatMap(([, symbol, line]) => {
    if (!requested.has(symbol)) return [];
    const fields = line.split("~");
    const price = Number(fields[3]);
    const date = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(fields[30] || "");
    if (fields[2] !== symbol.slice(2) || !date || !Number.isFinite(price) || price <= 0 || price > 1_000_000) return [];
    const [, year, month, day, hour, minute, second] = date;
    const asOf = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
    if (!Number.isFinite(asOf.getTime())) return [];
    const rounded = Math.round(price * 10_000) / 10_000;
    return rounded ? [{ symbol, name: fields[1], price: rounded, asOf: asOf.toISOString(), source: "tencent" }] : [];
  });
}

async function fetchStockQuotes(symbols) {
  const chunks = [];
  for (let index = 0; index < symbols.length; index += 40) chunks.push(symbols.slice(index, index + 40));
  const results = await Promise.allSettled(chunks.map(async chunk => {
    const response = await fetch(`https://qt.gtimg.cn/q=${chunk.join(",")}`, {
      cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`行情接口 HTTP ${response.status}`);
    return parseQuotes(new TextDecoder("gb18030").decode(await response.arrayBuffer()), chunk);
  }));
  return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
}

function options(values, current) {
  return values.map(([value, label]) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`).join("");
}

export function renderPortfolioPage(root, { notify, confirmAction }) {
  root.innerHTML = `<div class="life-page stock-page">
    <header class="life-page-head stock-page-head"><div><button type="button" class="stock-back" data-view="ledger">${icon("chevronL")}生活账本</button>
      <h1>股票持仓</h1></div>
      <div class="stock-toolbar"><button type="button" class="life-soft-button" data-stock-action="opening">补录持仓</button>
      <button type="button" class="primary" data-stock-action="new">${icon("plus")}记交易</button></div>
    </header>
    <section class="stock-overview" aria-labelledby="stock-overview-title">
      <div class="stock-panel-head"><h2 id="stock-overview-title">投资概览</h2><label><span class="sr-only">筛选投资账户</span><select id="stock-account"></select></label></div>
      <dl class="stock-summary" id="stock-summary"></dl>
    </section>
    <section class="stock-section" aria-labelledby="stock-holdings-title">
      <div class="stock-panel-head"><h2 id="stock-holdings-title">当前持仓 <small id="stock-holdings-count"></small></h2>
        <button type="button" class="life-soft-button" data-stock-action="refresh">${icon("refresh")}刷新行情</button></div>
      <p class="stock-status" id="stock-status" role="status"></p><div class="stock-holdings" id="stock-holdings"></div>
    </section>
    <section class="stock-section" aria-labelledby="stock-history-title">
      <div class="stock-panel-head"><h2 id="stock-history-title" tabindex="-1">交易流水 <small id="stock-history-count"></small></h2>
        <label><span class="sr-only">按股票筛选交易流水</span><select id="stock-symbol"></select></label></div>
      <button type="button" class="life-soft-button stock-history-scope" data-stock-action="clear-history-account" hidden><span></span>${icon("x")}</button>
      <div class="stock-entries" id="stock-history"></div>
      <button type="button" class="life-soft-button stock-more" data-stock-action="more" hidden>查看更多</button>
    </section>
    <details class="stock-method"><summary>成本与盈亏怎么算</summary><p>补录和买入使用移动加权平均成本，买入手续费计入成本。卖出扣除手续费并按比例结转持仓成本。现金分红计入已实现盈亏，保留原持仓成本。浮动盈亏为按报价计算的市值减剩余成本。</p></details>
    <dialog class="stock-dialog" aria-labelledby="stock-dialog-title"><header class="dialog-head"><h2 id="stock-dialog-title"></h2>
      <button type="button" class="stock-close" aria-label="关闭" data-stock-action="close">${icon("x")}</button></header><div id="stock-form-body"></div></dialog>
  </div>`;

  const $ = selector => root.querySelector(selector);
  const accountFilter = $("#stock-account");
  const symbolFilter = $("#stock-symbol");
  const historyScope = $('[data-stock-action="clear-history-account"]');
  const refresh = $('[data-stock-action="refresh"]');
  const status = $("#stock-status");
  const dialog = $(".stock-dialog");
  let accounts = [];
  let holdings = [];
  let entries = [];
  let draftOrigin;

  function update() {
    const data = readStockData();
    const calculated = calculateStockPositions(data);
    accounts = [...new Set(calculated.positions.map(position => position.account))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    if (!accounts.includes(selected.account)) selected.account = "";
    const positions = calculated.positions.filter(position => !selected.account || position.account === selected.account);
    holdings = positions.filter(position => position.shares > 0)
      .sort((a, b) => (b.market ?? b.cost) - (a.market ?? a.cost) || a.symbol.localeCompare(b.symbol));
    const names = new Map(positions.map(position => [position.symbol, position.name]));
    if (!names.has(selected.symbol)) selected.symbol = "";
    if (!positions.some(position => position.symbol === selected.symbol && position.account === selected.historyAccount)) selected.historyAccount = "";
    accountFilter.innerHTML = options([["", "全部账户"], ...accounts.map(account => [account, account])], selected.account);
    symbolFilter.innerHTML = options([["", "全部股票"], ...[...names].sort().map(([symbol, name]) => [symbol, `${symbol.slice(2)}${name ? ` · ${name}` : ""}`])], selected.symbol);
    const historyAccount = selected.account || selected.historyAccount;
    historyScope.hidden = !selected.historyAccount || Boolean(selected.account);
    historyScope.querySelector("span").textContent = `流水仅看 ${selected.historyAccount}`;
    historyScope.setAttribute("aria-label", `清除流水账户筛选 ${selected.historyAccount}`);
    entries = calculated.entries.filter(item => (!historyAccount || item.account === historyAccount) && (!selected.symbol || item.symbol === selected.symbol));
    $("#stock-summary").innerHTML = summaryMarkup(positions, holdings);
    $("#stock-holdings-count").textContent = `${holdings.length} 项`;
    $("#stock-holdings").innerHTML = holdings.length ? holdings.map(holdingMarkup).join("")
      : `<p class="stock-empty">${data.trades.length ? "当前账户没有持仓，已卖出的交易可以在流水里查看。" : "已有股票可以先补录持仓，之后每笔买卖会自动更新成本和盈亏。"}</p>`;
    refresh.disabled = refreshing || !holdings.length;
    $("#stock-history-count").textContent = `${entries.length} 笔`;
    $("#stock-history").innerHTML = entries.length ? entries.slice(0, selected.limit).map(item => entryMarkup(item, names.get(item.symbol))).join("")
      : '<p class="stock-empty">暂无交易流水</p>';
    $('[data-stock-action="more"]').hidden = entries.length <= selected.limit;
  }

  function openForm(type, item, origin, edit = false) {
    const manual = type === "price";
    const value = name => esc(item?.[name] ?? "");
    draftOrigin = origin;
    $("#stock-dialog-title").textContent = manual ? `手动估价 · ${stockTitle(item)}` : edit ? "编辑交易" : type === "opening" ? "补录已有持仓" : "记一笔交易";
    $("#stock-form-body").innerHTML = `<form class="stock-form" autocomplete="off"><div class="stock-form-fields">
      ${manual ? `<p>输入 ${item.symbol.toUpperCase()} 的参考价格。这个价格会用于该股票在各账户的市值计算。</p>
        <label class="stock-wide">每股参考价（元）<input name="price" type="number" step="0.0001" min="0.0001" max="1000000" inputmode="decimal" value="${item.quote?.price ?? ""}" required></label>` : `
        <label>交易类型<select name="type">${options(Object.entries(STOCK_TYPES), type)}</select></label>
        <label>账户<input name="account" list="stock-account-names" maxlength="32" value="${esc(item?.account || selected.account || DEFAULT_STOCK_ACCOUNT)}" required></label>
        <datalist id="stock-account-names">${options([...new Set([DEFAULT_STOCK_ACCOUNT, ...accounts])].map(account => [account, account]))}</datalist>
        <label>股票代码<input name="symbol" inputmode="numeric" placeholder="如 600519" maxlength="9" value="${item?.symbol ? item.symbol.slice(2) : ""}" required></label>
        <label>股票名称（选填）<input name="name" placeholder="如 贵州茅台" maxlength="40" value="${value("name")}"></label>
        <label class="stock-wide"><span data-stock-date-label></span><input name="at" type="datetime-local" value="${localDateTime(edit ? item.at : new Date())}" required></label>
        <label data-stock-share>股数 / 份数<input name="shares" type="number" step="1" min="1" max="10000000" inputmode="numeric" value="${edit && item.shares ? item.shares : ""}"></label>
        <label data-stock-share><span data-stock-price-label></span><input name="price" type="number" step="0.0001" max="1000000" inputmode="decimal" value="${edit && item.type !== "dividend" ? item.price : ""}"></label>
        <label class="stock-wide" data-stock-share>手续费（元，选填）<input name="fee" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" value="${edit && item.fee ? item.fee : ""}"></label>
        <label class="stock-wide" data-stock-dividend>实际到账分红（元）<input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" value="${edit && item.amount ? item.amount : ""}"></label>
        <label class="stock-wide">备注（选填）<textarea name="note" rows="2" maxlength="500">${value("note")}</textarea></label>`}
      <div class="stock-form-error stock-wide" role="alert" hidden></div></div><div class="stock-form-actions">
        <button class="secondary" type="button" data-stock-action="close">取消</button><button class="primary" type="submit">保存</button></div></form>`;
    const form = $(".stock-form");
    const fields = form.elements;
    function syncType() {
      const dividend = fields.type.value === "dividend";
      const opening = fields.type.value === "opening";
      form.querySelectorAll("[data-stock-share]").forEach(label => { label.hidden = dividend; label.querySelector("input").disabled = dividend; });
      form.querySelector("[data-stock-dividend]").hidden = !dividend;
      fields.amount.disabled = !dividend;
      fields.amount.required = dividend;
      fields.shares.required = fields.price.required = !dividend;
      fields.price.min = opening ? "0" : "0.0001";
      form.querySelector("[data-stock-price-label]").textContent = opening ? "每股持仓成本（元）" : "成交单价（元）";
      form.querySelector("[data-stock-date-label]").textContent = opening ? "持仓起始时间" : dividend ? "分红到账时间" : "成交时间";
    }
    if (!manual) {
      fields.type.onchange = syncType;
      syncType();
    }
    form.onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      try {
        if (manual) {
          const date = new Date().toISOString();
          if (!saveStockQuotes([{ symbol: item.symbol, name: item.name, price: values.price, asOf: date, source: "manual" }])) {
            throw new Error("当前报价时间更新，请检查设备时间后重试");
          }
        } else {
          const at = edit && values.at === localDateTime(item.at) ? item.at : new Date(values.at).toISOString();
          const saved = saveStockTrade({ ...values, id: edit ? item.id : undefined, at });
          if (edit && selected.historyAccount === item.account) selected.historyAccount = saved.account;
          if (edit && selected.symbol === item.symbol) selected.symbol = saved.symbol;
        }
        dialog.close();
        update();
        notify(manual ? "已保存估价" : edit ? "已更新交易" : "已记录交易");
      } catch (error) {
        const message = $(".stock-form-error");
        message.textContent = error.message;
        message.hidden = false;
        message.scrollIntoView({ block: "nearest" });
      }
    };
    dialog.showModal();
    fitDialog();
    window.visualViewport?.addEventListener("resize", fitDialog);
    window.visualViewport?.addEventListener("scroll", fitDialog);
    (manual || item?.symbol ? (fields.price.disabled ? fields.amount : fields.price) : fields.symbol).focus();
  }

  function fitDialog() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    dialog.style.setProperty("--stock-viewport-top", `${viewport.offsetTop}px`);
    dialog.style.setProperty("--stock-viewport-bottom", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    dialog.style.setProperty("--stock-viewport-height", `${viewport.height}px`);
  }

  accountFilter.onchange = () => { selected.account = accountFilter.value; selected.historyAccount = ""; selected.symbol = ""; selected.limit = historyStep; status.textContent = ""; update(); };
  symbolFilter.onchange = () => { selected.symbol = symbolFilter.value; selected.historyAccount = ""; selected.limit = historyStep; update(); };
  dialog.addEventListener("close", () => {
    window.visualViewport?.removeEventListener("resize", fitDialog);
    window.visualViewport?.removeEventListener("scroll", fitDialog);
    if (draftOrigin?.isConnected) draftOrigin.focus();
    else if (!root.hidden) $('[data-stock-action="new"]').focus({ preventScroll: true });
  });
  root.onclick = async event => {
    const button = event.target.closest("[data-stock-action]");
    if (!button) return;
    const { stockAction: action, id, holding } = button.dataset;
    const position = holdings[holding];
    const entry = entries.find(item => item.id === id);
    if (action === "close") dialog.close();
    else if (action === "new" || action === "opening") openForm(action === "new" ? "buy" : "opening", null, button);
    else if (["buy", "sell", "price"].includes(action) && position) openForm(action, position, button);
    else if (action === "edit" && entry) openForm(entry.type, entry, button, true);
    else if (action === "delete" && entry) {
      if (!await confirmAction("删除这笔交易？", `${stockTitle(entry)} · ${STOCK_TYPES[entry.type]}。成本和盈亏会重新计算。`)) return;
      try { deleteStockTrade(entry.id); update(); notify("已删除交易"); }
      catch (error) { notify(error.message); }
    } else if (action === "history" && position) {
      selected.historyAccount = position.account;
      selected.symbol = position.symbol;
      selected.limit = historyStep;
      update();
      $("#stock-history-title").focus({ preventScroll: true });
      $("#stock-history-title").scrollIntoView({ block: "start" });
    } else if (action === "clear-history-account") {
      selected.historyAccount = "";
      selected.limit = historyStep;
      update();
      symbolFilter.focus({ preventScroll: true });
    } else if (action === "more") {
      selected.limit += historyStep;
      update();
    } else if (action === "refresh" && holdings.length && !refreshing) {
      const symbols = [...new Set(holdings.map(item => item.symbol))];
      refreshing = refresh.disabled = true;
      status.textContent = "正在刷新行情…";
      try {
        const quotes = await fetchStockQuotes(symbols);
        if (!quotes.length) status.textContent = "暂未取得行情，已保留现有报价。你也可以手动估价。";
        else {
          const changed = saveStockQuotes(quotes);
          const received = new Set(quotes.map(quote => quote.symbol)).size;
          status.textContent = `取得 ${received}/${symbols.length} 只股票的报价，更新 ${changed} 只。`;
        }
      } catch {
        status.textContent = "保存行情失败，已保留现有报价。";
      } finally {
        refreshing = false;
        if (!root.hidden) updateCurrentPage();
      }
    }
  };
  updateCurrentPage = update;
  update();
}
