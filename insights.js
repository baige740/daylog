import { dateKey, plain } from "./journal.js";
import { MOOD_OPTIONS, moodMarkup } from "./extras.js";
import { icon } from "./icons.js";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PERIODS = [
  { label: "夜深", range: "00–06", start: 0, end: 5 },
  { label: "清晨", range: "06–09", start: 6, end: 8 },
  { label: "上午", range: "09–12", start: 9, end: 11 },
  { label: "午后", range: "12–18", start: 12, end: 17 },
  { label: "傍晚", range: "18–21", start: 18, end: 20 },
  { label: "深夜", range: "21–24", start: 21, end: 23 },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function moodValue(record) {
  if (Number.isInteger(record.mood) && record.mood >= 0 && record.mood <= 4) {
    return record.mood;
  }
  if (record.type !== "mood") return null;
  const text = plain(record.html);
  const match = MOOD_OPTIONS.find(option => option.label === text);
  return match ? match.id : null;
}

function recordsBetween(records, start, end) {
  return records.filter(record => {
    const time = new Date(record.at).getTime();
    return time >= start.getTime() && time < end.getTime();
  });
}

function dailyMoods(records) {
  const days = new Map();
  for (const record of records) {
    const mood = moodValue(record);
    if (mood === null) continue;
    const key = dateKey(record.at);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(mood);
  }
  return new Map(Array.from(days, ([key, values]) => [key, average(values)]));
}

function moodIndex(averageMood) {
  return averageMood === null ? null : (averageMood + 1) * 2;
}

function moodWord(score) {
  if (score === null) return "还没有心情记录";
  if (score < 3) return "低落中，记得照顾自己";
  if (score < 5) return "略感疲惫，慢一点也好";
  if (score < 7) return "整体平静，节奏稳定";
  if (score < 9) return "心情明亮，适合继续记录";
  return "这个月很轻快";
}

function currentStreak(records, now = new Date()) {
  const days = new Set(records.map(record => dateKey(record.at)));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function highestPeriod(hours) {
  return PERIODS.map(period => ({
    label: period.label,
    range: period.range,
    start: period.start,
    count: hours.slice(period.start, period.end + 1).reduce((sum, value) => sum + value, 0),
  })).sort((left, right) => right.count - left.count || left.start - right.start)[0];
}

function moodCalendar(year, month, records) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const dayCount = new Date(year, month + 1, 0).getDate();
  const byDay = new Map();
  for (const record of records) {
    const key = dateKey(record.at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(record);
  }
  const moods = dailyMoods(records);
  let cells = WEEKDAYS.map(day => '<span class="mood-calendar-week">' + day + "</span>").join("");
  cells += '<span class="mood-calendar-blank"></span>'.repeat(offset);
  for (let day = 1; day <= dayCount; day += 1) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    const daily = byDay.get(key) || [];
    const mood = moods.get(key);
    const moodRounded = mood === null || mood === undefined ? null : Math.round(mood);
    const content = moodRounded === null
      ? (daily.length ? '<span class="entry-mark"></span>' : "")
      : moodMarkup(moodRounded, { compact: true });
    cells += '<button type="button" class="mood-calendar-day'
      + (daily.length ? " has-record" : "")
      + (moodRounded === null ? "" : " mood-" + moodRounded)
      + (key === dateKey(new Date()) ? " is-today" : "")
      + '" data-stat-day="' + key + '" aria-label="' + key
      + (daily.length ? "，" + daily.length + " 条记录" : "，暂无记录")
      + (mood === null || mood === undefined ? "" : "，心情 " + moodWord(moodIndex(mood)).split("，")[0])
      + '"><small>' + day + "</small>" + content + "</button>";
  }
  return '<div class="mood-calendar-grid">' + cells + "</div>";
}

function hourChart(hours) {
  const maximum = Math.max(1, ...hours);
  const bars = Array.from({ length: 24 }, (_, hour) => {
    const count = hours[hour];
    const height = count ? Math.max(12, Math.round((count / maximum) * 100)) : 3;
    return '<span class="hour-bar' + (count === maximum && count ? " is-peak" : "") + '"'
      + ' style="--bar-height:' + height + '%" title="' + hour + " 时 · " + count + ' 条"'
      + ' aria-label="' + hour + " 点记录 " + count + ' 条"><i></i><small>'
      + (hour % 3 === 0 ? String(hour).padStart(2, "0") : "") + "</small></span>";
  }).join("");
  return '<div class="hour-chart" role="img" aria-label="本月二十四小时记录分布">' + bars + "</div>";
}

export function summarizeRecords(records, month) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  const previousEnd = start;
  const previousStart = new Date(year, monthIndex - 1, 1);
  const selected = recordsBetween(records, start, end);
  const previous = recordsBetween(records, previousStart, previousEnd);
  const hours = Array(24).fill(0);
  for (const record of selected) hours[new Date(record.at).getHours()] += 1;
  const activeDays = new Set(selected.map(record => dateKey(record.at))).size;
  const moods = Array.from(dailyMoods(selected).values());
  const previousMoods = Array.from(dailyMoods(previous).values());
  const averageMood = average(moods);
  const previousAverageMood = average(previousMoods);
  const score = moodIndex(averageMood);
  const previousScore = moodIndex(previousAverageMood);
  return {
    year,
    monthIndex,
    selected,
    hours,
    activeDays,
    streak: currentStreak(records),
    moodDays: moods.length,
    moodScore: score,
    moodDelta: score !== null && previousScore !== null ? score - previousScore : null,
    moodWord: moodWord(score),
    peak: highestPeriod(hours),
  };
}

