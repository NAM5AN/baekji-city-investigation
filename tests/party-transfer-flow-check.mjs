import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("party-transfer-flow.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const worldPersistence = fs.readFileSync("world-persistence.js", "utf8");
const domainRules = fs.readFileSync("runtime-domain-rules.js", "utf8");
const context = vm.createContext({ console, structuredClone, queueMicrotask(callback) { callback(); }, localStorage: { getItem() { return null; }, setItem() {} }, window: null });
context.window = context;
vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, context, { filename: "world-persistence.js" });
vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
vm.runInContext(source, context, { filename: "party-transfer-flow.js" });
const api = context.__BAEKJI_PARTY_TRANSFER_TEST__;
assert(api, "party transfer test API should be exposed");

function makeState() {
  return {
    version: 3,
    characters: {
      a: { id: "a", currentPartyId: "p1", currentSessionId: "s1", contamination: 0, inventory: {} },
      x: { id: "x", currentPartyId: "p1", currentSessionId: "s1", contamination: 0, inventory: {} },
      b: { id: "b", currentPartyId: "p2", currentSessionId: "s2", contamination: 0, inventory: {} },
      c: { id: "c", currentPartyId: "p3", currentSessionId: "s3", contamination: 0, inventory: {} },
      d: { id: "d", currentPartyId: "p4", currentSessionId: "s4", contamination: 0, inventory: {} },
    },
    parties: {
      p1: { id: "p1", name: "1조", creatorId: "a", status: "SESSION_CREATED", memberIds: ["a", "x"], confirmedBy: ["a", "x"], readyBy: ["a", "x"], invitedIds: [], sessionId: "s1" },
      p2: { id: "p2", name: "2조", creatorId: "b", status: "SESSION_CREATED", memberIds: ["b"], confirmedBy: ["b"], readyBy: ["b"], invitedIds: [], sessionId: "s2" },
      p3: { id: "p3", name: "3조", creatorId: "c", status: "SESSION_CREATED", memberIds: ["c"], confirmedBy: ["c"], readyBy: ["c"], invitedIds: [], sessionId: "s3" },
      p4: { id: "p4", name: "4조", creatorId: "d", status: "SESSION_CREATED", memberIds: ["d"], confirmedBy: ["d"], readyBy: ["d"], invitedIds: [], sessionId: "s4" },
    },
    sessions: {
      s1: { id: "s1", partyId: "p1", memberIds: ["a", "x"], status: "ACTIVE", variant: "c", currentNode: "E_HALL", currentDetailId: null, movement: null, activeEncounter: null, logs: [] },
      s2: { id: "s2", partyId: "p2", memberIds: ["b"], status: "ACTIVE", variant: "c", currentNode: "E_HALL", currentDetailId: null, movement: null, activeEncounter: null, logs: [] },
      s3: { id: "s3", partyId: "p3", memberIds: ["c"], status: "ACTIVE", variant: "c", currentNode: "E_HALL", currentDetailId: null, movement: null, activeEncounter: null, logs: [] },
      s4: { id: "s4", partyId: "p4", memberIds: ["d"], status: "ACTIVE", variant: "c", currentNode: "E_OTHER", currentDetailId: null, movement: null, activeEncounter: null, logs: [] },
    },
    partyTransferRequests: {},
  };
}

let state = makeState();
assert.equal(api.presentCharacterIds(state, state.sessions.s1).length, 4, "same field should include own and other-party characters, excluding other locations");
assert.equal(api.transferContext(state, "a", "p2").ok, true, "same stable field should allow a transfer request");
assert.equal(api.transferContext(state, "a", "p4").code, "NOT_SAME_FIELD", "different locations must not allow party transfer");

const busyState = makeState();
busyState.sessions.s2.activeEncounter = { fromNode: "E_HALL", targetNode: "E_NEXT", hazards: ["H1"], currentIndex: 0 };
assert.equal(api.transferContext(busyState, "a", "p2").code, "NOT_SAME_FIELD", "a target in a different active route is no longer the same exact field");

state = api.createTransferRequestState(state, "a", "p2", "r1", 1000);
state = api.createTransferRequestState(state, "c", "p2", "r2", 1001);
assert.equal(api.pendingRequestsForLeader(state, "b").length, 2, "target leader should see simultaneous requests as a queue");
assert.equal(state.partyTransferRequests.r1.status, "PENDING");
assert.equal(state.partyTransferRequests.r2.status, "PENDING");

const wrongLeader = api.approveTransferState(state, "r1", "x", 1100);
assert.equal(wrongLeader.partyTransferRequests.r1.status, "PENDING", "only the target party leader may approve");

state = api.approveTransferState(state, "r1", "b", 1200);
assert.equal(state.partyTransferRequests.r1.status, "APPROVED");
assert.equal(state.partyTransferRequests.r2.status, "PENDING", "approving one request must not consume other queued requests");
assert.equal(state.characters.a.currentPartyId, "p2");
assert.equal(state.characters.a.currentSessionId, "s2");
assert(!state.parties.p1.memberIds.includes("a"));
assert(state.parties.p2.memberIds.includes("a"));
assert(!state.sessions.s1.memberIds.includes("a"));
assert(state.sessions.s2.memberIds.includes("a"));
assert.equal(state.parties.p1.creatorId, "x", "if the source leader moves, leadership should pass to a remaining member");
assert.equal(state.sessions.s1.status, "ACTIVE", "source session remains active while members remain");
assert.equal(state.sessions.s2.currentNode, "E_HALL", "moving a character must not advance the destination party investigation");

const conflicted = structuredClone(state);
conflicted.parties.p1.memberIds.push("a");
conflicted.sessions.s1.memberIds.push("a");
conflicted.parties.p2.memberIds = conflicted.parties.p2.memberIds.filter((id) => id !== "a");
conflicted.sessions.s2.memberIds = conflicted.sessions.s2.memberIds.filter((id) => id !== "a");
const repaired = api.repairApprovedTransfers(conflicted);
assert.equal(repaired.changed, true, "approved requests should repair array-union cloud conflicts");
assert(!repaired.snapshot.parties.p1.memberIds.includes("a"));
assert(repaired.snapshot.parties.p2.memberIds.includes("a"));
assert(repaired.snapshot.sessions.s2.memberIds.includes("a"));

state = api.approveTransferState(state, "r2", "b", 1300);
assert.equal(state.partyTransferRequests.r2.status, "APPROVED");
assert(state.parties.p2.memberIds.includes("c"));
assert.equal(state.parties.p3.status, "CLOSED", "a one-person source party should close when its only member moves");
assert.equal(state.sessions.s3.status, "CLOSED", "an emptied source session should stop being a live field session");

const rejectedBase = makeState();
let rejected = api.createTransferRequestState(rejectedBase, "a", "p2", "r3", 2000);
rejected = api.rejectTransferState(rejected, "r3", "b", 2100);
assert.equal(rejected.partyTransferRequests.r3.status, "REJECTED");
assert.equal(rejected.characters.a.currentPartyId, "p1", "rejection must not alter membership");

assert(source.includes("data-open-field-presence"), "field presence card should be clickable even when solo");
assert(source.includes("data-party-transfer-open-approvals"), "leaders need a reusable approval queue entry point");
assert(source.includes("setInterval(scheduleRefresh"), "remote concurrent requests should be picked up while the session stays open");
console.log("PASS: field presence, queued party transfer requests, leader approval, leadership handoff, and conflict repair");
