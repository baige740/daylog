import { entries, storedDraftEntries } from "./journal.js";
import { exportMediaBundle } from "./media.js";

const SETTINGS_KEY = "daylog:cloud:v1";
const CLOUD_VERSION = 1;
const KEY_PREFIX = "DAYLOG1.";
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAIN_SITE_ORIGIN = "https://daylog-journal-c7w4.caringcatkin4.chatgpt.site";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let active = false;
let uploadPromise = null;
let fingerprint = "";
let checkTimer = 0;
let backupTimer = 0;

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (parsed && typeof parsed === "object" && KEY_PATTERN.test(parsed.key || "")) {
      return parsed;
    }
  } catch {
    // A damaged preference is replaced with a fresh local sync code.
  }
  return null;
}

function randomSyncKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function writeSettings(value) {
  const config = {
    version: 1,
    key: value.key,
    createdAt: value.createdAt || new Date().toISOString(),
    lastHash: typeof value.lastHash === "string" ? value.lastHash : "",
    lastSuccess: typeof value.lastSuccess === "string" ? value.lastSuccess : "",
    lastError: typeof value.lastError === "string" ? value.lastError : "",
    lastMessage: typeof value.lastMessage === "string" ? value.lastMessage : "",
    recordCount: Number(value.recordCount) || 0,
    draftCount: Number(value.draftCount) || 0,
    mediaCount: Number(value.mediaCount) || 0,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
  return config;
}

function settings() {
  return readSettings() || writeSettings({ key: randomSyncKey() });
}

function saveSettings(patch) {
  return writeSettings({ ...settings(), ...patch });
}

function normalizedSyncCode(value) {
  let code = String(value || "").trim();
  if (code.startsWith(KEY_PREFIX)) code = code.slice(KEY_PREFIX.length);
  if (!KEY_PATTERN.test(code)) {
    throw new Error("恢复码格式不正确，请粘贴完整的 DAYLOG1. 开头恢复码。");
  }
  return code;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(code) {
  return crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(code),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function digestHex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function gzip(bytes) {
  if (!("CompressionStream" in globalThis)) return { bytes, compression: "none" };
  const compressed = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return {
    bytes: new Uint8Array(await new Response(compressed).arrayBuffer()),
    compression: "gzip",
  };
}

async function gunzip(bytes, compression) {
  if (compression === "none") return bytes;
  if (compression !== "gzip" || !("DecompressionStream" in globalThis)) {
    throw new Error("当前浏览器无法解压这份云端备份，请更新浏览器后重试。");
  }
  const expanded = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(expanded).arrayBuffer());
}

async function encryptBundle(bundle, code) {
  const serialized = textEncoder.encode(JSON.stringify(bundle));
  const compressed = await gzip(serialized);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(code),
    compressed.bytes,
  );
  return {
    format: KEY_PREFIX.slice(0, -1),
    version: CLOUD_VERSION,
    compression: compressed.compression,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptPayload(payload, code) {
  if (
    !payload
    || payload.format !== "DAYLOG1"
    || payload.version !== CLOUD_VERSION
    || typeof payload.iv !== "string"
    || typeof payload.ciphertext !== "string"
  ) {
    throw new Error("云端备份格式不正确。");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    await encryptionKey(code),
    base64ToBytes(payload.ciphertext),
  );
  const expanded = await gunzip(new Uint8Array(decrypted), payload.compression);
  return JSON.parse(textDecoder.decode(expanded));
}

function apiUrl(path) {
  const localOrigin = ["127.0.0.1", "localhost"].includes(location.hostname);
  const apiOrigin = localOrigin || location.hostname.endsWith(".chatgpt.site")
    ? ""
    : MAIN_SITE_ORIGIN;
  return apiOrigin + "/api/journal" + path;
}

function emit(detail) {
  window.dispatchEvent(new CustomEvent("daylog:cloud-status", { detail }));
}

function failure(error) {
  const message = error instanceof Error ? error.message : "云端备份失败。";
  const config = saveSettings({ lastError: message, lastMessage: message });
  emit({ phase: "error", message, config });
  return config;
}

async function request(path, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(apiUrl(path), options);
      if (response.status === 404) {
        const error = new Error("云端还没有这份手记的备份。");
        error.status = 404;
        throw error;
      }
      if (!response.ok) {
        let detail = "";
        try {
          detail = (await response.json()).error || "";
        } catch {
          // Keep the generic message when the server did not return JSON.
        }
        throw new Error(detail || "云端服务暂时不可用，请稍后重试。");
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error?.status === 404 || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError || new Error("云端服务暂时不可用，请稍后重试。");
}

export async function buildJournalBackup() {
  const records = entries();
  const drafts = storedDraftEntries();
  const { media, missingIds } = await exportMediaBundle(
    records,
    drafts.map(item => item.value),
  );
  return {
    payload: {
      app: "daylog",
      version: 3,
      exportedAt: new Date().toISOString(),
      entries: records,
      drafts,
      media,
      missingMedia: missingIds,
    },
    counts: {
      records: records.length,
      drafts: drafts.length,
      media: media.length,
      missingMedia: missingIds.length,
    },
  };
}

export function getJournalCloudState() {
  const config = settings();
  return {
    configured: true,
    recoveryCode: KEY_PREFIX + config.key,
    lastSuccess: config.lastSuccess,
    lastError: config.lastError,
    lastMessage: config.lastMessage,
    recordCount: config.recordCount,
    draftCount: config.draftCount,
    mediaCount: config.mediaCount,
  };
}

export async function uploadJournalBackup({ force = false } = {}) {
  if (uploadPromise) return uploadPromise;
  if (!navigator.onLine) {
    return failure(new Error("当前没有网络，已保存在本机，联网后会自动重试。"));
  }
  uploadPromise = (async () => {
    const config = settings();
    emit({ phase: "uploading", message: "正在加密并上传手记…", config });
    const { payload, counts } = await buildJournalBackup();
    if (!counts.records && !counts.drafts && !counts.media) {
      const message = "还没有可上传的手记或图片。";
      const updated = saveSettings({ lastMessage: message, lastError: "" });
      emit({ phase: "empty", message, config: updated, counts });
      return { skipped: true, message, counts };
    }
    const serialized = textEncoder.encode(JSON.stringify(payload));
    const hash = await digestHex(serialized);
    if (!force && config.lastHash === hash && config.lastSuccess) {
      const message = "云端已是最新版本。";
      const updated = saveSettings({ lastMessage: message, lastError: "" });
      emit({ phase: "current", message, config: updated, counts });
      return { skipped: true, message, counts };
    }
    const encrypted = await encryptBundle(payload, config.key);
    const data = await request("/backup", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: CLOUD_VERSION,
        digest: hash,
        counts,
        payload: encrypted,
      }),
    });
    const success = saveSettings({
      lastHash: hash,
      lastSuccess: data.updatedAt || new Date().toISOString(),
      lastError: "",
      lastMessage: "已自动加密备份到云端，并等待 GitHub 镜像。",
      recordCount: counts.records,
      draftCount: counts.drafts,
      mediaCount: counts.media,
    });
    emit({
      phase: "success",
      message: success.lastMessage,
      config: success,
      counts,
      id: data.id,
    });
    return { skipped: false, data, counts };
  })().catch(error => {
    fingerprint = "";
    failure(error);
    throw error;
  }).finally(() => {
    uploadPromise = null;
  });
  return uploadPromise;
}

export async function restoreJournalBackup(code, { activate = true } = {}) {
  const syncCode = normalizedSyncCode(code);
  const response = await request("/snapshot", {
    headers: { Authorization: "Bearer " + syncCode },
  });
  const payload = await decryptPayload(response.payload, syncCode);
  if (payload?.app !== "daylog" || !Array.isArray(payload.entries)) {
    throw new Error("云端备份内容不完整。");
  }
  if (!activate) {
    return { payload, updatedAt: response.updatedAt || "", syncCode };
  }
  const current = settings();
  writeSettings({
    ...current,
    key: syncCode,
    lastHash: "",
    lastSuccess: response.updatedAt || "",
    lastError: "",
    lastMessage: "已从云端取回最新备份。",
  });
  emit({
    phase: "restored",
    message: "已从云端取回最新备份。",
    config: settings(),
  });
  return { payload, updatedAt: response.updatedAt || "" };
}

export function replaceJournalSyncCode(code) {
  const syncCode = normalizedSyncCode(code);
  const updated = writeSettings({
    key: syncCode,
    createdAt: new Date().toISOString(),
    lastHash: "",
    lastSuccess: "",
    lastError: "",
    lastMessage: "已切换到新的云端恢复码。",
  });
  fingerprint = "";
  emit({ phase: "code", message: updated.lastMessage, config: updated });
  return updated;
}

function localFingerprint() {
  let hash = 2166136261;
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      key?.startsWith("daylog:entry:")
      || key?.startsWith("daylog:draft:")
      || key?.startsWith("daylog:article-draft:")
    ) {
      keys.push(key);
    }
  }
  keys.sort();
  for (const key of keys) {
    const value = localStorage.getItem(key) || "";
    const sample = key + "\u0000" + value.length + "\u0000" + value;
    for (let index = 0; index < sample.length; index += 1) {
      hash ^= sample.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return String(hash >>> 0) + ":" + keys.length;
}

function scheduleBackup(delay = 1400) {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    const next = localFingerprint();
    fingerprint = next;
    uploadJournalBackup().catch(() => null);
  }, delay);
}

export function startJournalCloud() {
  if (active) return;
  active = true;
  fingerprint = localFingerprint();
  scheduleBackup(1800);
  checkTimer = setInterval(() => {
    const next = localFingerprint();
    if (next !== fingerprint) {
      fingerprint = next;
      clearTimeout(backupTimer);
      backupTimer = setTimeout(() => {
        uploadJournalBackup().catch(() => null);
      }, 1500);
    }
  }, 6000);
  window.addEventListener("storage", () => scheduleBackup(800));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      const next = localFingerprint();
      if (next !== fingerprint) {
        fingerprint = next;
        uploadJournalBackup().catch(() => null);
      }
    }
  });
  window.addEventListener("online", () => scheduleBackup(400));
  window.addEventListener("pagehide", () => clearInterval(checkTimer), { once: true });
}
