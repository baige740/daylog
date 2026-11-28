import { icon } from "./icons.js";
import { applyDocumentMedia } from "./media.js";

export const FONT_OPTIONS = [
  { id: "wenkai", label: "霞鹜文楷", short: "文楷" },
  { id: "song", label: "宋体", short: "宋体" },
  { id: "kai", label: "楷体", short: "楷体" },
  { id: "sans", label: "清爽黑体", short: "黑体" },
];

export const BACKGROUND_OPTIONS = [
  { id: "paper", label: "纸白" },
  { id: "mist", label: "晨雾" },
  { id: "grid", label: "方格纸" },
  { id: "forest", label: "林间" },
  { id: "custom", label: "我的背景" },
];

export const MOOD_OPTIONS = [
  { id: 0, label: "低落", face: "低落" },
  { id: 1, label: "疲惫", face: "疲惫" },
  { id: 2, label: "平静", face: "平静" },
  { id: 3, label: "愉快", face: "愉快" },
  { id: 4, label: "开心", face: "开心" },
];

export const DEFAULT_STYLE = Object.freeze({
  font: "wenkai",
  fontSize: 20,
  lineHeight: 2.05,
  letterSpacing: 0.025,
  paragraphGap: 0.88,
  background: "paper",
  backgroundAssetId: "",
});

const fontIds = new Set(FONT_OPTIONS.map(option => option.id));
const backgroundIds = new Set(BACKGROUND_OPTIONS.map(option => option.id));
const assetIdPattern = /^media_[a-zA-Z0-9-]{1,80}$/;

function clampNumber(value, minimum, maximum, fallback) {
  if (
    value === null
    || value === undefined
    || (typeof value === "string" && !value.trim())
    || typeof value === "boolean"
  ) {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function finiteNumberOrNull(value) {
  if (
    value === null
    || value === undefined
    || (typeof value === "string" && !value.trim())
    || typeof value === "boolean"
  ) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, maximum) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum)
    : "";
}

export function normalizeStyle(value, base = DEFAULT_STYLE) {
  const source = value && typeof value === "object" ? value : {};
  const fallback = base || DEFAULT_STYLE;
  const background = backgroundIds.has(source.background) ? source.background : fallback.background;
  const backgroundAssetId = background === "custom" && assetIdPattern.test(String(source.backgroundAssetId))
    ? source.backgroundAssetId
    : "";
  return {
    font: fontIds.has(source.font) ? source.font : fallback.font,
    fontSize: Math.round(clampNumber(source.fontSize, 16, 26, fallback.fontSize) * 2) / 2,
    lineHeight: Math.round(clampNumber(source.lineHeight, 1.55, 2.7, fallback.lineHeight) * 20) / 20,
    letterSpacing: Math.round(clampNumber(source.letterSpacing, 0, 0.08, fallback.letterSpacing) * 1000) / 1000,
    paragraphGap: Math.round(clampNumber(source.paragraphGap, 0.4, 1.7, fallback.paragraphGap) * 20) / 20,
    background: background === "custom" && !backgroundAssetId ? "paper" : background,
    backgroundAssetId,
  };
}

export function normalizeContext(value) {
  if (!value || typeof value !== "object") return null;
  const place = cleanText(value.place, 80);
  const weather = cleanText(value.weather, 16);
  const temperature = finiteNumberOrNull(value.temperature);
  const code = finiteNumberOrNull(value.code);
  if (!place && !weather && temperature === null) return null;
  return {
    place: place || "当前位置",
    weather: weather || "天气暂不可用",
    temperature: temperature !== null && temperature >= -100 && temperature <= 100
      ? Math.round(temperature)
      : null,
    code,
    updatedAt: value.updatedAt
      && Number.isFinite(new Date(value.updatedAt).getTime())
      ? new Date(value.updatedAt).toISOString()
      : new Date().toISOString(),
  };
}

export function normalizeMood(value) {
  if (
    value === null
    || value === undefined
    || (typeof value === "string" && !value.trim())
    || typeof value === "boolean"
  ) {
    return null;
  }
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 4 ? score : null;
}

export function applyDocumentStyle(element, value, base = DEFAULT_STYLE) {
  if (!element) return normalizeStyle(value, base);
  const style = normalizeStyle(value, base);
  element.dataset.docFont = style.font;
  element.style.setProperty("--doc-font-size", style.fontSize + "px");
  element.style.setProperty("--doc-line-height", String(style.lineHeight));
  element.style.setProperty("--doc-letter-spacing", style.letterSpacing + "em");
  element.style.setProperty("--doc-paragraph-gap", style.paragraphGap + "em");
  applyDocumentMedia(element, style).catch(() => null);
  return style;
}

