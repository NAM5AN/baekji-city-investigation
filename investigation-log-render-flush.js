(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  if (typeof Storage === "undefined" || window.__BAEKJI_ACTION_RENDER_FLUSH__) return;

  const previousSetItem = Storage.prototype.setItem;
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

  Storage.prototype.setItem = function patchedActionRenderSetItem(key, value) {
    const result = previousSetItem.call(this, key, value);
    if (this === localStorage && key === GLOBAL_KEY && isInvestigationProcessing()) queueRefresh();
    return result;
  };

  window.__BAEKJI_ACTION_RENDER_FLUSH__ = Object.freeze({
    dispatchRefresh,
    isInvestigationProcessing,
  });
})();