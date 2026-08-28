(() => {
  "use strict";

  if (window.__BAEKJI_GUEST_WORLD_ISOLATION__) return;

  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const VERSION = "0.4.1";

  if (typeof sessionStorage === "undefined") return;

  function activeUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function authenticated() {
    return Boolean(activeUserId());
  }

  // Legacy callers may still inspect this marker, but key selection is now
  // handled inside world-persistence.  Do not monkey-patch Storage: authenticated
  // projections must never pass through a browser-wide interceptor chain.

  window.__BAEKJI_GUEST_WORLD_ISOLATION__ = Object.freeze({
    version: "0.5.0",
    activeUserId,
    authenticated,
    stats: () => ({ blockedWrites: 0, blockedEvents: 0 }),
  });
})();
