(() => {
  "use strict";

  if (window.__BAEKJI_ACTION_RENDER_FLUSH__) return;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  let queued = false;

  function isInvestigationProcessing() {
    const page = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "login";
    return page === "investigate" && document.body.hasAttribute("data-action-processing");
  }

  function dispatchRefresh() {
    queued = false;
    if (!isInvestigationProcessing()) return;
    window.dispatchEvent(new Event("pageshow"));
  }

  function queueRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(dispatchRefresh);
  }

  persistence?.subscribe?.(() => {
    if (isInvestigationProcessing()) queueRefresh();
  });

  window.__BAEKJI_ACTION_RENDER_FLUSH__ = Object.freeze({
    dispatchRefresh,
    isInvestigationProcessing,
  });
})();