export function renderStatsPage(container, records, month) {
  const summary = summarizeRecords(records, month);
  const monthText = summary.year + " 年 " + (summary.monthIndex + 1) + " 月";
  const deltaText = summary.moodDelta === null
    ? "暂无可比上月"
    : (summary.moodDelta >= 0 ? "较上月 +" : "较上月 ")
      + summary.moodDelta.toFixed(1);
  const peakText = summary.peak.count
    ? summary.peak.range + " 点 · " + summary.peak.label
    : "还没有记录";
  const scoreText = summary.moodScore === null ? "—" : summary.moodScore.toFixed(1);
  const scoreFill = summary.moodScore === null ? 0 : summary.moodScore * 10;
  const latest = summary.selected
    .slice()
    .sort((left, right) => right.at.localeCompare(left.at))[0];

  container.innerHTML = '<div class="stats-page">'
    + '<header class="stats-head"><div><p class="stats-eyebrow">RECORD RHYTHM</p>'
    + '<h1>记录统计</h1><p>看看你把生活留在了哪些时刻。</p></div>'
    + '<div class="stats-month"><button type="button" data-stats-month="-1" aria-label="上个月">'
    + icon("chevronL") + '</button><strong>' + monthText + '</strong>'
    + '<button type="button" data-stats-month="1" aria-label="下个月">' + icon("chevronR")
    + "</button></div></header>"
    + '<div class="stats-summary">'
    + '<article class="stat-tile stat-tile--primary"><span>本月记录</span><strong>'
    + summary.selected.length + '</strong><small>分布在 ' + summary.activeDays + ' 天</small></article>'
    + '<article class="stat-tile"><span>连续记录</span><strong>' + summary.streak
    + '</strong><small>天</small><i>' + (summary.streak ? "保持这个节奏" : "从今天开始") + "</i></article>"
    + '<article class="stat-tile"><span>心情指数</span><strong>' + scoreText
    + '</strong><small>/ 10</small><i>' + escapeHtml(summary.moodWord) + "</i></article>"
    + '<article class="stat-tile"><span>最常记录</span><strong class="stat-period">'
    + escapeHtml(peakText.split(" · ")[0]) + '</strong><small>'
    + escapeHtml(summary.peak.count ? summary.peak.label + " · " + summary.peak.count + " 条" : "等待第一笔")
    + "</small></article></div>"
    + '<div class="stats-grid">'
    + '<section class="stats-panel stats-panel--mood"><header><div><p>MOOD INDEX</p><h2>心情指数</h2></div>'
    + '<span class="stats-delta' + (summary.moodDelta !== null && summary.moodDelta < 0 ? " is-down" : "")
    + '">' + escapeHtml(deltaText) + '</span></header>'
    + '<div class="mood-index-main"><div class="mood-gauge"><span style="--gauge:' + scoreFill
    + '%"></span><i></i></div><div class="mood-index-copy"><strong>' + scoreText
    + '</strong><small>OUT OF 10</small><p>' + escapeHtml(summary.moodWord)
    + '</p><span>' + summary.moodDays + ' 个有心情记录的日子</span></div></div>'
    + '<div class="mood-calendar-head"><h3>本月心情日历</h3><span>点日期查看当天记录</span></div>'
    + moodCalendar(summary.year, summary.monthIndex, summary.selected)
    + "</section>"
    + '<section class="stats-panel stats-panel--rhythm"><header><div><p>WRITING HOURS</p>'
    + '<h2>记录节律</h2></div><span>按事件时间统计</span></header>'
    + hourChart(summary.hours)
    + '<div class="period-list">'
    + PERIODS.map(period => {
      const count = summary.hours.slice(period.start, period.end + 1).reduce((sum, value) => sum + value, 0);
      const width = summary.selected.length ? Math.max(3, Math.round(count / summary.selected.length * 100)) : 0;
      return '<div class="period-row"><span><b>' + period.label + '</b><small>' + period.range
        + '</small></span><i><em style="--period:' + width + '%"></em></i><strong>' + count + "</strong></div>";
    }).join("")
    + "</div>"
    + '<div class="stats-latest"><span>' + icon("pen") + "</span><div><small>最近一笔记录</small><b>"
    + (latest
      ? escapeHtml(dateKey(latest.at) + " " + new Date(latest.at).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }))
      : "这个月还没有写下记录")
    + "</b></div></div></section></div></div>";
}
