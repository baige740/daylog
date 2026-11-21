const AUTH_KEY = "daylog:auth:v1";
const SESSION_KEY = "daylog:auth:session";
const RECOVERY_KEY = "daylog:auth:recovered";
const RECOVERY_WORD = "lixueyin";
const MIN_PASSWORD_LENGTH = 4;
const HASH_ITERATIONS = 210000;
const textEncoder = new TextEncoder();
let memoryUnlocked = false;

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

async function derivePasswordHash(password, salt, iterations = HASH_ITERATIONS) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前浏览器不支持安全密码校验，请更新浏览器后重试。");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function equalHash(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    if (
      parsed?.version !== 1
      || typeof parsed.salt !== "string"
      || typeof parsed.hash !== "string"
      || !Number.isInteger(parsed.iterations)
      || parsed.iterations < 100000
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeConfig(config) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(config));
}

function isRecoveryWord(value) {
  return value.trim().toLowerCase() === RECOVERY_WORD;
}

function sessionMarker(config) {
  if (!config) return null;
  return config.hash + ":" + (typeof config.sessionVersion === "string" ? config.sessionVersion : "");
}

function hasStoredSession(config) {
  if (!config) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === sessionMarker(config);
  } catch {
    return false;
  }
}

function canUseSession(config) {
  if (!config) return false;
  if (memoryUnlocked) return true;
  return hasStoredSession(config);
}

function markUnlocked(config, recovered = false) {
  memoryUnlocked = true;
  try {
    sessionStorage.setItem(SESSION_KEY, sessionMarker(config));
    if (recovered) sessionStorage.setItem(RECOVERY_KEY, "1");
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // The page remains unlocked for this load when session storage is unavailable.
  }
}

function lockPageContent() {
  const locked = [];
  for (const element of document.body.children) {
    if (
      element.classList.contains("auth-gate")
      || element.classList.contains("auth-settings-layer")
      || element.tagName === "SCRIPT"
      || element.tagName === "STYLE"
    ) {
      continue;
    }
    locked.push({
      element,
      hadInert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    });
    element.setAttribute("inert", "");
    element.setAttribute("aria-hidden", "true");
  }
  return locked;
}

function unlockPageContent(lockedElements) {
  for (const entry of lockedElements) {
    if (!entry.hadInert) entry.element.removeAttribute("inert");
    if (entry.ariaHidden === null) entry.element.removeAttribute("aria-hidden");
    else entry.element.setAttribute("aria-hidden", entry.ariaHidden);
  }
}

function gateTemplate(content, title, description) {
  return `
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-copy">
      <div class="auth-brand">
        <span class="auth-mark" aria-hidden="true">日</span>
        <span>
          <span class="auth-brand-name">日迹</span>
          <span class="auth-brand-sub">PRIVATE DAYLOG</span>
        </span>
      </div>
      <p class="auth-eyebrow">只属于你的本机手记</p>
      <h1 id="auth-title">${title}</h1>
      <p class="auth-copy" id="auth-copy">${description}</p>
      ${content}
      <p class="auth-note">密码不会上传，只在这台设备的浏览器中校验。关闭这个标签页后，下次进入需要重新解锁。</p>
    </section>
  `;
}

function passwordField({ id, label, autocomplete, placeholder = "请输入密码" }) {
  return `
    <label class="auth-field" for="${id}">
      <span>${label}</span>
      <span class="auth-input">
        <input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" required>
        <button class="auth-reveal" type="button" data-auth-reveal aria-label="显示密码">显示</button>
      </span>
    </label>
  `;
}

function bindRevealButtons(root) {
  const button = root.querySelector("[data-auth-reveal]");
  if (!button) return;
  button.addEventListener("click", () => {
    const inputs = [...root.querySelectorAll('input[type="password"], input[data-revealed="true"]')];
    const revealing = inputs[0]?.type === "password";
    for (const input of inputs) {
      input.type = revealing ? "text" : "password";
      if (revealing) input.dataset.revealed = "true";
      else delete input.dataset.revealed;
    }
    button.textContent = revealing ? "隐藏" : "显示";
    button.setAttribute("aria-label", revealing ? "隐藏密码" : "显示密码");
  });
}