export function weatherForCode(code) {
  const value = Number(code);
  if (value === 0) return { label: "晴", glyph: "☀" };
  if ([1, 2].includes(value)) return { label: value === 1 ? "少云" : "多云", glyph: "◐" };
  if (value === 3) return { label: "阴", glyph: "☁" };
  if ([45, 48].includes(value)) return { label: "有雾", glyph: "≋" };
  if ([51, 53, 55].includes(value)) return { label: "毛毛雨", glyph: "☂" };
  if ([56, 57].includes(value)) return { label: "冻毛毛雨", glyph: "☂" };
  if ([61, 63, 65].includes(value)) return { label: "下雨", glyph: "☂" };
  if ([66, 67].includes(value)) return { label: "冻雨", glyph: "☂" };
  if ([71, 73, 75].includes(value)) return { label: "下雪", glyph: "❄" };
  if (value === 77) return { label: "米雪", glyph: "❄" };
  if ([80, 81, 82].includes(value)) return { label: "阵雨", glyph: "☂" };
  if ([85, 86].includes(value)) return { label: "阵雪", glyph: "❄" };
  if (value === 95) return { label: "雷暴", glyph: "ϟ" };
  if ([96, 99].includes(value)) return { label: "雷暴冰雹", glyph: "ϟ" };
  return { label: "天气", glyph: "○" };
}

export function contextTemperature(context) {
  return context?.temperature === null || context?.temperature === undefined
    ? ""
    : context.temperature + "°C";
}

export function contextSummary(context) {
  if (!context) return "";
  return [context.place, context.weather, contextTemperature(context)].filter(Boolean).join(" · ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

export function contextBadgeMarkup(context, { compact = false } = {}) {
  if (!context) return "";
  const weather = weatherForCode(context.code);
  const details = [
    context.weather || weather.label,
    contextTemperature(context),
  ].filter(Boolean).join(" ");
  return '<span class="record-context' + (compact ? " record-context--compact" : "") + '">'
    + '<span>' + icon("pin") + escapeHtml(context.place || "当前位置") + "</span>"
    + '<span class="record-weather"><b aria-hidden="true">' + escapeHtml(weather.glyph) + "</b>"
    + escapeHtml(details) + "</span></span>";
}

export function updateContextButton(button, context, state = "idle") {
  if (!button) return;
  button.dataset.state = context ? "ready" : state;
  if (!context) {
    button.innerHTML = icon("pin") + "<span>定位天气</span>";
    button.setAttribute(
      "aria-label",
      state === "loading" ? "正在获取定位和天气" : "获取当前定位和天气",
    );
    return;
  }
  const weather = weatherForCode(context.code);
  const temperature = contextTemperature(context);
  button.innerHTML = icon("pin") + "<span>" + escapeHtml(context.place) + "</span>"
    + '<span class="context-weather"><b aria-hidden="true">' + escapeHtml(weather.glyph) + "</b>"
    + escapeHtml([context.weather || weather.label, temperature].filter(Boolean).join(" "))
    + "</span>";
  button.title = "点击重新获取当前定位和天气";
  button.setAttribute(
    "aria-label",
    "当前地点和天气：" + contextSummary(context) + "。点击重新获取",
  );
}

function geolocationPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("当前浏览器不支持定位。"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, error => {
      if (error.code === error.PERMISSION_DENIED) {
        reject(new Error("定位权限未开启，请在浏览器设置中允许位置访问。"));
      } else if (error.code === error.TIMEOUT) {
        reject(new Error("定位超时，请到窗边或稍后重试。"));
      } else {
        reject(new Error("暂时无法获取位置，请稍后重试。"));
      }
    }, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("天气服务暂时不可用。");
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("天气请求超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPlace(latitude, longitude) {
  const url = "https://api.bigdatacloud.net/data/reverse-geocode-client"
    + "?latitude=" + encodeURIComponent(latitude)
    + "&longitude=" + encodeURIComponent(longitude)
    + "&localityLanguage=zh";
  try {
    const data = await fetchJson(url);
    const city=cleanText(data.city || data.principalSubdivision, 32);
    const local=cleanText(data.locality, 32);
    const administrative=Array.isArray(data.localityInfo?.administrative)?data.localityInfo.administrative:[];
    const details=administrative.filter(item=>Number(item.adminLevel)>=6).map(item=>cleanText(item.name,32)).filter(Boolean);
    const pieces=[city,...details,local].filter(Boolean);
    return [...new Set(pieces)].filter((part,index,list)=>!list.some((other,i)=>i!==index&&other.length>part.length&&other.includes(part))).join(' · ').slice(0,80)||'当前位置';
  } catch {
    return "当前位置";
  }
}

async function fetchWeather(latitude, longitude) {
  const url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + encodeURIComponent(latitude)
    + "&longitude=" + encodeURIComponent(longitude)
    + "&current=temperature_2m,weather_code"
    + "&timezone=auto&forecast_days=1";
  return fetchJson(url);
}

export async function requestRecordContext() {
  const position = await geolocationPosition();
  const { latitude, longitude } = position.coords;
  const [placeResult, weatherResult] = await Promise.allSettled([
    fetchPlace(latitude, longitude),
    fetchWeather(latitude, longitude),
  ]);
  const weatherData = weatherResult.status === "fulfilled" ? weatherResult.value?.current : null;
  const code = weatherData?.weather_code != null && Number.isFinite(Number(weatherData.weather_code)) ? Number(weatherData.weather_code) : null;
  const temperature = weatherData?.temperature_2m != null && Number.isFinite(Number(weatherData.temperature_2m))
    ? Number(weatherData.temperature_2m)
    : null;
  const weather = weatherForCode(code).label;
  if (placeResult.status === "rejected" && weatherResult.status === "rejected") {
    throw new Error("已定位，但天气服务暂时不可用，请稍后重试。");
  }
  return normalizeContext({
    place: placeResult.status === "fulfilled" ? placeResult.value : "当前位置",
    weather,
    temperature,
    code,
    updatedAt: new Date().toISOString(),
  });
}

export function moodMarkup(index, { compact = false, selected = false } = {}) {
  const mood = MOOD_OPTIONS[index];
  if (!mood) return "";
  const mouth = [
    "M9 21q7-8 14 0",
    "M10 20q6-3 12 0",
    "M10 20q6 2 12 0",
    "M9 18q7 9 14 0",
    "M9 18q7 12 14 0z",
  ][index];
  const eyes = index === 4
    ? '<path d="M8 13q2-3 4 0m8 0q2-3 4 0"/>'
    : '<circle cx="10.5" cy="13" r="1" fill="currentColor"/><circle cx="21.5" cy="13" r="1" fill="currentColor"/>';
  return '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="currentColor" opacity=".13">'
    + '</circle><g stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round">'
    + eyes + '<path d="' + mouth + '"/></g></svg>'
    + (compact ? "" : "<span>" + mood.label + "</span>")
    + (selected ? '<span class="sr-only">已选择</span>' : "");
}

export function moodPickerMarkup(selected) {
  return MOOD_OPTIONS.map(mood => '<button type="button" class="inline-mood mood-' + mood.id + '"'
    + ' data-entry-mood="' + mood.id + '" aria-label="' + mood.label + '" title="' + mood.label + '"'
    + ' aria-pressed="' + (selected === mood.id) + '">'
    + moodMarkup(mood.id, { compact: true, selected: selected === mood.id }) + "</button>").join("");
}

export function updateMoodPicker(container, selected) {
  if (!container) return;
  container.querySelectorAll("[data-entry-mood]").forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.entryMood) === selected));
  });
}

