import assert from "node:assert/strict";
import { reducePlayerWorldPartyCommand as reduce } from "../server/player-world-party-reducer.mjs";

const call = (state, actorId, command, payload, nowMs = 1000) => reduce({ state, actorId, command, payload, nowMs, idFactory: (kind) => kind === "party" ? "p-new" : kind === "session" ? "s-new" : "r-new" });
const json = (value) => structuredClone(value);

function state() {
  return {
    version: 3, sessionSeq: 0,
    characters: {
      a: { id: "a", name: "A", currentPartyId: "p1", currentSessionId: null },
      b: { id: "b", name: "B", currentPartyId: null, currentSessionId: null },
      c: { id: "c", name: "C", currentPartyId: null, currentSessionId: null },
    },
    parties: {
      p1: { id: "p1", name: "1조", creatorId: "a", destination: "E", status: "RECRUITING", memberIds: ["a"], invitedIds: [], declinedIds: [], confirmedBy: [], readyBy: [], readyStateBy: {}, sessionId: null, flowRevision: 0 },
    }, sessions: {},
  };
}

let s = state();
let r = call(s, "b", "CREATE_PARTY_V1", {});
assert.equal(r.status, "APPLIED");
assert.equal(r.state.characters.b.currentPartyId, "p-new");
assert.equal(r.state.parties["p-new"].destination, "E", "create retains the fixed first-day destination");
assert.deepEqual(Object.keys(r.state.parties["p-new"]).sort(), ["confirmedBy", "createdAt", "creatorId", "declinedIds", "destination", "id", "invitedIds", "memberIds", "name", "readyBy", "sessionId", "status"].sort(), "create retains the shipped 12-field party shape");
assert.equal(call(r.state, "b", "CREATE_PARTY_V1", {}).status, "NOOP", "creation is idempotent for an assigned actor");

r = call(s, "a", "RENAME_PARTY_V1", { partyId: "p1", name: "  새   이름 " });
assert.equal(r.state.parties.p1.name, "새 이름");
assert.equal(call(s, "b", "RENAME_PARTY_V1", { partyId: "p1", name: "x" }).status, "OUT_OF_SCOPE");

r = call(s, "a", "INVITE_PARTY_MEMBER_V1", { partyId: "p1", inviteeId: "b" });
assert.equal(r.status, "APPLIED");
assert.deepEqual(r.state.parties.p1.invitedIds, ["b"]);
assert.equal(call(r.state, "a", "CANCEL_PARTY_INVITE_V1", { partyId: "p1", inviteeId: "b" }).state.parties.p1.invitedIds.length, 0);
r = call(r.state, "b", "ACCEPT_PARTY_INVITE_V1", { partyId: "p1" });
assert.equal(r.status, "APPLIED");
assert.equal(r.state.characters.b.currentPartyId, "p1");
assert(r.state.parties.p1.memberIds.includes("b"));
assert.equal(call(r.state, "b", "DECLINE_PARTY_INVITE_V1", { partyId: "p1" }).status, "OUT_OF_SCOPE");

s = state();
s.parties.p1.invitedIds = ["b"];
r = call(s, "b", "DECLINE_PARTY_INVITE_V1", { partyId: "p1" });
assert.equal(r.status, "APPLIED");
assert.deepEqual(r.state.parties.p1.declinedIds, ["b"]);

s = state(); s.parties.p1.memberIds.push("b"); s.characters.b.currentPartyId = "p1";
r = call(s, "a", "LOCK_PARTY_COMPOSITION_V1", { partyId: "p1" });
assert.equal(r.state.parties.p1.status, "COMPOSITION_CONFIRMED");
assert.equal(r.state.parties.p1.readyStateBy.a.ready, true);
r = call(r.state, "b", "TOGGLE_PARTY_READY_V1", { partyId: "p1" });
assert.equal(r.state.parties.p1.readyStateBy.b.ready, true);
r = call(r.state, "a", "REOPEN_PARTY_RECRUITING_V1", { partyId: "p1" });
assert.equal(r.state.parties.p1.status, "RECRUITING");
assert.equal(r.state.parties.p1.readyStateBy.b.ready, true, "reopen preserves existing readiness semantics");

