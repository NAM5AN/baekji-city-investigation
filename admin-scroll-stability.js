(() => {
  "use strict";

  const VERSION = "0.6.1";
  const panel = document.querySelector("[data-admin-panel]");
  if (!panel) return;

  const positions = new Map();
  const applied = new WeakMap();
  let restoreTimer = 0;
  let restoreEpoch = 0;

  function activeTab() {
    return document.querySelector("[data-admin-tab].active")?.dataset?.adminTab || "overview";
  }

  function indexedKey(element, selector, label) {
    const items = [...panel.querySelectorAll(selector)];
    const index = items.indexOf(element);
    return index >= 0 ? `${activeTab()}:${label}:${index}` : "";
  }

  function keyFor(element) {
    if (!(element instanceof Element)) return "";
    if (element.matches(".admin-panel-scroll")) return `${activeTab()}:panel`;
    if (element.matches("[data-admin-log-list]")) return `${activeTab()}:logs`;
    if (element.matches("[data-admin-zone-map-viewport]")) return `${activeTab()}:zone-map`;
    if (element.matches(".admin-mini-list")) return indexedKey(element, ".admin-mini-list", "mini");
    return "";
  }

  function remember(element) {
    const key = keyFor(element);
    if (!key) return;

    const lastApplied = applied.get(element);
    if (lastApplied && performance.now() < lastApplied.until) {
      const sameTop = Math.abs(element.scrollTop - lastApplied.top) <= 1;
      const sameLeft = Math.abs(element.scrollLeft - lastApplied.left) <= 1;
      if (sameTop && sameLeft) return;
    }

    positions.set(key, {
      top: Math.max(0, Number(element.scrollTop || 0)),
      left: Math.max(0, Number(element.scrollLeft || 0)),
    });
  }

  function applyPosition(element, saved) {
    if (!element || !saved) return;
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const top = Math.min(saved.top, maxTop);
    const left = Math.min(saved.left, maxLeft);

    applied.set(element, { top, left, until: performance.now() + 90 });
    if (Math.abs(element.scrollTop - top) > 1) element.scrollTop = top;
    if (Math.abs(element.scrollLeft - left) > 1) element.scrollLeft = left;
  }

  function restoreNow(epoch) {
    if (epoch !== restoreEpoch) return;
    const tab = activeTab();
    const candidates = [
      ...panel.querySelectorAll(".admin-panel-scroll"),
      ...panel.querySelectorAll("[data-admin-log-list]"),
      ...panel.querySelectorAll("[data-admin-zone-map-viewport]"),
      ...panel.querySelectorAll(".admin-mini-list"),
    ];

    candidates.forEach((element) => {
      const key = keyFor(element);
      if (!key || !key.startsWith(`${tab}:`)) return;
      applyPosition(element, positions.get(key));
    });
  }

  function scheduleRestore() {
    restoreEpoch += 1;
    const epoch = restoreEpoch;
    clearTimeout(restoreTimer);

    requestAnimationFrame(() => restoreNow(epoch));
    [30, 90, 180, 360, 720].forEach((delay, index, delays) => {
      const timer = setTimeout(() => restoreNow(epoch), delay);
      if (index === delays.length - 1) restoreTimer = timer;
    });
  }

  function clearTab(tab) {
    const prefix = `${tab}:`;
    [...positions.keys()].forEach((key) => {
      if (key.startsWith(prefix)) positions.delete(key);
    });
  }

  document.addEventListener("scroll", (event) => {
    const target = event.target;
    if (target instanceof Element && panel.contains(target)) remember(target);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-admin-tab]") : null;
    if (!target) return;
    const nextTab = String(target.dataset.adminTab || "");
    if (nextTab && nextTab !== activeTab()) clearTab(nextTab);
  }, true);

  new MutationObserver(scheduleRestore).observe(panel, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleRestore);
  window.addEventListener("focus", scheduleRestore);
  document.documentElement.dataset.adminScrollStabilityVersion = VERSION;
  scheduleRestore();
})();
