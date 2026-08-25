(() => {
  "use strict";
  const { clone, uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;
  const { effectivePartyReady: effectiveReady } = window.__BAEKJI_DOMAIN_RULES__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const VERSION = "0.3.96";

  function ensureReadyStateMap(party, at = Date.now()) {
    party.readyStateBy = party.readyStateBy && typeof party.readyStateBy === "object" && !Array.isArray(party.readyStateBy)
      ? { ...party.readyStateBy }
      : {};
    unique(party.memberIds).forEach((memberId) => {
      if (party.readyStateBy[memberId] === undefined) {
        party.readyStateBy[memberId] = { ready: unique(party.readyBy).includes(memberId), at };
      }
    });
    return party.readyStateBy;
  }

  function rebuildReadyBy(party) {
    party.readyBy = unique(party.memberIds).filter((memberId) => effectiveReady(party, memberId));
  }

  function togglePreflightReadyState(snapshot, partyId, userId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.sessionId || !["RECRUITING", "COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) || party.creatorId === userId) return draft;
    if (!unique(party.memberIds).includes(userId)) return draft;

    ensureReadyStateMap(party, at);
    const nextReady = !effectiveReady(party, userId);
    party.readyStateBy[userId] = { ready: nextReady, at };
    rebuildReadyBy(party);
    if (party.status === "READY_CHECK") party.status = "COMPOSITION_CONFIRMED";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function lockCompositionPreserveReadyState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "RECRUITING" || party.sessionId) return draft;

    party.memberIds = unique(party.memberIds);
    ensureReadyStateMap(party, at);
    party.readyStateBy[leaderId] = { ready: true, at };
    rebuildReadyBy(party);
    party.confirmedBy = [...party.memberIds];
    party.status = "COMPOSITION_CONFIRMED";
    party.compositionLockedAt = at;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function reopenRecruitingPreserveReadyState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "COMPOSITION_CONFIRMED" || party.sessionId) return draft;

    ensureReadyStateMap(party, at);
    rebuildReadyBy(party);
    party.status = "RECRUITING";
    party.confirmedBy = [];
    party.compositionLockedAt = null;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function backToCompositionState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "READY_CHECK" || party.sessionId) return draft;

    ensureReadyStateMap(party, at);
    party.readyStateBy[leaderId] = { ready: true, at };
    rebuildReadyBy(party);
    party.status = "COMPOSITION_CONFIRMED";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function enterReadyCheckState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.sessionId || party.status !== "COMPOSITION_CONFIRMED") return { snapshot: draft, cancelledIds: [], shouldNotify: false };
    const members = unique(party.memberIds);
    ensureReadyStateMap(party, at);
    party.readyStateBy[leaderId] = { ready: true, at };
    rebuildReadyBy(party);
    party.status = "COMPOSITION_CONFIRMED";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return { snapshot: draft, cancelledIds: [], shouldNotify: false };
  }

  function rollbackBriefingState(snapshot, sessionId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const session = draft?.sessions?.[sessionId];
    const party = session ? draft?.parties?.[session.partyId] : null;
    if (!session || !party || party.creatorId !== leaderId || session.status !== "BRIEFING") return draft;
    if (party.sessionId !== sessionId) return draft;

    const memberIds = unique(session.memberIds || party.memberIds);
    delete draft.sessions[sessionId];
    party.sessionId = null;
    party.status = "COMPOSITION_CONFIRMED";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    memberIds.forEach((memberId) => {
      const character = draft.characters?.[memberId];
      if (character?.currentSessionId === sessionId) character.currentSessionId = null;
    });
    return draft;
  }

  const TEST_API = Object.freeze({
    effectiveReady,
    togglePreflightReadyState,
    lockCompositionPreserveReadyState,
    reopenRecruitingPreserveReadyState,
    backToCompositionState,
    enterReadyCheckState,
    rollbackBriefingState,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_PREFLIGHT_FLOW_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence) return;

  function readState() {
    try {
      const parsed = JSON.parse(persistence.readRaw() || "null");
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

  function dispatchStateUpdate(oldRaw, newRaw, reason) {
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: GLOBAL_KEY,
        oldValue: oldRaw,
        newValue: newRaw,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      window.dispatchEvent(event);
    }
    window.dispatchEvent(new CustomEvent("baekji-party-preflight-flow", { detail: { reason, version: VERSION } }));
  }

  function writeState(snapshot, reason) {
    if (!snapshot?.version) return false;
    const oldRaw = persistence.readRaw();
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    persistence.writeRaw(newRaw);
    dispatchStateUpdate(oldRaw, newRaw, reason);
    return true;
  }

  function togglePreflightReady(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const before = snapshot.parties?.[partyId];
    const next = togglePreflightReadyState(snapshot, partyId, userId, Date.now());
    const after = next.parties?.[partyId];
    if (!before || !after || effectiveReady(before, userId) === effectiveReady(after, userId)) return false;
    return writeState(next, "preflight-ready-toggle");
  }

  function lockComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const next = lockCompositionPreserveReadyState(snapshot, partyId, userId, Date.now());
    if (next.parties?.[partyId]?.status !== "COMPOSITION_CONFIRMED") return false;
    return writeState(next, "composition-lock-preserve-ready");
  }

  function reopenRecruiting(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const next = reopenRecruitingPreserveReadyState(snapshot, partyId, userId, Date.now());
    if (next.parties?.[partyId]?.status !== "RECRUITING") return false;
    return writeState(next, "composition-back-recruiting-preserve-ready");
  }

  function backToComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const next = backToCompositionState(snapshot, partyId, userId, Date.now());
    if (next.parties?.[partyId]?.status !== "COMPOSITION_CONFIRMED") return false;
    return writeState(next, "ready-back-composition");
  }

  function rollbackBriefing(sessionId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !sessionId || !userId) return false;
    const session = snapshot.sessions?.[sessionId];
    const partyId = session?.partyId;
    const next = rollbackBriefingState(snapshot, sessionId, userId, Date.now());
    if (!partyId || next.sessions?.[sessionId] || next.parties?.[partyId]?.sessionId) return false;
    if (!writeState(next, "briefing-back-ready")) return false;
    location.hash = `#/party/${partyId}`;
    return true;
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const preflightReady = target.closest("[data-preflight-member-ready]");
    if (preflightReady) {
      event.preventDefault();
      event.stopImmediatePropagation();
      togglePreflightReady(preflightReady.dataset.preflightMemberReady);
      return;
    }

    const lock = target.closest("[data-confirm-composition]");
    if (lock) {
      const [, partyId] = routeParts();
      const snapshot = readState();
      const userId = currentUserId();
      if (partyId && snapshot?.parties?.[partyId]?.creatorId === userId && snapshot.parties[partyId].status === "RECRUITING") {
        event.preventDefault();
        event.stopImmediatePropagation();
        lockComposition(partyId);
        return;
      }
    }

    const backRecruiting = target.closest("[data-party-flow-back-recruiting]");
    if (backRecruiting) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reopenRecruiting(backRecruiting.dataset.partyFlowBackRecruiting);
      return;
    }

    const backConfirmed = target.closest("[data-party-preflight-back-confirmed]");
    if (backConfirmed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      backToComposition(backConfirmed.dataset.partyPreflightBackConfirmed);
      return;
    }

    const briefingBack = target.closest("[data-party-preflight-briefing-back]");
    if (briefingBack) {
      event.preventDefault();
      event.stopImmediatePropagation();
      rollbackBriefing(briefingBack.dataset.partyPreflightBriefingBack);
    }
  }, true);

  document.documentElement.dataset.partyPreflightFlowVersion = VERSION;
})();
