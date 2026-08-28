(() => {
  "use strict";

  const KEY = "baekji_city_mvp_state_v3";
  const GUEST_KEY = "baekji_city_mvp_guest_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const listeners = new Set();
  let queued = false;
  let queuedBefore = null;
  let queuedFinal = null;
  let remoteActive = false;
  let remoteRaw = null;

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

  function hasAuthenticatedBrowserSession() {
    // Non-browser harnesses historically exercise the canonical adapter without
    // session storage.  Treat that explicit absence as the legacy canonical
    // mode; real browser guests always have sessionStorage and select GUEST_KEY.
    if (typeof sessionStorage === "undefined") return true;
    try { return Boolean(String(sessionStorage.getItem(USER_KEY) || "")); }
    catch { return false; }
  }

  function localKey() {
    // Anonymous play is a separate local-only sandbox.  The canonical key is
    // reserved for legacy authenticated bytes and is never used for a remote
    // projection.
    return hasAuthenticatedBrowserSession() ? KEY : GUEST_KEY;
  }

  function readLocalRaw() {
    return localStorage.getItem(localKey());
  }

  function readRaw() {
    return remoteActive ? remoteRaw : readLocalRaw();
  }

  function writeRaw(value) {
    if (remoteActive) throw new Error("AUTHORITATIVE_PLAYER_STATE_READ_ONLY");
    const key = localKey();
    const before = localStorage.getItem(key);
    localStorage.setItem(key, value);
    const finalRaw = localStorage.getItem(key);
    if (finalRaw !== before) scheduleNotification(before, finalRaw);
    return finalRaw;
  }

  function replaceRemoteRaw(value) {
    const next = typeof value === "string" ? value : null;
    const before = readRaw();
    remoteActive = true;
    remoteRaw = next;
    scheduleNotification(before, remoteRaw);
    return remoteRaw;
  }

  function clearRemoteRaw() {
    if (!remoteActive) return;
    const before = remoteRaw;
    remoteActive = false;
    remoteRaw = null;
    scheduleNotification(before, readLocalRaw());
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
    replaceRemoteRaw,
    clearRemoteRaw,
    isRemoteActive: () => remoteActive,
    subscribe,
  });
})();
