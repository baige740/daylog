import { icon } from "./icons.js";
import { ledgerCategories, ledgerCategoryAliases, ledgerCategoryGroup } from "./ledger-categories.js";
import {
  deleteAnniversary,
  deleteLedger,
  deletePeriod,
  deletePerson,
  deleteQuickLedger,
  deleteWeight,
  getLifeProfile,
  getPeriodSettings,
  getWeightUnit,
  listLedger,
  listPeople,
  listPeriods,
  listQuickLedger,
  listWeights,
  lunarDateLabel,
  lunarToSolar,
  saveAnniversary,
  saveLedger,
  saveLifeProfile,
  savePeriod,
  savePeriodSettings,
  savePerson,
  saveQuickLedger,
  saveWeight,
  saveWeightUnit,
  solarToLunar,
  weightUnitFactor,
} from "./life-data.js";

const ACCOUNTS = ["微信", "支付宝", "银行卡", "现金", "证券账户", "其他"];
const WEIGHT_RANGES = [
  [7, "近 7 天"],
  [30, "近 30 天"],
  [0, "全部"],
];
const LUNAR_MONTHS = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "腊月"];
const LUNAR_DAYS = Array.from({ length: 30 }, (_, index) => [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
][index]);

let ageTimer = 0;
let weightRange = 30;
let periodCalendarMonth = monthStart(new Date());
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

function startOfLocalDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function solarDateLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function agePartsForDate(birthValue, nowValue = new Date()) {
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

function resolveLunarOccurrence(year, lunarBirth) {
  const candidates = [];
  const month = Number(lunarBirth.month);
  const day = Number(lunarBirth.day);
  if (lunarBirth.isLeap) {
    candidates.push({ month, day, isLeap: true, adjustedDay: false });
    if (day === 30) candidates.push({ month, day: 29, isLeap: true, adjustedDay: true });
    candidates.push({ month, day, isLeap: false, adjustedMonth: true, adjustedDay: false });
    if (day === 30) {
      candidates.push({ month, day: 29, isLeap: false, adjustedMonth: true, adjustedDay: true });
    }
  } else {
    candidates.push({ month, day, isLeap: false, adjustedDay: false });
    if (day === 30) candidates.push({ month, day: 29, isLeap: false, adjustedDay: true });
  }
  for (const candidate of candidates) {
    const date = lunarToSolar(year, candidate.month, candidate.day, candidate.isLeap);
    if (date) return { year, date, ...candidate };
  }
  return null;
}

function latestLunarBirthday(profile, nowValue = new Date()) {
  const lunarBirth = profile?.lunarBirth;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const currentLunar = profile?.birthCalendar === "lunar"
    ? solarToLunar(now)
    : null;
  if (!lunarBirth || !currentLunar || currentLunar.year < lunarBirth.year) return null;
  for (let year = currentLunar.year; year >= lunarBirth.year; year -= 1) {
    const occurrence = resolveLunarOccurrence(year, lunarBirth);
    if (occurrence?.date && occurrence.date <= now) return occurrence;
  }
  return null;
}

function lunarAgeParts(profile, nowValue = new Date()) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const latest = latestLunarBirthday(profile, now);
  if (!latest) return null;
  const years = latest.year - profile.lunarBirth.year;
  let months = 0;
  while (months < 11) {
    const next = addMonthsClamped(latest.date, months + 1);
    if (next > now) break;
    months += 1;
  }
  const monthAnchor = addMonthsClamped(latest.date, months);
  const remaining = Math.max(0, now.getTime() - monthAnchor.getTime());
  return {
    years,
    months,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
  };
}

function ageParts(profile, nowValue = new Date()) {
  if (!profile) return null;
  return profile.birthCalendar === "lunar"
    ? lunarAgeParts(profile, nowValue)
    : agePartsForDate(profile.birthAt, nowValue);
}