s = state(); s.parties.p1.memberIds.push("b"); s.characters.b.currentPartyId = "p1";
r = call(s, "b", "LEAVE_PARTY_V1", { partyId: "p1" });
assert.equal(r.status, "APPLIED");
assert.equal(r.state.characters.b.currentPartyId, null);
assert.equal(r.state.partyMembershipRemovals["p1:b"].kind, "SELF_LEAVE");
s = state(); s.parties.p1.memberIds.push("b"); s.characters.b.currentPartyId = "p1";
r = call(s, "a", "REMOVE_PARTY_MEMBER_V1", { partyId: "p1", memberId: "b" });
assert.equal(r.status, "APPLIED");
assert.equal(r.state.partyMembershipRemovals["p1:b"].kind, "LEADER_KICK");
assert.equal(call(s, "b", "REMOVE_PARTY_MEMBER_V1", { partyId: "p1", memberId: "a" }).status, "OUT_OF_SCOPE");
r = call(state(), "a", "DISBAND_RECRUITING_PARTY_V1", { partyId: "p1" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.parties.p1, undefined);

s = state(); s.parties.p1.status = "COMPOSITION_CONFIRMED"; s.parties.p1.readyBy = ["a"]; s.parties.p1.readyStateBy = { a: { ready: true, at: 1 } };
r = call(s, "a", "START_PARTY_SESSION_V1", { partyId: "p1" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.sessions["s-new"].status, "BRIEFING");
assert.equal(r.state.characters.a.currentSessionId, "s-new");

s = state(); s.parties.p1.memberIds.push("b"); s.characters.b.currentPartyId = "p1"; s.parties.p1.status = "COMPOSITION_CONFIRMED"; s.parties.p1.readyBy = ["a"]; s.parties.p1.readyStateBy = { a: { ready: true }, b: { ready: false } }; s.parties.p1.invitedIds = ["c"];
r = call(s, "a", "START_PARTY_SESSION_V1", { partyId: "p1" });
assert.equal(r.status, "OUT_OF_SCOPE", "a pending start is an explicit confirmation boundary, never a success-looking noop");
assert.deepEqual(r.metadata, { requiresConfirmation: true, pendingIds: ["c"], unreadyIds: ["b"] });
r = call(s, "a", "FORCE_START_PARTY_SESSION_V1", { partyId: "p1" });
assert.equal(r.status, "APPLIED"); assert.deepEqual(r.state.sessions["s-new"].memberIds, ["a"]); assert.equal(r.state.characters.b.currentPartyId, null);

s = r.state;
r = call(s, "a", "ROLLBACK_BRIEFING_V1", { sessionId: "s-new" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.sessions["s-new"], undefined); assert.equal(r.state.parties.p1.status, "COMPOSITION_CONFIRMED");

s = state(); s.parties.p1.memberIds.push("b"); s.characters.b.currentPartyId = "p1"; s.parties.p1.status = "SESSION_CREATED"; s.parties.p1.sessionId = "s1"; s.characters.a.currentSessionId = "s1"; s.characters.b.currentSessionId = "s1"; s.sessions.s1 = { id: "s1", partyId: "p1", memberIds: ["a", "b"], status: "BRIEFING", briefingConfirmedBy: [], logs: [] };
r = call(s, "b", "CONFIRM_BRIEFING_V1", {});
assert.equal(r.status, "APPLIED"); assert.equal(call(r.state, "b", "CONFIRM_BRIEFING_V1", {}).status, "NOOP");
r = call(r.state, "a", "ACTIVATE_SESSION_V1", { sessionId: "s1" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.sessions.s1.status, "ACTIVE");

s = json(r.state); s.sessions.s1.status = "COMPLETED";
r = call(s, "b", "DISBAND_COMPLETED_PARTY_V1", { sessionId: "s1" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.sessions.s1.status, "COMPLETED", "result status is historical evidence"); assert.equal(r.state.parties.p1.status, "CLOSED");

s = state();
s.parties.p1.status = "SESSION_CREATED"; s.parties.p1.sessionId = "s1"; s.characters.a.currentSessionId = "s1";
s.parties.p2 = { id: "p2", name: "2조", creatorId: "b", status: "SESSION_CREATED", memberIds: ["b"], invitedIds: [], declinedIds: [], confirmedBy: ["b"], readyBy: ["b"], readyStateBy: {}, sessionId: "s2" };
s.characters.b.currentPartyId = "p2"; s.characters.b.currentSessionId = "s2";
s.sessions.s1 = { id: "s1", partyId: "p1", memberIds: ["a"], status: "ACTIVE", variant: "c", currentNode: "E_HALL", currentDetailId: null, movement: null, activeEncounter: null, logs: [] };
s.sessions.s2 = { id: "s2", partyId: "p2", memberIds: ["b"], status: "ACTIVE", variant: "c", currentNode: "E_HALL", currentDetailId: null, movement: null, activeEncounter: null, logs: [] };
r = call(s, "a", "REQUEST_PARTY_TRANSFER_V1", { targetPartyId: "p2" });
assert.equal(r.status, "APPLIED"); assert.equal(r.metadata.requestId, "r-new");
const requested = r.state;
assert.equal(call(requested, "c", "APPROVE_PARTY_TRANSFER_V1", { requestId: "r-new" }).status, "OUT_OF_SCOPE");
r = call(requested, "b", "APPROVE_PARTY_TRANSFER_V1", { requestId: "r-new" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.characters.a.currentPartyId, "p2"); assert.equal(r.state.parties.p1.status, "CLOSED");

s = json(requested); r = call(s, "b", "REJECT_PARTY_TRANSFER_V1", { requestId: "r-new" });
assert.equal(r.status, "APPLIED"); assert.equal(r.state.partyTransferRequests["r-new"].status, "REJECTED");
assert.equal(call(s, "a", "UNKNOWN_V1", {}).status, "OUT_OF_SCOPE");
assert.equal(call(s, "a", "REQUEST_PARTY_TRANSFER_V1", { targetPartyId: "p2", actorId: "b" }).status, "OUT_OF_SCOPE", "over-posted actor fields are rejected");

console.log("PASS: pure party reducer preserves all shipped and remaining lifecycle command boundaries");
