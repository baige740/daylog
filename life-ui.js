import { icon } from "./icons.js";
import { ledgerCategories, ledgerCategoryAliases, ledgerCategoryGroup } from "./ledger-categories.js";
import {
  deleteLedger,
  deleteQuickLedger,
  deleteWeight,
  getLifeProfile,
  listLedger,
  listQuickLedger,
  listWeights,
  saveLedger,
  saveLifeProfile,
  saveQuickLedger,
  saveWeight,
} from "./life-data.js";

const ACCOUNTS = ["微信", "支付宝", "银行卡", "现金", "证券账户", "其他"];
const WEIGHT_RANGES = [
  [7, "近 7 天"],
  [30, "近 30 天"],
  [0, "全部"],
];

let ageTimer = 0;
let weightRange = 30;
let ledgerOptions = {};
let ledgerState = {
  month: monthStart(new Date()),
  query: "",
  type: "",
  group: "",
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateTimeValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(value, amount) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function sameMonth(value, month) {
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function monthLabel(month) {
  return `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;
}

function dateTimeLabel(value, withYear = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const options = {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (withYear) options.year = "numeric";
  return date.toLocaleString("zh-CN", options);
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function addYearsClamped(value, years) {
  const date = new Date(value);
  const month = date.getMonth();
  const day = date.getDate();
  date.setFullYear(date.getFullYear() + years, month, 1);
  const lastDay = new Date(date.getFullYear(), month + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

function addMonthsClamped(value, months) {
  const date = new Date(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

function ageParts(birthValue, nowValue = new Date()) {
  const birth = new Date(birthValue);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (!Number.isFinite(birth.getTime()) || birth > now) return null;

  let years = now.getFullYear() - birth.getFullYear();
  let anchor = addYearsClamped(birth, years);
  if (anchor > now) {
    years -= 1;
    anchor = addYearsClamped(birth, years);
  }

  let months = 0;
  while (months < 11) {
    const next = addMonthsClamped(anchor, months + 1);
    if (next > now) break;
    months += 1;
  }
  const monthAnchor = addMonthsClamped(anchor, months);
  const remaining = Math.max(0, now.getTime() - monthAnchor.getTime());
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return { years, months, days, hours, minutes, seconds };
}

function nextBirthday(birthValue, nowValue = new Date()) {
  const birth = new Date(birthValue);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  let next = addYearsClamped(birth, now.getFullYear() - birth.getFullYear());
  if (next < now) next = addYearsClamped(birth, now.getFullYear() - birth.getFullYear() + 1);
  const remaining = Math.max(0, next.getTime() - now.getTime());
  return {
    date: next,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
  };
}

function weightViewData(items) {
  if (!weightRange) return items;
  const cutoff = Date.now() - weightRange * 86400000;
  return items.filter(item => new Date(item.at).getTime() >= cutoff);
}

function weightSummary(items) {
  const newest = items[0];
  const previous = items[1];
  if (!newest) return { newest: null, change: null, total: null };
  return {
    newest,
    change: previous ? newest.kg - previous.kg : null,
    total: items.length > 1 ? newest.kg - items[items.length - 1].kg : null,
  };
}

function deltaMarkup(value, suffix = " kg") {
  if (value === null) return '<span class="life-delta is-neutral">等待下一次记录</span>';
  if (Math.abs(value) < 0.05) return '<span class="life-delta is-neutral">与上次持平</span>';
  const direction = value > 0 ? "增加" : "减少";
  return `<span class="life-delta ${value > 0 ? "is-up" : "is-down"}">${direction} ${Math.abs(value).toFixed(1)}${suffix}</span>`;
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return path;
}

function weightChartMarkup(items) {
  if (!items.length) {
    return '<div class="life-empty-chart"><span>' + icon("activity") + '</span><b>还没有这一时段的体重</b><p>记下第一次体重，曲线会从这里开始。</p></div>';
  }
  const sorted = items.slice().sort((left, right) => left.at.localeCompare(right.at));
  const width = 760;
  const height = 220;
  const leftPad = 50;
  const rightPad = 20;
  const topPad = 24;
  const bottomPad = 38;
  const values = sorted.map(item => item.kg);
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (minimum === maximum) {
    minimum -= 1;
    maximum += 1;
  } else {
    const margin = Math.max(0.5, (maximum - minimum) * 0.18);
    minimum -= margin;
    maximum += margin;
  }
  const x = index => sorted.length === 1
    ? width / 2
    : leftPad + index * ((width - leftPad - rightPad) / (sorted.length - 1));
  const y = value => topPad + ((maximum - value) / (maximum - minimum)) * (height - topPad - bottomPad);
  const points = sorted.map((item, index) => [x(index), y(item.kg)]);
  const line = smoothPath(points);
  const area = points.length > 1
    ? `${line} L ${points.at(-1)[0]} ${height - bottomPad} L ${points[0][0]} ${height - bottomPad} Z`
    : "";
  const gridLines = [0, 0.5, 1].map(ratio => {
    const yPosition = topPad + ratio * (height - topPad - bottomPad);
    const label = maximum - ratio * (maximum - minimum);
    return `<line x1="${leftPad}" y1="${yPosition}" x2="${width - rightPad}" y2="${yPosition}"></line><text x="${leftPad - 9}" y="${yPosition + 4}" text-anchor="end">${label.toFixed(1)}</text>`;
  }).join("");
  const labelIndexes = [...new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1])];
  const dateLabels = labelIndexes.map(index => {
    const date = new Date(sorted[index].at);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    return `<text x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === sorted.length - 1 ? "end" : "middle"}">${label}</text>`;
  }).join("");
  const circles = sorted.map((item, index) =>
    `<circle class="weight-dot" cx="${points[index][0]}" cy="${points[index][1]}" r="4.5"><title>${escapeHTML(dateTimeLabel(item.at))} · ${item.kg.toFixed(1)} kg</title></circle>`,
  ).join("");
  return `<svg class="weight-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="体重变化曲线，共 ${items.length} 次记录">
    <defs><linearGradient id="weight-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e8062" stop-opacity=".23"></stop><stop offset="1" stop-color="#2e8062" stop-opacity=".01"></stop></linearGradient></defs>
    <g class="weight-grid">${gridLines}</g>
    ${area ? `<path class="weight-area" d="${area}"></path>` : ""}
    <path class="weight-line" d="${line}"></path>
    <g class="weight-dots">${circles}</g>
    <g class="weight-dates">${dateLabels}</g>
  </svg>`;
}

