(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const SWIPE_MIN_PX = 20;
  const SWIPE_VIEWPORT_RATIO = 0.05;
  const SWIPE_RATIO = 0.6;
  const SWIPE_LOCK_PX = 5;
  const SWIPE_LOCK_RATIO = 0.45;
  const CANCEL_GRACE_MS = 260;
  const CLICK_SUPPRESS_MS = 520;

  function decideFallbackSwipe(start, end, currentPane = "field", viewportWidth = 390) {
    if (!start || !end) return currentPane;
    const dx = Number(end.x) - Number(start.x);
    const dy = Number(end.y) - Number(start.y);
    const threshold = Math.max(SWIPE_MIN_PX, Number(viewportWidth || 0) * SWIPE_VIEWPORT_RATIO);
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return currentPane;
    if (currentPane === "field" && dx < 0) return "chat";
    if (currentPane === "chat" && dx > 0) return "field";
    return currentPane;
  }

  function isEditableTarget(target) {
    return Boolean(target?.closest?.("textarea, input, select, [contenteditable='true'], [data-mobile-no-swipe]"));
  }

  const TEST_API = Object.freeze({ decideFallbackSwipe, isEditableTarget });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_BIDIRECTIONAL_SWIPE_TEST__ = TEST_API;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let gesture = null;
  let suppressClickUntil = 0;

  function isMobileInvestigation() {
    const mobile = window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
    return Boolean(mobile && document.body?.classList.contains("mobile-investigation-active"));
  }

  function currentPane() {
    return document.body?.classList.contains("mobile-investigation-chat") ? "chat" : "field";
  }

  function clearCancelTimer(target = gesture) {
    if (!target?.cancelTimer) return;
    clearTimeout(target.cancelTimer);
    target.cancelTimer = null;
  }

  function beginGesture({ source, id, x, y, target, captureTarget = null }) {
    const investigation = target?.closest?.(".retro-investigation");
    if (!isMobileInvestigation() || !investigation || isEditableTarget(target)) return;

    if (gesture) {
      if (source === "pointer" && gesture.pointerId == null) gesture.pointerId = id;
      if (source === "touch" && gesture.touchId == null) gesture.touchId = id;
      return;
    }

    gesture = {
      pointerId: source === "pointer" ? id : null,
      touchId: source === "touch" ? id : null,
      start: { x, y },
      last: { x, y },
      pane: currentPane(),
      horizontal: false,
      captureTarget: captureTarget || investigation,
      cancelTimer: null,
    };

    if (source === "pointer") {
      try { gesture.captureTarget?.setPointerCapture?.(id); } catch {}
    }
  }

  function idMatches(source, id) {
    if (!gesture) return false;
    if (source === "pointer") return gesture.pointerId == null || gesture.pointerId === id;
    if (source === "touch") return gesture.touchId == null || gesture.touchId === id;
    return true;
  }

  function moveGesture({ source, id, x, y, preventDefault }) {
    if (!gesture || !idMatches(source, id)) return;
    clearCancelTimer();
    if (source === "pointer" && gesture.pointerId == null) gesture.pointerId = id;
    if (source === "touch" && gesture.touchId == null) gesture.touchId = id;

    gesture.last = { x, y };
    const dx = x - gesture.start.x;
    const dy = y - gesture.start.y;
    if (!gesture.horizontal && Math.abs(dx) >= SWIPE_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * SWIPE_LOCK_RATIO) {
      gesture.horizontal = true;
    }
    if (gesture.horizontal) preventDefault?.();
  }

  function finishGesture({ source, id, x, y, force = false }) {
    if (!gesture || (!force && !idMatches(source, id))) return;
    const completed = gesture;
    gesture = null;
    clearCancelTimer(completed);
    try { completed.captureTarget?.releasePointerCapture?.(completed.pointerId); } catch {}

    const end = {
      x: Number.isFinite(x) ? x : completed.last.x,
      y: Number.isFinite(y) ? y : completed.last.y,
    };
    const desiredPane = decideFallbackSwipe(completed.start, end, completed.pane, window.innerWidth || 390);
    if (desiredPane === completed.pane) return;

    // The root handler may already have completed the same switch.
    if (currentPane() !== completed.pane) return;
    const toggle = document.querySelector("[data-mobile-investigation-toggle]");
    if (!toggle) return;
    toggle.click();
    suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
  }

  function deferCancelledPointer(id) {
    if (!gesture || !idMatches("pointer", id)) return;
    try { gesture.captureTarget?.releasePointerCapture?.(id); } catch {}
    gesture.pointerId = null;
    clearCancelTimer();
    gesture.cancelTimer = setTimeout(() => {
      finishGesture({ source: "cancel", id: null, x: gesture?.last.x, y: gesture?.last.y, force: true });
    }, gesture.touchId == null ? 90 : CANCEL_GRACE_MS);
  }

  function findTouch(list, identifier) {
    const touches = Array.from(list || []);
    if (!touches.length) return null;
    return touches.find((touch) => identifier == null || touch.identifier === identifier) || null;
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    beginGesture({
      source: "pointer",
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target: event.target,
      captureTarget: event.target?.closest?.(".retro-investigation"),
    });
  }, true);

  document.addEventListener("pointermove", (event) => {
    moveGesture({
      source: "pointer",
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      preventDefault: () => event.preventDefault(),
    });
  }, { capture: true, passive: false });

  document.addEventListener("pointerup", (event) => {
    finishGesture({ source: "pointer", id: event.pointerId, x: event.clientX, y: event.clientY });
  }, true);

  document.addEventListener("pointercancel", (event) => {
    deferCancelledPointer(event.pointerId);
  }, true);

  // Touch events stay active even on PointerEvent browsers. Android can cancel the
  // pointer stream early when a finger starts slightly diagonally; this stream then
  // continues measuring the same gesture instead of losing the swipe entirely.
  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    beginGesture({ source: "touch", id: touch.identifier, x: touch.clientX, y: touch.clientY, target: event.target });
  }, { capture: true, passive: true });

  document.addEventListener("touchmove", (event) => {
    const touch = findTouch(event.touches, gesture?.touchId) || findTouch(event.changedTouches, gesture?.touchId);
    if (!touch) return;
    moveGesture({
      source: "touch",
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      preventDefault: () => event.preventDefault(),
    });
  }, { capture: true, passive: false });

  document.addEventListener("touchend", (event) => {
    const touch = findTouch(event.changedTouches, gesture?.touchId);
    if (!touch) return;
    finishGesture({ source: "touch", id: touch.identifier, x: touch.clientX, y: touch.clientY });
  }, true);

  document.addEventListener("touchcancel", (event) => {
    const touch = findTouch(event.changedTouches, gesture?.touchId);
    finishGesture({ source: "touch", id: touch?.identifier, x: gesture?.last.x, y: gesture?.last.y, force: true });
  }, true);

  document.addEventListener("click", (event) => {
    if (!event.isTrusted || Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();