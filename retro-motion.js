(() => {
  "use strict";

  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");
  if (!app) return;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const cleanupTimers = new WeakMap();
  let initialized = false;
  let frameId = 0;
  let lastRoute = "";
  let lastSessionId = "";
  let lastTab = "";
  let lastLocation = "";
  let lastSpecial = "";
  let lastValues = new Map();

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

  function cleanupTypingArtifacts(root = document) {
    root.querySelectorAll?.(".motion-type-target, [data-motion-typing='true']").forEach((target) => {
      const fullText = target.dataset?.motionFullText;
      if (fullText != null && target.textContent !== fullText) target.textContent = fullText;
      target.classList.remove("motion-type-target", "is-typing");
      delete target.dataset.motionTyping;
    });
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

  function animateNewEntries() {
    const entries = [...document.querySelectorAll(
      ".motion-stable-new:not([data-motion-animated='true'])"
    )].filter((element) => !element.classList.contains("retro-action-result-pending")).slice(-8);

    entries.forEach((element, index) => {
      element.dataset.motionAnimated = "true";
      element.style.setProperty("--motion-index", String(index));
      const isChat = element.matches(".retro-chat-message, .retro-chat-divider");
      animateOnce(element, isChat ? "motion-chat-new" : "motion-system-new", 880);
    });
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
    cleanupTypingArtifacts(app);

    const route = routeKey();
    const mountedSession = sessionId();
    const routeChanged = !initialized || route !== lastRoute || mountedSession !== lastSessionId;
    const tab = activeTab();
    const locationText = currentLocation();
    const special = specialStateSignature();

    if (routeChanged) {
      animatePage();
    } else {
      animateNewEntries();
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
    if (frameId) return;
    frameId = requestAnimationFrame(() => requestAnimationFrame(processRender));
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
  }

  const appObserver = new MutationObserver(scheduleProcess);
  appObserver.observe(app, { childList: true });
  if (modalRoot) animateModalRoot(modalRoot);
  if (toastRoot) animateToastRoot(toastRoot);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button, [role='button']");
    if (!button || button.matches(":disabled")) return;
    if (button.matches(".retro-tab")) animateOnce(button, "motion-tab-selected", 430);
  }, true);

  reduceMotion?.addEventListener?.("change", () => {
    document.documentElement.dataset.retroMotion = "ready";
    cleanupTypingArtifacts(app);
    scheduleProcess();
  });

  window.__BAEKJI_RETRO_MOTION_TEST__ = Object.freeze({
    routeKey,
    motionEnabled,
    cleanupTypingArtifacts,
    animateNewEntries,
  });

  cleanupTypingArtifacts(app);
  scheduleProcess();
})();