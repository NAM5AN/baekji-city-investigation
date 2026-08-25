(() => {
  "use strict";

  const KEY = "baekji_city_mvp_state_v3";
  const listeners = new Set();
  let queued = false;
  let queuedBefore = null;
  let queuedFinal = null;

  function flushNotification() {
    queued = false;
    const before = queuedBefore;
    const finalRaw = queuedFinal;
    queuedBefore = null;
    queuedFinal = null;
    if (finalRaw === before) return;
    [...listeners].forEach((listener) => {
      if (!listeners.has(listener)) return;
      try { listener(finalRaw); } catch { /* A listener must not block other ingress owners. */ }
    });
  }

  function scheduleNotification(before, finalRaw) {
    if (!queued) {
      queued = true;
      queuedBefore = before;
      queueMicrotask(flushNotification);
    }
    queuedFinal = finalRaw;
  }

  function readRaw() {
    return localStorage.getItem(KEY);
  }

  function writeRaw(value) {
    const before = localStorage.getItem(KEY);
    localStorage.setItem(KEY, value);
    const finalRaw = localStorage.getItem(KEY);
    if (finalRaw !== before) scheduleNotification(before, finalRaw);
    return finalRaw;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  window.__BAEKJI_WORLD_PERSISTENCE__ = Object.freeze({
    key: KEY,
    readRaw,
    writeRaw,
    subscribe,
  });
})();
