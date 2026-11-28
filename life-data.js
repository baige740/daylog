import { STOCK_STORAGE_KEY, mergeStockBackup, normalizeStockBackup, readStockData } from "./stock-data.js";

export const LIFE_PROFILE_KEY = "daylog:life:profile:v1";
export const LIFE_WEIGHTS_KEY = "daylog:life:weights:v1";
export const LIFE_WEIGHT_UNIT_KEY = "daylog:life:weight-unit:v1";
export const LIFE_LEDGER_KEY = "daylog:life:ledger:v1";
export const LIFE_QUICK_LEDGER_KEY = "daylog:life:quick-ledger:v1";

export const LIFE_STORAGE_KEYS = [
  LIFE_PROFILE_KEY,
  LIFE_WEIGHTS_KEY,
  LIFE_WEIGHT_UNIT_KEY,
  LIFE_LEDGER_KEY,
  LIFE_QUICK_LEDGER_KEY,
  STOCK_STORAGE_KEY,
];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const LEDGER_TYPES = new Set(["income", "expense"]);
const WEIGHT_UNITS = new Set(["kg", "jin"]);
const MAX_QUICK_LEDGER = 20;
const LUNAR_MONTH_NAMES = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "腊月"];
const LUNAR_DAY_NAMES = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
const LUNAR_MONTH_NUMBERS = new Map([
  ["正月", 1],
  ["一月", 1],
  ["二月", 2],
  ["三月", 3],
  ["四月", 4],
  ["五月", 5],
  ["六月", 6],
  ["七月", 7],
  ["八月", 8],
  ["九月", 9],
  ["十月", 10],
  ["十一月", 11],
  ["冬月", 11],
  ["十二月", 12],
  ["腊月", 12],
]);
const lunarSolarCache = new Map();
let lunarDateFormatter = null;
try {
  lunarDateFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
} catch {
  lunarDateFormatter = null;
}

function identifier(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function cleanText(value, limit) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, limit);
}

function canonicalDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function numberFromLunarPart(value, names) {
  const numeric = Number(String(value || "").replace(/[^\d]/g, ""));
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  return names.indexOf(String(value || "").trim());
}

export function solarToLunar(value) {
  if (!lunarDateFormatter) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = lunarDateFormatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === "relatedYear")?.value);
  const rawMonth = parts.find(part => part.type === "month")?.value || "";
  const isLeap = rawMonth.startsWith("闰");
  const monthName = rawMonth.replace(/^闰/, "");
  const month = LUNAR_MONTH_NUMBERS.get(monthName)
    || numberFromLunarPart(monthName, LUNAR_MONTH_NAMES);
  const dayText = parts.find(part => part.type === "day")?.value || "";
  const day = numberFromLunarPart(dayText, LUNAR_DAY_NAMES);
  if (!Number.isInteger(year) || !month || !day) return null;
  return { year, month, day, isLeap };
}

function normalizeLunarBirth(value) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  const isLeap = Boolean(value?.isLeap);
  if (
    !Number.isInteger(year)
    || year < 1900
    || year > 2100
    || !Number.isInteger(month)
    || month < 1
    || month > 12
    || !Number.isInteger(day)
    || day < 1
    || day > 30
  ) {
    throw new Error("请选择有效的农历出生年月日");
  }
  return { year, month, day, isLeap };
}

