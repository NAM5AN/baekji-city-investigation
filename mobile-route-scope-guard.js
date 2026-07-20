(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const ACTIVE_CLASSES = [
    "mobile-investigation-active",
    "mobile-investigation-chat",
    "mobile-investigation-field",
  ];
  const ROUTE_ATTRIBUTE = "data-mobile-investigation-route";
  const LOGIN_SETTLING_ATTRIBUTE = "data-mobile-login-viewport-settling";
  const STALE_STYLE_PROPERTIES = [
    "height",
    "min-height",
    "max-height",
    "overflow",
    "overflow-x",
    "overflow-y",
    "position",
    "inset",
    "touch-action",
  ];

  function routePage(hashValue = "") {
    return String(hashValue || "").replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "";
  }

  function routeIsInvestigation(hashValue = "") {
    return routePage(hashValue) === "investigate";
  }

  function shouldKeepMobileInvestigationScope({ hashValue = "", rootExists = false, mobile = true } = {}) {
    return Boolean(mobile && rootExists && routeIsInvestigation(hashValue));
  }

  function isLoginFormTarget(target) {
    return Boolean(target?.matches?.("[data-login-form]"));
  }

  const TEST_API = Object.freeze({
    routePage,
    routeIsInvestigation,
    shouldKeepMobileInvestigationScope,
    isLoginFormTarget,
  });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_ROUTE_SCOPE_TEST__ = TEST_API;

  if (typeof window === "undefined" || typeof document === "undefined") return;

  let resetQueued = false;
  let loginViewportPending = false;
  let viewportSettleTimer = 0;

  function isMobile() {
    return window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
  }

  function investigationRoot() {
    return document.querySelector(".retro-investigation[data-session-id]");
  }

  function removeInvestigationControls() {
    document.querySelectorAll(
      "[data-mobile-investigation-toggle], " +
      "[data-mobile-investigation-indicator], " +
      "[data-mobile-investigation-live], " +
      "[data-mobile-investigation-hint]"
    ).forEach((element) => element.remove());
  }

  function clearInvestigationMarkers() {
    document.querySelectorAll("[data-mobile-investigation-root]").forEach((element) => {
      element.removeAttribute("data-mobile-investigation-root");
      element.removeAttribute("data-mobile-swipe-bound");
      element.style.removeProperty("--mobile-investigation-transform");
    });
  }

  function clearStaleViewportStyles() {
    const targets = [
      document.documentElement,
      document.body,
      document.getElementById("app"),
      document.querySelector("#app > .shell"),
    ].filter(Boolean);

    targets.forEach((element) => {
      STALE_STYLE_PROPERTIES.forEach((property) => element.style.removeProperty(property));
    });
  }

  function blurActiveControl() {
    const active = document.activeElement;
    if (!active?.matches?.("input, textarea, select, [contenteditable='true']")) return false;
    active.blur?.();
    return true;
  }

  function resetOutsideInvestigation() {
    const rootExists = Boolean(investigationRoot());
    const keepScope = shouldKeepMobileInvestigationScope({
      hashValue: location.hash,
      rootExists,
      mobile: isMobile(),
    });

    if (keepScope) {
      document.body?.setAttribute(ROUTE_ATTRIBUTE, "1");
      document.body?.removeAttribute(LOGIN_SETTLING_ATTRIBUTE);
      return true;
    }

    const body = document.body;
    if (!body) return false;

    ACTIVE_CLASSES.forEach((className) => body.classList.remove(className));
    body.removeAttribute("data-mobile-investigation-mounted");
    body.removeAttribute(ROUTE_ATTRIBUTE);
    document.documentElement.style.removeProperty("--mobile-investigation-topbar");
    removeInvestigationControls();
    clearInvestigationMarkers();
    clearStaleViewportStyles();
    return false;
  }

  function resetHomeScrollPosition() {
    if (!isMobile() || routePage(location.hash) !== "home") return;
    window.scrollTo?.(0, 0);
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) {
      scrollingElement.scrollTop = 0;
      scrollingElement.scrollLeft = 0;
    }
    document.documentElement.getBoundingClientRect();
  }

  function finishLoginViewportRelease() {
    if (!loginViewportPending || routePage(location.hash) !== "home") return;
    loginViewportPending = false;
    blurActiveControl();
    document.body?.setAttribute(LOGIN_SETTLING_ATTRIBUTE, "1");
    resetOutsideInvestigation();

    let attempts = 0;
    const settle = () => {
      attempts += 1;
      resetOutsideInvestigation();
      resetHomeScrollPosition();
      if (attempts < 7) {
        viewportSettleTimer = window.setTimeout(settle, 70);
      } else {
        document.body?.removeAttribute(LOGIN_SETTLING_ATTRIBUTE);
      }
    };

    window.clearTimeout(viewportSettleTimer);
    requestAnimationFrame(settle);
  }

  function prepareLoginViewportRelease(event) {
    if (!isMobile() || !isLoginFormTarget(event.target)) return;
    loginViewportPending = true;
    blurActiveControl();
  }

  function scheduleReset() {
    if (resetQueued) return;
    resetQueued = true;
    queueMicrotask(() => {
      resetQueued = false;
      resetOutsideInvestigation();
      finishLoginViewportRelease();
    });
  }

  function resetBeforeOutsideTouch() {
    if (!shouldKeepMobileInvestigationScope({
      hashValue: location.hash,
      rootExists: Boolean(investigationRoot()),
      mobile: isMobile(),
    })) resetOutsideInvestigation();
  }

  document.addEventListener("submit", prepareLoginViewportRelease, true);
  window.addEventListener("hashchange", scheduleReset);
  window.addEventListener("popstate", scheduleReset);
  window.addEventListener("pageshow", scheduleReset);
  window.addEventListener("resize", scheduleReset);
  window.addEventListener("orientationchange", scheduleReset);
  window.visualViewport?.addEventListener?.("resize", scheduleReset);
  document.addEventListener("pointerdown", resetBeforeOutsideTouch, true);
  document.addEventListener("touchstart", resetBeforeOutsideTouch, { capture: true, passive: true });

  const appRoot = document.getElementById("app");
  if (appRoot) {
    const observer = new MutationObserver(scheduleReset);
    observer.observe(appRoot, { childList: true });
  }

  resetOutsideInvestigation();
  requestAnimationFrame(resetOutsideInvestigation);
})();