function nextSolarBirthday(birthValue, nowValue = new Date()) {
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

function nextLunarBirthday(profile, nowValue = new Date()) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const today = startOfLocalDay(now);
  const currentLunar = solarToLunar(now);
  if (!currentLunar || profile?.birthCalendar !== "lunar") return null;
  for (let year = currentLunar.year; year <= 2100; year += 1) {
    const occurrence = resolveLunarOccurrence(year, profile.lunarBirth);
    if (!occurrence?.date) continue;
    const birthday = startOfLocalDay(occurrence.date);
    if (birthday < today) continue;
    const days = Math.round((birthday.getTime() - today.getTime()) / 86400000);
    const fallback = [];
    if (occurrence.adjustedMonth) fallback.push("今年没有这个闰月，按同名普通月");
    if (occurrence.adjustedDay) fallback.push("这个月没有三十，按廿九");
    return {
      date: occurrence.date,
      year,
      days,
      fallback: fallback.join("；"),
    };
  }
  return null;
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

function weightUnitName(unit) {
  return unit === "jin" ? "斤" : "公斤";
}

function weightToDisplay(kg, unit) {
  return Number(kg) * weightUnitFactor(unit);
}

function weightDisplayText(kg, unit) {
  return weightToDisplay(kg, unit).toFixed(2);
}

function deltaMarkup(value, unit) {
  if (value === null) return '<span class="life-delta is-neutral">等待下一次记录</span>';
  const shown = weightToDisplay(value, unit);
  if (Math.abs(shown) < 0.005) return '<span class="life-delta is-neutral">与上次持平</span>';
  const direction = shown > 0 ? "增加" : "减少";
  return `<span class="life-delta ${shown > 0 ? "is-up" : "is-down"}">${direction} ${Math.abs(shown).toFixed(2)} ${weightUnitName(unit)}</span>`;
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

function weightChartMarkup(items, unit) {
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
  const values = sorted.map(item => weightToDisplay(item.kg, unit));
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
  const points = values.map((value, index) => [x(index), y(value)]);
  const line = smoothPath(points);
  const area = points.length > 1
    ? `${line} L ${points.at(-1)[0]} ${height - bottomPad} L ${points[0][0]} ${height - bottomPad} Z`
    : "";
  const gridLines = [0, 0.5, 1].map(ratio => {
    const yPosition = topPad + ratio * (height - topPad - bottomPad);
    const label = maximum - ratio * (maximum - minimum);
    return `<line x1="${leftPad}" y1="${yPosition}" x2="${width - rightPad}" y2="${yPosition}"></line><text x="${leftPad - 9}" y="${yPosition + 4}" text-anchor="end">${label.toFixed(2)}</text>`;
  }).join("");
  const labelIndexes = [...new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1])];
  const dateLabels = labelIndexes.map(index => {
    const date = new Date(sorted[index].at);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    return `<text x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === sorted.length - 1 ? "end" : "middle"}">${label}</text>`;
  }).join("");
  const circles = sorted.map((item, index) =>
    `<circle class="weight-dot" cx="${points[index][0]}" cy="${points[index][1]}" r="4.5"><title>${escapeHTML(dateTimeLabel(item.at))} · ${weightDisplayText(item.kg, unit)} ${weightUnitName(unit)}</title></circle>`,
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

function birthdayText(profile, nowValue = new Date()) {
  if (profile.birthCalendar === "lunar") {
    const next = nextLunarBirthday(profile, nowValue);
    if (!next) return { date: "暂时无法计算", countdown: "请检查农历生日" };
    return {
      date: `${solarDateLabel(next.date)} · ${lunarDateLabel(profile.lunarBirth)}`,
      countdown: next.days === 0 ? "就是今天" : `还有 ${next.days} 天`,
      fallback: next.fallback,
    };
  }
  const next = nextSolarBirthday(profile.birthAt, nowValue);
  return {
    date: `${next.date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })} · 公历`,
    countdown: `${next.days} 天 ${pad(next.hours)}:${pad(next.minutes)}:${pad(next.seconds)}`,
    fallback: "",
  };
}

function dateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoFromDateInput(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function dayDistance(fromValue, toValue) {
  const from = startOfLocalDay(fromValue);
  const to = startOfLocalDay(toValue);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function nextSolarOccurrence(value, nowValue = new Date(), includeYear = false) {
  const source = new Date(value);
  if (!Number.isFinite(source.getTime())) return null;
  const today = startOfLocalDay(nowValue);
  const month = source.getMonth();
  const day = source.getDate();
  const year = today.getFullYear();
  const make = targetYear => {
    const lastDay = new Date(targetYear, month + 1, 0).getDate();
    return new Date(targetYear, month, Math.min(day, lastDay));
  };
  let date = make(year);
  if (date < today) date = make(year + 1);
  return {
    date,
    days: dayDistance(today, date),
    year: date.getFullYear(),
    label: date.toLocaleDateString("zh-CN", {
      ...(includeYear ? { year: "numeric" } : {}),
      month: "long",
      day: "numeric",
      weekday: "short",
    }),
    fallback: "",
  };
}

function nextLunarDateOccurrence(lunarDate, nowValue = new Date()) {
  if (!lunarDate) return null;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const today = startOfLocalDay(now);
  const currentLunar = solarToLunar(now);
  if (!currentLunar) return null;
  for (let year = currentLunar.year; year <= 2100; year += 1) {
    const occurrence = resolveLunarOccurrence(year, lunarDate);
    if (!occurrence?.date) continue;
    const date = startOfLocalDay(occurrence.date);
    if (date < today) continue;
    const fallback = [];
    if (occurrence.adjustedMonth) fallback.push("今年没有闰月，按同名普通月");
    if (occurrence.adjustedDay) fallback.push("这个月没有三十，按廿九");
    return {
      date,
      days: dayDistance(today, date),
      year,
      label: `${solarDateLabel(date)} · ${lunarDateLabel({ year, ...lunarDate })}`,
      fallback: fallback.join("；"),
    };
  }
  return null;
}

function nextAnniversaryOccurrence(anniversary, nowValue = new Date()) {
  return anniversary.calendar === "lunar"
    ? nextLunarDateOccurrence(anniversary.lunarDate, nowValue)
    : nextSolarOccurrence(anniversary.solarAt, nowValue);
}

function nextPersonBirthday(person, nowValue = new Date()) {
  return person.birthCalendar === "lunar"
    ? nextLunarDateOccurrence(person.lunarBirth, nowValue)
    : nextSolarOccurrence(person.birthAt, nowValue);
}

function relationshipLabel(value) {
  return {
    father: "父亲",
    mother: "母亲",
    spouse: "配偶",
    daughter: "女儿",
    son: "儿子",
    sibling: "兄弟姐妹",
    grandparent: "祖辈",
    other: "重要的人",
  }[value] || "重要的人";
}

function reminderCopy(days, reminderDays) {
  if (days < 0) return `已过 ${Math.abs(days)} 天`;
  if (days === 0) return "就是今天";
  if (days <= reminderDays) return `已进入提醒 · 还有 ${days} 天`;
  return `还有 ${days} 天`;
}

function upcomingMilestones(people, periods, periodSettings, nowValue = new Date()) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const events = [];
  for (const person of people) {
    const birthday = nextPersonBirthday(person, now);
    if (birthday) {
      events.push({
        type: "birthday",
        personId: person.id,
        title: `${person.name}生日`,
        detail: `${relationshipLabel(person.relation)} · ${birthday.label}${birthday.fallback ? ` · ${birthday.fallback}` : ""}`,
        days: birthday.days,
        reminderDays: person.birthdayReminderDays,
        date: birthday.date,
      });
    }
    for (const anniversary of person.anniversaries) {
      const next = nextAnniversaryOccurrence(anniversary, now);
      if (!next) continue;
      events.push({
        type: "anniversary",
        personId: person.id,
        anniversaryId: anniversary.id,
        title: `${person.name} · ${anniversary.title}`,
        detail: `${next.label}${anniversary.note ? ` · ${anniversary.note}` : ""}${next.fallback ? ` · ${next.fallback}` : ""}`,
        days: next.days,
        reminderDays: anniversary.reminderDays,
        date: next.date,
      });
    }
  }
  const prediction = periodPrediction(periods, now);
  if (prediction?.nextStart) {
    const days = dayDistance(now, prediction.nextStart);
    events.push({
      type: "period",
      title: "预计经期",
      detail: `${solarDateLabel(prediction.nextStart)} · 根据最近 ${prediction.cycleCount} 个周期估算`,
      days,
      reminderDays: periodSettings.reminderDays,
      date: prediction.nextStart,
    });
  }
  return events.sort((left, right) =>
    left.days - right.days
    || String(left.title).localeCompare(String(right.title), "zh-CN"));
}

function periodPrediction(periods, nowValue = new Date()) {
  if (!periods.length) return null;
  const ordered = periods.slice().sort((left, right) => left.startAt.localeCompare(right.startAt));
  const starts = ordered.map(item => startOfLocalDay(item.startAt));
  const cycles = [];
  for (let index = 1; index < starts.length; index += 1) {
    const length = dayDistance(starts[index - 1], starts[index]);
    if (length >= 15 && length <= 45) cycles.push(length);
  }
  const recentCycles = cycles.slice(-6);
  const durations = ordered
    .filter(item => item.endAt)
    .map(item => dayDistance(item.startAt, item.endAt) + 1)
    .filter(length => length >= 1 && length <= 15)
    .slice(-6);
  const average = list => list.length
    ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length)
    : null;
  const averageCycle = average(recentCycles);
  const averageDuration = average(durations);
  const latest = ordered.at(-1);
  const latestStart = startOfLocalDay(latest.startAt);
  const nextStart = averageCycle
    ? new Date(latestStart.getFullYear(), latestStart.getMonth(), latestStart.getDate() + averageCycle)
    : null;
  const nextEnd = nextStart && averageDuration
    ? new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() + averageDuration - 1)
    : null;
  return {
    ordered,
    cycles,
    recentCycles,
    cycleCount: recentCycles.length,
    averageCycle,
    variation: recentCycles.length > 1
      ? Math.max(...recentCycles) - Math.min(...recentCycles)
      : null,
    averageDuration,
    latestStart,
    nextStart,
    nextEnd,
  };
}

function lunarPickerMarkup({ year = "", month = 1, day = 1, isLeap = false, includeYear = true } = {}) {
  const currentYear = new Date().getFullYear();
  const years = includeYear
    ? Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index)
        .map(item => `<option value="${item}"${Number(year) === item ? " selected" : ""}>${item} 年</option>`)
        .join("")
    : "";
  return `<div class="life-lunar-fields wellness-lunar-fields">
    ${includeYear ? `<label><span>年</span><select name="lunarYear" required><option value=""${year ? "" : " selected"} disabled>选择</option>${years}</select></label>` : ""}
    <label><span>月</span><select name="lunarMonth">${LUNAR_MONTHS.map((name, index) => `<option value="${index + 1}"${Number(month) === index + 1 ? " selected" : ""}>${name}</option>`).join("")}</select></label>
    <label><span>日</span><select name="lunarDay">${LUNAR_DAYS.map((name, index) => `<option value="${index + 1}"${Number(day) === index + 1 ? " selected" : ""}>${name}</option>`).join("")}</select></label>
  </div>
  <label class="life-leap-toggle wellness-leap-toggle"><input name="lunarLeap" type="checkbox"${isLeap ? " checked" : ""}><span>闰月</span></label>`;
}

