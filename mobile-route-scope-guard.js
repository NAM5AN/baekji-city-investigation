(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const ACTIVE_CLASSES = [
    "mobile-investigation-active",
    "mobile-investigation-chat",
    "mobile-investigation-field",
  ];
  const ROUTE_ATTRIBUTE = "data-mobile-investigation-route";

  function routePage(hashValue = "") {
    return String(hashValue || "").replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "";
  }

  function routeIsInvestigation(hashValue = "") {
    return routePage(hashValue) === "investigate";
  }

  function shouldKeepMobileInvestigationScope({ hashValue = "", rootExists = false, mobile = true } = {}) {
    return Boolean(mobile && rootExists && routeIsInvestigation(hashValue));
  }

  const TEST_API = Object.freeze({ routePage, routeIsInvestigation, shouldKeepMobileInvestigationScope });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_ROUTE_SCOPE_TEST__ = TEST_API;

  if (typeof window === "undefined" || typeof document === "undefined") return;

  let resetQueued = false;

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
      element.style.removeProperty("--mobile-investigation-transform");
      element.removeAttribute("data-mobile-swipe-bound");
    });
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
    return false;
  }

  function scheduleReset() {
    if (resetQueued) return;
    resetQueued = true;
    queueMicrotask(() => {
      resetQueued = false;
      resetOutsideInvestigation();
    });
  }

  function resetBeforeOutsideTouch() {
    if (!shouldKeepMobileInvestigationScope({
      hashValue: location.hash,
      rootExists: Boolean(investigationRoot()),
      mobile: isMobile(),
    })) resetOutsideInvestigation();
  }

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