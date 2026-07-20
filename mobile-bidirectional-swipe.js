(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const SWIPE_MIN_PX = 34;
  const SWIPE_RATIO = 1.05;

  function decideFallbackSwipe(start, end, currentPane = "field", viewportWidth = 390) {
    if (!start || !end) return currentPane;
    const dx = Number(end.x) - Number(start.x);
    const dy = Number(end.y) - Number(start.y);
    const threshold = Math.max(SWIPE_MIN_PX, Number(viewportWidth || 0) * 0.09);
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return currentPane;
    if (currentPane === "field" && dx < 0) return "chat";
    if (currentPane === "chat" && dx > 0) return "field";
    return currentPane;
  }

  function isEditableTarget(target) {
    return Boolean(target?.closest?.("textarea, input, select, [contenteditable='true']"));
  }

  const TEST_API = Object.freeze({ decideFallbackSwipe, isEditableTarget });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_BIDIRECTIONAL_SWIPE_TEST__ = TEST_API;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let gesture = null;

  function isMobileInvestigation() {
    const mobile = window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
    return Boolean(mobile && document.body?.classList.contains("mobile-investigation-active"));
  }

  function currentPane() {
    return document.body?.classList.contains("mobile-investigation-chat") ? "chat" : "field";
  }

  function beginGesture({ id, x, y, target, captureTarget = null }) {
    if (!isMobileInvestigation() || !target?.closest?.(".retro-investigation") || isEditableTarget(target)) return;
    gesture = {
      id,
      start: { x, y },
      last: { x, y },
      pane: currentPane(),
      horizontal: false,
      captureTarget,
    };
    try { captureTarget?.setPointerCapture?.(id); } catch {}
  }

  function moveGesture({ id, x, y, preventDefault }) {
    if (!gesture || (gesture.id !== null && id !== gesture.id)) return;
    gesture.last = { x, y };
    const dx = x - gesture.start.x;
    const dy = y - gesture.start.y;
    if (!gesture.horizontal && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) {
      gesture.horizontal = true;
    }
    if (gesture.horizontal) preventDefault?.();
  }

  function finishGesture({ id, x, y }) {
    if (!gesture || (gesture.id !== null && id !== gesture.id)) return;
    const completed = gesture;
    gesture = null;
    try { completed.captureTarget?.releasePointerCapture?.(completed.id); } catch {}

    const end = {
      x: Number.isFinite(x) ? x : completed.last.x,
      y: Number.isFinite(y) ? y : completed.last.y,
    };
    const desiredPane = decideFallbackSwipe(completed.start, end, completed.pane, window.innerWidth || 390);
    if (desiredPane === completed.pane) return;

    // The original root handler may already have completed the switch.
    if (currentPane() !== completed.pane) return;
    document.querySelector("[data-mobile-investigation-toggle]")?.click();
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    beginGesture({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target: event.target,
      captureTarget: event.target,
    });
  }, true);

  document.addEventListener("pointermove", (event) => {
    moveGesture({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      preventDefault: () => event.preventDefault(),
    });
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    finishGesture({ id: event.pointerId, x: event.clientX, y: event.clientY });
  }, true);

  document.addEventListener("pointercancel", (event) => {
    finishGesture({ id: event.pointerId, x: gesture?.last.x, y: gesture?.last.y });
  }, true);

  if (!("PointerEvent" in window)) {
    document.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      beginGesture({ id: null, x: touch.clientX, y: touch.clientY, target: event.target });
    }, { capture: true, passive: true });

    document.addEventListener("touchmove", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      moveGesture({ id: null, x: touch.clientX, y: touch.clientY, preventDefault: () => event.preventDefault() });
    }, { capture: true, passive: false });

    document.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      finishGesture({ id: null, x: touch?.clientX, y: touch?.clientY });
    }, true);

    document.addEventListener("touchcancel", () => {
      finishGesture({ id: null, x: gesture?.last.x, y: gesture?.last.y });
    }, true);
  }
})();
