(() => {
  "use strict";

  const ACTIVE_CLASS = "mobile-pane-user-switching";
  const SWIPE_MIN_PX = 46;
  const SWIPE_RATIO = 1.18;
  let clearTimer = 0;
  let pointerStart = null;

  function beginUserTransition() {
    const body = document.body;
    if (!body?.classList.contains("mobile-investigation-active")) return false;
    body.classList.add(ACTIVE_CLASS);
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => body.classList.remove(ACTIVE_CLASS), 320);
    return true;
  }

  function qualifiesAsPaneSwipe(start, end) {
    if (!start || !end) return false;
    const dx = Number(end.x) - Number(start.x);
    const dy = Number(end.y) - Number(start.y);
    const threshold = Math.max(SWIPE_MIN_PX, Number(window.innerWidth || 0) * 0.12);
    return Math.abs(dx) >= threshold && Math.abs(dx) >= Math.abs(dy) * SWIPE_RATIO;
  }

  const TEST_API = Object.freeze({ qualifiesAsPaneSwipe });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_PANEL_LAYOUT_TEST__ = TEST_API;
  if (typeof document === "undefined") return;

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-mobile-investigation-toggle]")) beginUserTransition();
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !event.target?.closest?.(".retro-investigation")) {
      pointerStart = null;
      return;
    }
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);

  document.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const start = pointerStart;
    pointerStart = null;
    if (qualifiesAsPaneSwipe(start, { x: event.clientX, y: event.clientY })) beginUserTransition();
  }, true);

  document.addEventListener("pointercancel", () => { pointerStart = null; }, true);
  window.addEventListener("hashchange", () => {
    document.body?.classList.remove(ACTIVE_CLASS);
    pointerStart = null;
  });
})();
