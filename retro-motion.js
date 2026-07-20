(() => {
  "use strict";

  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");
  if (!app) return;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const knownSystem = new Set();
  const knownChat = new Set();
  let initialized = false;
  let frameId = 0;
  let lastRoute = "";
  let lastSessionId = "";
  let lastTab = "";
  let lastLocation = "";
  let lastSpecial = "";
  let lastValues = new Map();

  const cleanupTimers = new WeakMap();
  const typingTimers = new WeakMap();

  function routeKey() {
    return location.hash.replace(/^#\/?/, "") || "login";
  }

  function sessionId() {
    return document.querySelector(".retro-investigation")?.dataset.sessionId || "";
  }

  function motionEnabled() {
    return !reduceMotion?.matches;
  }

  function animateOnce(element, className, duration = 760) {
    if (!element || !motionEnabled()) return;
    const previousTimer = cleanupTimers.get(element);
    if (previousTimer) clearTimeout(previousTimer);
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    const timer = setTimeout(() => {
      element.classList.remove(className);
      cleanupTimers.delete(element);
    }, duration);
    cleanupTimers.set(element, timer);
  }

  function flashScreen() {
    if (!motionEnabled()) return;
    let flash = document.getElementById("retro-motion-flash");
    if (!flash) {
      flash = document.createElement("div");
      flash.id = "retro-motion-flash";
      flash.setAttribute("aria-hidden", "true");
      document.body.appendChild(flash);
    }
    animateOnce(flash, "is-active", 430);
  }

  function elementSignatures(selector) {
    const counts = new Map();
    return [...document.querySelectorAll(selector)].map((element) => {
      const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
      const count = (counts.get(text) || 0) + 1;
      counts.set(text, count);
      return { element, signature: `${text}::${count}` };
    });
  }

  function replaceKnown(target, entries) {
    target.clear();
    entries.forEach(({ signature }) => target.add(signature));
  }

  function ensureSystemTypingTarget(element) {
    const existing = element.querySelector(".retro-character-log-text, .retro-system-copy");
    if (existing) return existing;
    const time = element.querySelector(".retro-log-time");
    const nodes = [...element.childNodes].filter((node) => node !== time && node.nodeType === Node.TEXT_NODE);
    const text = nodes.map((node) => node.textContent || "").join("");
    if (!text.trim()) return null;
    element.dataset.motionTyping = "true";
    const target = document.createElement("span");
    target.className = "retro-system-copy";
    target.textContent = text;
    nodes.forEach((node) => node.remove());
    element.appendChild(target);
    return target;
  }

  function typingTargetFor(element, kind) {
    if (kind === "chat") return element.querySelector(".retro-chat-bubble");
    if (kind === "system") return ensureSystemTypingTarget(element);
    return null;
  }

  function typeText(target, { speed = 9, maxDuration = 680 } = {}) {
    if (!target || !motionEnabled()) return;
    const original = String(target.textContent || "");
    if (!original.trim() || original.length < 2) return;
    const previous = typingTimers.get(target);
    if (previous) clearTimeout(previous);

    const characters = [...original];
    const delay = Math.max(4, Math.min(speed, Math.floor(maxDuration / Math.max(1, characters.length))));
    let index = 0;
    target.dataset.motionTyping = "true";
    target.classList.add("motion-type-target", "is-typing");
    target.textContent = "";

    const step = () => {
      if (!target.isConnected) return;
      index = Math.min(characters.length, index + Math.max(1, Math.ceil(characters.length / 70)));
      target.textContent = characters.slice(0, index).join("");
      if (index < characters.length) {
        const timer = setTimeout(step, delay);
        typingTimers.set(target, timer);
        return;
      }
      target.textContent = original;
      target.classList.remove("is-typing");
      typingTimers.delete(target);
      setTimeout(() => {
        target.classList.remove("motion-type-target");
        delete target.dataset.motionTyping;
        const line = target.closest("[data-motion-typing]");
        if (line && line !== target) delete line.dataset.motionTyping;
      }, 50);
    };

    const timer = setTimeout(step, 42);
    typingTimers.set(target, timer);
  }

  function animateNewEntries(entries, known, className, kind) {
    const newEntries = entries.filter(({ signature }) => !known.has(signature)).slice(-8);
    newEntries.forEach(({ element }, index) => {
      element.style.setProperty("--motion-index", String(index));
      animateOnce(element, className, 880);
      const target = typingTargetFor(element, kind);
      if (target) setTimeout(() => typeText(target, { speed: kind === "system" ? 7 : 9 }), index * 34 + 65);
    });
    replaceKnown(known, entries);
  }

  function animatePage() {
    const shell = app.querySelector(".shell") || app.firstElementChild;
    animateOnce(shell, "motion-page-enter", 620);

    const candidates = [...app.querySelectorAll([
      ".hero",
      "main > .card",
      "main > .section",
      ".briefing",
      ".result-summary",
      ".retro-scene-frame",
      ".retro-system-panel",
      ".retro-right-panel",
    ].join(","))].slice(0, 12);

    candidates.forEach((element, index) => {
      element.style.setProperty("--motion-index", String(index));
      animateOnce(element, "motion-cascade-item", 720);
    });
    flashScreen();
  }

  function activeTab() {
    return document.querySelector(".retro-tab.active")?.dataset.tab || "";
  }

  function currentLocation() {
    return String(document.querySelector(".retro-location-card strong")?.textContent || "").trim();
  }

  function specialStateSignature() {
    return [...document.querySelectorAll(".retro-motion-overlay, .retro-current-risk, .retro-scene-choice-overlay")]
      .map((element) => String(element.textContent || "").replace(/\s+/g, " ").trim())
      .join("|");
  }

  function animateTabChange(tab) {
    if (!tab || !lastTab || tab === lastTab) return;
    animateOnce(document.querySelector(".retro-tab-body"), "motion-tab-enter", 520);
    animateOnce(document.querySelector(`.retro-tab[data-tab="${CSS.escape(tab)}"]`), "motion-tab-selected", 430);
  }

  function animateLocationChange(locationText) {
    if (!locationText || !lastLocation || locationText === lastLocation) return;
    animateOnce(document.querySelector(".retro-scene-frame"), "motion-scene-shift", 680);
    animateOnce(document.querySelector(".retro-location-card"), "motion-location-update", 560);
    flashScreen();
  }

  function animateSpecialState(signature) {
    if (!signature || signature === lastSpecial) return;
    document.querySelectorAll(".retro-motion-overlay, .retro-current-risk, .retro-scene-choice-overlay").forEach((element) => {
      animateOnce(element, "motion-modal-enter", 540);
    });
  }

  function valueKey(element, index) {
    const classKey = String(element.className || element.tagName).replace(/\s+/g, ".");
    const parentLabel = String(element.closest(".card, .member, .retro-location-card, .retro-field-card")?.querySelector("h1,h2,h3,strong,.list-title,.muted")?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    return `${classKey}:${parentLabel}:${index}`;
  }

  function animateChangedValues(routeChanged) {
    const nextValues = new Map();
    const elements = [...document.querySelectorAll([
      ".kpi-value",
      ".status-pills .badge",
      ".retro-field-card span",
      "[data-ai-status]",
      ".retro-current-risk strong",
    ].join(","))];

    elements.forEach((element, index) => {
      const key = valueKey(element, index);
      const value = String(element.textContent || "").replace(/\s+/g, " ").trim();
      nextValues.set(key, value);
      if (!routeChanged && lastValues.has(key) && lastValues.get(key) !== value) {
        animateOnce(element, "retro-motion-value-change", 520);
      }
    });
    lastValues = nextValues;

    document.querySelectorAll("[data-ai-status]").forEach((element) => {
      const pending = /(중|확인 중|읽고)/.test(String(element.textContent || ""));
      element.classList.toggle("motion-thinking", pending && motionEnabled());
    });
  }

  function processRender() {
    frameId = 0;
    const route = routeKey();
    const mountedSession = sessionId();
    const routeChanged = !initialized || route !== lastRoute || mountedSession !== lastSessionId;
    const tab = activeTab();
    const locationText = currentLocation();
    const special = specialStateSignature();
    const systemEntries = elementSignatures(".retro-system-line");
    const chatEntries = elementSignatures(".retro-chat-message, .retro-chat-divider");

    if (routeChanged) {
      animatePage();
      replaceKnown(knownSystem, systemEntries);
      replaceKnown(knownChat, chatEntries);
    } else {
      animateNewEntries(systemEntries, knownSystem, "motion-system-new", "system");
      animateNewEntries(chatEntries, knownChat, "motion-chat-new", "chat");
      animateTabChange(tab);
      animateLocationChange(locationText);
      animateSpecialState(special);
    }

    animateChangedValues(routeChanged);

    lastRoute = route;
    lastSessionId = mountedSession;
    lastTab = tab;
    lastLocation = locationText;
    lastSpecial = special;
    initialized = true;
    document.documentElement.dataset.retroMotion = "ready";
  }

  function scheduleProcess() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => requestAnimationFrame(processRender));
  }

  function isTypingMutation(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    return Boolean(target?.closest?.("[data-motion-typing]"));
  }

  function animateModalRoot(root) {
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
      requestAnimationFrame(() => {
        const backdrop = root.querySelector(".retro-modal-backdrop");
        const modal = root.querySelector(".retro-modal");
        if (!backdrop || !modal) return;
        animateOnce(backdrop, "motion-modal-backdrop", 520);
        animateOnce(modal, modal.classList.contains("retro-map-modal") ? "motion-map-unfold" : "motion-modal-enter", 760);
      });
    });
    observer.observe(root, { childList: true });
    return observer;
  }

  function animateToastRoot(root) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const toast = node.matches(".toast") ? node : node.querySelector(".toast");
        if (toast) animateOnce(toast, "motion-toast-enter", 760);
      }));
    });
    observer.observe(root, { childList: true, subtree: true });
    return observer;
  }

  const appObserver = new MutationObserver((mutations) => {
    if (mutations.every(isTypingMutation)) return;
    scheduleProcess();
  });
  appObserver.observe(app, { childList: true, subtree: true });
  if (modalRoot) animateModalRoot(modalRoot);
  if (toastRoot) animateToastRoot(toastRoot);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button, [role='button']");
    if (!button || button.matches(":disabled")) return;
    if (button.matches(".retro-tab")) animateOnce(button, "motion-tab-selected", 430);
  }, true);

  reduceMotion?.addEventListener?.("change", () => {
    document.documentElement.dataset.retroMotion = "ready";
    scheduleProcess();
  });

  window.__BAEKJI_RETRO_MOTION_TEST__ = Object.freeze({
    routeKey,
    elementSignatures,
    motionEnabled,
    typeText,
  });

  scheduleProcess();
})();