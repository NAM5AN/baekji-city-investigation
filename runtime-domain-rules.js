(() => {
  "use strict";
  const { uniqueArray } = window.__BAEKJI_RUNTIME_UTILS__;
  function storedPartyReady(party, memberId) {
    const marker = party?.readyStateBy?.[memberId];
    if (marker && typeof marker === "object" && typeof marker.ready === "boolean") return marker.ready;
    if (typeof marker === "boolean") return marker;
    return uniqueArray(party?.readyBy).includes(memberId);
  }
  function effectivePartyReady(party, memberId) {
    if (memberId === party?.creatorId && ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party?.status)) return true;
    return storedPartyReady(party, memberId);
  }
  function partyMembershipChangeAllowed(party) {
    if (!party || party.sessionId) return false;
    return !["SESSION_CREATED", "LOCKED", "CLOSED"].includes(String(party.status || ""));
  }
  function partyMembershipRemovalKey(partyId, memberId) { return `${String(partyId || "")}:${String(memberId || "")}`; }
  function spatialScopeKey(session) {
    if (!session) return "";
    if (session.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
    if (session.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
    if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
    return `node:${session.currentNode}`;
  }
  function contaminationStage(value) {
    if (value >= 100) return "완전 용해";
    if (value >= 80) return "붕락";
    if (value >= 60) return "용해";
    if (value >= 40) return "유화";
    if (value >= 20) return "번짐";
    return "안정";
  }
  window.__BAEKJI_DOMAIN_RULES__ = Object.freeze({ storedPartyReady, effectivePartyReady, partyMembershipChangeAllowed, partyMembershipRemovalKey, spatialScopeKey, contaminationStage });
})();
