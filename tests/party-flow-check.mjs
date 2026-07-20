import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-flow-sync.js", import.meta.url), "utf8");
const sandbox = {
  window: {},
  structuredClone,
  console,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "party-flow-sync.js" });

const api = sandbox.window.__BAEKJI_PARTY_FLOW_TEST__;
assert.ok(api, "party flow test API must be exposed");

const base = {
  version: 3,
  characters: {
    test_a: { currentPartyId: "party_1", currentSessionId: "session_1" },
    test_b: { currentPartyId: null, currentSessionId: null },
    test_c: { currentPartyId: null, currentSessionId: null },
  },
  parties: {
    party_1: {
      id: "party_1",
      name: "해오름역 조사조 1",
      creatorId: "test_a",
      status: "RECRUITING",
      memberIds: ["test_a"],
      invitedIds: ["test_b", "test_c"],
      declinedIds: ["test_c"],
      confirmedBy: [],
      readyBy: [],
    },
  },
  sessions: {
    session_1: {
      id: "session_1",
      partyId: "party_1",
      status: "BRIEFING",
      memberIds: ["test_a", "test_b", "test_c"],
    },
  },
};

assert.deepEqual(Array.from(api.pendingInvitationsFor(base, "test_b"), (party) => party.id), ["party_1"]);
assert.equal(api.pendingInvitationsFor(base, "test_c").length, 0, "declined invitation must stay hidden");

const accepted = api.acceptInviteState(base, "party_1", "test_b");
assert.equal(accepted.characters.test_b.currentPartyId, "party_1");
assert.ok(accepted.parties.party_1.memberIds.includes("test_b"));
assert.ok(!accepted.parties.party_1.invitedIds.includes("test_b"));
assert.equal(base.characters.test_b.currentPartyId, null, "pure helper must not mutate source");

const declined = api.declineInviteState(base, "party_1", "test_b");
assert.ok(!declined.parties.party_1.invitedIds.includes("test_b"));
assert.ok(declined.parties.party_1.declinedIds.includes("test_b"));

const party = { ...base.parties.party_1, memberIds: ["test_a", "test_b", "test_c"] };
const session = base.sessions.session_1;
assert.deepEqual(Array.from(api.briefingRequiredMemberIds(session, party)), ["test_b", "test_c"]);
assert.equal(api.allBriefingMembersConfirmed(session, party), false);

const onceConfirmed = api.confirmBriefingState({ ...base, parties: { party_1: party } }, "session_1", "test_b");
assert.deepEqual(Array.from(onceConfirmed.sessions.session_1.briefingConfirmedBy), ["test_b"]);
const twiceConfirmed = api.confirmBriefingState(onceConfirmed, "session_1", "test_c");
assert.equal(api.allBriefingMembersConfirmed(twiceConfirmed.sessions.session_1, party), true);

assert.equal(api.routeSyncTarget(base, "test_a", "party", "party_1"), "briefing/session_1");
const active = structuredClone(base);
active.sessions.session_1.status = "ACTIVE";
assert.equal(api.routeSyncTarget(active, "test_a", "home", ""), null, "active sessions must remain on the personal home screen until resume is pressed");
assert.equal(api.routeSyncTarget(active, "test_a", "briefing", "session_1"), "investigate/session_1");
assert.equal(api.routeSyncTarget(active, "test_a", "investigate", "session_1"), null);

assert.match(source, /data-party-flow-defer/);
assert.match(source, /data-party-flow-decline/);
assert.match(source, /data-party-flow-accept/);
assert.match(source, /stopImmediatePropagation\(\)/, "old unrestricted briefing entry must be guarded");
assert.match(source, /조장의 세션 시작을 기다리는 중/);
assert.match(source, /모든 조원의 조사가 동시에 시작됩니다/);

console.log("party flow sync checks passed");