function birthdayText(birthAt) {
  const next = nextBirthday(birthAt);
  return {
    date: next.date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }),
    countdown: `${next.days} 天 ${pad(next.hours)}:${pad(next.minutes)}:${pad(next.seconds)}`,
  };
}

function updateAgeDisplay(profile) {
  const calendar = document.querySelector("#life-age-calendar");
  const clock = document.querySelector("#life-age-clock");
  const birthday = document.querySelector("#life-birthday-countdown");
  if (!profile || !calendar || !clock || !birthday) return;
  const parts = ageParts(profile.birthAt);
  if (!parts) {
    calendar.textContent = "出生时间晚于此刻";
    clock.textContent = "00:00:00";
    birthday.textContent = "请检查出生日期";
    return;
  }
  calendar.textContent = `${parts.years} 年 ${parts.months} 个月 ${parts.days} 天`;
  clock.textContent = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
  const next = birthdayText(profile.birthAt);
  birthday.textContent = `${next.date} · ${next.countdown}`;
}

function stopAgeTimer() {
  if (ageTimer) clearInterval(ageTimer);
  ageTimer = 0;
}

function renderWellnessPage(root, options = {}) {
  stopAgeTimer();
  const profile = getLifeProfile();
  const weights = listWeights();
  const visibleWeights = weightViewData(weights);
  const summary = weightSummary(weights);
  const age = profile ? ageParts(profile.birthAt) : null;
  const birthday = profile ? birthdayText(profile.birthAt) : null;
  const ageCalendar = age
    ? `${age.years} 年 ${age.months} 个月 ${age.days} 天`
    : "还没有设置出生时间";
  const ageClock = age
    ? `${pad(age.hours)}:${pad(age.minutes)}:${pad(age.seconds)}`
    : "—";

  root.innerHTML = `<div class="life-page wellness-page">
    <header class="life-page-head">
      <div><p class="life-eyebrow">BODY &amp; TIME</p><h1>身体与时间</h1><p>把体重变化和正在流逝的时间，安静地留在这里。</p></div>
      <button class="life-soft-button" type="button" data-life-jump="weight-form">${icon("plus")}记体重</button>
    </header>

    <section class="life-age-card">
      <div class="life-age-main">
        <span class="life-live-pulse" aria-hidden="true"></span>
        <p class="life-card-kicker">此刻的我</p>
        <strong id="life-age-calendar">${escapeHTML(ageCalendar)}</strong>
        <div class="life-age-clock-row"><span>加上</span><b id="life-age-clock">${escapeHTML(ageClock)}</b></div>
        <p class="life-birthday-line">下次生日 <span id="life-birthday-countdown">${birthday ? escapeHTML(`${birthday.date} · ${birthday.countdown}`) : "设置出生日期后显示"}</span></p>
      </div>
      <form class="life-birth-form" id="life-profile-form">
        <label for="life-birth-at">出生日期与时间</label>
        <input id="life-birth-at" name="birthAt" type="datetime-local" step="1" required value="${profile ? escapeHTML(localDateTimeValue(profile.birthAt)) : ""}">
        <button class="primary" type="submit">${icon("clock")}${profile ? "更新出生时间" : "保存出生时间"}</button>
        <small>保存后会按年月日、时分秒实时更新。</small>
      </form>
    </section>

    <section class="life-metric-grid" aria-label="体重摘要">
      <article class="life-metric-card is-primary"><span>最新体重</span><strong>${summary.newest ? summary.newest.kg.toFixed(1) + " <small>kg</small>" : "—"}</strong><em>${summary.newest ? escapeHTML(dateTimeLabel(summary.newest.at)) : "等待第一次记录"}</em></article>
      <article class="life-metric-card"><span>较上次</span><strong>${summary.change === null ? "—" : (summary.change > 0 ? "+" : "") + summary.change.toFixed(1) + " <small>kg</small>"}</strong><em>${deltaMarkup(summary.change)}</em></article>
      <article class="life-metric-card"><span>累计变化</span><strong>${summary.total === null ? "—" : (summary.total > 0 ? "+" : "") + summary.total.toFixed(1) + " <small>kg</small>"}</strong><em>${summary.total === null ? "至少需要两次记录" : summary.total > 0 ? "从最早记录至今增加" : "从最早记录至今减少"}</em></article>
    </section>

    <div class="life-content-grid">
      <section class="life-panel life-chart-panel">
        <header class="life-panel-head"><div><p>WEIGHT TREND</p><h2>体重变化</h2></div><div class="life-range-tabs" role="group" aria-label="体重曲线时间范围">${WEIGHT_RANGES.map(([days, label]) => `<button type="button" data-weight-range="${days}" aria-pressed="${weightRange === days}">${label}</button>`).join("")}</div></header>
        ${weightChartMarkup(visibleWeights)}
        <footer class="life-chart-foot"><span>${visibleWeights.length ? `这一时期共 ${visibleWeights.length} 次记录` : "曲线会随每次记录自动更新"}</span><span>单位 · 公斤</span></footer>
      </section>

      <form class="life-panel life-weight-form" id="weight-form">
        <header class="life-panel-head"><div><p>NEW CHECK-IN</p><h2>记一次体重</h2></div><span class="life-form-icon">${icon("activity")}</span></header>
        <label class="life-field"><span>记录时间</span><input name="at" type="datetime-local" step="1" required value="${escapeHTML(localDateTimeValue())}"></label>
        <label class="life-field"><span>体重（公斤）</span><div class="life-number-field"><input name="kg" type="number" min="20" max="500" step="0.1" inputmode="decimal" required placeholder="例如 65.5"><b>kg</b></div></label>
        <label class="life-field"><span>备注 <small>选填</small></span><input name="note" maxlength="300" placeholder="晨起、运动后或其他状态"></label>
        <button class="primary life-wide-button" type="submit">${icon("plus")}保存体重</button>
      </form>
    </div>

    <section class="life-panel life-history-panel">
      <header class="life-panel-head"><div><p>HISTORY</p><h2>体重记录</h2></div><span class="life-count-badge">${weights.length} 次</span></header>
      <div class="life-weight-list">${weights.length ? weights.map(item => `<article class="life-weight-row" data-weight-id="${item.id}"><time datetime="${item.at}">${escapeHTML(dateTimeLabel(item.at))}</time><strong>${item.kg.toFixed(1)} <small>kg</small></strong><p>${escapeHTML(item.note || "没有备注")}</p><button type="button" class="life-icon-button" data-delete-weight="${item.id}" aria-label="删除 ${item.kg.toFixed(1)} 公斤记录" title="删除">${icon("trash")}</button></article>`).join("") : '<div class="life-empty-row">还没有体重记录。第一次记录后，趋势和变化会从这里开始。</div>'}</div>
    </section>
  </div>`;

  const notify = message => {
    if (typeof options.notify === "function") options.notify(message);
  };
  const confirmAction = typeof options.confirmAction === "function"
    ? options.confirmAction
    : (title, body) => Promise.resolve(window.confirm(`${title}\n${body}`));

  root.querySelector("#life-profile-form").addEventListener("submit", event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("birthAt");
    try {
      saveLifeProfile({ birthAt: new Date(String(value)).toISOString() });
      notify("出生时间已保存，年龄会实时更新");
      renderWellnessPage(root, options);
    } catch (error) {
      notify(error instanceof Error ? error.message : "出生时间保存失败");
    }
  });

  root.querySelector("#weight-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const record = saveWeight({
        at: new Date(String(data.get("at"))).toISOString(),
        kg: data.get("kg"),
        note: data.get("note"),
      });
      notify(`已记录 ${record.kg.toFixed(1)} kg`);
      renderWellnessPage(root, options);
    } catch (error) {
      notify(error instanceof Error ? error.message : "体重保存失败");
    }
  });

  root.querySelectorAll("[data-weight-range]").forEach(button => {
    button.addEventListener("click", () => {
      weightRange = Number(button.dataset.weightRange);
      renderWellnessPage(root, options);
    });
  });

  root.querySelectorAll("[data-delete-weight]").forEach(button => {
    button.addEventListener("click", async () => {
      const item = listWeights().find(record => record.id === button.dataset.deleteWeight);
      if (!item) return;
      const confirmed = await confirmAction(
        "删除这条体重记录？",
        `${dateTimeLabel(item.at)} · ${item.kg.toFixed(1)} kg。删除后曲线会立即更新。`,
      );
      if (!confirmed) return;
      try {
        deleteWeight(item.id);
        notify("体重记录已删除");
        renderWellnessPage(root, options);
      } catch {
        notify("删除失败，请稍后重试");
      }
    });
  });

  const jump = root.querySelector("[data-life-jump]");
  if (jump) jump.addEventListener("click", () => {
    const form = root.querySelector(`#${jump.dataset.lifeJump}`);
    form?.scrollIntoView({ behavior: "smooth", block: "center" });
    form?.querySelector("input")?.focus({ preventScroll: true });
  });

  if (profile) {
    updateAgeDisplay(profile);
    ageTimer = setInterval(() => updateAgeDisplay(profile), 1000);
  }
}

