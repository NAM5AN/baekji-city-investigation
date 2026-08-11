(() => {
  "use strict";

  if (window.__BAEKJI_GUEST_WORLD_ISOLATION__) return;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const VERSION = "0.4.1";

  if (
    typeof Storage === "undefined" ||
    typeof localStorage === "undefined" ||
    typeof sessionStorage === "undefined"
  ) return;

  const storageProto = Storage.prototype;
  const previousSetItem = storageProto.setItem;
  const previousRemoveItem = storageProto.removeItem;
  let blockedWrites = 0;
  let blockedEvents = 0;

  function activeUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function authenticated() {
    return Boolean(activeUserId());
  }

  function isSharedWorld(storage, key) {
    return storage === localStorage && String(key) === GLOBAL_KEY;
  }

  storageProto.setItem = function guestSafeSetItem(key, value) {
    if (isSharedWorld(this, key) && !authenticated()) {
      blockedWrites += 1;
      return undefined;
    }
    return previousSetItem.call(this, key, value);
  };

  storageProto.removeItem = function guestSafeRemoveItem(key) {
    if (isSharedWorld(this, key) && !authenticated()) {
      blockedWrites += 1;
      return undefined;
    }
    return previousRemoveItem.call(this, key);
  };

  // Storage events are the bridge between tabs. A logged-out/login tab has no
  // game-world UI to synchronize, so letting these events reach app.js only
  // destroys and rebuilds the login form (clearing typed credentials and
  // restarting hover/motion effects). Capture first and isolate the guest tab.
  window.addEventListener("storage", (event) => {
    if (event?.key !== GLOBAL_KEY || authenticated()) return;
    blockedEvents += 1;
    event.stopImmediatePropagation();
  }, true);

  window.__BAEKJI_GUEST_WORLD_ISOLATION__ = Object.freeze({
    version: VERSION,
    activeUserId,
    authenticated,
    stats: () => ({ blockedWrites, blockedEvents }),
  });
})();
