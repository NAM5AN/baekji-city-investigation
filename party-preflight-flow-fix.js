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

  const preflightReadyInFlight = new Set();
  async function togglePreflightReady(partyId, control = null) {
    const key = String(partyId || "");
    if (!key || preflightReadyInFlight.has(key)) return false;
    preflightReadyInFlight.add(key);
    control?.setAttribute?.("aria-busy", "true");
    if (control && "disabled" in control) control.disabled = true;
    try {
      const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("TOGGLE_PARTY_READY_V1", { partyId });
      if (!["APPLIED", "REPLAY"].includes(result?.status)) {
        control?.setAttribute?.("data-ready-command-error", String(result?.status || "OUT_OF_SCOPE"));
        return false;
      }
      return true;
    } catch (error) {
      control?.setAttribute?.("data-ready-command-error", error?.message === "WORLD_COMMAND_SYNC_NOT_READY" ? "SYNC_NOT_READY" : "UNAVAILABLE");
      return false;
    } finally {
      preflightReadyInFlight.delete(key);
      control?.removeAttribute?.("aria-busy");
      if (control && "disabled" in control) control.disabled = false;
    }
  }

  const compositionLockInFlight = new Set();
  async function lockComposition(partyId, control = null) {
    const key = String(partyId || "");
    if (!key || compositionLockInFlight.has(key)) return false;
    compositionLockInFlight.add(key);
    control?.setAttribute?.("aria-busy", "true");
    if (control && "disabled" in control) control.disabled = true;
    try {
      const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("LOCK_PARTY_COMPOSITION_V1", { partyId });
      if (!["APPLIED", "REPLAY"].includes(result?.status)) {
        control?.setAttribute?.("data-composition-lock-command-error", String(result?.status || "OUT_OF_SCOPE"));
        return false;
      }
      return true;
    } catch (error) {
      control?.setAttribute?.("data-composition-lock-command-error", error?.message === "WORLD_COMMAND_SYNC_NOT_READY" ? "SYNC_NOT_READY" : "UNAVAILABLE");
      return false;
    } finally {
      compositionLockInFlight.delete(key);
      control?.removeAttribute?.("aria-busy");
      if (control && "disabled" in control) control.disabled = false;
    }
  }

  async function reopenRecruiting(partyId) {
    if (!partyId) return false;
    const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("REOPEN_PARTY_RECRUITING_V1", { partyId });
    return ["APPLIED", "REPLAY"].includes(result?.status);
  }

  function backToComposition() { return false; }

  async function rollbackBriefing(sessionId) {
    const partyId = readState()?.sessions?.[sessionId]?.partyId;
    if (!partyId || !sessionId) return false;
    const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("ROLLBACK_BRIEFING_V1", { sessionId });
    if (!["APPLIED", "REPLAY"].includes(result?.status)) return false;
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
      togglePreflightReady(preflightReady.dataset.preflightMemberReady, preflightReady);
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
        lockComposition(partyId, lock);
        return;
      }
    }

    const backRecruiting = target.closest("[data-party-flow-back-recruiting]");
    if (backRecruiting) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void reopenRecruiting(backRecruiting.dataset.partyFlowBackRecruiting);
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
      void rollbackBriefing(briefingBack.dataset.partyPreflightBriefingBack);
    }
  }, true);

  document.documentElement.dataset.partyPreflightFlowVersion = VERSION;
})();
