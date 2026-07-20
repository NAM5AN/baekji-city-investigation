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

  let queued = false;

  function isMobile() {
    return window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
  }

  function removeInvestigationControls() {
    document.querySelectorAll(
      "[data-mobile-investigation-toggle], " +
      "[data-mobile-investigation-indicator], " +
      "[data-mobile-investigation-live], " +
      "[data-mobile-investigation-hint]"
    ).forEach((element) => element.remove());
  }

  function clearLeakedInvestigationLayout() {
    const body = document.body;
    if (!body) return;

    ACTIVE_CLASSES.forEach((className) => body.classList.remove(className));
    body.removeAttribute("data-mobile-investigation-mounted");
    body.removeAttribute(ROUTE_ATTRIBUTE);
    document.documentElement.style.removeProperty("--mobile-investigation-topbar");
    removeInvestigationControls();

    document.querySelectorAll("[data-mobile-investigation-root]").forEach((element) => {
      element.removeAttribute("data-mobile-investigation-root");
      element.style.removeProperty("--mobile-investigation-transform");
    });
  }

  function enforceRouteScope() {
    queued = false;
    const root = document.querySelector(".retro-investigation[data-session-id]");
    const keepScope = shouldKeepMobileInvestigationScope({
      hashValue: location.hash,
      rootExists: Boolean(root),
      mobile: isMobile(),
    });

    if (keepScope) {
      document.body?.setAttribute(ROUTE_ATTRIBUTE, "1");
      return true;
    }

    clearLeakedInvestigationLayout();
    return false;
  }

  function scheduleEnforcement() {
    if (!routeIsInvestigation(location.hash)) {
      enforceRouteScope();
      return;
    }
    if (queued) return;
    queued = true;
    queueMicrotask(enforceRouteScope);
  }

  function clearBeforeTouchOutsideInvestigation() {
    if (!routeIsInvestigation(location.hash)) enforceRouteScope();
  }

  window.addEventListener("hashchange", scheduleEnforcement);
  window.addEventListener("popstate", scheduleEnforcement);
  window.addEventListener("pageshow", scheduleEnforcement);
  window.addEventListener("resize", scheduleEnforcement);
  window.visualViewport?.addEventListener?.("resize", scheduleEnforcement);
  document.addEventListener("pointerdown", clearBeforeTouchOutsideInvestigation, true);
  document.addEventListener("touchstart", clearBeforeTouchOutsideInvestigation, { capture: true, passive: true });
  document.addEventListener("visibilitychange", scheduleEnforcement);

  const observer = new MutationObserver(scheduleEnforcement);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  enforceRouteScope();
})();
