import assert from "node:assert/strict";
import { reducePlayerWorldInvestigationCommand as reduce } from "../lib/player-world-investigation-reducer.mjs";

let sequence = 0;
const ids = (prefix) => `${prefix}-${++sequence}`;
const base = () => ({
  characters: { a: { id: "a", contamination: 0, symptom: "안정", inventory: {} }, b: { id: "b", contamination: 0, symptom: "안정", inventory: {} } },
  parties: { p: { id: "p", creatorId: "a", confirmedBy: [] } },
  sessions: { s: { id: "s", partyId: "p", memberIds: ["a"], status: "BRIEFING", variant: "a", currentNode: "E_ENTRY", currentDetailId: null, movement: null, activeEncounter: null, inspectedObjectIds: [], takenItemKeys: [], logs: [] } },
  itemClaimsByVariant: { a: {} },
});
const call = (state, command, payload, nowMs = 1000) => reduce({ state, actorId: "a", command, payload, nowMs, idFactory: ids });

let state = base();
state.sessions.s.status = "ACTIVE";
let result = call(state, "BEGIN_MOVEMENT_V1", { sessionId: "s", routeId: "E_R001" }, 2000);
assert.equal(result.status, "APPLIED");
assert.equal(result.state.sessions.s.movement.fromNode, "E_ENTRY");
const token = result.state.sessions.s.movement.token;
assert.equal(call(result.state, "SETTLE_MOVEMENT_V1", { sessionId: "s", movementToken: token }, 2001).reason, "NOT_DUE");
result = call(result.state, "SETTLE_MOVEMENT_V1", { sessionId: "s", movementToken: token }, 4000);
assert.equal(result.status, "APPLIED");
assert.ok(result.state.sessions.s.activeEncounter || result.state.sessions.s.currentNode !== "E_ENTRY");
state = result.state;
if (state.sessions.s.activeEncounter) {
  const encounter = state.sessions.s.activeEncounter;
  result = call(state, "RESOLVE_HAZARD_V1", { sessionId: "s", movementToken: token, hazardIndex: encounter.currentIndex, hazardId: encounter.hazards[encounter.currentIndex], actionText: "천천히 확인한다" }, 5000);
  assert.equal(result.status, "APPLIED");
}

state = base(); state.sessions.s.status = "ACTIVE"; state.sessions.s.currentNode = "E_G_PLAZA";
result = call(state, "INVESTIGATION_ACTION_V1", { sessionId: "s", kind: "DETAIL", targetId: "E_G_INFO" });
assert.equal(result.state.sessions.s.currentDetailId, "E_G_INFO");
result = call(result.state, "SEND_FIELD_CHAT_V1", { sessionId: "s", text: "여기 봐." });
assert.equal(result.status, "APPLIED");
assert.equal(result.state.sessions.s.logs.at(-1).type, "interaction");
result = call(result.state, "END_SESSION_V1", { sessionId: "s" }, 6000);
assert.equal(result.state.sessions.s.status, "COMPLETED");
assert.equal(state.sessions.s.status, "ACTIVE", "input snapshot must remain immutable");

console.log("PASS: pure player-world investigation reducer handles movement, hazard, investigation, field-chat, and session completion transitions");