function ledgerRecordMatches(record, { query, type, group }) {
  if (type && record.type !== type) return false;
  if (group && ledgerCategoryGroup(record.type, record.category) !== group) return false;
  if (!query) return true;
  const haystack = [
    record.category,
    ledgerCategoryGroup(record.type, record.category),
    record.account,
    record.payee,
    record.note,
    ...record.tags,
    record.type === "income" ? "收入" : "支出",
  ].join(" ").toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

function quickLedgerCountToday(id) {
  const now = new Date();
  return listLedger().filter(item => {
    if (item.quickLedgerId !== id) return false;
    const at = new Date(item.at);
    return at.getFullYear() === now.getFullYear()
      && at.getMonth() === now.getMonth()
      && at.getDate() === now.getDate();
  }).length;
}

function quickLedgerCardsMarkup(items, { home = false } = {}) {
  return items.map(item => {
    const today = quickLedgerCountToday(item.id);
    const detail = [item.category, item.account].filter(Boolean).join(" · ");
    const amount = `${item.type === "income" ? "+" : "−"}${money(item.amount)}`;
    return `<article class="ledger-quick-item${home ? " is-home" : ""}" data-quick-template-id="${item.id}">
      <button type="button" class="ledger-quick-run" data-run-quick-ledger="${item.id}" aria-label="快捷记账：${escapeHTML(item.name)}，${amount}">
        <span class="ledger-quick-icon is-${item.type}">${icon(item.type === "income" ? "trendUp" : "wallet")}</span>
        <span class="ledger-quick-copy"><b>${escapeHTML(item.name)}</b><small>${escapeHTML(detail)}</small></span>
        <strong class="is-${item.type}">${amount}</strong>
        <em>${today ? `今日 ${today} 次` : "点一下就记"}</em>
      </button>
      ${home ? "" : `<div class="ledger-quick-actions">
        <button type="button" data-edit-quick-ledger="${item.id}" title="编辑快捷记账" aria-label="编辑 ${escapeHTML(item.name)}">${icon("pen")}</button>
        <button type="button" data-delete-quick-ledger="${item.id}" title="删除快捷记账" aria-label="删除 ${escapeHTML(item.name)}">${icon("trash")}</button>
      </div>`}
    </article>`;
  }).join("");
}

function runQuickLedger(template) {
  return saveLedger({
    quickLedgerId: template.id,
    type: template.type,
    amount: template.amount,
    category: template.category,
    account: template.account,
    payee: template.payee || template.name,
    note: template.note,
    tags: template.tags,
    at: new Date().toISOString(),
  });
}

export function renderHomeLedgerQuick(root, options = {}) {
  if (!root) return;
  const items = listQuickLedger();
  root.innerHTML = `<div class="home-ledger-quick-head">
    <div><span>${icon("wallet")}</span><b>快捷记账</b></div>
    <button type="button" data-home-ledger-manage="${items.length ? "add" : "empty"}">${items.length ? "管理" : "去设置"}</button>
  </div>
  ${items.length
    ? `<div class="home-ledger-quick-grid">${quickLedgerCardsMarkup(items, { home: true })}</div>
      <p class="home-ledger-quick-foot">点一下会按当前时间自动入账</p>`
    : `<div class="home-ledger-quick-empty">
        <p>把上班地铁、下班地铁设成一键账目</p>
        <button type="button" data-home-ledger-manage="empty">${icon("plus")}设置快捷记账</button>
      </div>`}`;

  root.querySelectorAll("[data-home-ledger-manage]").forEach(button => {
    button.addEventListener("click", () => {
      if (typeof options.navigate === "function") options.navigate("ledger");
    });
  });
  root.querySelectorAll("[data-run-quick-ledger]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const template = listQuickLedger().find(item => item.id === button.dataset.runQuickLedger);
      if (!template) {
        renderHomeLedgerQuick(root, options);
        return;
      }
      button.disabled = true;
      try {
        runQuickLedger(template);
        options.notify?.(`已记「${template.name}」 ${money(template.amount)}`);
        renderHomeLedgerQuick(root, options);
      } catch (error) {
        button.disabled = false;
        options.notify?.(error instanceof Error ? error.message : "快捷记账失败");
      }
    });
  });
}

