/**
 * Pure, server-side party command reducer.
 *
 * This module deliberately owns no persistence, clock, authenticated session,
 * or command ledger concerns.  Its caller supplies the authenticated actor,
 * a stable clock, and an id factory after the command envelope has passed its
 * CAS/idempotency preflight.
 */

const PARTY_ID = /^[A-Za-z0-9_-]{1,96}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,160}$/;
const DEFAULT_PARTY_NAME = /^해오름역 조사조\s+\d+$/;
const unique = (values) => [...new Set(Array.isArray(values) ? values.filter(Boolean) : [])];
const clone = (value) => structuredClone(value);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const partyId = (value) => typeof value === "string" && PARTY_ID.test(value) ? value : null;
const requestId = (value) => typeof value === "string" && REQUEST_ID.test(value) ? value : null;
const normalName = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

function result(status, state, metadata = undefined) {
  return metadata === undefined ? { status, state } : { status, state, metadata };
}

function ready(party, memberId) {
  if (object(party?.readyStateBy) && object(party.readyStateBy[memberId])) return party.readyStateBy[memberId].ready === true;
  return unique(party?.readyBy).includes(memberId);
}

function ensureReadyMap(party, at) {
  party.readyStateBy = object(party.readyStateBy) ? { ...party.readyStateBy } : {};
  unique(party.memberIds).forEach((memberId) => {
    if (!object(party.readyStateBy[memberId])) party.readyStateBy[memberId] = { ready: unique(party.readyBy).includes(memberId), at };
  });
}

