(() => {
  "use strict";
  const { uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SCROLL_SEEN_PREFIX = "baekji_city_party_creation_top_seen_v1:";
  const VERSION = "0.3.98";

  function effectiveReady(party, memberId) {
    const marker = party?.readyStateBy?.[memberId];
    if (marker && typeof marker === "object" && typeof marker.ready === "boolean") return marker.ready;
    if (typeof marker === "boolean") return marker;
    return unique(party?.readyBy).includes(memberId);
  }

  function isFreshlyCreatedParty(party, userId, now = Date.now()) {
    if (!party || party.creatorId !== userId || party.sessionId) return false;
    const createdAt = Number(party.createdAt || 0);
    return createdAt > 0 && Math.abs(Number(now) - createdAt) <= 12_000;
  }

  function rosterSignature(party) {
    if (!party) return "";
    return [
      String(party.name || ""),
      String(party.status || ""),
      unique(party.memberIds).map((memberId) => `${memberId}:${effectiveReady(party, memberId) ? 1 : 0}`).join("|"),
      String(party.flowRevision || 0),
    ].join("::");
  }

  const TEST_API = Object.freeze({ effectiveReady, isFreshlyCreatedParty, rosterSignature });
  if (typeof window !== "undefined") window.__BAEKJI_MEMBER_HOME_ROSTER_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    return String(sessionStorage.getItem(USER_KEY) || "");
  }

  function routeParts() {
    return (location.hash.replace(/^#\/?/, "") || "login").split("/").filter(Boolean);
  }

  function scrollFreshPartyToTop(snapshot = readState(), userId = currentUserId()) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return false;
    const party = snapshot?.parties?.[partyId];
    if (!isFreshlyCreatedParty(party, userId)) return false;
    const seenKey = `${SCROLL_SEEN_PREFIX}${partyId}`;
    if (sessionStorage.getItem(seenKey) === "1") return false;
    sessionStorage.setItem(seenKey, "1");

    const scrollTop = () => {
      try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }
      catch { window.scrollTo(0, 0); }
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };
    scrollTop();
    requestAnimationFrame(scrollTop);
    return true;
  }

  window.addEventListener("hashchange", () => scrollFreshPartyToTop());
  window.addEventListener("pageshow", () => scrollFreshPartyToTop());
  window.__BAEKJI_MEMBER_HOME_ROSTER__ = Object.freeze({ version: VERSION, scrollFreshPartyToTop });
  requestAnimationFrame(() => scrollFreshPartyToTop());
})();
