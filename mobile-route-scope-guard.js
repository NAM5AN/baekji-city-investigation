(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const ACTIVE_CLASSES = [
    "mobile-investigation-active",
    "mobile-investigation-chat",
    "mobile-investigation-field",
  ];
  const ROUTE_ATTRIBUTE = "data-mobile-investigation-route";
  const NON_INVESTIGATION_CLASS = "mobile-non-investigation-route";
  const RESET_PROPERTIES = [
    "position",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "height",
    "min-height",
    "max-height",
    "overflow",
    "overflow-x",
    "overflow-y",
    "overscroll-behavior",
    "touch-action",
    "transform",
    "contain",
  ];

  function routePage(hashValue = "") {
    return String(hashValue || "").replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "";
  }

  function routeIsInvestigation(hashValue = "") {
    return routePage(hashValue) === "investigate";
  }

  function shouldKeepMobileInvestigationScope({ hashValue = "", rootExists = false, mobile = true, homeMode = false, pageMode = false } = {}) {
    return Boolean(mobile && rootExists && routeIsInvestigation(hashValue) && !homeMode && !pageMode);
  }

  const TEST_API = Object.freeze({ routePage, routeIsInvestigation, shouldKeepMobileInvestigationScope });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_ROUTE_SCOPE_TEST__ = TEST_API;

  if (typeof window === "undefined" || typeof document === "undefined") return;

  let queued = false;

  function isMobile() {
    return window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
  }

  function setImportant(element, property, value) {
    element?.style?.setProperty?.(property, value, "important");
  }

  function removeRestorationStyles(element) {
    if (!element?.style) return;
    RESET_PROPERTIES.forEach((property) => element.style.removeProperty(property));
  }

  function removeInvestigationControls() {
    document.querySelectorAll(
      "[data-mobile-investigation-toggle], " +
      "[data-mobile-investigation-indicator], " +
      "[data-mobile-investigation-live], " +
      "[data-mobile-investigation-hint]"
    ).forEach((element) => element.remove());
  }

  function restoreDocumentScrolling() {
    const body = document.body;
    const app = document.getElementById("app");
    const shell = app?.querySelector(":scope > .shell") || document.querySelector(".shell");
    const main = shell?.querySelector("main");

    document.documentElement.classList.add(NON_INVESTIGATION_CLASS);
    [document.documentElement, body].forEach((element) => {
      setImportant(element, "position", "static");
      setImportant(element, "width", "100%");
      setImportant(element, "height", "auto");
      setImportant(element, "min-height", "0");
      setImportant(element, "max-height", "none");
      setImportant(element, "overflow-x", "hidden");
      setImportant(element, "overflow-y", "auto");
      setImportant(element, "overscroll-behavior", "auto");
      setImportant(element, "touch-action", "pan-y");
      setImportant(element, "transform", "none");
    });

    [app, shell, main].forEach((element) => {
      setImportant(element, "position", "static");
      setImportant(element, "inset", "auto");
      setImportant(element, "width", "100%");
      setImportant(element, "height", "auto");
      setImportant(element, "min-height", "0");
      setImportant(element, "max-height", "none");
      setImportant(element, "overflow", "visible");
      setImportant(element, "overflow-x", "visible");
      setImportant(element, "overflow-y", "visible");
      setImportant(element, "overscroll-behavior", "auto");
      setImportant(element, "touch-action", "pan-y");
      setImportant(element, "transform", "none");
      setImportant(element, "contain", "none");
    });
  }

  function clearRestorationStyles() {
    document.documentElement.classList.remove(NON_INVESTIGATION_CLASS);
    const app = document.getElementById("app");
    const shell = app?.querySelector(":scope > .shell") || document.querySelector(".shell");
    const main = shell?.querySelector("main");
    [document.documentElement, document.body, app, shell, main].forEach(removeRestorationStyles);
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

    restoreDocumentScrolling();
  }

  function enforceRouteScope() {
    queued = false;
    const body = document.body;
    const root = document.querySelector(".retro-investigation[data-session-id]");
    const homeMode = Boolean(body?.classList.contains("retro-home-mode"));
    const pageMode = Boolean(body?.classList.contains("retro-page-mode"));
    const keepScope = shouldKeepMobileInvestigationScope({
      hashValue: location.hash,
      rootExists: Boolean(root),
      mobile: isMobile(),
      homeMode,
      pageMode,
    });

    if (keepScope) {
      clearRestorationStyles();
      body?.setAttribute(ROUTE_ATTRIBUTE, "1");
      return true;
    }

    clearLeakedInvestigationLayout();
    return false;
  }

  function scheduleEnforcement() {
    if (!routeIsInvestigation(location.hash) || document.body?.classList.contains("retro-home-mode") || document.body?.classList.contains("retro-page-mode")) {
      enforceRouteScope();
      return;
    }
    if (queued) return;
    queued = true;
    queueMicrotask(enforceRouteScope);
  }

  function clearBeforeTouchOutsideInvestigation() {
    const body = document.body;
    if (!routeIsInvestigation(location.hash) || body?.classList.contains("retro-home-mode") || body?.classList.contains("retro-page-mode")) {
      enforceRouteScope();
    }
  }

  window.addEventListener("hashchange", scheduleEnforcement);
  window.addEventListener("popstate", scheduleEnforcement);
  window.addEventListener("pageshow", scheduleEnforcement);
  window.addEventListener("resize", scheduleEnforcement);
  window.addEventListener("orientationchange", scheduleEnforcement);
  window.visualViewport?.addEventListener?.("resize", scheduleEnforcement);
  document.addEventListener("pointerdown", clearBeforeTouchOutsideInvestigation, true);
  document.addEventListener("touchstart", clearBeforeTouchOutsideInvestigation, { capture: true, passive: true });
  document.addEventListener("visibilitychange", scheduleEnforcement);

  const observer = new MutationObserver(scheduleEnforcement);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  enforceRouteScope();
  requestAnimationFrame(enforceRouteScope);
  setTimeout(enforceRouteScope, 120);
})();