function fillQuickLedgerForm(root, record = null) {
  const form = root.querySelector("#quick-ledger-form");
  if (!form) return;
  const type = record?.type || "expense";
  form.hidden = false;
  form.querySelector('[name="id"]').value = record?.id || "";
  form.querySelector('[name="name"]').value = record?.name || "";
  form.querySelector('[name="amount"]').value = record?.amount ?? "";
  form.querySelector('[name="payee"]').value = record?.payee || "";
  form.querySelector('[name="note"]').value = record?.note || "";
  form.querySelector('[name="tags"]').value = record?.tags?.join(" ") || "";
  form.querySelectorAll("[data-quick-type]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.quickType === type));
  });
  const category = form.querySelector('[name="category"]');
  setCategoryOptions(category, type, record?.category);
  form.querySelector('[name="account"]').value = record?.account || "微信";
  form.querySelector(".quick-ledger-form-title").textContent = record ? "编辑快捷账目" : "新建快捷账目";
  form.querySelector('[type="submit"]').innerHTML = `${icon("check")}${record ? "保存修改" : "保存快捷"}`;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.querySelector('[name="name"]')?.focus({ preventScroll: true });
}

function bindQuickLedgerPanel(root, options) {
  const panel = root.querySelector(".ledger-quick-panel");
  if (!panel) return;
  const form = panel.querySelector("#quick-ledger-form");
  const notify = message => options.notify?.(message);

  panel.querySelectorAll("[data-new-quick-ledger]").forEach(button => {
    button.addEventListener("click", () => fillQuickLedgerForm(root));
  });
  panel.querySelectorAll("[data-cancel-quick-ledger]").forEach(button => {
    button.addEventListener("click", () => {
      form.hidden = true;
      form.reset();
    });
  });
  panel.querySelectorAll("[data-ledger-quick-manage]").forEach(button => {
    button.addEventListener("click", () => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      fillQuickLedgerForm(root);
    });
  });
  form.querySelectorAll("[data-quick-type]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") return;
      const type = button.dataset.quickType;
      form.querySelectorAll("[data-quick-type]").forEach(item => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      const category = form.querySelector('[name="category"]');
      setCategoryOptions(category, type);
    });
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const type = form.querySelector('[data-quick-type][aria-pressed="true"]')?.dataset.quickType;
    try {
      const editing = Boolean(data.get("id"));
      saveQuickLedger({
        id: data.get("id") || undefined,
        name: data.get("name"),
        type,
        amount: data.get("amount"),
        category: data.get("category"),
        account: data.get("account"),
        payee: data.get("payee"),
        note: data.get("note"),
        tags: data.get("tags"),
      });
      notify(editing ? "快捷账目已更新" : "快捷账目已创建，可从首页一键入账");
      renderLedgerPage(root, options);
    } catch (error) {
      notify(error instanceof Error ? error.message : "快捷账目保存失败");
    }
  });

  panel.querySelectorAll("[data-run-quick-ledger]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const template = listQuickLedger().find(item => item.id === button.dataset.runQuickLedger);
      if (!template) {
        renderLedgerPage(root, options);
        return;
      }
      button.disabled = true;
      try {
        runQuickLedger(template);
        ledgerState.month = monthStart(new Date());
        notify(`已记「${template.name}」 ${money(template.amount)}`);
        renderLedgerPage(root, options);
      } catch (error) {
        button.disabled = false;
        notify(error instanceof Error ? error.message : "快捷记账失败");
      }
    });
  });
  panel.querySelectorAll("[data-edit-quick-ledger]").forEach(button => {
    button.addEventListener("click", () => {
      const record = listQuickLedger().find(item => item.id === button.dataset.editQuickLedger);
      if (record) fillQuickLedgerForm(root, record);
    });
  });
  panel.querySelectorAll("[data-delete-quick-ledger]").forEach(button => {
    button.addEventListener("click", async () => {
      const record = listQuickLedger().find(item => item.id === button.dataset.deleteQuickLedger);
      if (!record) return;
      const confirmAction = typeof options.confirmAction === "function"
        ? options.confirmAction
        : (title, body) => Promise.resolve(window.confirm(`${title}\n${body}`));
      const confirmed = await confirmAction(
        "删除这个快捷账目？",
        `「${record.name}」的快捷按钮会被删除，已经记下的账目会保留。`,
      );
      if (!confirmed) return;
      deleteQuickLedger(record.id);
      notify("快捷账目已删除");
      renderLedgerPage(root, options);
    });
  });
}