function milestonesMarkup(events) {
  const visible = events
    .filter(event => event.days >= -7 && event.days <= 90)
    .slice(0, 8);
  if (!visible.length) {
    return `<div class="wellness-empty-state">${icon("calendar")}<b>接下来还没有需要提醒的日期</b><p>添加重要人物、纪念日或生理期记录后，这里会把事项串在一起。</p></div>`;
  }
  return `<div class="wellness-reminder-list">${visible.map(event => {
    const due = event.days >= 0 && event.days <= event.reminderDays;
    const overdue = event.type === "period" && event.days < 0;
    const target = event.personId
      ? `person:${event.personId}`
      : "period";
    return `<button type="button" class="wellness-reminder-row${due ? " is-due" : ""}${overdue ? " is-overdue" : ""}" data-reminder-target="${target}">
      <span class="wellness-reminder-mark">${icon(event.type === "period" ? "activity" : "calendar")}</span>
      <span class="wellness-reminder-copy"><b>${escapeHTML(event.title)}</b><small>${escapeHTML(event.detail)}</small></span>
      <span class="wellness-reminder-count">${escapeHTML(reminderCopy(event.days, event.reminderDays))}<small>提前 ${event.reminderDays} 天提醒</small></span>
      ${icon("chevronR")}
    </button>`;
  }).join("")}</div>`;
}

function peopleMarkup(people, nowValue = new Date()) {
  if (!people.length) {
    return `<div class="wellness-empty-state wellness-people-empty">${icon("user")}<b>把重要的人放在时间里</b><p>记下父母、伴侣和孩子的生日。公历或农历都可以，也能添加结婚、相识等重要纪念日。</p><button type="button" class="life-soft-button" data-add-person>${icon("plus")}添加第一位</button></div>`;
  }
  return `<div class="wellness-people-grid">${people.map(person => {
    const age = ageParts(person, nowValue);
    const birthday = nextPersonBirthday(person, nowValue);
    const birthLabel = person.birthCalendar === "lunar"
      ? lunarDateLabel(person.lunarBirth)
      : solarDateLabel(person.birthAt);
    return `<article class="wellness-person-card" id="wellness-person-${person.id}" tabindex="-1">
      <header>
        <span class="wellness-person-avatar">${escapeHTML(person.name.slice(0, 1))}</span>
        <div><p>${escapeHTML(relationshipLabel(person.relation))}</p><h3>${escapeHTML(person.name)}</h3></div>
        <div class="wellness-card-actions">
          <button type="button" data-edit-person="${person.id}" aria-label="编辑 ${escapeHTML(person.name)}" title="编辑">${icon("pen")}</button>
          <button type="button" data-delete-person="${person.id}" aria-label="删除 ${escapeHTML(person.name)}" title="删除">${icon("trash")}</button>
        </div>
      </header>
      <div class="wellness-person-age">
        <strong>${age ? `${age.years} 岁 ${age.months} 个月` : "年龄待确认"}</strong>
        <span>${escapeHTML(birthLabel)}</span>
      </div>
      <p class="wellness-next-birthday">${birthday ? `<b>${escapeHTML(birthday.label)}</b><span>${escapeHTML(reminderCopy(birthday.days, person.birthdayReminderDays))} · 提前 ${person.birthdayReminderDays} 天提醒</span>${birthday.fallback ? `<small>${escapeHTML(birthday.fallback)}</small>` : ""}` : "暂时无法计算下一次生日"}</p>
      ${person.note ? `<p class="wellness-person-note">${escapeHTML(person.note)}</p>` : ""}
      <div class="wellness-anniversaries">
        <div class="wellness-anniversary-head"><b>纪念日</b><button type="button" data-add-anniversary="${person.id}">${icon("plus")}添加</button></div>
        ${person.anniversaries.length ? person.anniversaries.map(anniversary => {
          const next = nextAnniversaryOccurrence(anniversary, nowValue);
          return `<div class="wellness-anniversary-row">
            <span><b>${escapeHTML(anniversary.title)}</b><small>${next ? `${escapeHTML(next.label)} · ${escapeHTML(reminderCopy(next.days, anniversary.reminderDays))}` : "暂时无法计算"}</small></span>
            <span>提前 ${anniversary.reminderDays} 天</span>
            <button type="button" data-edit-anniversary="${anniversary.id}" data-person-id="${person.id}" aria-label="编辑 ${escapeHTML(anniversary.title)}" title="编辑">${icon("pen")}</button>
            <button type="button" data-delete-anniversary="${anniversary.id}" data-person-id="${person.id}" aria-label="删除 ${escapeHTML(anniversary.title)}" title="删除">${icon("trash")}</button>
          </div>`;
        }).join("") : '<p class="wellness-no-anniversary">还没有纪念日</p>'}
      </div>
    </article>`;
  }).join("")}</div>`;
}

function periodCalendarMarkup(periods, prediction, monthValue) {
  const month = monthStart(monthValue);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leading = month.getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const today = startOfLocalDay(new Date());
  const cells = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push('<span class="wellness-calendar-blank" aria-hidden="true"></span>');
  }
  for (let dayNumber = 1; dayNumber <= days; dayNumber += 1) {
    const date = new Date(year, monthIndex, dayNumber);
    const actual = periods.find(item => {
      const start = startOfLocalDay(item.startAt);
      const end = item.endAt ? startOfLocalDay(item.endAt) : start;
      return date >= start && date <= end;
    });
    const predicted = prediction?.nextStart && prediction.nextEnd
      && date >= startOfLocalDay(prediction.nextStart)
      && date <= startOfLocalDay(prediction.nextEnd);
    const isStart = actual && date.getTime() === startOfLocalDay(actual.startAt).getTime();
    const isToday = date.getTime() === today.getTime();
    const flow = actual?.flow || "";
    const label = [
      `${year}年${monthIndex + 1}月${dayNumber}日`,
      actual ? `实际经期${isStart ? "开始" : ""}` : "",
      predicted ? "预计经期" : "",
    ].filter(Boolean).join("，");
    cells.push(`<time datetime="${dateInputValue(date)}" class="wellness-calendar-day${actual ? ` is-period is-${flow}` : ""}${isStart ? " is-start" : ""}${predicted ? " is-predicted" : ""}${isToday ? " is-today" : ""}" aria-label="${escapeHTML(label)}"><span>${dayNumber}</span>${isStart ? '<i>始</i>' : ""}${predicted && !actual ? '<i>预计</i>' : ""}</time>`);
  }
  return `<div class="wellness-period-calendar">
    <header>
      <button type="button" data-period-month="-1" aria-label="上个月">${icon("chevronL")}</button>
      <b>${year} 年 ${monthIndex + 1} 月</b>
      <button type="button" data-period-month="1" aria-label="下个月">${icon("chevronR")}</button>
      <button type="button" class="wellness-calendar-today" data-period-month="0">回到本月</button>
    </header>
    <div class="wellness-calendar-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
    <div class="wellness-calendar-grid">${cells.join("")}</div>
    <footer><span><i class="is-actual"></i>实际记录</span><span><i class="is-estimate"></i>预计日期</span></footer>
  </div>`;
}

