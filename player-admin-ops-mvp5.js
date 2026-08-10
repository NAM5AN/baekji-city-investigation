(() => {
  "use strict";

  if (window.__BAEKJI_PLAYER_ADMIN_OPS_MVP5__) return;
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const CLIENT_KEY = "baekji_city_presence_client_v1";
  const HEARTBEAT_MS = 20_000;
  let heartbeatTimer = 0;
  let guard = null;

  function safeState() {
    try {
      const state = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return state?.version === 3 ? state : null;
    } catch { return null; }
  }

  function currentUserId() {
    return sessionStorage.getItem(USER_KEY) || "";
  }

  function currentSession() {
    const match = String(location.hash || "").match(/^#\/investigate\/([^/?#]+)/);
    if (!match) return null;
    return safeState()?.sessions?.[match[1]] || null;
  }

  function clientId() {
    let value = sessionStorage.getItem(CLIENT_KEY) || "";
    if (!value) {
      value = crypto?.randomUUID ? crypto.randomUUID() : `presence_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(CLIENT_KEY, value);
    }
    return value;
  }

  async function heartbeat() {
    clearTimeout(heartbeatTimer);
    const characterId = currentUserId();
    if (characterId) {
      fetch("/api/player-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, clientId: clientId() }),
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    }
    heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_MS);
  }

  function ensureGuard() {
    if (guard?.isConnected) return guard;
    guard = document.createElement("div");
    guard.id = "player-admin-pause-guard-mvp5";
    guard.hidden = true;
    guard.innerHTML = `<div class="mvp5-player-pause"><strong>조사 일시정지</strong><span>운영진이 현재 조사 세션을 일시정지했습니다. 화면은 그대로 유지되며 재개되면 자동으로 조작할 수 있습니다.</span></div>`;
    document.body.append(guard);
    return guard;
  }

  function paused() {
    return currentSession()?.status === "PAUSED";
  }

  function refreshGuard() {
    const node = ensureGuard();
    const active = paused();
    node.hidden = !active;
    document.documentElement.classList.toggle("admin-session-paused-mvp5", active);
    if (active) {
      document.querySelectorAll("#app main button,#app main input,#app main textarea,#app main select").forEach((control) => {
        if (control.dataset.mvp5PauseDisabled === undefined) control.dataset.mvp5PauseDisabled = control.disabled ? "1" : "0";
        control.disabled = true;
      });
    } else {
      document.querySelectorAll("[data-mvp5-pause-disabled]").forEach((control) => {
        if (control.dataset.mvp5PauseDisabled === "0") control.disabled = false;
        delete control.dataset.mvp5PauseDisabled;
      });
    }
  }

  function blockIfPaused(event) {
    if (!paused()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(".topbar,[data-go],#player-admin-pause-guard-mvp5")) return;
    if (target.closest("#app main button,#app main input,#app main textarea,#app main select,[role='button']")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  document.addEventListener("click", blockIfPaused, true);
  document.addEventListener("keydown", (event) => {
    if (!paused()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("#app main input,#app main textarea,#app main select")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener("hashchange", refreshGuard);
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) queueMicrotask(refreshGuard); });
  window.addEventListener("baekji-cloud-sync", () => queueMicrotask(refreshGuard));
  window.addEventListener("focus", () => { heartbeat(); refreshGuard(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) heartbeat(); });
  new MutationObserver(refreshGuard).observe(document.documentElement, { childList: true, subtree: true });

  ensureGuard();
  refreshGuard();
  heartbeat();

  window.__BAEKJI_PLAYER_ADMIN_OPS_MVP5__ = Object.freeze({ safeState, currentSession, paused, refreshGuard, heartbeat });
})();