function rebuildReady(party) { party.readyBy = unique(party.memberIds).filter((memberId) => ready(party, memberId)); }
function bump(party) { party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1; }
function membershipAllowed(party) { return !!party && !party.sessionId && ["RECRUITING", "COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status); }
function log(session, at, text, meta = {}) {
  session.logs ||= [];
  session.logs.push({ id: `log_${String(at)}_${session.logs.length + 1}`, type: "presence", text, actorId: null, at, ...meta });
}

function activeAtEntry(session) {
  return session?.status === "ACTIVE"
    && session.currentNode === "E_ENTRY"
    && !session.currentDetailId
    && !session.movement
    && !session.activeEncounter;
}

function partyDisplayName(state, session) {
  const party = state.parties?.[session?.partyId];
  if (!party) return "다른 조사조";
  const raw = String(party.name || "").trim();
  if (party.nameCustomized === true || (raw && !DEFAULT_PARTY_NAME.test(raw))) return raw || "다른 조사조";
  const members = unique(party.memberIds);
  if (members.length === 1) return String(state.characters?.[members[0]]?.name || raw || "다른 조사조");
  return raw || "다른 조사조";
}

function addEntryPresence(state, session, at) {
  if (!activeAtEntry(session)) return;
  for (const witness of Object.values(state.sessions || {})) {
    if (witness.id === session.id || witness.variant !== session.variant || !activeAtEntry(witness)) continue;
    const pair = [String(session.id), String(witness.id)].sort().join(":");
    for (const [recipient, other] of [[session, witness], [witness, session]]) {
      const id = `entry:${pair}:${recipient.id}:presence`;
      recipient.logs ||= [];
      if (recipient.logs.some((entry) => entry?.id === id)) continue;
      recipient.logs.push({
        id,
        type: "presence",
        text: `${partyDisplayName(state, other)}와 해오름역 구역 입구에서 마주쳐 같은 현장에 합류했다.`,
        actorId: null,
        at,
        entryPresence: true,
      });
    }
  }
}

function resetAfterMembershipChange(party, at) {
  const keepStage = ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status);
  const members = unique(party.memberIds);
  const retained = keepStage ? members.filter((memberId) => memberId === party.creatorId || ready(party, memberId)) : [];
  party.status = keepStage ? "COMPOSITION_CONFIRMED" : "RECRUITING";
  party.confirmedBy = keepStage ? members : [];
  party.readyBy = retained;
  party.readyStateBy = keepStage ? Object.fromEntries(members.map((memberId) => [memberId, { ready: retained.includes(memberId), at }])) : {};
  if (!keepStage) party.compositionLockedAt = null;
  party.membershipChangedAt = at;
  bump(party);
}

function appendRemoval(draft, party, memberId, actorId, kind, at) {
  draft.partyMembershipRemovals ||= {};
  draft.partyMembershipNotices ||= {};
  const key = `${party.id}:${memberId}`;
  draft.partyMembershipRemovals[key] = { partyId: party.id, memberId, actorId, kind, active: true, at };
  const noticeId = `membership_${at}_${memberId}_${kind}`;
  draft.partyMembershipNotices[noticeId] = {
    id: noticeId, partyId: party.id, partyName: String(party.name || "조사조"), memberId,
    memberName: String(draft.characters?.[memberId]?.name || memberId), leaderId: String(party.creatorId || ""), actorId, kind, at,
  };
}

function removeMember(draft, party, memberId, actorId, at, kind) {
  party.memberIds = unique(party.memberIds).filter((id) => id !== memberId);
  party.invitedIds = unique(party.invitedIds).filter((id) => id !== memberId);
  party.declinedIds = unique(party.declinedIds).filter((id) => id !== memberId);
  party.confirmedBy = unique(party.confirmedBy).filter((id) => id !== memberId);
  party.readyBy = unique(party.readyBy).filter((id) => id !== memberId);
  if (object(party.readyStateBy)) delete party.readyStateBy[memberId];
  if (object(party.membershipReinvitedAtBy)) delete party.membershipReinvitedAtBy[memberId];
  const character = draft.characters?.[memberId];
  if (character?.currentPartyId === party.id) character.currentPartyId = null;
  if (character && !party.sessionId) character.currentSessionId = null;
  resetAfterMembershipChange(party, at);
  appendRemoval(draft, party, memberId, actorId, kind, at);
}

function scope(session) { return `${session?.currentNode || ""}:${session?.currentDetailId || ""}`; }
function transferContext(state, actorId, targetPartyId) {
  const character = state.characters?.[actorId];
  const sourceParty = state.parties?.[character?.currentPartyId];
  const sourceSession = state.sessions?.[character?.currentSessionId];
  const targetParty = state.parties?.[targetPartyId];
  const targetSession = state.sessions?.[targetParty?.sessionId];
  if (!character || !sourceParty || !sourceSession || !targetParty || !targetSession) return null;
  if (sourceParty.id === targetParty.id || sourceSession.id === targetSession.id) return null;
  if (sourceSession.status !== "ACTIVE" || targetSession.status !== "ACTIVE" || sourceSession.variant !== targetSession.variant) return null;
  if (scope(sourceSession) !== scope(targetSession) || sourceSession.movement || targetSession.movement || sourceSession.activeEncounter || targetSession.activeEncounter) return null;
  return { character, sourceParty, sourceSession, targetParty, targetSession };
}

function valid(command, payload) {
  const oneParty = exact(payload, ["partyId"]) && !!partyId(payload.partyId);
  const partyMember = exact(payload, ["partyId", "memberId"]) && !!partyId(payload.partyId) && !!partyId(payload.memberId);
  switch (command) {
    case "CREATE_PARTY_V1": case "CONFIRM_BRIEFING_V1": return exact(payload, []);
    case "DECLINE_PARTY_INVITE_V1": case "ACCEPT_PARTY_INVITE_V1": case "TOGGLE_PARTY_READY_V1": case "LOCK_PARTY_COMPOSITION_V1": case "REOPEN_PARTY_RECRUITING_V1": case "START_PARTY_SESSION_V1": case "FORCE_START_PARTY_SESSION_V1": case "LEAVE_PARTY_V1": case "DISBAND_RECRUITING_PARTY_V1": return oneParty;
    case "CANCEL_PARTY_INVITE_V1": case "INVITE_PARTY_MEMBER_V1": return exact(payload, ["partyId", "inviteeId"]) && !!partyId(payload.partyId) && !!partyId(payload.inviteeId);
    case "RENAME_PARTY_V1": return exact(payload, ["partyId", "name"]) && !!partyId(payload.partyId) && normalName(payload.name).length >= 1 && normalName(payload.name).length <= 24;
    case "REMOVE_PARTY_MEMBER_V1": return partyMember;
    case "ROLLBACK_BRIEFING_V1": case "ACTIVATE_SESSION_V1": case "DISBAND_COMPLETED_PARTY_V1": return exact(payload, ["sessionId"]) && !!partyId(payload.sessionId);
    case "REQUEST_PARTY_TRANSFER_V1": return exact(payload, ["targetPartyId"]) && !!partyId(payload.targetPartyId);
    case "APPROVE_PARTY_TRANSFER_V1": case "REJECT_PARTY_TRANSFER_V1": return exact(payload, ["requestId"]) && !!requestId(payload.requestId);
    default: return false;
  }
}

export function reducePlayerWorldPartyCommand({ state, actorId, command, payload, nowMs = Date.now(), idFactory = (kind) => `${kind}_${nowMs}` }) {
  if (!object(state) || !object(state.parties) || !object(state.characters) || !object(state.sessions) || typeof actorId !== "string" || !valid(command, payload)) return result("OUT_OF_SCOPE", state);
  const draft = clone(state);
  const party = (id) => draft.parties[partyId(id)];

  if (command === "CREATE_PARTY_V1") {
    const actor = draft.characters[actorId];
    if (!actor) return result("OUT_OF_SCOPE", state);
    if (actor.currentPartyId && draft.parties[actor.currentPartyId]) return result("NOOP", state, { partyId: actor.currentPartyId });
    const id = String(idFactory("party"));
    if (!partyId(id) || draft.parties[id]) return result("OUT_OF_SCOPE", state);
    draft.parties[id] = { id, name: `해오름역 조사조 ${Object.keys(draft.parties).length + 1}`, creatorId: actorId, destination: "E", status: "RECRUITING", memberIds: [actorId], invitedIds: [], declinedIds: [], confirmedBy: [], readyBy: [], sessionId: null, createdAt: nowMs };
    actor.currentPartyId = id;
    return result("APPLIED", draft, { partyId: id });
  }

  if (command === "RENAME_PARTY_V1") {
    const entry = party(payload.partyId);
    const name = normalName(payload.name);
    if (!entry || entry.creatorId !== actorId || entry.sessionId) return result("OUT_OF_SCOPE", state);
    if (entry.name === name) return result("NOOP", state);
    entry.name = name; bump(entry); return result("APPLIED", draft);
  }

  if (command === "INVITE_PARTY_MEMBER_V1" || command === "CANCEL_PARTY_INVITE_V1") {
    const entry = party(payload.partyId); const invitee = draft.characters[payload.inviteeId];
    if (!entry || entry.creatorId !== actorId || !invitee || entry.status !== "RECRUITING" || entry.sessionId) return result("OUT_OF_SCOPE", state);
    if (command === "INVITE_PARTY_MEMBER_V1") {
      if (invitee.currentPartyId || unique(entry.memberIds).includes(payload.inviteeId)) return result("OUT_OF_SCOPE", state);
      if (unique(entry.invitedIds).includes(payload.inviteeId)) return result("NOOP", state);
      entry.invitedIds = unique([...entry.invitedIds, payload.inviteeId]); entry.declinedIds = unique(entry.declinedIds).filter((id) => id !== payload.inviteeId); return result("APPLIED", draft);
    }
    if (!unique(entry.invitedIds).includes(payload.inviteeId)) return result("NOOP", state);
    entry.invitedIds = unique(entry.invitedIds).filter((id) => id !== payload.inviteeId); return result("APPLIED", draft);
  }

  if (command === "ACCEPT_PARTY_INVITE_V1" || command === "DECLINE_PARTY_INVITE_V1") {
    const entry = party(payload.partyId); const actor = draft.characters[actorId];
    if (!entry || !actor || !["RECRUITING", "COMPOSITION_CONFIRMED"].includes(entry.status) || entry.sessionId) return result("OUT_OF_SCOPE", state);
    if (!unique(entry.invitedIds).includes(actorId)) return result(command === "DECLINE_PARTY_INVITE_V1" && unique(entry.declinedIds).includes(actorId) ? "NOOP" : "OUT_OF_SCOPE", state);
    if (command === "DECLINE_PARTY_INVITE_V1") { entry.invitedIds = unique(entry.invitedIds).filter((id) => id !== actorId); entry.declinedIds = unique([...entry.declinedIds, actorId]); return result("APPLIED", draft); }
    if (actor.currentPartyId) return result("OUT_OF_SCOPE", state);
    entry.memberIds = unique([...entry.memberIds, actorId]); entry.invitedIds = unique(entry.invitedIds).filter((id) => id !== actorId); entry.declinedIds = unique(entry.declinedIds).filter((id) => id !== actorId); entry.confirmedBy = unique(entry.confirmedBy).filter((id) => entry.memberIds.includes(id));
    if (entry.status === "COMPOSITION_CONFIRMED") { entry.confirmedBy = unique([...entry.confirmedBy, actorId]); ensureReadyMap(entry, nowMs); entry.readyStateBy[actorId] = { ready: false, at: nowMs }; rebuildReady(entry); }
    actor.currentPartyId = entry.id; return result("APPLIED", draft);
  }

  if (command === "TOGGLE_PARTY_READY_V1") {
    const entry = party(payload.partyId);
    if (!entry || entry.creatorId === actorId || !unique(entry.memberIds).includes(actorId) || entry.sessionId || !["RECRUITING", "COMPOSITION_CONFIRMED", "READY_CHECK"].includes(entry.status)) return result("OUT_OF_SCOPE", state);
    ensureReadyMap(entry, nowMs); entry.readyStateBy[actorId] = { ready: !ready(entry, actorId), at: nowMs }; rebuildReady(entry); if (entry.status === "READY_CHECK") entry.status = "COMPOSITION_CONFIRMED"; bump(entry); return result("APPLIED", draft);
  }

  if (command === "LOCK_PARTY_COMPOSITION_V1") {
    const entry = party(payload.partyId);
    if (!entry || entry.creatorId !== actorId || entry.status !== "RECRUITING" || entry.sessionId) return result("OUT_OF_SCOPE", state);
    entry.memberIds = unique(entry.memberIds); ensureReadyMap(entry, nowMs); entry.readyStateBy[actorId] = { ready: true, at: nowMs }; rebuildReady(entry); entry.confirmedBy = [...entry.memberIds]; entry.status = "COMPOSITION_CONFIRMED"; entry.compositionLockedAt = nowMs; bump(entry); return result("APPLIED", draft);
  }

  if (command === "REOPEN_PARTY_RECRUITING_V1") {
    const entry = party(payload.partyId);
    if (!entry || entry.creatorId !== actorId || entry.status !== "COMPOSITION_CONFIRMED" || entry.sessionId) return result("OUT_OF_SCOPE", state);
    ensureReadyMap(entry, nowMs); rebuildReady(entry); entry.status = "RECRUITING"; entry.confirmedBy = []; entry.compositionLockedAt = null; bump(entry); return result("APPLIED", draft);
  }

  if (command === "LEAVE_PARTY_V1" || command === "REMOVE_PARTY_MEMBER_V1") {
    const entry = party(payload.partyId); const memberId = command === "LEAVE_PARTY_V1" ? actorId : payload.memberId;
    if (!membershipAllowed(entry) || !unique(entry.memberIds).includes(memberId)) return result("OUT_OF_SCOPE", state);
    if (command === "LEAVE_PARTY_V1" ? memberId === entry.creatorId : entry.creatorId !== actorId || memberId === entry.creatorId) return result("OUT_OF_SCOPE", state);
    removeMember(draft, entry, memberId, actorId, nowMs, command === "LEAVE_PARTY_V1" ? "SELF_LEAVE" : "LEADER_KICK"); return result("APPLIED", draft);
  }

  if (command === "DISBAND_RECRUITING_PARTY_V1") {
    const entry = party(payload.partyId);
    if (!entry || entry.creatorId !== actorId || entry.status !== "RECRUITING" || entry.sessionId) return result("OUT_OF_SCOPE", state);
    unique(entry.memberIds).forEach((memberId) => { const character = draft.characters[memberId]; if (character?.currentPartyId === entry.id) character.currentPartyId = null; }); delete draft.parties[entry.id]; return result("APPLIED", draft);
  }

  if (command === "START_PARTY_SESSION_V1" || command === "FORCE_START_PARTY_SESSION_V1") {
    const entry = party(payload.partyId);
    if (!entry || entry.creatorId !== actorId || entry.sessionId || !["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(entry.status)) return result("OUT_OF_SCOPE", state);
    const pendingIds = unique(entry.invitedIds); const unreadyIds = unique(entry.memberIds).filter((memberId) => !ready(entry, memberId));
    if (command === "START_PARTY_SESSION_V1" && (pendingIds.length || unreadyIds.length)) return result("OUT_OF_SCOPE", state, { requiresConfirmation: true, pendingIds, unreadyIds });
    if (command === "START_PARTY_SESSION_V1" && !unique(entry.memberIds).length) return result("OUT_OF_SCOPE", state);
    if (command === "FORCE_START_PARTY_SESSION_V1") {
      const remaining = unique(entry.memberIds).filter((memberId) => !unreadyIds.includes(memberId));
      if (!remaining.includes(actorId)) return result("OUT_OF_SCOPE", state);
      entry.invitedIds = unique(entry.invitedIds).filter((memberId) => !pendingIds.includes(memberId));
      unreadyIds.forEach((memberId) => { removeMember(draft, entry, memberId, actorId, nowMs, "LEADER_KICK"); });
      if (!entry.memberIds.length) return result("OUT_OF_SCOPE", state);
    }
    const sessionId = String(idFactory("session"));
    if (!partyId(sessionId) || draft.sessions[sessionId]) return result("OUT_OF_SCOPE", state);
    const members = unique(entry.memberIds); if (!members.every((memberId) => ready(entry, memberId))) return result("OUT_OF_SCOPE", state);
    entry.invitedIds = []; entry.status = "SESSION_CREATED"; entry.sessionId = sessionId; draft.sessionSeq = Number(draft.sessionSeq || 0) + 1;
    draft.sessions[sessionId] = { id: sessionId, partyId: entry.id, memberIds: members, status: "BRIEFING", variant: "c", currentNode: "E_ENTRY", currentDetailId: null, activeEncounter: null, movement: null, inspectedObjectIds: [], takenItemKeys: [], choiceReveal: null, logs: [{ id: `session:${sessionId}:briefing-start`, type: "scene", at: nowMs, actorId: null, text: "조사조 전원이 준비를 마쳐 해오름역 출입 경계가 열렸습니다." }], startedAt: nowMs, endedAt: null };
    members.forEach((memberId) => { if (draft.characters[memberId]) draft.characters[memberId].currentSessionId = sessionId; }); return result("APPLIED", draft, { sessionId });
  }

  if (command === "CONFIRM_BRIEFING_V1") {
    const sessionId = draft.characters[actorId]?.currentSessionId; const session = draft.sessions[sessionId]; const entry = draft.parties?.[session?.partyId];
    if (!session || !entry || session.status !== "BRIEFING" || entry.creatorId === actorId || !unique(session.memberIds).includes(actorId)) return result("OUT_OF_SCOPE", state);
    if (unique(session.briefingConfirmedBy).includes(actorId)) return result("NOOP", state);
    session.briefingConfirmedBy = unique([...(session.briefingConfirmedBy || []), actorId]); return result("APPLIED", draft);
  }

  if (command === "ROLLBACK_BRIEFING_V1" || command === "ACTIVATE_SESSION_V1" || command === "DISBAND_COMPLETED_PARTY_V1") {
    const session = draft.sessions[payload.sessionId]; const entry = draft.parties?.[session?.partyId];
    if (!session || !entry) return result("OUT_OF_SCOPE", state);
    if (command === "ROLLBACK_BRIEFING_V1") {
      if (entry.creatorId !== actorId || session.status !== "BRIEFING" || entry.sessionId !== session.id) return result("OUT_OF_SCOPE", state);
      unique(session.memberIds).forEach((memberId) => { if (draft.characters[memberId]?.currentSessionId === session.id) draft.characters[memberId].currentSessionId = null; }); delete draft.sessions[session.id]; entry.sessionId = null; entry.status = "COMPOSITION_CONFIRMED"; bump(entry); return result("APPLIED", draft);
    }
    if (command === "ACTIVATE_SESSION_V1") {
      const required = unique(session.memberIds).filter((memberId) => memberId !== entry.creatorId);
      if (entry.creatorId !== actorId || session.status !== "BRIEFING" || !required.every((memberId) => unique(session.briefingConfirmedBy).includes(memberId))) return result("OUT_OF_SCOPE", state);
      session.status = "ACTIVE";
      log(session, nowMs, "해오름역 구역 입구에 도착했다.", { kind: "SESSION_ACTIVATED" });
      addEntryPresence(draft, session, nowMs);
      return result("APPLIED", draft);
    }
    if (session.status !== "COMPLETED" || session.partyDisbandedAt || !unique(session.memberIds).includes(actorId)) return result(session.partyDisbandedAt ? "NOOP" : "OUT_OF_SCOPE", state);
    session.partyDisbandedAt = nowMs; session.partyDisbandedBy = actorId; entry.status = "CLOSED"; entry.archivedAt = nowMs; entry.archivedSessionId = session.id; entry.memberIds = []; entry.invitedIds = []; entry.declinedIds = []; entry.confirmedBy = []; entry.readyBy = []; entry.readyStateBy = {}; entry.sessionId = null;
    unique(session.memberIds).forEach((memberId) => { const character = draft.characters[memberId]; if (character?.currentPartyId === entry.id) character.currentPartyId = null; if (character?.currentSessionId === session.id) character.currentSessionId = null; }); return result("APPLIED", draft);
  }

  if (command === "REQUEST_PARTY_TRANSFER_V1") {
    const context = transferContext(draft, actorId, payload.targetPartyId);
    if (!context) return result("OUT_OF_SCOPE", state);
    if (Object.values(draft.partyTransferRequests || {}).some((request) => request?.requesterId === actorId && request.status === "PENDING")) return result("NOOP", state);
    const id = String(idFactory("transfer")); if (!requestId(id) || draft.partyTransferRequests?.[id]) return result("OUT_OF_SCOPE", state);
    draft.partyTransferRequests ||= {};
    draft.partyTransferRequests[id] = { id, requesterId: actorId, sourcePartyId: context.sourceParty.id, sourceSessionId: context.sourceSession.id, targetPartyId: context.targetParty.id, targetSessionId: context.targetSession.id, scopeKey: scope(context.sourceSession), status: "PENDING", requestedAt: nowMs, resolvedAt: null, resolvedBy: null };
    return result("APPLIED", draft, { requestId: id });
  }

  if (command === "APPROVE_PARTY_TRANSFER_V1" || command === "REJECT_PARTY_TRANSFER_V1") {
    const request = draft.partyTransferRequests?.[payload.requestId]; const target = draft.parties?.[request?.targetPartyId];
    if (!request || !target || target.creatorId !== actorId) return result("OUT_OF_SCOPE", state);
    if (request.status !== "PENDING") return result("NOOP", state);
    if (command === "REJECT_PARTY_TRANSFER_V1") { request.status = "REJECTED"; request.resolvedAt = nowMs; request.resolvedBy = actorId; return result("APPLIED", draft); }
    const context = transferContext(draft, request.requesterId, request.targetPartyId);
    if (!context || context.sourceParty.id !== request.sourcePartyId || context.sourceSession.id !== request.sourceSessionId || context.targetSession.id !== request.targetSessionId) return result("OUT_OF_SCOPE", state);
    request.status = "APPROVED"; request.resolvedAt = nowMs; request.resolvedBy = actorId;
    const id = request.requesterId; const source = context.sourceParty; const targetParty = context.targetParty;
    source.memberIds = unique(source.memberIds).filter((memberId) => memberId !== id); source.confirmedBy = unique(source.confirmedBy).filter((memberId) => memberId !== id); source.readyBy = unique(source.readyBy).filter((memberId) => memberId !== id); context.sourceSession.memberIds = unique(context.sourceSession.memberIds).filter((memberId) => memberId !== id);
    targetParty.memberIds = unique([...targetParty.memberIds, id]); targetParty.confirmedBy = unique([...targetParty.confirmedBy, id]); targetParty.readyBy = unique([...targetParty.readyBy, id]); context.targetSession.memberIds = unique([...context.targetSession.memberIds, id]); context.character.currentPartyId = targetParty.id; context.character.currentSessionId = context.targetSession.id;
    if (source.creatorId === id) source.creatorId = source.memberIds[0] || null;
    if (!source.memberIds.length) source.status = "CLOSED";
    if (!context.sourceSession.memberIds.length) context.sourceSession.status = "CLOSED";
    log(context.sourceSession, nowMs, `${id}의 조사조 소속이 다른 조사조로 이동되었다.`, { kind: "PARTY_TRANSFER_OUT", requestId: request.id }); log(context.targetSession, nowMs, `${id}의 조사조 소속이 이 조사조로 이동되었다.`, { kind: "PARTY_TRANSFER_IN", requestId: request.id }); return result("APPLIED", draft);
  }

  return result("OUT_OF_SCOPE", state);
}
