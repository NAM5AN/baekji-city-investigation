(() => {
  "use strict";
  const { clone, uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;
  const { effectivePartyReady: effectiveReady } = window.__BAEKJI_DOMAIN_RULES__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const DEFER_KEY_PREFIX = "baekji_city_mvp_deferred_invites_v1:";
  const VERSION = "0.3.87";

  function readyIds(party) {
    return unique(party?.memberIds).filter((memberId) => effectiveReady(party, memberId));
  }

  function readyCount(party) {
    return readyIds(party).length;
  }

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

  function acceptInviteState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const character = draft?.characters?.[userId];
    if (!party || !character || !["RECRUITING", "COMPOSITION_CONFIRMED"].includes(party.status) || character.currentPartyId) return draft;
    if (!unique(party.invitedIds).includes(userId)) return draft;
    party.memberIds = unique([...(party.memberIds || []), userId]);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== userId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== userId);
    party.confirmedBy = unique(party.confirmedBy).filter((id) => party.memberIds.includes(id));
    party.readyBy = unique(party.readyBy).filter((id) => id !== userId && party.memberIds.includes(id));
    if (party.status === "COMPOSITION_CONFIRMED") {
      party.confirmedBy = unique([...party.confirmedBy, userId]);
      party.readyStateBy = party.readyStateBy && typeof party.readyStateBy === "object" ? { ...party.readyStateBy } : {};
      party.readyStateBy[userId] = { ready: false, at: Date.now() };
    }
    character.currentPartyId = partyId;
    return draft;
  }

  function lockCompositionState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "RECRUITING") return draft;
    party.memberIds = unique(party.memberIds);
    party.confirmedBy = [...party.memberIds];
    party.readyBy = [];
    party.readyStateBy = {};
    party.memberIds.forEach((memberId) => { party.readyStateBy[memberId] = { ready: false, at }; });
    party.readyStateBy[leaderId] = { ready: true, at };
    party.readyBy = [leaderId];
    party.status = "COMPOSITION_CONFIRMED";
    party.compositionLockedAt = at;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function reopenCompositionState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || !["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) || party.sessionId) return draft;
    party.status = "RECRUITING";
    party.confirmedBy = [];
    party.readyBy = [];
    party.readyStateBy = {};
    unique(party.memberIds).forEach((memberId) => { party.readyStateBy[memberId] = { ready: false, at }; });
    party.compositionLockedAt = null;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function toggleReadyState(snapshot, partyId, userId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || !["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) || !unique(party.memberIds).includes(userId) || party.creatorId === userId) return draft;
    ensureReadyStateMap(party, at);
    const nextReady = !effectiveReady(party, userId);
    party.readyStateBy[userId] = { ready: nextReady, at };
    party.readyBy = unique(party.memberIds).filter((memberId) => effectiveReady(party, memberId));
    if (party.status === "READY_CHECK") party.status = "COMPOSITION_CONFIRMED";
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
    party.readyBy = members.filter((memberId) => effectiveReady(party, memberId));
    party.status = "COMPOSITION_CONFIRMED";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return { snapshot: draft, cancelledIds: [], shouldNotify: false };
  }

  const TEST_API = Object.freeze({
    effectiveReady,
    readyIds,
    readyCount,
    acceptInviteState,
    lockCompositionState,
    reopenCompositionState,
    toggleReadyState,
    enterReadyCheckState,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_FLOW_UX_TEST__ = TEST_API;
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

  function dispatchStateUpdate(oldRaw, newRaw) {
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
    window.dispatchEvent(new CustomEvent("baekji-party-flow-ux", { detail: { version: VERSION } }));
  }

  function writeState(snapshot) {
    if (!snapshot?.version) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw);
    return true;
  }

  function clearDeferredInvite(userId, partyId) {
    const key = `${DEFER_KEY_PREFIX}${userId}`;
    try {
      const values = unique(JSON.parse(sessionStorage.getItem(key) || "[]")).filter((id) => id !== partyId);
      sessionStorage.setItem(key, JSON.stringify(values));
    } catch {
      sessionStorage.setItem(key, "[]");
    }
  }

  function closeInviteModal() {
    const root = document.getElementById("modal-root");
    if (root?.querySelector("[data-party-flow-modal]")) root.replaceChildren();
    document.querySelectorAll(".retro-invite-backdrop[data-party-flow-modal]").forEach((node) => node.remove());
  }

  function acceptInvite(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const next = acceptInviteState(snapshot, partyId, userId);
    if (next.characters?.[userId]?.currentPartyId !== partyId) return false;
    closeInviteModal();
    clearDeferredInvite(userId, partyId);
    writeState(next);
    if (location.hash !== "#/home") location.hash = "#/home";
    return true;
  }

  function lockComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    const next = lockCompositionState(snapshot, partyId, userId);
    if (next?.parties?.[partyId]?.status !== "COMPOSITION_CONFIRMED") return false;
    return writeState(next);
  }

  function reopenComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    const next = reopenCompositionState(snapshot, partyId, userId);
    if (next?.parties?.[partyId]?.status !== "RECRUITING") return false;
    return writeState(next);
  }

  function toggleReady(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const before = snapshot.parties?.[partyId];
    if (!before) return false;
    if (before.creatorId === userId) return false;
    const next = toggleReadyState(snapshot, partyId, userId);
    const after = next.parties?.[partyId];
    if (!after || effectiveReady(after, userId) === effectiveReady(before, userId)) return false;
    return writeState(next);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const accept = target.closest("[data-party-flow-accept], [data-accept]");
    if (accept) {
      const partyId = accept.dataset.partyFlowAccept || accept.dataset.accept;
      const snapshot = readState();
      const userId = currentUserId();
      const party = snapshot?.parties?.[partyId];
      if (["RECRUITING", "COMPOSITION_CONFIRMED"].includes(party?.status) && unique(party.invitedIds).includes(userId) && !snapshot?.characters?.[userId]?.currentPartyId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        acceptInvite(partyId);
        return;
      }
    }

    const legacyMemberConfirm = target.closest("[data-member-confirm-composition]");
    if (legacyMemberConfirm) {
      const partyId = legacyMemberConfirm.dataset.memberConfirmComposition;
      legacyMemberConfirm.removeAttribute("data-member-confirm-composition");
      legacyMemberConfirm.dataset.partyRosterOpen = partyId;
      legacyMemberConfirm.textContent = "조원 보기";
      return;
    }

    const lock = target.closest("[data-confirm-composition]");
    if (lock) {
      const [, partyId] = routeParts();
      const snapshot = readState();
      const userId = currentUserId();
      if (partyId && snapshot?.parties?.[partyId]?.creatorId === userId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        lockComposition(partyId);
        return;
      }
    }

    const back = target.closest("[data-party-flow-back-recruiting]");
    if (back) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reopenComposition(back.dataset.partyFlowBackRecruiting);
      return;
    }

    const memberReady = target.closest("[data-member-ready]");
    if (memberReady) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleReady(memberReady.dataset.memberReady);
      return;
    }

    const leaderReady = target.closest("[data-ready]");
    if (leaderReady) {
      const [, partyId] = routeParts();
      const snapshot = readState();
      const userId = currentUserId();
      if (partyId && snapshot?.parties?.[partyId]?.creatorId === userId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleReady(partyId);
        return;
      }
    }

  }, true);
  document.documentElement.dataset.partyFlowUxVersion = VERSION;
})();
