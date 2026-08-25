import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-leadership-flow.js", import.meta.url), "utf8");
const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const worldPersistence = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const sandbox = { window: {}, localStorage: { getItem() { return null; }, setItem() {} }, queueMicrotask(callback) { callback(); }, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, sandbox, { filename: "world-persistence.js" });
vm.runInContext(source, sandbox, { filename: "party-leadership-flow.js" });
const api = sandbox.window.__BAEKJI_PARTY_LEADERSHIP_TEST__;
assert.ok(api, "party leadership test API must be exposed");

const base = {
  version: 3,
  characters: {
    leader: { currentPartyId: null, currentSessionId: null },
    member: { currentPartyId: null, currentSessionId: null },
    busy: { currentPartyId: "party_busy", currentSessionId: null },
  },
  parties: {
    party_busy: {
      id: "party_busy",
      creatorId: "busy",
      status: "RECRUITING",
      memberIds: ["busy"], invitedIds: [], declinedIds: [], confirmedBy: [], readyBy: [], sessionId: null,
    },
  },
  sessions: {},
};

const created = api.createLeaderPartyState(base, "leader", "party_new", 1000);
assert.equal(created.characters.leader.currentPartyId, "party_new");
assert.equal(created.parties.party_new.creatorId, "leader");
assert.deepEqual(Array.from(created.parties.party_new.memberIds), ["leader"]);
assert.equal(base.characters.leader.currentPartyId, null, "leader creation helper must be pure");
assert.equal(api.isPartyLeader(created, "leader", "party_new"), true);
assert.equal(api.partyRoute("party_new"), "#/party/party_new");

created.parties.party_new.invitedIds.push("member");
const accepted = api.acceptInviteAsMemberState(created, "party_new", "member");
assert.equal(accepted.characters.member.currentPartyId, "party_new");
assert.ok(accepted.parties.party_new.memberIds.includes("member"));
assert.ok(!accepted.parties.party_new.invitedIds.includes("member"));

const confirmedInvite = structuredClone(created);
confirmedInvite.parties.party_new.status = "COMPOSITION_CONFIRMED";
confirmedInvite.parties.party_new.confirmedBy = ["leader"];
const acceptedAfterLock = api.acceptInviteAsMemberState(confirmedInvite, "party_new", "member");
assert.equal(acceptedAfterLock.characters.member.currentPartyId, "party_new", "leadership capture must accept an invitation after composition lock");
assert.equal(acceptedAfterLock.parties.party_new.status, "COMPOSITION_CONFIRMED");
assert.ok(acceptedAfterLock.parties.party_new.confirmedBy.includes("member"));
assert.equal(api.isPartyLeader(accepted, "member", "party_new"), false);

let controls = api.memberControlState(accepted, "member");
assert.equal(controls.canConfirm, true, "member must confirm composition separately after accepting");
assert.equal(controls.canReady, false);

let confirmed = api.confirmCompositionAsMemberState(accepted, "party_new", "member");
assert.ok(confirmed.parties.party_new.confirmedBy.includes("member"));
assert.equal(api.memberControlState(confirmed, "member").confirmed, true);

confirmed.parties.party_new.confirmedBy.push("leader");
confirmed.parties.party_new.status = "COMPOSITION_CONFIRMED";
controls = api.memberControlState(confirmed, "member");
assert.equal(controls.canReady, true, "member must still complete ready check");

const ready = api.setReadyAsMemberState(confirmed, "party_new", "member");
assert.equal(ready.parties.party_new.status, "COMPOSITION_CONFIRMED", "member readiness stays in the collapsed composition-confirmed state");
assert.ok(ready.parties.party_new.readyBy.includes("member"));
assert.equal(api.memberControlState(ready, "member").ready, true);

const legacyReadyCheck = structuredClone(confirmed);
legacyReadyCheck.parties.party_new.status = "READY_CHECK";
const normalizedReady = api.setReadyAsMemberState(legacyReadyCheck, "party_new", "member");
assert.equal(normalizedReady.parties.party_new.status, "COMPOSITION_CONFIRMED", "a member interaction must normalize legacy READY_CHECK state into the collapsed confirmed state");
assert.ok(normalizedReady.parties.party_new.readyBy.includes("member"));

const blocked = api.createLeaderPartyState(base, "busy", "party_other", 1000);
assert.equal(blocked.characters.busy.currentPartyId, "party_busy", "a current party must block creating another party");
assert.equal(blocked.parties.party_other, undefined);

assert.match(source, /data-party-leadership-warning/);
assert.match(source, /조사조를 생성하면 이번 조사조의 조장이 됩니다/);
assert.match(source, /data-member-confirm-composition/);
assert.match(source, /data-member-ready/);
assert.match(source, /currentPartyId\) card\.remove\(\)/, "busy invite candidates should be removed from leader invite list");
assert.match(source, /replaceChildren\(\)/, "warning modal must be fully cleared instead of leaving a click-blocking backdrop");
assert.doesNotMatch(source, /new MutationObserver/, "leadership UI must not self-trigger through a DOM observer");
assert.match(index, /party-leadership-flow\.js\?v=0\.3\.69&stage3a=1&stage6b=1/);
assert.ok(index.indexOf("party-leadership-flow.js?v=0.3.69&stage3a=1&stage6b=1") < index.indexOf("party-flow-sync.js?v=0.3.68&stage3a=1&stage6b=1"), "leadership interception must load before party-flow-sync");
assert.doesNotMatch(source, /function decorateMemberHome/, "member home must render directly in app.js");

console.log("PASS: leader warning, member confirmation/ready flow, stable navigation, and busy invite filtering");
