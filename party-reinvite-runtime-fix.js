(() => {
  "use strict";
  const { clone, uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;
  const {
    partyMembershipChangeAllowed: membershipChangeAllowed,
    partyMembershipRemovalKey: removalKey,
  } = window.__BAEKJI_DOMAIN_RULES__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const JOIN_INTENT_KEY = "baekji_city_party_join_intent_v1";
  const VERSION = "0.3.89";

  function reinviteState(snapshot, partyId, memberId, actorId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const character = draft?.characters?.[memberId];
    const removal = draft?.partyMembershipRemovals?.[removalKey(partyId, memberId)];
    if (!party || !character || !removal?.active || !membershipChangeAllowed(party)) return draft;
    if (party.creatorId !== actorId || party.status !== "RECRUITING") return draft;
    if (character.currentPartyId || unique(party.memberIds).includes(memberId)) return draft;
    if (Number(at) <= Number(removal.at || 0)) return draft;

    party.invitedIds = unique([...(party.invitedIds || []), memberId]);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== memberId);
    party.membershipReinvitedAtBy = party.membershipReinvitedAtBy && typeof party.membershipReinvitedAtBy === "object" && !Array.isArray(party.membershipReinvitedAtBy)
      ? { ...party.membershipReinvitedAtBy }
      : {};
    party.membershipReinvitedAtBy[memberId] = Math.max(Number(party.membershipReinvitedAtBy[memberId] || 0), Number(at));
    return draft;
  }

  function acceptReinviteState(snapshot, partyId, memberId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const character = draft?.characters?.[memberId];
    const removal = draft?.partyMembershipRemovals?.[removalKey(partyId, memberId)];
    if (!party || !character || !removal?.active || !membershipChangeAllowed(party)) return draft;
    if (party.status !== "RECRUITING" || character.currentPartyId) return draft;
    if (!unique(party.invitedIds).includes(memberId)) return draft;
    if (Number(at) <= Number(removal.at || 0)) return draft;

    party.memberIds = unique([...(party.memberIds || []), memberId]);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== memberId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== memberId);
    party.confirmedBy = unique(party.confirmedBy).filter((id) => party.memberIds.includes(id));
    party.readyBy = unique(party.readyBy).filter((id) => party.memberIds.includes(id) && id !== memberId);
    if (party.readyStateBy && typeof party.readyStateBy === "object") delete party.readyStateBy[memberId];

    character.currentPartyId = partyId;
    if (!party.sessionId) character.currentSessionId = null;

    party.membershipJoinedAtBy = party.membershipJoinedAtBy && typeof party.membershipJoinedAtBy === "object" && !Array.isArray(party.membershipJoinedAtBy)
      ? { ...party.membershipJoinedAtBy }
      : {};
    party.membershipJoinedAtBy[memberId] = Math.max(Number(party.membershipJoinedAtBy[memberId] || 0), Number(at));
    if (party.membershipReinvitedAtBy && typeof party.membershipReinvitedAtBy === "object") delete party.membershipReinvitedAtBy[memberId];

    removal.active = false;
    removal.clearedAt = Number(at);
    return draft;
  }

  function repairRejoinedState(snapshot) {
    const draft = clone(snapshot);
    let changed = false;

    Object.values(draft?.partyMembershipRemovals || {}).forEach((removal) => {
      if (!removal?.partyId || !removal?.memberId) return;
      const party = draft.parties?.[removal.partyId];
      const character = draft.characters?.[removal.memberId];
      if (!party || !character) return;

      const joinedAt = Number(party.membershipJoinedAtBy?.[removal.memberId] || 0);
      const removalAt = Number(removal.at || 0);
      const membershipPresent = unique(party.memberIds).includes(removal.memberId)
        && character.currentPartyId === removal.partyId;
      const laterJoin = joinedAt > removalAt;
      if (!membershipPresent || (!laterJoin && removal.active !== false)) return;

      const before = JSON.stringify({
        active: removal.active,
        clearedAt: removal.clearedAt,
        invitedIds: party.invitedIds,
        declinedIds: party.declinedIds,
        reinvitedAt: party.membershipReinvitedAtBy?.[removal.memberId],
      });

      if (laterJoin) {
        removal.active = false;
        removal.clearedAt = Math.max(Number(removal.clearedAt || 0), joinedAt);
      }
      party.invitedIds = unique(party.invitedIds).filter((id) => id !== removal.memberId);
      party.declinedIds = unique(party.declinedIds).filter((id) => id !== removal.memberId);
      if (party.membershipReinvitedAtBy && typeof party.membershipReinvitedAtBy === "object") delete party.membershipReinvitedAtBy[removal.memberId];

      const after = JSON.stringify({
        active: removal.active,
        clearedAt: removal.clearedAt,
        invitedIds: party.invitedIds,
        declinedIds: party.declinedIds,
        reinvitedAt: party.membershipReinvitedAtBy?.[removal.memberId],
      });
      if (before !== after) changed = true;
    });

    return { snapshot: draft, changed };
  }

  const TEST_API = Object.freeze({
    membershipChangeAllowed,
    reinviteState,
    acceptReinviteState,
    repairRejoinedState,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_REINVITE_RUNTIME_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let refreshQueued = false;
  let repairing = false;

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
    window.dispatchEvent(new CustomEvent("baekji-party-reinvite-fix", { detail: { reason, version: VERSION } }));
  }

  function writeState(snapshot, reason) {
    if (!snapshot?.version) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw, reason);
    return true;
  }

  function closeInviteModal() {
    const root = document.getElementById("modal-root");
    if (root?.querySelector("[data-party-flow-modal]")) root.replaceChildren();
    document.querySelectorAll(".retro-invite-backdrop[data-party-flow-modal]").forEach((node) => node.remove());
  }

  function handleReinvite(memberId) {
    const [page, partyId] = routeParts();
    const actorId = currentUserId();
    if (page !== "party" || !partyId || !memberId || !actorId) return false;
    const snapshot = readState();
    if (!snapshot) return false;
    const next = reinviteState(snapshot, partyId, memberId, actorId, Date.now());
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return false;
    writeState(next, "reinvite-atomic");
    return true;
  }

  function handleAcceptReinvite(partyId) {
    const memberId = currentUserId();
    if (!partyId || !memberId) return false;
    const snapshot = readState();
    if (!snapshot) return false;
    const next = acceptReinviteState(snapshot, partyId, memberId, Date.now());
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return false;
    sessionStorage.removeItem(JOIN_INTENT_KEY);
    closeInviteModal();
    writeState(next, "reinvite-accept-atomic");
    if (location.hash !== "#/home") location.hash = "#/home";
    return true;
  }

  function refresh() {
    refreshQueued = false;
    if (repairing) return;
    const snapshot = readState();
    if (!snapshot) return;
    const repaired = repairRejoinedState(snapshot);
    if (!repaired.changed) {
      document.documentElement.dataset.partyReinviteFixVersion = VERSION;
      return;
    }
    repairing = true;
    try { writeState(repaired.snapshot, "rejoin-invariant-repair"); }
    finally { repairing = false; }
    document.documentElement.dataset.partyReinviteFixVersion = VERSION;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(refresh, 16);
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const invite = target.closest("[data-invite]");
    if (invite && handleReinvite(invite.dataset.invite)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const accept = target.closest("[data-party-flow-accept], [data-accept]");
    if (accept && handleAcceptReinvite(accept.dataset.partyFlowAccept || accept.dataset.accept)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener("storage", (event) => { if (!event.key || event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-party-membership", scheduleRefresh);
  window.addEventListener("baekji-party-reinvite-fix", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);
  setInterval(scheduleRefresh, 1200);
  scheduleRefresh();
})();