function ledgerSummary(items) {
  return items.reduce((summary, item) => {
    if (item.type === "income") summary.income += item.amount;
    else summary.expenses += item.amount;
    summary.count += 1;
    return summary;
  }, { income: 0, expenses: 0, count: 0, balance: 0 });
}

function categoryBreakdown(items) {
  const totals = new Map();
  for (const item of items) {
    const group = ledgerCategoryGroup(item.type, item.category);
    totals.set(group, (totals.get(group) || 0) + item.amount);
  }
  const maximum = Math.max(1, ...totals.values());
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([category, total]) => ({ category, total, ratio: total / maximum }));
}

function categoryOptionsMarkup(type, selected) {
  const groups = ledgerCategories[type];
  const known = Object.entries(groups).some(([group, items]) =>
    group === selected || items.includes(selected)
  );
  const oldCategory = selected && !known
    ? `<option value="${escapeHTML(selected)}">${escapeHTML(selected)}</option>`
    : "";
  const grouped = Object.entries(groups).map(([group, items]) =>
    `<optgroup label="${group}">${[group, ...items].map(item =>
      `<option value="${item}">${item}</option>`
    ).join("")}</optgroup>`
  ).join("");
  return oldCategory + grouped;
}

function setCategoryOptions(select, type, selected = Object.keys(ledgerCategories[type])[0]) {
  select.innerHTML = categoryOptionsMarkup(type, selected);
  select.value = selected;
}

function ledgerCategoryField(kind) {
  return `<div class="life-field ledger-category-field">
    <div><label for="${kind}-category">分类</label>
      <button type="button" class="ledger-project-trigger" aria-haspopup="dialog" data-ledger-projects>常用项目</button>
    </div>
    <select name="category" id="${kind}-category">${categoryOptionsMarkup("expense")}</select>
  </div>`;
}

function bindLedgerProjects(root) {
  const picker = root.querySelector("#ledger-project-picker");
  const search = picker.querySelector("#ledger-project-search");
  const groupSelect = picker.querySelector("#ledger-project-group");
  const results = picker.querySelector("#ledger-project-results");
  const types = picker.querySelectorAll("[data-project-type]");
  let form, originalType, type;

  function renderProjects() {
    const query = search.value.trim().toLocaleLowerCase();
    const sections = Object.entries(ledgerCategories[type]).flatMap(([group, items]) => {
      if (groupSelect.value && groupSelect.value !== group) return [];
      const matching = items.filter(item =>
        [group, item, ledgerCategoryAliases[item] || ""].join(" ").toLocaleLowerCase().includes(query)
      );
      if (!matching.length) return [];
      return [`<section class="ledger-project-group"><h3>${group}</h3><div>
        ${matching.map(item => `<button type="button" data-project-category="${item}">${item}</button>`).join("")}
      </div></section>`];
    });
    results.innerHTML = sections.join("") || '<p>没找到项目，试试更短的关键词或切换场景。</p>';
    results.scrollTop = 0;
  }

  function setType(next) {
    type = next;
    types.forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.projectType === type))
    );
    groupSelect.innerHTML = '<option value="">全部场景</option>' +
      Object.keys(ledgerCategories[type]).map(group => `<option>${group}</option>`).join("");
    renderProjects();
  }

  root.querySelectorAll("[data-ledger-projects]").forEach(button => {
    button.onclick = () => {
      form = button.closest("form");
      const buttons = form.querySelectorAll("[data-ledger-type], [data-quick-type]");
      const active = Array.from(buttons).find(item => item.getAttribute("aria-pressed") === "true");
      originalType = active.dataset.ledgerType || active.dataset.quickType;
      search.value = "";
      setType(originalType);
      picker.showModal();
    };
  });
  types.forEach(button => button.onclick = () => setType(button.dataset.projectType));
  search.oninput = renderProjects;
  groupSelect.onchange = renderProjects;
  picker.querySelector("[data-close-projects]").onclick = () => picker.close();
  results.onclick = event => {
    const button = event.target.closest("[data-project-category]");
    if (!button) return;
    const category = button.dataset.projectCategory;
    if (type !== originalType) {
      form.querySelector(`[data-ledger-type="${type}"], [data-quick-type="${type}"]`).click();
    }
    form.elements.category.value = category;
    const name = form.elements.namedItem("name");
    if (name && !name.value.trim()) name.value = category;
    picker.close();
    const amount = form.elements.amount;
    (amount.value ? form.elements.category : amount).focus();
  };
}

