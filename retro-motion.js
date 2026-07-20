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

  function animateNewEntries(entries, known, className) {
    const newEntries = entries.filter(({ signature }) => !known.has(signature)).slice(-8);
    newEntries.forEach(({ element }, index) => {
      element.style.setProperty("--motion-index", String(index));
      animateOnce(element, className, 880);
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
      animateNewEntries(systemEntries, knownSystem, "motion-system-new");
      animateNewEntries(chatEntries, knownChat, "motion-chat-new");
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

  function animateAddedChildren(root, selector, className) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          const candidates = [node, ...node.querySelectorAll(selector)].filter((element) => element.matches(selector));
          candidates.forEach((element, index) => {
            element.style.setProperty("--motion-index", String(index));
            animateOnce(element, className, 760);
          });
        });
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return observer;
  }

  const appObserver = new MutationObserver(scheduleProcess);
  appObserver.observe(app, { childList: true, subtree: true });
  if (modalRoot) animateAddedChildren(modalRoot, ":scope > *, .modal, .dialog, [role='dialog']", "motion-modal-enter");
  if (toastRoot) animateAddedChildren(toastRoot, ":scope > *, .toast", "motion-toast-enter");

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
  });

  scheduleProcess();
})();