export function lunarToSolar(yearValue, monthValue, dayValue, isLeapValue = false) {
  const lunar = normalizeLunarBirth({
    year: yearValue,
    month: monthValue,
    day: dayValue,
    isLeap: isLeapValue,
  });
  const cacheKey = `${lunar.year}-${lunar.month}-${lunar.day}-${lunar.isLeap ? 1 : 0}`;
  if (lunarSolarCache.has(cacheKey)) return lunarSolarCache.get(cacheKey);
  const cursor = new Date(lunar.year, 0, 1, 12);
  const end = new Date(lunar.year + 1, 2, 1, 12);
  let match = null;
  while (cursor < end) {
    const current = solarToLunar(cursor);
    if (
      current?.year === lunar.year
      && current.month === lunar.month
      && current.day === lunar.day
      && current.isLeap === lunar.isLeap
    ) {
      match = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  lunarSolarCache.set(cacheKey, match);
  return match;
}

export function lunarDateLabel(value) {
  let lunar = null;
  try {
    lunar = normalizeLunarBirth(value);
  } catch {
    return "";
  }
  return `农历${lunar.isLeap ? "闰" : ""}${LUNAR_MONTH_NAMES[lunar.month]}${LUNAR_DAY_NAMES[lunar.day]}`;
}

export function weightUnitFactor(unit = getWeightUnit()) {
  return unit === "jin" ? 2 : 1;
}

export function getWeightUnit() {
  const unit = localStorage.getItem(LIFE_WEIGHT_UNIT_KEY);
  return WEIGHT_UNITS.has(unit) ? unit : "kg";
}

export function saveWeightUnit(unit) {
  const next = WEIGHT_UNITS.has(unit) ? unit : "kg";
  localStorage.setItem(LIFE_WEIGHT_UNIT_KEY, next);
  return next;
}

function readArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, values) {
  localStorage.setItem(key, JSON.stringify(values));
}

function normalizeProfile(value) {
  if (!value || typeof value !== "object") return null;
  const birthCalendar = value.birthCalendar === "lunar" ? "lunar" : "solar";
  const lunarBirth = birthCalendar === "lunar"
    ? (() => {
        try {
          return normalizeLunarBirth(value.lunarBirth);
        } catch {
          return null;
        }
      })()
    : null;
  if (birthCalendar === "lunar" && !lunarBirth) return null;
  const birthAt = birthCalendar === "lunar"
    ? lunarToSolar(lunarBirth.year, lunarBirth.month, lunarBirth.day, lunarBirth.isLeap)?.toISOString() || ""
    : canonicalDate(value.birthAt);
  if (!birthAt) return null;
  return {
    birthAt,
    birthCalendar,
    lunarBirth,
    updatedAt: canonicalDate(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizeWeight(value) {
  if (!value || typeof value !== "object" || !ID_PATTERN.test(String(value.id || ""))) {
    throw new Error("体重记录 ID 无效");
  }
  const at = canonicalDate(value.at);
  const kg = Number(value.kg);
  if (!at || !Number.isFinite(kg) || kg <= 0 || kg > 500) {
    throw new Error("体重记录格式无效");
  }
  return {
    id: String(value.id),
    at,
    // Keep kilogram precision below the interface so two-decimal jin values
    // can round-trip exactly when the user switches units.
    kg: Math.round(kg * 1000) / 1000,
    note: cleanText(value.note, 300),
    createdAt: canonicalDate(value.createdAt) || at,
    updatedAt: canonicalDate(value.updatedAt) || canonicalDate(value.createdAt) || at,
  };
}

function normalizeTags(value) {
  const source = Array.isArray(value)
    ? value
    : cleanText(value, 500).split(/[,，、\s]+/);
  return [...new Set(source.map(item => cleanText(item, 20)).filter(Boolean))].slice(0, 8);
}

function normalizeLedger(value) {
  if (!value || typeof value !== "object" || !ID_PATTERN.test(String(value.id || ""))) {
    throw new Error("账目记录 ID 无效");
  }
  const at = canonicalDate(value.at);
  const amount = Math.round(Number(value.amount) * 100) / 100;
  if (
    !at
    || !Number.isFinite(amount)
    || amount <= 0
    || amount > 1_000_000_000_000
    || !LEDGER_TYPES.has(value.type)
  ) {
    throw new Error("账目记录格式无效");
  }
  return {
    id: String(value.id),
    type: value.type,
    amount,
    currency: "CNY",
    category: cleanText(value.category, 30) || "其他",
    account: cleanText(value.account, 30) || "其他",
    payee: cleanText(value.payee, 80),
    note: cleanText(value.note, 500),
    tags: normalizeTags(value.tags),
    quickLedgerId: ID_PATTERN.test(String(value.quickLedgerId || ""))
      ? String(value.quickLedgerId)
      : "",
    at,
    createdAt: canonicalDate(value.createdAt) || at,
    updatedAt: canonicalDate(value.updatedAt) || canonicalDate(value.createdAt) || at,
  };
}

function normalizeQuickLedger(value) {
  if (!value || typeof value !== "object" || !ID_PATTERN.test(String(value.id || ""))) {
    throw new Error("快捷账目 ID 无效");
  }
  const amount = Math.round(Number(value.amount) * 100) / 100;
  const name = cleanText(value.name, 24);
  if (
    !name
    || !Number.isFinite(amount)
    || amount <= 0
    || amount > 1_000_000_000_000
    || !LEDGER_TYPES.has(value.type)
  ) {
    throw new Error("快捷账目格式无效");
  }
  return {
    id: String(value.id),
    name,
    type: value.type,
    amount,
    currency: "CNY",
    category: cleanText(value.category, 30) || "其他",
    account: cleanText(value.account, 30) || "其他",
    payee: cleanText(value.payee, 80),
    note: cleanText(value.note, 500),
    tags: normalizeTags(value.tags),
    createdAt: canonicalDate(value.createdAt) || new Date().toISOString(),
    updatedAt: canonicalDate(value.updatedAt) || canonicalDate(value.createdAt) || new Date().toISOString(),
  };
}

export function getLifeProfile() {
  try {
    return normalizeProfile(JSON.parse(localStorage.getItem(LIFE_PROFILE_KEY) || "null"));
  } catch {
    return null;
  }
}

export function saveLifeProfile(input) {
  let birthAt = input?.birthAt;
  if (input?.birthCalendar === "lunar") {
    const lunarBirth = normalizeLunarBirth(input?.lunarBirth);
    const solarBirth = lunarToSolar(
      lunarBirth.year,
      lunarBirth.month,
      lunarBirth.day,
      lunarBirth.isLeap,
    );
    if (!solarBirth) {
      throw new Error(lunarBirth.isLeap
        ? "这一农历年份没有该闰月，请核对月份"
        : "请选择有效的农历出生年月日");
    }
    birthAt = solarBirth.toISOString();
  }
  const profile = normalizeProfile({
    birthAt,
    birthCalendar: input?.birthCalendar,
    lunarBirth: input?.lunarBirth,
    updatedAt: new Date().toISOString(),
  });
  if (!profile) throw new Error("请选择有效的出生日期和时间");
  if (new Date(profile.birthAt) > new Date()) {
    throw new Error("出生日期不能晚于今天");
  }
  localStorage.setItem(LIFE_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function listWeights() {
  return readArray(LIFE_WEIGHTS_KEY)
    .map(value => {
      try {
        return normalizeWeight(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
}

export function saveWeight(input) {
  const now = new Date().toISOString();
  const items = listWeights();
  const existing = input?.id ? items.find(item => item.id === input.id) : null;
  const record = normalizeWeight({
    id: existing?.id || identifier("weight"),
    at: input?.at,
    kg: input?.kg,
    note: input?.note,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  const next = items.filter(item => item.id !== record.id);
  next.push(record);
  next.sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
  writeArray(LIFE_WEIGHTS_KEY, next);
  return record;
}

export function deleteWeight(id) {
  const next = listWeights().filter(item => item.id !== id);
  writeArray(LIFE_WEIGHTS_KEY, next);
}

export function listLedger() {
  return readArray(LIFE_LEDGER_KEY)
    .map(value => {
      try {
        return normalizeLedger(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
}

export function saveLedger(input) {
  const now = new Date().toISOString();
  const items = listLedger();
  const existing = input?.id ? items.find(item => item.id === input.id) : null;
  const record = normalizeLedger({
    id: existing?.id || identifier("entry"),
    type: input?.type,
    amount: input?.amount,
    currency: "CNY",
    category: input?.category,
    account: input?.account,
    payee: input?.payee,
    note: input?.note,
    tags: input?.tags,
    quickLedgerId: input?.quickLedgerId || existing?.quickLedgerId,
    at: input?.at,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  const next = items.filter(item => item.id !== record.id);
  next.push(record);
  next.sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
  writeArray(LIFE_LEDGER_KEY, next);
  return record;
}

export function deleteLedger(id) {
  const next = listLedger().filter(item => item.id !== id);
  writeArray(LIFE_LEDGER_KEY, next);
}

export function listQuickLedger() {
  return readArray(LIFE_QUICK_LEDGER_KEY)
    .map(value => {
      try {
        return normalizeQuickLedger(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function saveQuickLedger(input) {
  const now = new Date().toISOString();
  const items = listQuickLedger();
  const existing = input?.id ? items.find(item => item.id === input.id) : null;
  if (!existing && items.length >= MAX_QUICK_LEDGER) {
    throw new Error(`最多设置 ${MAX_QUICK_LEDGER} 个快捷账目`);
  }
  const record = normalizeQuickLedger({
    id: existing?.id || identifier("quick"),
    name: input?.name,
    type: input?.type,
    amount: input?.amount,
    currency: "CNY",
    category: input?.category,
    account: input?.account,
    payee: input?.payee,
    note: input?.note,
    tags: input?.tags,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  const next = items.filter(item => item.id !== record.id);
  next.push(record);
  next.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  writeArray(LIFE_QUICK_LEDGER_KEY, next);
  return record;
}

export function deleteQuickLedger(id) {
  const next = listQuickLedger().filter(item => item.id !== id);
  writeArray(LIFE_QUICK_LEDGER_KEY, next);
}

export function normaliseLifeBackup(value) {
  if (!value || typeof value !== "object") throw new Error("备份中没有生活数据");
  if (!Array.isArray(value.weights) || !Array.isArray(value.ledger)) {
    throw new Error("生活数据备份不完整");
  }
  return {
    version: 1,
    profile: normalizeProfile(value.profile),
    preferences: {
      weightUnit: WEIGHT_UNITS.has(value.preferences?.weightUnit)
        ? value.preferences.weightUnit
        : "kg",
    },
    weights: value.weights.map(normalizeWeight),
    ledger: value.ledger.map(normalizeLedger),
    quickLedger: Array.isArray(value.quickLedger)
      ? value.quickLedger.map(normalizeQuickLedger)
      : [],
    stock: normalizeStockBackup(value.stock),
  };
}

export function getLifeBackupData() {
  return normaliseLifeBackup({
    version: 1,
    profile: getLifeProfile(),
    preferences: {
      weightUnit: getWeightUnit(),
    },
    weights: listWeights(),
    ledger: listLedger(),
    quickLedger: listQuickLedger(),
    stock: readStockData(),
  });
}

export function lifeCounts(data = getLifeBackupData()) {
  return {
    lifeCount: data.profile || data.weights.length || data.ledger.length || data.quickLedger.length || data.stock?.trades.length ? 1 : 0,
    weightCount: data.weights.length,
    ledgerCount: data.ledger.length,
    quickLedgerCount: data.quickLedger.length,
    stockTradeCount: data.stock?.trades.length || 0,
  };
}

export function snapshotLifeStorage() {
  return new Map(LIFE_STORAGE_KEYS.map(key => [key, localStorage.getItem(key)]));
}

export function restoreLifeStorage(snapshot) {
  for (const key of LIFE_STORAGE_KEYS) {
    const value = snapshot.get(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }
}

export function mergeLifeBackup(value) {
  const hasIncomingWeightUnit = WEIGHT_UNITS.has(value?.preferences?.weightUnit);
  const incoming = normaliseLifeBackup(value);
  const stockTradesAdded = mergeStockBackup(incoming.stock);
  const currentProfile = getLifeProfile();
  const incomingProfile = incoming.profile;
  if (
    incomingProfile
    && (!currentProfile || incomingProfile.updatedAt > currentProfile.updatedAt)
  ) {
    localStorage.setItem(LIFE_PROFILE_KEY, JSON.stringify(incomingProfile));
  }
  if (hasIncomingWeightUnit) {
    saveWeightUnit(incoming.preferences.weightUnit);
  }

  const currentWeights = listWeights();
  const knownWeights = new Set(currentWeights.map(item => item.id));
  const addedWeights = incoming.weights.filter(item => !knownWeights.has(item.id));
  if (addedWeights.length) {
    const merged = currentWeights.concat(addedWeights)
      .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
    writeArray(LIFE_WEIGHTS_KEY, merged);
  }

  const currentLedger = listLedger();
  const knownLedger = new Set(currentLedger.map(item => item.id));
  const addedLedger = incoming.ledger.filter(item => !knownLedger.has(item.id));
  if (addedLedger.length) {
    const merged = currentLedger.concat(addedLedger)
      .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
    writeArray(LIFE_LEDGER_KEY, merged);
  }

  const currentQuickLedger = listQuickLedger();
  const knownQuickLedger = new Set(currentQuickLedger.map(item => item.id));
  const addedQuickLedger = incoming.quickLedger.filter(item => !knownQuickLedger.has(item.id));
  if (addedQuickLedger.length) {
    const merged = currentQuickLedger.concat(addedQuickLedger)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    writeArray(LIFE_QUICK_LEDGER_KEY, merged);
  }

  return {
    profileAdded: Boolean(
      incomingProfile
      && (!currentProfile || incomingProfile.updatedAt > currentProfile.updatedAt),
    ),
    weightsAdded: addedWeights.length,
    ledgerAdded: addedLedger.length,
    quickLedgerAdded: addedQuickLedger.length,
    stockTradesAdded,
  };
}