function periodSectionMarkup(periods, settings, nowValue = new Date()) {
  const prediction = periodPrediction(periods, nowValue);
  const latest = prediction?.ordered.at(-1);
  const cycleValue = prediction?.averageCycle ? `${prediction.averageCycle} 天` : "记录 2 次后显示";
  const variationValue = prediction?.variation === null || prediction?.variation === undefined
    ? "等待更多周期"
    : `波动 ${prediction.variation} 天`;
  const nextValue = prediction?.nextStart ? solarDateLabel(prediction.nextStart) : "等待周期数据";
  const nextDetail = prediction?.nextStart
    ? `${reminderCopy(dayDistance(nowValue, prediction.nextStart), settings.reminderDays)}${prediction.averageDuration ? ` · 预计持续 ${prediction.averageDuration} 天` : ""}`
    : "至少记录两次开始日期后才能预测";
  return `<section class="life-panel wellness-period-panel" id="wellness-period" tabindex="-1">
    <header class="life-panel-head">
      <div><p>CYCLE &amp; FORECAST</p><h2>生理期记录与预测</h2></div>
      <button type="button" class="life-soft-button" data-add-period>${icon("plus")}记一次</button>
    </header>
    <div class="wellness-period-summary">
      <article><span>最近开始</span><strong>${latest ? solarDateLabel(latest.startAt) : "还没有记录"}</strong><small>${latest?.endAt ? `持续 ${dayDistance(latest.startAt, latest.endAt) + 1} 天` : latest ? "上次记录为持续中" : "从一次开始日期开始"}</small></article>
      <article><span>平均周期</span><strong>${cycleValue}</strong><small>${variationValue}</small></article>
      <article class="is-next"><span>下次预计</span><strong>${nextValue}</strong><small>${nextDetail}</small></article>
    </div>
    <div class="wellness-period-layout">
      ${periodCalendarMarkup(periods, prediction, periodCalendarMonth)}
      <div class="wellness-period-tools">
        <label class="life-field"><span>预计经期提前提醒</span><select data-period-reminder>${Array.from({ length: 8 }, (_, day) => `<option value="${day}"${settings.reminderDays === day ? " selected" : ""}>${day === 0 ? "当天提醒" : `提前 ${day} 天`}</option>`).join("")}</select></label>
        <div class="wellness-period-method">${icon("sparkles")}<p><b>预测怎么算</b><span>使用最近最多 6 个有效周期求平均；实际记录与预计日期在日历中以不同样式显示。预测只作生活参考。</span></p></div>
      </div>
    </div>
    <div class="wellness-period-history">
      <header><b>周期记录</b><span>${periods.length} 次</span></header>
      ${periods.length ? periods.map(item => {
        const flowLabel = { light: "少量", medium: "中等", heavy: "较多" }[item.flow] || "中等";
        return `<article class="wellness-period-row" data-period-id="${item.id}">
          <time datetime="${item.startAt}"><b>${solarDateLabel(item.startAt)}</b><small>${item.endAt ? `至 ${solarDateLabel(item.endAt)} · ${dayDistance(item.startAt, item.endAt) + 1} 天` : "尚未记录结束日期"}</small></time>
          <span class="wellness-period-flow is-${item.flow}">${flowLabel}</span>
          <p>${escapeHTML(item.symptoms.length ? item.symptoms.join("、") : "没有记录症状")}${item.note ? ` · ${escapeHTML(item.note)}` : ""}</p>
          <div><button type="button" data-edit-period="${item.id}" aria-label="编辑这次生理期记录" title="编辑">${icon("pen")}</button><button type="button" data-delete-period="${item.id}" aria-label="删除这次生理期记录" title="删除">${icon("trash")}</button></div>
        </article>`;
      }).join("") : `<div class="wellness-empty-state wellness-period-empty">${icon("activity")}<b>先记下最近一次开始日期</b><p>连续记录两个周期后，日迹会算出平均周期并标出预计经期。</p></div>`}
    </div>
  </section>`;
}

function updateAgeDisplay(profile) {
  const calendar = document.querySelector("#life-age-calendar");
  const clock = document.querySelector("#life-age-clock");
  const birthday = document.querySelector("#life-birthday-countdown");
  if (!profile || !calendar || !clock || !birthday) return;
  const parts = ageParts(profile);
  if (!parts) {
    calendar.textContent = "出生时间晚于此刻";
    clock.textContent = "00:00:00";
    birthday.textContent = "请检查出生日期";
    return;
  }
  calendar.textContent = `${parts.years} 年 ${parts.months} 个月 ${parts.days} 天`;
  clock.textContent = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
  const next = birthdayText(profile);
  birthday.textContent = `${next.date} · ${next.countdown}${next.fallback ? ` · ${next.fallback}` : ""}`;
}

function stopAgeTimer() {
  if (ageTimer) clearInterval(ageTimer);
  ageTimer = 0;
}

function openWellnessDialog(root, { title, html, onMount }) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "wellness-dialog";
  dialog.innerHTML = `<div class="wellness-dialog-card">
    <header><div><p>DAYLOG · BODY &amp; TIME</p><h2>${escapeHTML(title)}</h2></div><button type="button" class="wellness-dialog-close" data-wellness-close aria-label="关闭">${icon("x")}</button></header>
    <div class="wellness-dialog-body">${html}</div>
  </div>`;
  root.append(dialog);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  });
  dialog.querySelectorAll("[data-wellness-close]").forEach(button => {
    button.addEventListener("click", () => dialog.close());
  });
  dialog.showModal();
  onMount?.(dialog);
  requestAnimationFrame(() => {
    dialog.querySelector("input:not([type=hidden]), select, textarea, button")?.focus({ preventScroll: true });
  });
  return dialog;
}

function bindCalendarFields(form, initialCalendar, { includeYear = true } = {}) {
  const preview = form.querySelector("[data-calendar-preview]");
  const currentCalendar = () => form.querySelector('[data-calendar][aria-pressed="true"]')?.dataset.calendar || "solar";
  const updatePreview = () => {
    if (!preview) return;
    const calendar = currentCalendar();
    if (calendar === "solar") {
      const date = new Date(`${form.elements.solarDate?.value || ""}T12:00:00`);
      preview.textContent = Number.isFinite(date.getTime())
        ? `公历 ${solarDateLabel(date)}`
        : "请选择公历日期";
      preview.classList.toggle("is-error", !Number.isFinite(date.getTime()));
      return;
    }
    const year = includeYear
      ? Number(form.elements.lunarYear?.value)
      : (solarToLunar(new Date())?.year || new Date().getFullYear());
    const month = Number(form.elements.lunarMonth?.value);
    const day = Number(form.elements.lunarDay?.value);
    const isLeap = Boolean(form.elements.lunarLeap?.checked);
    if (includeYear && !year) {
      preview.textContent = "请选择农历年份";
      preview.classList.add("is-error");
      return;
    }
    try {
      const solar = lunarToSolar(year, month, day, isLeap);
      preview.textContent = solar
        ? `${lunarDateLabel({ year, month, day, isLeap })} = ${solarDateLabel(solar)}`
        : "这个农历日期不存在，请检查闰月或日期";
      preview.classList.toggle("is-error", !solar);
    } catch {
      preview.textContent = "请选择有效的农历日期";
      preview.classList.add("is-error");
    }
  };
  const setCalendar = next => {
    form.querySelectorAll("[data-calendar]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.calendar === next));
    });
    form.querySelectorAll("[data-calendar-panel]").forEach(panel => {
      const active = panel.dataset.calendarPanel === next;
      panel.hidden = !active;
      panel.querySelectorAll("input, select").forEach(control => {
        control.disabled = !active;
      });
    });
    updatePreview();
  };
  form.querySelectorAll("[data-calendar]").forEach(button => {
    button.addEventListener("click", () => setCalendar(button.dataset.calendar));
  });
  form.querySelectorAll("[data-calendar-panel] input, [data-calendar-panel] select").forEach(control => {
    control.addEventListener("change", updatePreview);
  });
  setCalendar(initialCalendar);
}