function setError(root, message) {
  const error = root.querySelector(".auth-error");
  if (!error) return;
  error.textContent = message;
  if (!message) return;
  const card = root.querySelector(".auth-card");
  if (!card || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  card.classList.remove("is-shaking");
  void card.offsetWidth;
  card.classList.add("is-shaking");
}

function setBusy(form, busy, label = "正在进入…") {
  form.setAttribute("aria-busy", String(busy));
  for (const control of form.querySelectorAll("input, button")) control.disabled = busy;
  const submit = form.querySelector(".auth-submit");
  if (submit) submit.textContent = busy ? label : submit.dataset.idleLabel;
}

function focusSoon(element) {
  requestAnimationFrame(() => element?.focus({ preventScroll: true }));
}

function finishUnlock(gate, config, lockedElements, resolve, recovered = false) {
  markUnlocked(config, recovered);
  gate.classList.add("is-leaving");
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
  setTimeout(() => {
    gate.remove();
    document.documentElement.classList.remove("daylog-auth-checking");
    unlockPageContent(lockedElements);
    resolve(true);
  }, duration);
}

function showSetup(gate, lockedElements, resolve) {
  gate.innerHTML = gateTemplate(
    `
      <form class="auth-form" id="auth-form" novalidate>
        ${passwordField({ id: "auth-password", label: "设置访问密码", autocomplete: "new-password", placeholder: "至少 4 位" })}
        ${passwordField({ id: "auth-confirm", label: "再输入一次", autocomplete: "new-password", placeholder: "确认访问密码" })}
        <p class="auth-error" role="alert" aria-live="polite"></p>
        <button class="auth-submit" type="submit" data-idle-label="保存并进入">保存并进入</button>
      </form>
    `,
    "为你的手记加一把锁",
    "第一次使用，请设置一个自己记得住的访问密码。以后打开日迹时输入它即可。",
  );
  const form = gate.querySelector("#auth-form");
  const password = gate.querySelector("#auth-password");
  const confirmation = gate.querySelector("#auth-confirm");
  bindRevealButtons(form);
  focusSoon(password);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    setError(gate, "");
    if (password.value.length < MIN_PASSWORD_LENGTH) {
      setError(gate, `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
      focusSoon(password);
      return;
    }
    if (isRecoveryWord(password.value)) {
      setError(gate, "找回词语不能设置为访问密码，请换一个。");
      focusSoon(password);
      return;
    }
    if (password.value !== confirmation.value) {
      setError(gate, "两次输入的密码不一致。");
      focusSoon(confirmation);
      return;
    }

    setBusy(form, true, "正在保存…");
    try {
      const salt = randomSalt();
      const hash = await derivePasswordHash(password.value, salt);
      const config = {
        version: 1,
        iterations: HASH_ITERATIONS,
        salt,
        hash,
        createdAt: new Date().toISOString(),
      };
      writeConfig(config);
      finishUnlock(gate, config, lockedElements, resolve);
    } catch (error) {
      setBusy(form, false);
      setError(gate, error instanceof Error ? error.message : "密码保存失败，请重试。");
    }
  });
}

function showRecovery(gate, config, lockedElements, resolve) {
  gate.innerHTML = gateTemplate(
    `
      <form class="auth-form" id="recovery-form" novalidate>
        <label class="auth-field" for="recovery-word">
          <span>找回词语</span>
          <span class="auth-input">
            <input id="recovery-word" name="recovery-word" type="password" autocomplete="off" placeholder="输入找回词语" required>
            <button class="auth-reveal" type="button" data-auth-reveal aria-label="显示找回词语">显示</button>
          </span>
        </label>
        <p class="auth-error" role="alert" aria-live="polite"></p>
        <button class="auth-submit" type="submit" data-idle-label="验证并进入">验证并进入</button>
      </form>
      <div class="auth-links">
        <button class="auth-link" id="back-to-login" type="button">返回密码登录</button>
      </div>
    `,
    "使用找回词语",
    "输入约定的找回词语即可进入。进入后，可以在“我的手记本”中设置新的访问密码。",
  );
  const form = gate.querySelector("#recovery-form");
  const input = gate.querySelector("#recovery-word");
  bindRevealButtons(form);
  focusSoon(input);

  gate.querySelector("#back-to-login").addEventListener("click", () => {
    showLogin(gate, config, lockedElements, resolve);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    setError(gate, "");
    if (!isRecoveryWord(input.value)) {
      setError(gate, "找回词语不正确，请重试。");
      focusSoon(input);
      return;
    }
    finishUnlock(gate, config, lockedElements, resolve, true);
  });
}

function showLogin(gate, config, lockedElements, resolve) {
  gate.innerHTML = gateTemplate(
    `
      <form class="auth-form" id="login-form" novalidate>
        ${passwordField({ id: "login-password", label: "访问密码", autocomplete: "current-password" })}
        <p class="auth-error" role="alert" aria-live="polite"></p>
        <button class="auth-submit" type="submit" data-idle-label="进入日迹">进入日迹</button>
      </form>
      <div class="auth-links">
        <span></span>
        <button class="auth-link" id="forgot-password" type="button">忘记密码？</button>
      </div>
    `,
    "欢迎回来",
    "输入访问密码，继续记录今天。",
  );
  const form = gate.querySelector("#login-form");
  const password = gate.querySelector("#login-password");
  bindRevealButtons(form);
  focusSoon(password);

  gate.querySelector("#forgot-password").addEventListener("click", () => {
    showRecovery(gate, config, lockedElements, resolve);
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setError(gate, "");
    if (!password.value) {
      setError(gate, "请输入访问密码。");
      focusSoon(password);
      return;
    }
    if (isRecoveryWord(password.value)) {
      finishUnlock(gate, config, lockedElements, resolve, true);
      return;
    }

    setBusy(form, true, "正在验证…");
    try {
      const candidate = await derivePasswordHash(password.value, config.salt, config.iterations);
      if (!equalHash(candidate, config.hash)) {
        setBusy(form, false);
        setError(gate, "密码不正确，请重试。");
        password.select();
        return;
      }
      finishUnlock(gate, config, lockedElements, resolve);
    } catch (error) {
      setBusy(form, false);
      setError(gate, error instanceof Error ? error.message : "密码验证失败，请重试。");
    }
  });
}

export async function requireLogin() {
  const config = readConfig();
  if (canUseSession(config)) {
    document.documentElement.classList.remove("daylog-auth-checking");
    return true;
  }

  document.documentElement.classList.add("daylog-auth-checking");
  return new Promise(resolve => {
    const gate = document.createElement("div");
    gate.className = "auth-gate";
    const lockedElements = lockPageContent();
    document.body.append(gate);
    if (config) showLogin(gate, config, lockedElements, resolve);
    else showSetup(gate, lockedElements, resolve);
  });
}

export function consumeRecoveryNotice() {
  try {
    if (sessionStorage.getItem(RECOVERY_KEY) !== "1") return false;
    sessionStorage.removeItem(RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function lockNow() {
  const config = readConfig();
  memoryUnlocked = false;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Reloading still restores the gate in this tab when session storage is unavailable.
  }
  try {
    if (config) {
      writeConfig({
        ...config,
        sessionVersion: crypto.randomUUID?.() || String(Date.now()),
        lockedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Other tabs cannot be invalidated when local storage is unavailable.
  }
  document.documentElement.classList.add("daylog-auth-checking");
  location.reload();
}

export function openPasswordSettings() {
  const config = readConfig();
  if (!config) {
    lockNow();
    return;
  }

  const previousFocus = document.activeElement;
  const lockedElements = lockPageContent();
  const layer = document.createElement("div");
  layer.className = "auth-settings-layer";
  layer.innerHTML = gateTemplate(
    `
      <button class="auth-close" id="close-password-settings" type="button" aria-label="关闭密码设置">×</button>
      <form class="auth-form" id="password-settings-form" novalidate>
        ${passwordField({ id: "current-password", label: "当前密码", autocomplete: "current-password", placeholder: "也可以输找回词语" })}
        ${passwordField({ id: "new-password", label: "新的访问密码", autocomplete: "new-password", placeholder: "至少 4 位" })}
        ${passwordField({ id: "new-password-confirm", label: "再次输入新密码", autocomplete: "new-password", placeholder: "确认新的访问密码" })}
        <p class="auth-error" role="alert" aria-live="polite"></p>
        <p class="auth-success" role="status" aria-live="polite"></p>
        <button class="auth-submit" type="submit" data-idle-label="更新访问密码">更新访问密码</button>
      </form>
    `,
    "设置访问密码",
    "更新后，旧密码将立即失效。已经在当前标签页中的会话会保持解锁。",
  );
  document.body.append(layer);
  bindRevealButtons(layer);
  focusSoon(layer.querySelector("#current-password"));

  const close = () => {
    layer.remove();
    unlockPageContent(lockedElements);
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  };
  layer.querySelector("#close-password-settings").addEventListener("click", close);
  layer.addEventListener("click", event => {
    if (event.target === layer) close();
  });
  layer.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });

  const form = layer.querySelector("#password-settings-form");
  const current = layer.querySelector("#current-password");
  const next = layer.querySelector("#new-password");
  const confirmation = layer.querySelector("#new-password-confirm");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const success = layer.querySelector(".auth-success");
    success.textContent = "";
    setError(layer, "");

    setBusy(form, true, "正在验证…");
    try {
      const recoveryAllowed = isRecoveryWord(current.value);
      const currentMatches = recoveryAllowed
        || equalHash(
          await derivePasswordHash(current.value, config.salt, config.iterations),
          config.hash,
        );
      if (!currentMatches) {
        setBusy(form, false);
        setError(layer, "当前密码不正确。");
        current.select();
        return;
      }
      if (next.value.length < MIN_PASSWORD_LENGTH) {
        setBusy(form, false);
        setError(layer, `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
        next.focus();
        return;
      }
      if (isRecoveryWord(next.value)) {
        setBusy(form, false);
        setError(layer, "找回词语不能设置为访问密码，请换一个。");
        next.focus();
        return;
      }
      if (next.value !== confirmation.value) {
        setBusy(form, false);
        setError(layer, "两次输入的新密码不一致。");
        confirmation.focus();
        return;
      }

      const salt = randomSalt();
      const hash = await derivePasswordHash(next.value, salt);
      const updated = {
        version: 1,
        iterations: HASH_ITERATIONS,
        salt,
        hash,
        createdAt: config.createdAt,
        updatedAt: new Date().toISOString(),
      };
      writeConfig(updated);
      markUnlocked(updated);
      setBusy(form, false);
      success.textContent = "访问密码已更新。";
      window.setTimeout(close, 900);
    } catch (error) {
      setBusy(form, false);
      setError(layer, error instanceof Error ? error.message : "密码更新失败，请重试。");
    }
  });
}

window.addEventListener("storage", event => {
  if (event.key !== AUTH_KEY) return;
  const config = readConfig();
  if (!hasStoredSession(config)) location.reload();
});

window.addEventListener("pageshow", event => {
  if (!event.persisted || document.querySelector(".auth-gate")) return;
  if (!hasStoredSession(readConfig())) location.reload();
});
