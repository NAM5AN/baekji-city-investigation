(() => {
  "use strict";

  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  let identity = null;
  let refreshGeneration = 0;

  function profile(user) {
    const name = String(user?.characterName || "").trim();
    return {
      id: String(user?.id || ""),
      loginId: name,
      name,
      password: "",
      initial: Array.from(name || "?")[0] || "?",
      note: "초대 테스터 계정",
      profilePhoto: String(user?.profilePhoto || ""),
      isTestOnly: true,
    };
  }

  function adopt(user) {
    const next = profile(user);
    if (!next.id || !next.name) return null;
    identity = next;
    sessionStorage.setItem(USER_KEY, identity.id);
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(identity));
    window.__BAEKJI_TESTER_REGISTRY_GUARD__?.registerTester?.(identity);
    window.dispatchEvent(new CustomEvent("baekji-player-session-adopted", { detail: { user: identity } }));
    window.dispatchEvent(new CustomEvent("baekji-player-session-ready", { detail: { user: identity } }));
    return identity;
  }

  function clearIdentity() {
    identity = null;
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    window.dispatchEvent(new CustomEvent("baekji-player-session-ready", { detail: { user: null } }));
  }

  async function refresh() {
    if (typeof window.fetch !== "function") return null;
    const generation = ++refreshGeneration;
    try {
      const response = await window.fetch("/api/player-session", { method: "GET", cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok && payload?.user?.id) {
        return generation === refreshGeneration ? adopt(payload.user) : identity;
      }
      if (response.status === 401 && generation === refreshGeneration) {
        clearIdentity();
      }
    } catch {
      // A transient session lookup failure must not erase the currently rendered local view.
    }
    return identity;
  }

  window.__BAEKJI_PLAYER_SESSION_BOOTSTRAP__ = Object.freeze({ get: () => identity, refresh });
  window.addEventListener("baekji-player-session-logged-out", clearIdentity);
  refresh();
})();
