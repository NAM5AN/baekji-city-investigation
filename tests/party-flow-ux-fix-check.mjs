import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-flow-ux-fix.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../party-flow-ux-fix.css", import.meta.url), "utf8");
const preflightSource = fs.readFileSync(new URL("../party-preflight-flow-fix.js", import.meta.url), "utf8");
const preflightCss = fs.readFileSync(new URL("../party-preflight-flow-fix.css", import.meta.url), "utf8");
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

const preflightSandbox = { window: {}, console, structuredClone };
vm.createContext(preflightSandbox);
vm.runInContext(preflightSource, preflightSandbox, { filename: "party-preflight-flow-fix.js" });
const preflightApi = preflightSandbox.window.__BAEKJI_PARTY_PREFLIGHT_FLOW_TEST__;
assert.ok(preflightApi, "preflight party flow test API must be exposed");

const preReadyBase = structuredClone(accepted);
preReadyBase.parties.p1.readyBy = [];
preReadyBase.parties.p1.readyStateBy = {};
const preReady = preflightApi.togglePreflightReadyState(preReadyBase, "p1", "member2", 3000);
assert.equal(preReady.parties.p1.status, "RECRUITING", "members must be able to prepare before composition is locked");
assert.equal(preflightApi.effectiveReady(preReady.parties.p1, "member2"), true);
assert.ok(preReady.parties.p1.readyBy.includes("member2"));

const preservedLock = preflightApi.lockCompositionPreserveReadyState(preReady, "p1", "leader", 3100);
assert.equal(preservedLock.parties.p1.status, "COMPOSITION_CONFIRMED");
assert.equal(preflightApi.effectiveReady(preservedLock.parties.p1, "member2"), true, "composition lock must not erase a pre-ready member");
assert.ok(preservedLock.parties.p1.readyBy.includes("member2"));

const backRecruiting = preflightApi.reopenRecruitingPreserveReadyState(preservedLock, "p1", "leader", 3200);
assert.equal(backRecruiting.parties.p1.status, "RECRUITING");
assert.equal(preflightApi.effectiveReady(backRecruiting.parties.p1, "member2"), true, "step 2 back to step 1 must preserve member readiness");
assert.equal(backRecruiting.parties.p1.confirmedBy.length, 0);

const readyStage = structuredClone(preservedLock);
readyStage.parties.p1.status = "READY_CHECK";
readyStage.parties.p1.readyStateBy.leader = { ready: true, at: 3300 };
readyStage.parties.p1.readyBy = ["leader", "member2"];
const backComposition = preflightApi.backToCompositionState(readyStage, "p1", "leader", 3400);
assert.equal(backComposition.parties.p1.status, "COMPOSITION_CONFIRMED", "step 3 must be able to return to step 2");
assert.equal(preflightApi.effectiveReady(backComposition.parties.p1, "leader"), false, "back to composition should reopen the leader ready action");
assert.equal(preflightApi.effectiveReady(backComposition.parties.p1, "member2"), true, "other members keep their pre-ready state");

const briefingWorld = structuredClone(readyStage);
briefingWorld.parties.p1.status = "SESSION_CREATED";
briefingWorld.parties.p1.sessionId = "s1";
briefingWorld.characters.leader.currentSessionId = "s1";
briefingWorld.characters.member2.currentSessionId = "s1";
briefingWorld.sessions.s1 = {
  id: "s1",
  partyId: "p1",
  status: "BRIEFING",
  memberIds: ["leader", "member2"],
  briefingConfirmedBy: ["member2"],
};
const briefingBack = preflightApi.rollbackBriefingState(briefingWorld, "s1", "leader", 3500);
assert.equal(briefingBack.sessions.s1, undefined, "briefing back must remove the not-yet-started session");
assert.equal(briefingBack.parties.p1.sessionId, null);
assert.equal(briefingBack.parties.p1.status, "READY_CHECK", "briefing back returns the leader to all-ready step");
assert.equal(briefingBack.characters.leader.currentSessionId, null);
assert.equal(briefingBack.characters.member2.currentSessionId, null);
assert.deepEqual(Array.from(briefingBack.parties.p1.readyBy), ["leader", "member2"], "briefing back preserves readiness so departure can be retried");

const activeBriefingWorld = structuredClone(briefingWorld);
activeBriefingWorld.sessions.s1.status = "ACTIVE";
const cannotBackAfterEntry = preflightApi.rollbackBriefingState(activeBriefingWorld, "s1", "leader", 3600);
assert.ok(cannotBackAfterEntry.sessions.s1, "back navigation must be blocked after investigation actually starts");
assert.equal(cannotBackAfterEntry.parties.p1.sessionId, "s1");

assert.match(preflightSource, /data-preflight-member-ready/, "recruiting members need an early ready button");
assert.match(preflightSource, /● 준비 완료/);
assert.match(preflightSource, /○ 준비 대기/);
assert.match(preflightSource, /조사 출발/, "leader start button copy must be renamed");
assert.match(preflightSource, /data-party-preflight-back-confirmed/, "ready step needs a back button");
assert.match(preflightSource, /data-party-preflight-briefing-back/, "briefing needs a leader-only back button");
assert.match(preflightSource, /textContent \|\| ""\)\.trim\(\) === "조사조 확인"/, "redundant briefing roster button must be removed");
assert.match(preflightCss, /\[data-preflight-member-ready\]\.is-ready/);
assert.match(preflightCss, /\[data-preflight-member-ready\]\.is-waiting/);
assert.match(index, /party-preflight-flow-fix\.css\?v=0\.3\.90/);
assert.match(index, /party-preflight-flow-fix\.js\?v=0\.3\.90/);
assert.ok(index.indexOf("party-membership-ux-fix.js?v=0.3.85") < index.indexOf("party-preflight-flow-fix.js?v=0.3.90"), "preflight decorator must run after membership UI normalization");

console.log("PASS: party invite flow plus pre-confirm readiness, strong member ready states, backward party navigation, briefing rollback, and departure copy");
