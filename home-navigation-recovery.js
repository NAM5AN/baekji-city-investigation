(() => {
  "use strict";

  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";

  function go(path) {
    const next = `#/${String(path || "").replace(/^\//, "")}`;
    if (location.hash !== next) location.hash = next;
  }

  function state() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const openParty = target.closest("[data-open-party]");
    if (openParty) {
      const before = location.hash;
      const partyId = String(openParty.dataset.openParty || "");
      setTimeout(() => {
        if (partyId && location.hash === before) go(`party/${partyId}`);
      }, 40);
      return;
    }

    const resume = target.closest("[data-resume-session]");
    if (resume) {
      const before = location.hash;
      const sessionId = String(resume.dataset.resumeSession || "");
      setTimeout(() => {
        if (!sessionId || location.hash !== before) return;
        const session = state()?.sessions?.[sessionId];
        if (!session) return;
        go(session.status === "BRIEFING" ? `briefing/${sessionId}` : session.status === "COMPLETED" ? `result/${sessionId}` : `investigate/${sessionId}`);
      }, 40);
      return;
    }

    const dataGo = target.closest("[data-go]");
    if (dataGo) {
      const before = location.hash;
      const path = String(dataGo.dataset.go || "");
      setTimeout(() => {
        if (path && location.hash === before) go(path);
      }, 40);
      return;
    }

    const logout = target.closest('[data-action="logout"]');
    if (logout) {
      // App-owned logout waits for server revocation. This recovery listener must not
      // clear a session while the server is temporarily unavailable.
      return;
    }
  }, true);

  window.__BAEKJI_HOME_NAV_RECOVERY__ = Object.freeze({ version: "0.3.97", go });
})();
