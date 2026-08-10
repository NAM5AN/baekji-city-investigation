import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-flow-ux-fix.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../party-flow-ux-fix.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const sandbox = { window: {}, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "party-flow-ux-fix.js" });
const api = sandbox.window.__BAEKJI_PARTY_FLOW_UX_TEST__;
assert.ok(api, "party flow UX test API must be exposed");

const base = {
  version: 3,
  characters: {
    leader: { currentPartyId: "p1", currentSessionId: null },
    member: { currentPartyId: null, currentSessionId: null },
    member2: { currentPartyId: "p1", currentSessionId: null },
  },
  parties: {
    p1: {
      id: "p1",
      creatorId: "leader",
      status: "RECRUITING",
      memberIds: ["leader", "member2"],
      invitedIds: ["member"],
      declinedIds: [],
      confirmedBy: [],
      readyBy: [],
      sessionId: null,
    },
  },
  sessions: {},
};

const accepted = api.acceptInviteState(base, "p1", "member");
assert.equal(accepted.characters.member.currentPartyId, "p1", "accept must join immediately");
assert.ok(accepted.parties.p1.memberIds.includes("member"));
assert.ok(!accepted.parties.p1.invitedIds.includes("member"), "accepted invite must disappear");
assert.equal(base.characters.member.currentPartyId, null, "state helpers must stay pure");

const locked = api.lockCompositionState(accepted, "p1", "leader", 1000);
assert.equal(locked.parties.p1.status, "COMPOSITION_CONFIRMED", "leader alone locks composition");
assert.deepEqual(Array.from(locked.parties.p1.confirmedBy), ["leader", "member2", "member"]);
assert.equal(api.readyCount(locked.parties.p1), 0);
assert.equal(api.effectiveReady(locked.parties.p1, "member"), false);

const memberReady = api.toggleReadyState(locked, "p1", "member", 1100);
assert.equal(memberReady.parties.p1.status, "READY_CHECK");
assert.equal(api.effectiveReady(memberReady.parties.p1, "member"), true);
assert.ok(memberReady.parties.p1.readyBy.includes("member"));

const memberWaitingAgain = api.toggleReadyState(memberReady, "p1", "member", 1200);
assert.equal(api.effectiveReady(memberWaitingAgain.parties.p1, "member"), false, "ready button must toggle back to waiting");
assert.ok(!memberWaitingAgain.parties.p1.readyBy.includes("member"));

const staleArray = structuredClone(memberWaitingAgain.parties.p1);
staleArray.readyBy = ["member"];
staleArray.readyStateBy.member = { ready: false, at: 1200 };
assert.equal(api.effectiveReady(staleArray, "member"), false, "authoritative per-user readiness must beat stale union arrays");

const backSource = api.lockCompositionState(accepted, "p1", "leader", 2000);
const reopened = api.reopenCompositionState(backSource, "p1", "leader", 2100);
assert.equal(reopened.parties.p1.status, "RECRUITING");
assert.equal(api.readyCount(reopened.parties.p1), 0);
assert.equal(reopened.parties.p1.confirmedBy.length, 0);

assert.match(source, /data-party-flow-back-recruiting/);
assert.match(source, /← 이전 단계/);
assert.match(source, /data-party-roster-open/);
assert.match(source, /partyFlowBriefingRosterFixed/);
assert.match(source, /준비 완료/);
assert.match(source, /준비 대기/);
assert.match(source, /readyStateBy/);
assert.match(source, /data-member-confirm-composition/);
assert.match(source, /removeAttribute\("data-member-confirm-composition"\)/, "legacy member composition button must be converted away");
assert.match(css, /party-ready-state\.is-ready/);
assert.match(css, /party-ready-state\.is-waiting/);
assert.match(css, /party-ready-count\.is-all-ready/);
assert.match(index, /party-flow-ux-fix\.css\?v=0\.3\.81/);
assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.81/);
assert.ok(index.indexOf("party-flow-ux-fix.js?v=0.3.81") < index.indexOf("party-leadership-flow.js?v=0.3.65"), "fixed invite interception must run before legacy leadership capture handlers");
assert.ok(index.indexOf("party-flow-ux-fix.js?v=0.3.81") < index.indexOf("party-flow-sync.js?v=0.3.63"), "fixed state flow must own invite/ready clicks before legacy flow sync");

console.log("PASS: party invite acceptance, leader-only composition lock/back, roster-only member confirmation UI, readiness toggle/count, and briefing roster bridge");