export function firstImageFiles(dataTransfer) {
  return Array.from(dataTransfer?.files || []).filter(file => file.type.startsWith("image/"));
}

function fitDesktopStylePanel(details) {
  const panel = details.querySelector(".style-panel");
  if (!panel) return;
  panel.classList.remove("is-viewport-raised");
  panel.style.removeProperty("--style-panel-shift");
  if (!details.open || window.matchMedia("(max-width: 820px)").matches) return;
  requestAnimationFrame(() => {
    const overflow = panel.getBoundingClientRect().bottom - window.innerHeight + 12;
    if (overflow <= 0) return;
    panel.style.setProperty("--style-panel-shift", -Math.ceil(overflow) + "px");
    panel.classList.add("is-viewport-raised");
  });
}

function syncStylePanelState() {
  document.body.classList.toggle(
    "style-panel-open",
    Boolean(document.querySelector(".style-details[open]")),
  );
  document.querySelectorAll(".style-details").forEach(details => {
    details.querySelector("summary")?.setAttribute("aria-expanded", String(details.open));
    fitDesktopStylePanel(details);
  });
}

document.addEventListener("toggle", event => {
  if (event.target instanceof HTMLDetailsElement) syncStylePanelState();
}, true);

window.addEventListener("resize", () => {
  document.querySelectorAll(".style-details[open]").forEach(fitDesktopStylePanel);
});

document.addEventListener("click", event => {
  const details = document.querySelector(".style-details[open]");
  if (!details) return;
  if (event.target.closest("[data-style-done]")) {
    details.open = false;
    details.querySelector("summary")?.focus({ preventScroll: true });
  } else if (event.target === details || !details.contains(event.target)) {
    details.open = false;
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const details = document.querySelector(".style-details[open]");
  if (!details) return;
  details.open = false;
  details.querySelector("summary")?.focus();
  event.preventDefault();
});