function renderWellnessPage(root, options = {}) {
  stopAgeTimer();
  const profile = getLifeProfile();
  const weightUnit = getWeightUnit();
  const weights = listWeights();
  const people = listPeople();
  const periods = listPeriods();
  const periodSettings = getPeriodSettings();
  const visibleWeights = weightViewData(weights);
  const summary = weightSummary(weights);
  const age = profile ? ageParts(profile) : null;
  const birthday = profile ? birthdayText(profile) : null;
  const currentYear = new Date().getFullYear();
  const birthCalendar = profile?.birthCalendar === "lunar" ? "lunar" : "solar";
  const convertedLunarBirth = profile ? solarToLunar(profile.birthAt) : null;
  const lunarBirth = profile?.lunarBirth || convertedLunarBirth || {
    year: null,
    month: 1,
    day: 1,
    isLeap: false,
  };
  const selectedLunarYear = Number(lunarBirth.year) || 0;
  const ageCalendar = age
    ? `${age.years} 年 ${age.months} 个月 ${age.days} 天`
    : "还没有设置出生时间";
  const ageClock = age
    ? `${pad(age.hours)}:${pad(age.minutes)}:${pad(age.seconds)}`
    : "—";
  const birthdayLabel = birthday
    ? `${birthday.date} · ${birthday.countdown}${birthday.fallback ? ` · ${birthday.fallback}` : ""}`
    : "设置出生日期后显示";
  const unitName = weightUnitName(weightUnit);
  const unitLabel = weightUnit === "jin" ? "斤" : "kg";
  const weightMinimum = weightUnit === "jin" ? 40 : 20;
  const weightMaximum = weightUnit === "jin" ? 1000 : 500;
  const weightPlaceholder = weightUnit === "jin" ? "例如 130.50" : "例如 65.25";
  const latestWeight = summary.newest
    ? `${weightDisplayText(summary.newest.kg, weightUnit)} <small>${unitLabel}</small>`
    : "—";
  const changeWeight = summary.change === null
    ? "—"
    : `${summary.change > 0 ? "+" : ""}${weightDisplayText(summary.change, weightUnit)} <small>${unitLabel}</small>`;
  const totalWeight = summary.total === null
    ? "—"
    : `${summary.total > 0 ? "+" : ""}${weightDisplayText(summary.total, weightUnit)} <small>${unitLabel}</small>`;
  const lunarYearOptions = Array.from(
    { length: currentYear - 1899 },
    (_, index) => currentYear - index,
  ).map(year => `<option value="${year}"${selectedLunarYear === year ? " selected" : ""}>${year} 年</option>`).join("");
  const lunarYearPlaceholder = selectedLunarYear
    ? ""
    : '<option value="" selected disabled>选择年份</option>';
  const lunarMonthOptions = LUNAR_MONTHS.map((name, index) => {
    const month = index + 1;
    return `<option value="${month}"${lunarBirth.month === month ? " selected" : ""}>${name}</option>`;
  }).join("");
  const lunarDayOptions = LUNAR_DAYS.map((name, index) => {
    const day = index + 1;
    return `<option value="${day}"${lunarBirth.day === day ? " selected" : ""}>${name}</option>`;
  }).join("");
  const milestones = upcomingMilestones(people, periods, periodSettings);

  root.innerHTML = `<div class="life-page wellness-page">
    <header class="life-page-head">
      <div><p class="life-eyebrow">BODY &amp; TIME</p><h1>身体与时间</h1><p>照看自己的变化，也记住重要的人和日子。</p></div>
      <button class="life-soft-button" type="button" data-life-jump="weight-form">${icon("plus")}记体重</button>
    </header>
    <nav class="wellness-jump-nav" aria-label="身体与时间页面导航">
      <button type="button" data-wellness-jump="wellness-self">本人</button>
      <button type="button" data-wellness-jump="wellness-milestones">提醒</button>
      <button type="button" data-wellness-jump="wellness-people">重要人物</button>
      <button type="button" data-wellness-jump="wellness-period">生理期</button>
      <button type="button" data-wellness-jump="weight-form">体重</button>
    </nav>

    <section class="life-age-card" id="wellness-self">
      <div class="life-age-main">
        <span class="life-live-pulse" aria-hidden="true"></span>
        <p class="life-card-kicker">此刻的我</p>
        <strong id="life-age-calendar">${escapeHTML(ageCalendar)}</strong>
        <div class="life-age-clock-row"><span>加上</span><b id="life-age-clock">${escapeHTML(ageClock)}</b></div>
        <p class="life-birthday-line">下次生日 <span id="life-birthday-countdown">${escapeHTML(birthdayLabel)}</span></p>
      </div>
      <form class="life-birth-form" id="life-profile-form">
        <div class="life-calendar-switch" role="group" aria-label="出生日期历法">
          <button type="button" data-birth-calendar="solar" aria-pressed="${birthCalendar === "solar"}">公历</button>
          <button type="button" data-birth-calendar="lunar" aria-pressed="${birthCalendar === "lunar"}">农历</button>
        </div>
        <div class="life-birth-panel" data-birth-panel="solar"${birthCalendar === "solar" ? "" : " hidden"}>
          <label for="life-birth-at">公历出生日期与时间</label>
          <input class="life-birth-control" id="life-birth-at" name="birthAt" type="datetime-local" step="1" required value="${profile ? escapeHTML(localDateTimeValue(profile.birthAt)) : ""}"${birthCalendar === "solar" ? "" : " disabled"}>
        </div>
        <div class="life-birth-panel" data-birth-panel="lunar"${birthCalendar === "lunar" ? "" : " hidden"}>
          <p class="life-birth-panel-title">农历出生年月日</p>
          <div class="life-lunar-fields">
            <label><span>年</span><select name="lunarYear" required${birthCalendar === "lunar" ? "" : " disabled"}>${lunarYearPlaceholder}${lunarYearOptions}</select></label>
            <label><span>月</span><select name="lunarMonth"${birthCalendar === "lunar" ? "" : " disabled"}>${lunarMonthOptions}</select></label>
            <label><span>日</span><select name="lunarDay"${birthCalendar === "lunar" ? "" : " disabled"}>${lunarDayOptions}</select></label>
          </div>
          <label class="life-leap-toggle"><input name="lunarLeap" type="checkbox"${lunarBirth.isLeap ? " checked" : ""}${birthCalendar === "lunar" ? "" : " disabled"}><span>这个生日是闰月</span></label>
          <p class="life-lunar-preview" data-lunar-preview aria-live="polite"></p>
        </div>
        <button class="primary life-birth-save" type="submit">${icon("clock")}${profile ? "更新生日" : "保存生日"}</button>
        <small>农历生日会换算为对应公历日期，并优先按每年的同名农历日计算下一次生日。若该年没有原来的闰月，按同名普通月；没有三十时按廿九。</small>
      </form>
    </section>

    <section class="life-panel wellness-reminder-panel" id="wellness-milestones">
      <header class="life-panel-head">
        <div><p>REMINDER BOOK</p><h2>接下来要记住的日子</h2></div>
        <span class="life-count-badge">提前提醒 ${people.length ? "已启用" : "待设置"}</span>
      </header>
      <p class="wellness-reminder-note">生日、纪念日和预计经期会在这里汇总。打开日迹时，进入提醒窗口的事项会重点显示。</p>
      ${milestonesMarkup(milestones)}
    </section>

    <section class="life-panel wellness-people-panel" id="wellness-people">
      <header class="life-panel-head">
        <div><p>PEOPLE &amp; MEMORIES</p><h2>重要人物</h2></div>
        <button type="button" class="life-soft-button" data-add-person>${icon("plus")}添加人物</button>
      </header>
      <p class="wellness-section-intro">保存父母、伴侣和孩子的公历或农历生日，再把共同的纪念日放在同一张人物卡里。</p>
      ${peopleMarkup(people)}
    </section>

    ${periodSectionMarkup(periods, periodSettings)}

    <section class="life-metric-grid" aria-label="体重摘要">
      <article class="life-metric-card is-primary"><span>最新体重</span><strong>${latestWeight}</strong><em>${summary.newest ? escapeHTML(dateTimeLabel(summary.newest.at)) : "等待第一次记录"}</em></article>
      <article class="life-metric-card"><span>较上次</span><strong>${changeWeight}</strong><em>${deltaMarkup(summary.change, weightUnit)}</em></article>
      <article class="life-metric-card"><span>累计变化</span><strong>${totalWeight}</strong><em>${summary.total === null ? "至少需要两次记录" : summary.total > 0 ? "从最早记录至今增加" : "从最早记录至今减少"}</em></article>
    </section>

    <div class="life-content-grid">
      <section class="life-panel life-chart-panel">
        <header class="life-panel-head"><div><p>WEIGHT TREND</p><h2>体重变化</h2></div><div class="life-range-tabs" role="group" aria-label="体重曲线时间范围">${WEIGHT_RANGES.map(([days, label]) => `<button type="button" data-weight-range="${days}" aria-pressed="${weightRange === days}">${label}</button>`).join("")}</div></header>
        ${weightChartMarkup(visibleWeights, weightUnit)}
        <footer class="life-chart-foot"><span>${visibleWeights.length ? `这一时期共 ${visibleWeights.length} 次记录` : "曲线会随每次记录自动更新"}</span><span>当前单位 · ${unitName}</span></footer>
      </section>

      <form class="life-panel life-weight-form" id="weight-form">
        <header class="life-panel-head"><div><p>NEW CHECK-IN</p><h2>记一次体重</h2></div><div class="life-weight-head-actions"><div class="life-unit-switch" role="group" aria-label="体重显示和录入单位"><button type="button" data-weight-unit="kg" aria-pressed="${weightUnit === "kg"}">公斤</button><button type="button" data-weight-unit="jin" aria-pressed="${weightUnit === "jin"}">斤</button></div><span class="life-form-icon">${icon("activity")}</span></div></header>
        <label class="life-field"><span>记录时间</span><input name="at" type="datetime-local" step="1" required value="${escapeHTML(localDateTimeValue())}"></label>
        <label class="life-field"><span>体重（${unitName}）</span><div class="life-number-field"><input name="weight" type="number" min="${weightMinimum}" max="${weightMaximum}" step="0.01" inputmode="decimal" required placeholder="${weightPlaceholder}"><b>${unitLabel}</b></div></label>
        <label class="life-field"><span>备注 <small>选填</small></span><input name="note" maxlength="300" placeholder="晨起、运动后或其他状态"></label>
        <button class="primary life-wide-button" type="submit">${icon("plus")}保存体重</button>
        <p class="life-weight-storage-note">支持两位小数；切换单位不会改动已有记录。</p>
      </form>
    </div>

    <section class="life-panel life-history-panel">
      <header class="life-panel-head"><div><p>HISTORY</p><h2>体重记录</h2></div><span class="life-count-badge">${weights.length} 次</span></header>
      <div class="life-weight-list">${weights.length ? weights.map(item => `<article class="life-weight-row" data-weight-id="${item.id}"><time datetime="${item.at}">${escapeHTML(dateTimeLabel(item.at))}</time><strong>${weightDisplayText(item.kg, weightUnit)} <small>${unitLabel}</small></strong><p>${escapeHTML(item.note || "没有备注")}</p><button type="button" class="life-icon-button" data-delete-weight="${item.id}" aria-label="删除 ${weightDisplayText(item.kg, weightUnit)} ${unitName}记录" title="删除">${icon("trash")}</button></article>`).join("") : '<div class="life-empty-row">还没有体重记录。第一次记录后，趋势和变化会从这里开始。</div>'}</div>
    </section>
  </div>`;

  const notify = message => {
    if (typeof options.notify === "function") options.notify(message);
  };
  const confirmAction = typeof options.confirmAction === "function"
    ? options.confirmAction
    : (title, body) => Promise.resolve(window.confirm(`${title}\n${body}`));

  const rerender = (focusSelector = "") => {
    const scrollY = window.scrollY;
    renderWellnessPage(root, options);
    if (focusSelector) {
      requestAnimationFrame(() => root.querySelector(focusSelector)?.focus({ preventScroll: true }));
    }
    window.scrollTo({ top: scrollY });
  };

  const openPersonEditor = person => {
    const birthCalendar = person?.birthCalendar || "solar";
    const lunarBirth = person?.lunarBirth || solarToLunar(person?.birthAt) || {
      year: "",
      month: 1,
      day: 1,
      isLeap: false,
    };
    const reminderOptions = Array.from({ length: 31 }, (_, day) => `<option value="${day}"${person?.birthdayReminderDays === day ? " selected" : ""}${!person && day === 7 ? " selected" : ""}>${day === 0 ? "当天提醒" : `提前 ${day} 天`}</option>`).join("");
    openWellnessDialog(root, {
      title: person ? `编辑 ${person.name}` : "添加重要人物",
      html: `<form class="wellness-editor-form" id="wellness-person-form">
        <div class="wellness-form-grid">
          <label class="life-field"><span>姓名或称呼</span><input name="name" maxlength="40" required autocomplete="off" value="${escapeHTML(person?.name || "")}" placeholder="例如：妈妈"></label>
          <label class="life-field"><span>关系</span><select name="relation">${[
            ["father", "父亲"],
            ["mother", "母亲"],
            ["spouse", "配偶"],
            ["daughter", "女儿"],
            ["son", "儿子"],
            ["sibling", "兄弟姐妹"],
            ["grandparent", "祖辈"],
            ["other", "其他重要的人"],
          ].map(([value, label]) => `<option value="${value}"${(person?.relation || "other") === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        </div>
        <fieldset class="wellness-fieldset">
          <legend>出生日期</legend>
          <div class="wellness-calendar-tabs" role="group" aria-label="出生日期历法"><button type="button" data-calendar="solar" aria-pressed="${birthCalendar === "solar"}">公历</button><button type="button" data-calendar="lunar" aria-pressed="${birthCalendar === "lunar"}">农历</button></div>
          <div data-calendar-panel="solar"${birthCalendar === "solar" ? "" : " hidden"}>
            <label class="life-field"><span>公历出生日期</span><input name="solarDate" type="date" max="${dateInputValue()}" required value="${person?.birthCalendar === "solar" ? dateInputValue(person.birthAt) : ""}"></label>
          </div>
          <div data-calendar-panel="lunar"${birthCalendar === "lunar" ? "" : " hidden"}>
            ${lunarPickerMarkup(lunarBirth)}
          </div>
          <p class="wellness-calendar-preview" data-calendar-preview aria-live="polite"></p>
        </fieldset>
        <label class="life-field"><span>生日提前提醒</span><select name="birthdayReminderDays">${reminderOptions}</select></label>
        <label class="life-field"><span>想记住的事 <small>选填</small></span><textarea name="note" rows="3" maxlength="500" placeholder="喜好、共同经历或想记住的小事"></textarea></label>
        <div class="wellness-dialog-actions"><button type="button" class="secondary" data-wellness-close>取消</button><button type="submit" class="primary">${icon("check")}${person ? "保存修改" : "添加人物"}</button></div>
      </form>`,
      onMount: dialog => {
        const form = dialog.querySelector("#wellness-person-form");
        form.elements.note.value = person?.note || "";
        bindCalendarFields(form, birthCalendar);
        form.addEventListener("submit", event => {
          event.preventDefault();
          try {
            const calendar = form.querySelector('[data-calendar][aria-pressed="true"]').dataset.calendar;
            const saved = savePerson({
              id: person?.id,
              name: form.elements.name.value,
              relation: form.elements.relation.value,
              birthCalendar: calendar,
              birthAt: isoFromDateInput(form.elements.solarDate.value),
              lunarBirth: calendar === "lunar" ? {
                year: Number(form.elements.lunarYear.value),
                month: Number(form.elements.lunarMonth.value),
                day: Number(form.elements.lunarDay.value),
                isLeap: form.elements.lunarLeap.checked,
              } : null,
              birthdayReminderDays: Number(form.elements.birthdayReminderDays.value),
              note: form.elements.note.value,
            });
            dialog.close();
            rerender(`#wellness-person-${saved.id} [data-edit-person]`);
            notify(`${saved.name}已保存，生日和纪念日会进入提醒簿`);
          } catch (error) {
            notify(error instanceof Error ? error.message : "重要人物保存失败");
          }
        });
      },
    });
  };

  const openAnniversaryEditor = (person, anniversary) => {
    const calendar = anniversary?.calendar || "solar";
    const lunarDate = anniversary?.lunarDate || { month: 1, day: 1, isLeap: false };
    const reminderOptions = Array.from({ length: 31 }, (_, day) => `<option value="${day}"${anniversary?.reminderDays === day ? " selected" : ""}${!anniversary && day === 7 ? " selected" : ""}>${day === 0 ? "当天提醒" : `提前 ${day} 天`}</option>`).join("");
    openWellnessDialog(root, {
      title: anniversary ? `编辑 ${anniversary.title}` : `给 ${person.name} 添加纪念日`,
      html: `<form class="wellness-editor-form" id="wellness-anniversary-form">
        <label class="life-field"><span>纪念日名称</span><input name="title" maxlength="40" required autocomplete="off" value="${escapeHTML(anniversary?.title || "")}" placeholder="例如：结婚纪念日"></label>
        <fieldset class="wellness-fieldset">
          <legend>日期</legend>
          <div class="wellness-calendar-tabs" role="group" aria-label="纪念日历法"><button type="button" data-calendar="solar" aria-pressed="${calendar === "solar"}">公历</button><button type="button" data-calendar="lunar" aria-pressed="${calendar === "lunar"}">农历</button></div>
          <div data-calendar-panel="solar"${calendar === "solar" ? "" : " hidden"}>
            <label class="life-field"><span>公历日期</span><input name="solarDate" type="date" required value="${anniversary?.calendar === "solar" ? dateInputValue(anniversary.solarAt) : ""}"></label>
          </div>
          <div data-calendar-panel="lunar"${calendar === "lunar" ? "" : " hidden"}>
            ${lunarPickerMarkup({ ...lunarDate, includeYear: false })}
          </div>
          <p class="wellness-calendar-preview" data-calendar-preview aria-live="polite"></p>
        </fieldset>
        <label class="life-field"><span>提前提醒</span><select name="reminderDays">${reminderOptions}</select></label>
        <label class="life-field"><span>说明 <small>选填</small></span><textarea name="note" rows="3" maxlength="300" placeholder="这一年发生了什么，或当天想做什么"></textarea></label>
        <div class="wellness-dialog-actions"><button type="button" class="secondary" data-wellness-close>取消</button><button type="submit" class="primary">${icon("check")}${anniversary ? "保存修改" : "添加纪念日"}</button></div>
      </form>`,
      onMount: dialog => {
        const form = dialog.querySelector("#wellness-anniversary-form");
        form.elements.note.value = anniversary?.note || "";
        bindCalendarFields(form, calendar, { includeYear: false });
        form.addEventListener("submit", event => {
          event.preventDefault();
          try {
            const selectedCalendar = form.querySelector('[data-calendar][aria-pressed="true"]').dataset.calendar;
            saveAnniversary(person.id, {
              id: anniversary?.id,
              title: form.elements.title.value,
              calendar: selectedCalendar,
              solarAt: isoFromDateInput(form.elements.solarDate.value),
              lunarDate: selectedCalendar === "lunar" ? {
                month: Number(form.elements.lunarMonth.value),
                day: Number(form.elements.lunarDay.value),
                isLeap: form.elements.lunarLeap.checked,
              } : null,
              reminderDays: Number(form.elements.reminderDays.value),
              note: form.elements.note.value,
            });
            dialog.close();
            rerender(`#wellness-person-${person.id} [data-edit-person]`);
            notify("纪念日已保存，并加入提醒簿");
          } catch (error) {
            notify(error instanceof Error ? error.message : "纪念日保存失败");
          }
        });
      },
    });
  };

  const openPeriodEditor = period => {
    const selectedSymptoms = new Set(period?.symptoms || []);
    const symptoms = ["腹痛", "腰酸", "头痛", "乏力", "情绪波动", "乳房胀痛", "恶心"];
    openWellnessDialog(root, {
      title: period ? "编辑生理期记录" : "记录一次生理期",
      html: `<form class="wellness-editor-form" id="wellness-period-form">
        <div class="wellness-form-grid">
          <label class="life-field"><span>开始日期</span><input name="startDate" type="date" required value="${period ? dateInputValue(period.startAt) : dateInputValue()}"></label>
          <label class="life-field"><span>结束日期 <small>未结束可留空</small></span><input name="endDate" type="date" value="${period?.endAt ? dateInputValue(period.endAt) : ""}"></label>
        </div>
        <label class="life-field"><span>经量</span><select name="flow"><option value="light"${period?.flow === "light" ? " selected" : ""}>少量</option><option value="medium"${!period || period.flow === "medium" ? " selected" : ""}>中等</option><option value="heavy"${period?.flow === "heavy" ? " selected" : ""}>较多</option></select></label>
        <fieldset class="wellness-fieldset wellness-symptom-fieldset"><legend>症状 <small>可多选</small></legend><div class="wellness-symptom-grid">${symptoms.map(symptom => `<label><input name="symptoms" type="checkbox" value="${symptom}"${selectedSymptoms.has(symptom) ? " checked" : ""}><span>${symptom}</span></label>`).join("")}</div></fieldset>
        <label class="life-field"><span>备注 <small>选填</small></span><textarea name="note" rows="3" maxlength="500" placeholder="睡眠、用药或其他身体感受">${escapeHTML(period?.note || "")}</textarea></label>
        <div class="wellness-dialog-actions"><button type="button" class="secondary" data-wellness-close>取消</button><button type="submit" class="primary">${icon("check")}${period ? "保存修改" : "保存记录"}</button></div>
      </form>`,
      onMount: dialog => {
        const form = dialog.querySelector("#wellness-period-form");
        form.addEventListener("submit", event => {
          event.preventDefault();
          try {
            const saved = savePeriod({
              id: period?.id,
              startAt: isoFromDateInput(form.elements.startDate.value),
              endAt: isoFromDateInput(form.elements.endDate.value),
              flow: form.elements.flow.value,
              symptoms: new FormData(form).getAll("symptoms"),
              note: form.elements.note.value,
            });
            periodCalendarMonth = monthStart(new Date(saved.startAt));
            dialog.close();
            rerender("[data-add-period]");
            notify("生理期记录已保存，周期预测已更新");
          } catch (error) {
            notify(error instanceof Error ? error.message : "生理期记录保存失败");
          }
        });
      },
    });
  };

  const profileForm = root.querySelector("#life-profile-form");
  const lunarPreview = profileForm.querySelector("[data-lunar-preview]");

  const updateLunarPreview = () => {
    const year = Number(profileForm.elements.lunarYear.value);
    const month = Number(profileForm.elements.lunarMonth.value);
    const day = Number(profileForm.elements.lunarDay.value);
    const isLeap = profileForm.elements.lunarLeap.checked;
    if (!year) {
      lunarPreview.textContent = "请选择农历出生年份";
      lunarPreview.classList.add("is-error");
      return;
    }
    try {
      const solar = lunarToSolar(year, month, day, isLeap);
      lunarPreview.textContent = solar
        ? `${lunarDateLabel({ year, month, day, isLeap })} = ${solarDateLabel(solar)}`
        : "这个农历日期不存在，请检查闰月或日期";
      lunarPreview.classList.toggle("is-error", !solar);
    } catch {
      lunarPreview.textContent = "请选择有效的农历年月日";
      lunarPreview.classList.add("is-error");
    }
  };

  const setBirthCalendar = (next, focus = false) => {
    profileForm.querySelectorAll("[data-birth-calendar]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.birthCalendar === next));
    });
    profileForm.querySelectorAll("[data-birth-panel]").forEach(panel => {
      const active = panel.dataset.birthPanel === next;
      panel.hidden = !active;
      panel.querySelectorAll("input, select").forEach(control => {
        control.disabled = !active;
      });
    });
    if (next === "lunar") updateLunarPreview();
    if (focus) {
      const selector = next === "lunar" ? '[name="lunarYear"]' : "[name=birthAt]";
      profileForm.querySelector(selector)?.focus({ preventScroll: true });
    }
  };

  profileForm.querySelectorAll("[data-birth-calendar]").forEach(button => {
    button.addEventListener("click", () => {
      setBirthCalendar(button.dataset.birthCalendar, true);
    });
  });
  ["lunarYear", "lunarMonth", "lunarDay", "lunarLeap"].forEach(name => {
    profileForm.elements[name].addEventListener("change", updateLunarPreview);
  });
  updateLunarPreview();

  profileForm.addEventListener("submit", event => {
    event.preventDefault();
    const calendar = profileForm.querySelector('[data-birth-calendar][aria-pressed="true"]')?.dataset.birthCalendar;
    try {
      if (calendar === "lunar") {
        saveLifeProfile({
          birthCalendar: "lunar",
          lunarBirth: {
            year: Number(profileForm.elements.lunarYear.value),
            month: Number(profileForm.elements.lunarMonth.value),
            day: Number(profileForm.elements.lunarDay.value),
            isLeap: profileForm.elements.lunarLeap.checked,
          },
        });
        notify("农历生日已保存，会按农历日期计算下一次生日");
      } else {
        const birth = new Date(String(profileForm.elements.birthAt.value));
        if (!Number.isFinite(birth.getTime()) || birth > new Date()) {
          throw new Error("请选择不晚于今天的公历出生日期和时间");
        }
        saveLifeProfile({ birthCalendar: "solar", birthAt: birth.toISOString() });
        notify("公历生日已保存，年龄会实时更新");
      }
      renderWellnessPage(root, options);
    } catch (error) {
      notify(error instanceof Error ? error.message : "出生时间保存失败");
    }
  });

  root.querySelectorAll("[data-weight-unit]").forEach(button => {
    button.addEventListener("click", () => {
      const next = button.dataset.weightUnit;
      if (next === getWeightUnit()) return;
      saveWeightUnit(next);
      const scrollY = window.scrollY;
      renderWellnessPage(root, options);
      root.querySelector(`[data-weight-unit="${next}"]`)?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY });
    });
  });

  root.querySelector("#weight-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const unit = getWeightUnit();
      const entered = Number(data.get("weight"));
      if (!Number.isFinite(entered) || entered <= 0) {
        throw new Error("请输入有效的体重");
      }
      const record = saveWeight({
        at: new Date(String(data.get("at"))).toISOString(),
        kg: entered / weightUnitFactor(unit),
        note: data.get("note"),
      });
      notify(`已记录 ${weightDisplayText(record.kg, unit)} ${weightUnitName(unit)}`);
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
      const unit = getWeightUnit();
      const confirmed = await confirmAction(
        "删除这条体重记录？",
        `${dateTimeLabel(item.at)} · ${weightDisplayText(item.kg, unit)} ${weightUnitName(unit)}。删除后曲线会立即更新。`,
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

  root.querySelectorAll("[data-add-person]").forEach(button => {
    button.addEventListener("click", () => openPersonEditor(null));
  });

  root.querySelectorAll("[data-edit-person]").forEach(button => {
    button.addEventListener("click", () => {
      const person = listPeople().find(item => item.id === button.dataset.editPerson);
      if (person) openPersonEditor(person);
    });
  });

  root.querySelectorAll("[data-delete-person]").forEach(button => {
    button.addEventListener("click", async () => {
      const person = listPeople().find(item => item.id === button.dataset.deletePerson);
      if (!person) return;
      const confirmed = await confirmAction(
        `删除 ${person.name}？`,
        `这也会删除人物卡中的 ${person.anniversaries.length} 个纪念日和提醒设置。`,
      );
      if (!confirmed) return;
      deletePerson(person.id);
      rerender("[data-add-person]");
      notify(`${person.name}的人物卡已删除`);
    });
  });

  root.querySelectorAll("[data-add-anniversary]").forEach(button => {
    button.addEventListener("click", () => {
      const person = listPeople().find(item => item.id === button.dataset.addAnniversary);
      if (person) openAnniversaryEditor(person, null);
    });
  });

  root.querySelectorAll("[data-edit-anniversary]").forEach(button => {
    button.addEventListener("click", () => {
      const person = listPeople().find(item => item.id === button.dataset.personId);
      const anniversary = person?.anniversaries.find(item => item.id === button.dataset.editAnniversary);
      if (person && anniversary) openAnniversaryEditor(person, anniversary);
    });
  });

  root.querySelectorAll("[data-delete-anniversary]").forEach(button => {
    button.addEventListener("click", async () => {
      const person = listPeople().find(item => item.id === button.dataset.personId);
      const anniversary = person?.anniversaries.find(item => item.id === button.dataset.deleteAnniversary);
      if (!person || !anniversary) return;
      const confirmed = await confirmAction(
        `删除“${anniversary.title}”？`,
        "之后不会再出现在提醒簿里，人物生日不受影响。",
      );
      if (!confirmed) return;
      deleteAnniversary(person.id, anniversary.id);
      rerender(`#wellness-person-${person.id} [data-edit-person]`);
      notify("纪念日已删除");
    });
  });

  root.querySelectorAll("[data-add-period]").forEach(button => {
    button.addEventListener("click", () => openPeriodEditor(null));
  });

  root.querySelectorAll("[data-edit-period]").forEach(button => {
    button.addEventListener("click", () => {
      const period = listPeriods().find(item => item.id === button.dataset.editPeriod);
      if (period) openPeriodEditor(period);
    });
  });

  root.querySelectorAll("[data-delete-period]").forEach(button => {
    button.addEventListener("click", async () => {
      const period = listPeriods().find(item => item.id === button.dataset.deletePeriod);
      if (!period) return;
      const confirmed = await confirmAction(
        "删除这次生理期记录？",
        `${solarDateLabel(period.startAt)} 开始的周期会被删除，平均周期和预计日期会重新计算。`,
      );
      if (!confirmed) return;
      deletePeriod(period.id);
      rerender("[data-add-period]");
      notify("生理期记录已删除");
    });
  });

  root.querySelectorAll("[data-period-month]").forEach(button => {
    button.addEventListener("click", () => {
      const amount = Number(button.dataset.periodMonth);
      periodCalendarMonth = amount === 0
        ? monthStart(new Date())
        : shiftMonth(periodCalendarMonth, amount);
      const scrollY = window.scrollY;
      renderWellnessPage(root, options);
      window.scrollTo({ top: scrollY });
      root.querySelector(`[data-period-month="${amount}"]`)?.focus({ preventScroll: true });
    });
  });

  root.querySelector("[data-period-reminder]")?.addEventListener("change", event => {
    const reminderDays = Number(event.currentTarget.value);
    savePeriodSettings({ reminderDays });
    notify(`预计经期会提前 ${reminderDays} 天提醒`);
    const scrollY = window.scrollY;
    renderWellnessPage(root, options);
    window.scrollTo({ top: scrollY });
    root.querySelector("[data-period-reminder]")?.focus({ preventScroll: true });
  });

  root.querySelectorAll("[data-wellness-jump]").forEach(button => {
    button.addEventListener("click", () => {
      const target = root.querySelector(`#${button.dataset.wellnessJump}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      requestAnimationFrame(() => target?.focus?.({ preventScroll: true }));
    });
  });

  root.querySelectorAll("[data-reminder-target]").forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.reminderTarget;
      const target = value === "period"
        ? root.querySelector("#wellness-period")
        : root.querySelector(`#wellness-person-${CSS.escape(value.replace(/^person:/, ""))}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus?.({ preventScroll: true });
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
