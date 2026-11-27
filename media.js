const DB_NAME = "daylog-media-v1";
const DB_VERSION = 1;
const STORE_NAME = "assets";
const ASSET_ID = /^media_[a-zA-Z0-9-]{1,80}$/;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const objectUrls = new Map();
let databasePromise = null;

function createId() {
  const suffix = globalThis.crypto?.randomUUID?.()
    || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return "media_" + suffix;
}

function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("当前浏览器不支持本地图片库。"));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("图片库打开失败。"));
  });
  return databasePromise;
}

async function transaction(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("图片存储失败。"));
    tx.onabort = () => reject(tx.error || new Error("图片存储已中止。"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("图片读取失败。"));
  });
}

function loadWithImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("这张图片无法读取，请换一张 JPEG、PNG 或 WebP 图片。"));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in globalThis) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Some browsers support createImageBitmap but not every camera format.
    }
  }
  return loadWithImageElement(file);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败，请重试。"));
    }, type, quality);
  });
}

function renderCanvas(image, maxSide) {
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效。");
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fffefb";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return { canvas, width, height };
}

export async function compressImage(file, { kind = "photo" } = {}) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("单张图片不能超过 20 MB。");
  }
  const image = await decodeImage(file);
  let maxSide = kind === "background" ? 1920 : 1600;
  let quality = kind === "background" ? 0.74 : 0.82;
  let output = null;
  let dimensions = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = renderCanvas(image, maxSide);
    dimensions = { width: rendered.width, height: rendered.height };
    output = await canvasBlob(rendered.canvas, "image/webp", quality);
    if (output.size <= (kind === "background" ? 650 * 1024 : 520 * 1024)) break;
    maxSide = Math.max(720, Math.round(maxSide * 0.82));
    quality = Math.max(0.58, quality - 0.07);
  }
  image.close?.();
  return {
    blob: output,
    width: dimensions.width,
    height: dimensions.height,
    mime: output.type || "image/webp",
  };
}

export async function saveImageAsset(file, { kind = "photo" } = {}) {
  const compressed = await compressImage(file, { kind });
  const asset = {
    id: createId(),
    kind,
    mime: compressed.mime,
    width: compressed.width,
    height: compressed.height,
    createdAt: new Date().toISOString(),
    blob: compressed.blob,
  };
  await transaction("readwrite", store => store.put(asset));
  return {
    id: asset.id,
    kind: asset.kind,
    mime: asset.mime,
    size: asset.blob.size,
    width: asset.width,
    height: asset.height,
  };
}

export async function getImageAsset(id) {
  if (!ASSET_ID.test(String(id))) return null;
  const database = await openDatabase();
  const tx = database.transaction(STORE_NAME, "readonly");
  return requestResult(tx.objectStore(STORE_NAME).get(id));
}

async function mediaUrl(id) {
  if (!ASSET_ID.test(String(id))) return "";
  if (objectUrls.has(id)) return objectUrls.get(id);
  const asset = await getImageAsset(id);
  if (!asset?.blob) return "";
  const url = URL.createObjectURL(asset.blob);
  objectUrls.set(id, url);
  return url;
}

function openPhoto(source) {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-viewer";
  dialog.setAttribute("aria-label", "全屏查看照片");
  const photo = document.createElement("img");
  photo.src = source.src;
  photo.alt = source.alt;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "关闭";
  close.autofocus = true;
  close.onclick = () => dialog.close();
  dialog.onclick = event => {
    if (event.target === dialog) dialog.close();
  };
  dialog.addEventListener("close", () => dialog.remove(), {once:true});
  dialog.append(photo, close);
  document.body.append(dialog);
  dialog.showModal();
}