function ledgerRowsMarkup(items) {
  if (!items.length) {
    return `<div class="ledger-empty">
      <span>${icon("wallet")}</span>
      <b>${ledgerState.query || ledgerState.type || ledgerState.group ? "没有符合条件的账目" : "这个月还没有记账"}</b>
      <p>${ledgerState.query || ledgerState.type || ledgerState.group ? "换个关键词或筛选条件试试。" : "记录一笔收支，月度汇总和分类统计会自动生成。"}</p>
    </div>`;
  }
  return items.map(item => `<article class="ledger-row" data-ledger-id="${item.id}">
    <div class="ledger-date"><strong>${String(new Date(item.at).getDate()).padStart(2, "0")}</strong><span>${new Date(item.at).toLocaleDateString("zh-CN", { weekday: "short" })}</span></div>
    <div class="ledger-main">
      <div class="ledger-title-line"><span class="ledger-type-dot is-${item.type}"></span><b>${escapeHTML(item.payee || item.category)}</b><span class="ledger-category">${escapeHTML(item.category)}</span>${item.tags.map(tag => `<span class="ledger-tag">#${escapeHTML(tag)}</span>`).join("")}</div>
      <p>${escapeHTML(item.note || `${item.account} · 没有备注`)}</p>
      <small>${escapeHTML(dateTimeLabel(item.at))} · ${escapeHTML(item.account)}</small>
    </div>
    <strong class="ledger-amount is-${item.type}">${item.type === "income" ? "+" : "−"}${money(item.amount)}</strong>
    <div class="ledger-actions"><button type="button" data-edit-ledger="${item.id}" aria-label="编辑这笔账" title="编辑">${icon("pen")}</button><button type="button" data-delete-ledger="${item.id}" aria-label="删除这笔账" title="删除">${icon("trash")}</button></div>
  </article>`).join("");
}

function updateLedgerRows(root) {
  const all = listLedger().filter(item => sameMonth(item.at, ledgerState.month));
  const filtered = all.filter(item => ledgerRecordMatches(item, ledgerState));
  const target = root.querySelector("#ledger-rows");
  if (target) target.innerHTML = ledgerRowsMarkup(filtered);
  const count = root.querySelector("#ledger-filter-count");
  if (count) count.textContent = filtered.length === all.length ? `${all.length} 笔` : `${filtered.length} / ${all.length} 笔`;
  bindLedgerRowActions(root);
}

function ledgerCategoryMarkup(items) {
  const expenses = items.filter(item => item.type === "expense");
  const categories = categoryBreakdown(expenses);
  if (!categories.length) {
    return '<div class="ledger-category-empty">本月还没有支出分类数据。</div>';
  }
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  return categories.map(item => `<div class="ledger-category-row"><div><span>${escapeHTML(item.category)}</span><b>${money(item.total)}</b></div><div class="ledger-category-bar"><i style="width:${Math.max(4, item.ratio * 100).toFixed(1)}%"></i></div><small>${total ? (item.total / total * 100).toFixed(1) : "0.0"}%</small></div>`).join("");
}

function fillLedgerForm(root, record) {
  const form = root.querySelector("#ledger-form");
  if (!form) return;
  const data = record || null;
  form.querySelector('[name="id"]').value = data?.id || "";
  form.querySelector('[name="amount"]').value = data?.amount ?? "";
  form.querySelector('[name="at"]').value = localDateTimeValue(data ? new Date(data.at) : new Date());
  form.querySelector('[name="payee"]').value = data?.payee || "";
  form.querySelector('[name="note"]').value = data?.note || "";
  form.querySelector('[name="tags"]').value = data?.tags?.join(" ") || "";
  form.querySelector('[name="account"]').value = data?.account || "微信";
  const type = data?.type || "expense";
  form.querySelectorAll("[data-ledger-type]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.ledgerType === type));
  });
  setCategoryOptions(form.elements.category, type, data?.category);
  form.classList.toggle("is-editing", Boolean(data));
  form.querySelector(".ledger-form-title").textContent = data ? "编辑账目" : "记一笔";
  form.querySelector('[type="submit"]').innerHTML = data
    ? icon("check") + "保存修改"
    : icon("plus") + "保存账目";
  form.querySelector("[data-cancel-ledger-edit]").hidden = !data;
}

function bindLedgerRowActions(root) {
  root.querySelectorAll("[data-edit-ledger]").forEach(button => {
    button.onclick = () => {
      const record = listLedger().find(item => item.id === button.dataset.editLedger);
      if (!record) return;
      fillLedgerForm(root, record);
      root.querySelector("#ledger-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      root.querySelector('#ledger-form [name="amount"]')?.focus({ preventScroll: true });
    };
  });
  root.querySelectorAll("[data-delete-ledger]").forEach(button => {
    button.onclick = async () => {
      const record = listLedger().find(item => item.id === button.dataset.deleteLedger);
      if (!record) return;
      const confirmAction = typeof ledgerOptions.confirmAction === "function"
        ? ledgerOptions.confirmAction
        : (title, body) => Promise.resolve(window.confirm(`${title}\n${body}`));
      const confirmed = await confirmAction(
        "删除这笔账？",
        `${record.payee || record.category} · ${money(record.amount)}。删除后汇总会立即重算。`,
      );
      if (!confirmed) return;
      try {
        deleteLedger(record.id);
        ledgerOptions.notify?.("账目已删除");
        renderLedgerPage(root, ledgerOptions);
      } catch {
        ledgerOptions.notify?.("删除失败，请稍后重试");
      }
    };
  });
}

function downloadLedgerCsv(items, filename) {
  const safeCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["时间", "收支", "金额（元）", "分类", "账户/支付方式", "商户或对方", "备注", "标签"],
    ...items.slice().sort((left, right) => left.at.localeCompare(right.at)).map(item => [
      dateTimeLabel(item.at),
      item.type === "income" ? "收入" : "支出",
      item.amount.toFixed(2),
      item.category,
      item.account,
      item.payee,
      item.note,
      item.tags.join(" "),
    ]),
  ];
  const csv = "\ufeff" + rows.map(row => row.map(safeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderLedgerPage(root, options = {}) {
  ledgerOptions = options;
  const allItems = listLedger();
  const quickItems = listQuickLedger();
  const monthItems = allItems.filter(item => sameMonth(item.at, ledgerState.month));
  const summary = ledgerSummary(monthItems);
  summary.balance = summary.income - summary.expenses;

  const usedGroups = [...new Set(allItems.map(item => ledgerCategoryGroup(item.type, item.category)))];
  if (!usedGroups.includes(ledgerState.group)) ledgerState.group = "";
  const filtered = monthItems.filter(item => ledgerRecordMatches(item, ledgerState));
  const groupOptions = usedGroups.sort((a, b) => a.localeCompare(b, "zh-CN")).map(group =>
    `<option value="${escapeHTML(group)}"${group === ledgerState.group ? " selected" : ""}>${escapeHTML(group)}</option>`
  ).join("");

  root.innerHTML = `<div class="life-page ledger-page">
    <header class="life-page-head ledger-page-head">
      <div><p class="life-eyebrow">MONEY &amp; RHYTHM</p><h1>生活账本</h1><p>每一笔收入和支出，都留下时间、来源与用途。</p></div>
      <div class="ledger-head-actions"><button type="button" class="life-soft-button ledger-stock-link" data-view="portfolio">${icon("activity")}股票持仓</button><button type="button" class="life-soft-button" data-export-ledger="month">${icon("download")}导出本月</button><button type="button" class="life-soft-button" data-export-ledger="all">导出全部</button></div>
    </header>

    <section class="ledger-monthbar">
      <button type="button" data-ledger-month="-1" aria-label="上个月">${icon("chevronL")}</button>
      <div><p>MONTHLY LEDGER</p><strong>${monthLabel(ledgerState.month)}</strong></div>
      <button type="button" data-ledger-month="1" aria-label="下个月">${icon("chevronR")}</button>
    </section>

    <section class="ledger-summary-grid" aria-label="本月收支汇总">
      <article><span class="ledger-summary-icon is-income">${icon("trendUp")}</span><div><small>本月收入</small><strong>${money(summary.income)}</strong></div></article>
      <article><span class="ledger-summary-icon is-expense">${icon("trendDown")}</span><div><small>本月支出</small><strong>${money(summary.expenses)}</strong></div></article>
      <article class="is-balance"><span class="ledger-summary-icon">${icon("wallet")}</span><div><small>本月结余</small><strong class="${summary.balance < 0 ? "is-negative" : ""}">${money(summary.balance)}</strong></div></article>
      <article><span class="ledger-summary-icon is-count">${icon("list")}</span><div><small>记录笔数</small><strong>${summary.count}<em> 笔</em></strong></div></article>
    </section>

    <section class="life-panel ledger-quick-panel" aria-labelledby="quick-ledger-title">
      <header class="life-panel-head ledger-quick-head">
        <div><p>ONE-TAP LEDGER</p><h2 id="quick-ledger-title">快捷记账 <span>${quickItems.length} 个</span></h2></div>
        <button class="life-soft-button" type="button" data-new-quick-ledger>${icon("plus")}新建快捷</button>
      </header>
      ${quickItems.length
        ? `<div class="ledger-quick-grid">${quickLedgerCardsMarkup(quickItems)}</div>`
        : `<div class="ledger-quick-empty">
            <span>${icon("zap")}</span>
            <div><b>把每天重复的账目变成一键按钮</b><p>例如“上班地铁 2.70 元”和“下班地铁 2.70 元”，设好后可在首页直接点击入账。</p></div>
            <button type="button" data-ledger-quick-manage>${icon("plus")}设置第一个快捷</button>
          </div>`}
      <form class="quick-ledger-form" id="quick-ledger-form" autocomplete="off" hidden>
        <header>
          <div><p>QUICK ENTRY SETTINGS</p><h3 class="quick-ledger-form-title">新建快捷账目</h3></div>
          <button type="button" data-cancel-quick-ledger>取消</button>
        </header>
        <input type="hidden" name="id">
        <div class="quick-ledger-form-grid">
          <label class="life-field"><span>快捷名称</span><input name="name" maxlength="24" required placeholder="例如：上班地铁"></label>
          <label class="life-field"><span>金额</span><div class="life-number-field"><input name="amount" type="number" min="0.01" max="1000000000000" step="0.01" inputmode="decimal" required placeholder="0.00"><b>元</b></div></label>
          <div class="life-field">
            <span>收支类型</span>
            <div class="quick-ledger-type" role="group" aria-label="快捷账目收支类型">
              <button type="button" data-quick-type="expense" aria-pressed="true">支出</button>
              <button type="button" data-quick-type="income" aria-pressed="false">收入</button>
            </div>
          </div>
          ${ledgerCategoryField("quick-ledger")}
          <label class="life-field"><span>账户或支付方式</span><select name="account">${ACCOUNTS.map(value => `<option value="${value}">${value}</option>`).join("")}</select></label>
          <label class="life-field"><span>商户或对方 <small>选填</small></span><input name="payee" maxlength="80" placeholder="例如：地铁"></label>
          <label class="life-field is-wide"><span>备注 <small>选填</small></span><input name="note" maxlength="500" placeholder="例如：工作日通勤"></label>
          <label class="life-field is-wide"><span>标签 <small>空格或逗号分隔</small></span><input name="tags" maxlength="500" placeholder="例如：通勤 工作日"></label>
        </div>
        <div class="quick-ledger-form-actions">
          <button class="secondary" type="button" data-cancel-quick-ledger>取消</button>
          <button class="primary" type="submit">${icon("plus")}保存快捷</button>
        </div>
      </form>
    </section>

    <div class="ledger-workgrid">
      <form class="life-panel ledger-form" id="ledger-form" autocomplete="off">
        <header class="life-panel-head"><div><p>NEW TRANSACTION</p><h2 class="ledger-form-title">记一笔</h2></div><button type="button" class="ledger-cancel-edit" data-cancel-ledger-edit hidden>取消编辑</button></header>
        <input type="hidden" name="id">
        <div class="ledger-type-toggle" role="group" aria-label="收入或支出">
          <button type="button" data-ledger-type="expense" aria-pressed="true">支出</button>
          <button type="button" data-ledger-type="income" aria-pressed="false">收入</button>
        </div>
        <label class="ledger-amount-field"><span>金额</span><div><b>¥</b><input name="amount" type="number" min="0.01" max="1000000000000" step="0.01" inputmode="decimal" required placeholder="0.00"></div></label>
        <div class="ledger-form-grid">
          <label class="life-field"><span>发生时间</span><input name="at" type="datetime-local" step="1" required value="${escapeHTML(localDateTimeValue())}"></label>
          ${ledgerCategoryField("ledger")}
          <label class="life-field"><span>账户或支付方式</span><select name="account">${ACCOUNTS.map(value => `<option value="${value}">${value}</option>`).join("")}</select></label>
          <label class="life-field"><span>商户或对方</span><input name="payee" maxlength="80" placeholder="例如：早餐店、公司"></label>
        </div>
        <label class="life-field"><span>备注 <small>选填</small></span><textarea name="note" rows="3" maxlength="500" placeholder="这笔钱用在了哪里？"></textarea></label>
        <label class="life-field"><span>标签 <small>空格或逗号分隔，最多 8 个</small></span><input name="tags" maxlength="500" placeholder="例如：日常 工作日 报销"></label>
        <button class="primary life-wide-button" type="submit">${icon("plus")}保存账目</button>
      </form>

      <section class="life-panel ledger-insight-panel">
        <header class="life-panel-head"><div><p>SPENDING MIX</p><h2>支出分类</h2></div><span class="life-form-icon">${icon("chart")}</span></header>
        <div class="ledger-categories">${ledgerCategoryMarkup(monthItems)}</div>
      </section>
    </div>

    <section class="life-panel ledger-list-panel">
      <header class="life-panel-head ledger-list-head"><div><p>TRANSACTIONS</p><h2>本月明细 <span id="ledger-filter-count">${filtered.length === monthItems.length ? `${monthItems.length} 笔` : `${filtered.length} / ${monthItems.length} 笔`}</span></h2></div><div class="ledger-filters"><label><span class="sr-only">搜索账目</span><input type="search" id="ledger-search" value="${escapeHTML(ledgerState.query)}" placeholder="搜索项目、商户或备注">${icon("search")}</label><select id="ledger-type-filter" aria-label="筛选收支类型"><option value="">全部收支</option><option value="expense"${ledgerState.type === "expense" ? " selected" : ""}>只看支出</option><option value="income"${ledgerState.type === "income" ? " selected" : ""}>只看收入</option></select><select id="ledger-group-filter" aria-label="筛选账目分类"><option value="">全部分类</option>${groupOptions}</select></div></header>
      <div id="ledger-rows">${ledgerRowsMarkup(filtered)}</div>
    </section>
    <dialog id="ledger-project-picker" aria-labelledby="ledger-project-title">
      <header class="dialog-head"><h2 id="ledger-project-title">常用记账项目</h2>
        <button type="button" class="icon-btn" aria-label="关闭常用项目" data-close-projects>${icon("x")}</button>
      </header>
      <div class="ledger-project-types" role="group" aria-label="项目收支类型">
        <button type="button" data-project-type="expense" aria-pressed="true">支出</button>
        <button type="button" data-project-type="income" aria-pressed="false">收入</button>
      </div>
      <div class="ledger-project-controls">
        <input type="search" id="ledger-project-search" aria-label="搜索常用项目" placeholder="搜索早饭、通勤…" maxlength="60">
        <select id="ledger-project-group" aria-label="按生活场景筛选"></select>
      </div>
      <div id="ledger-project-results"></div>
    </dialog>
  </div>`;

  const notify = message => {
    if (typeof options.notify === "function") options.notify(message);
  };
  bindQuickLedgerPanel(root, options);
  bindLedgerProjects(root);
  const form = root.querySelector("#ledger-form");

  form.querySelectorAll("[data-ledger-type]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") return;
      const type = button.dataset.ledgerType;
      form.querySelectorAll("[data-ledger-type]").forEach(item => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      const category = form.querySelector('[name="category"]');
      setCategoryOptions(category, type);
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const type = form.querySelector('[data-ledger-type][aria-pressed="true"]')?.dataset.ledgerType;
    const editing = Boolean(data.get("id"));
    try {
      const record = saveLedger({
        id: data.get("id") || undefined,
        type,
        amount: data.get("amount"),
        at: new Date(String(data.get("at"))).toISOString(),
        category: data.get("category"),
        account: data.get("account"),
        payee: data.get("payee"),
        note: data.get("note"),
        tags: data.get("tags"),
      });
      ledgerState.month = monthStart(new Date(record.at));
      notify(editing ? "账目已更新" : "账目已保存");
      renderLedgerPage(root, options);
    } catch (error) {
      notify(error instanceof Error ? error.message : "账目保存失败");
    }
  });

  form.querySelector("[data-cancel-ledger-edit]").addEventListener("click", () => {
    fillLedgerForm(root, null);
    form.querySelector('[name="amount"]')?.focus();
  });

  root.querySelectorAll("[data-ledger-month]").forEach(button => {
    button.addEventListener("click", () => {
      ledgerState.month = shiftMonth(ledgerState.month, Number(button.dataset.ledgerMonth));
      renderLedgerPage(root, options);
    });
  });

  const search = root.querySelector("#ledger-search");
  search.addEventListener("input", () => {
    ledgerState.query = search.value.trim();
    updateLedgerRows(root);
  });
  root.querySelector("#ledger-type-filter").addEventListener("change", event => {
    ledgerState.type = event.currentTarget.value;
    updateLedgerRows(root);
  });

  root.querySelector("#ledger-group-filter").addEventListener("change", event => {
    ledgerState.group = event.currentTarget.value;
    updateLedgerRows(root);
  });

  root.querySelectorAll("[data-export-ledger]").forEach(button => {
    button.addEventListener("click", () => {
      const all = listLedger();
      const items = button.dataset.exportLedger === "all"
        ? all
        : all.filter(item => sameMonth(item.at, ledgerState.month));
      if (!items.length) {
        notify("当前没有可以导出的账目");
        return;
      }
      downloadLedgerCsv(
        items,
        button.dataset.exportLedger === "all"
          ? "日迹-全部账目.csv"
          : `日迹-${ledgerState.month.getFullYear()}-${pad(ledgerState.month.getMonth() + 1)}账目.csv`,
      );
      notify(`已导出 ${items.length} 笔账目`);
    });
  });

  bindLedgerRowActions(root);
}

export function stopWellnessTicker() {
  stopAgeTimer();
}

export { renderWellnessPage, renderLedgerPage };

export function focusLedgerRecord(root,item,options={}){
  ledgerState.month=monthStart(new Date(item.at));ledgerState.query='';ledgerState.type='';ledgerState.group='';renderLedgerPage(root,options);
  requestAnimationFrame(()=>root.querySelector('[data-ledger-id="'+CSS.escape(item.id)+'"]')?.scrollIntoView({block:'center'}));
}
