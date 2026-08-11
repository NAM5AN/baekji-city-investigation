(() => {
  "use strict";

  const VERSION = "0.6.5";
  const panel = document.querySelector("[data-admin-panel]");
  if (!panel || window.__BAEKJI_ADMIN_LOG_BOTTOM_CHRONOLOGY__) return;

  let processTimer = 0;
  let pinBottom = true;
  let needsInitialBottom = true;

  function logList() {
    return panel.querySelector("[data-admin-log-list]");
  }

  function isNearBottom(list, tolerance = 24) {
    if (!list) return true;
    return Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop) <= tolerance;
  }

  function scrollToBottom(list) {
    if (!list?.isConnected) return;
    list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
  }

  function normalizeChronology() {
    const list = logList();
    if (!list) return;

    if (list.dataset.recipientGroupingBusy === "1" || !list.dataset.recipientGroupingVersion) {
      scheduleProcess(20);
      return;
    }
    if (list.dataset.adminLogChronologyVersion === VERSION) return;

    const shouldStick = needsInitialBottom || pinBottom || isNearBottom(list);
    const rows = [...list.querySelectorAll(":scope > .admin-log-row")];

    // The base dashboard renderer supplies newest-first rows. Reverse them only
    // after recipient grouping has finished so grouped SYSTEM rows stay intact.
    rows.reverse().forEach((row) => list.append(row));
    list.dataset.adminLogChronologyVersion = VERSION;

    if (shouldStick) {
      requestAnimationFrame(() => {
        scrollToBottom(list);
        pinBottom = true;
        needsInitialBottom = false;
      });
    } else {
      needsInitialBottom = false;
    }
  }

  function scheduleProcess(delay = 0) {
    clearTimeout(processTimer);
    processTimer = setTimeout(normalizeChronology, delay);
  }

  document.addEventListener("scroll", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches("[data-admin-log-list]")) return;
    pinBottom = isNearBottom(target);
    needsInitialBottom = false;
  }, true);

  document.addEventListener("click", (event) => {
    const tab = event.target instanceof Element ? event.target.closest('[data-admin-tab="logs"]') : null;
    if (!tab) return;
    pinBottom = true;
    needsInitialBottom = true;
    scheduleProcess(0);
  }, true);

  new MutationObserver(scheduleProcess).observe(panel, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  window.__BAEKJI_ADMIN_LOG_BOTTOM_CHRONOLOGY__ = Object.freeze({
    version: VERSION,
    isNearBottom,
    normalizeChronology,
  });

  scheduleProcess();
})();