function enablePhotoPreview(image) {
  if (image.parentElement?.classList.contains("photo-trigger")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "photo-trigger";
  button.setAttribute("aria-label", "放大查看：" + image.alt);
  button.onclick = () => openPhoto(image);
  image.replaceWith(button);
  button.append(image);
}

export async function hydrateMedia(root, {preview = false} = {}) {
  if (!root?.querySelectorAll) return;
  const images = Array.from(root.querySelectorAll("img[data-media-id]"));
  await Promise.all(images.map(async image => {
    const id = image.dataset.mediaId;
    const url = await mediaUrl(id).catch(() => "");
    image.classList.toggle("is-missing", !url);
    if (url) {
      image.src = url;
      image.alt ||= "日记照片";
      image.loading = "lazy";
      image.decoding = "async";
      if (preview) enablePhotoPreview(image);
    } else {
      image.removeAttribute("src");
      image.alt = "图片未找到";
      image.title = "这张图片没有随当前浏览器保存";
    }
  }));
}

export async function applyDocumentMedia(element, style) {
  if (!element) return;
  const mode = style?.background || "paper";
  element.dataset.docBg = mode;
  element.style.removeProperty("--doc-bg-image");
  if (mode === "custom" && style?.backgroundAssetId) {
    const url = await mediaUrl(style.backgroundAssetId).catch(() => "");
    if (url) element.style.setProperty("--doc-bg-image", 'url("' + url + '")');
    else element.dataset.docBg = "paper";
  }
}

export function insertImageFigure(editor, asset) {
  if (!editor || !ASSET_ID.test(String(asset?.id))) return false;
  const figure = document.createElement("figure");
  figure.dataset.mediaBlock = asset.id;
  const image = document.createElement("img");
  image.dataset.mediaId = asset.id;
  image.alt = "日记照片";
  const caption = document.createElement("figcaption");
  caption.dataset.placeholder = "写一句图片说明";
  figure.append(image, caption);

  const selection = getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  let insertionBlock = null;
  if (range && editor.contains(range.commonAncestorContainer)) {
    range.collapse(false);
    const focus = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    insertionBlock = focus?.closest("p, div, li, blockquote, h3, figure") || null;
    if (insertionBlock === editor || !editor.contains(insertionBlock)) {
      insertionBlock = null;
    }
  }
  if (insertionBlock) {
    insertionBlock.after(figure);
  } else if (range && editor.contains(range.commonAncestorContainer)) {
    range.insertNode(figure);
  } else {
    editor.append(figure);
  }
  const paragraph = document.createElement("p");
  paragraph.append(document.createElement("br"));
  figure.after(paragraph);
  const nextRange = document.createRange();
  nextRange.setStart(paragraph, 0);
  nextRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  editor.focus();
  return true;
}

export async function addImagesToEditor(editor, files, onChange) {
  const selected = Array.from(files || []).filter(file => file?.type?.startsWith("image/"));
  if (!selected.length) return 0;
  let count = 0;
  try {
    for (const file of selected) {
      const asset = await saveImageAsset(file);
      await hydrateMediaIntoEditor(editor, asset.id);
      count += 1;
    }
  } finally {
    if (count) onChange?.();
  }
  return count;
}

async function hydrateMediaIntoEditor(editor, id) {
  insertImageFigure(editor, { id });
  await hydrateMedia(editor);
}

export function collectMediaIds(html) {
  const ids = new Set();
  for (const match of String(html).matchAll(/data-media-id=["'](media_[a-zA-Z0-9-]{1,80})["']/g)) {
    ids.add(match[1]);
  }
  return ids;
}

function allReferencedIds(records, drafts = []) {
  const ids = new Set();
  for (const record of records || []) {
    for (const id of collectMediaIds(record.html)) ids.add(id);
    if (record.style?.backgroundAssetId) ids.add(record.style.backgroundAssetId);
  }
  for (const draft of drafts || []) {
    for (const id of collectMediaIds(draft?.html)) ids.add(id);
    if (draft?.style?.backgroundAssetId) ids.add(draft.style.backgroundAssetId);
  }
  return ids;
}

function cursorValues(store, operation) {
  return new Promise((resolve, reject) => {
    const values = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(values);
        return;
      }
      if (operation(cursor.value)) values.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error("图片读取失败。"));
  });
}

export async function cleanupUnreferencedMedia(records, drafts = [], { minimumAgeMs = 30 * 60 * 1000 } = {}) {
  const referenced = allReferencedIds(records, drafts);
  const database = await openDatabase();
  const readTx = database.transaction(STORE_NAME, "readonly");
  const cutoff = Date.now() - Math.max(0, Number(minimumAgeMs) || 0);
  const unreferenced = (await cursorValues(readTx.objectStore(STORE_NAME), asset => {
    const created = Date.parse(asset?.createdAt || "");
    return !referenced.has(asset?.id) && Number.isFinite(created) && created <= cutoff;
  })).map(asset => asset.id);
  if (unreferenced.length) {
    await transaction("readwrite", store => {
      for (const key of unreferenced) store.delete(key);
    });
  }
  for (const [id, url] of objectUrls) {
    if (!referenced.has(id)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(id);
    }
  }
  return unreferenced.length;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("图片备份读取失败。"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl, fallbackType) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=\s]+)$/.exec(dataUrl || "");
  if (!match) throw new Error("备份中的图片格式无效。");
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: fallbackType || match[1] });
}

export async function exportReferencedMedia(records, drafts = []) {
  return (await exportMediaBundle(records, drafts)).media;
}

export async function exportMediaBundle(records, drafts = []) {
  const ids = allReferencedIds(records, drafts);
  const media = [];
  const missingIds = [];
  for (const id of ids) {
    const asset = await getImageAsset(id);
    if (!asset) {
      missingIds.push(id);
      continue;
    }
    media.push({
      id: asset.id,
      kind: asset.kind,
      mime: asset.mime,
      width: asset.width,
      height: asset.height,
      data: await blobToDataUrl(asset.blob),
    });
  }
  return {media, missingIds};
}

export async function importMediaAssets(items) {
  if (!Array.isArray(items)) return {addedIds: [], count: 0};
  const assets = [];
  for (const item of items) {
    const id = String(item?.id || "");
    if (!ASSET_ID.test(id) || !MIME_TYPES.has(item?.mime)) {
      throw new Error("备份中的图片信息无效。");
    }
    const blob = dataUrlToBlob(item.data, item.mime);
    if (!MIME_TYPES.has(blob.type) || blob.size > 20 * 1024 * 1024) {
      throw new Error("备份中的图片过大或格式不受支持。");
    }
    assets.push({
      id,
      kind: item.kind === "background" ? "background" : "photo",
      mime: item.mime,
      width: Math.max(0, Number(item.width) || 0),
      height: Math.max(0, Number(item.height) || 0),
      createdAt: new Date().toISOString(),
      blob,
    });
  }
  if (!assets.length) return {addedIds: [], count: 0};
  const addedIds = [];
  await transaction("readwrite", store => {
    for (const asset of assets) {
      const request = store.get(asset.id);
      request.onsuccess = () => {
        if (!request.result) {
          store.put(asset);
          addedIds.push(asset.id);
        }
      };
    }
  });
  return {addedIds, count: addedIds.length};
}

export async function deleteMediaAssets(ids) {
  const valid = Array.from(new Set(ids || [])).filter(id => ASSET_ID.test(String(id)));
  if (!valid.length) return 0;
  await transaction("readwrite", store => {
    for (const id of valid) store.delete(id);
  });
  for (const id of valid) {
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
  return valid.length;
}

export function referencedMediaIds(records, drafts = []) {
  return allReferencedIds(records, drafts);
}
