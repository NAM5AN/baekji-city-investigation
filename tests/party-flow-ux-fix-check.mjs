import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-flow-ux-fix.js", import.meta.url), "utf8");
const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../party-flow-ux-fix.css", import.meta.url), "utf8");
const preflightSource = fs.readFileSync(new URL("../party-preflight-flow-fix.js", import.meta.url), "utf8");
const preflightCss = fs.readFileSync(new URL("../party-preflight-flow-fix.css", import.meta.url), "utf8");
const stabilitySource = fs.readFileSync(new URL("../party-ui-stability.js", import.meta.url), "utf8");
const stabilityCss = fs.readFileSync(new URL("../party-ui-stability.css", import.meta.url), "utf8");
const presenceLabelSource = fs.readFileSync(new URL("../entry-presence-party-label-fix.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const renderHomeStart = app.indexOf("  function renderHome()");
const renderHomeEnd = app.indexOf("  function createParty()", renderHomeStart);
const renderPartyStart = app.indexOf("  function renderParty(partyId)");
const renderPartyEnd = app.indexOf("  function inviteUser(", renderPartyStart);
const renderBriefingStart = app.indexOf("  function renderBriefing(sessionId)");
const renderBriefingEnd = app.indexOf("  function appendLog(", renderBriefingStart);
assert.ok(renderHomeStart >= 0 && renderHomeEnd > renderHomeStart, "home renderer must be discoverable");
assert.ok(renderPartyStart >= 0 && renderPartyEnd > renderPartyStart, "party renderer must be discoverable");
assert.ok(renderBriefingStart >= 0 && renderBriefingEnd > renderBriefingStart, "briefing renderer must be discoverable");
const renderHome = app.slice(renderHomeStart, renderHomeEnd);
const renderParty = app.slice(renderPartyStart, renderPartyEnd);
const renderBriefing = app.slice(renderBriefingStart, renderBriefingEnd);

const sandbox = { window: {}, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
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
      name: "해오름역 조사조 1",
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

const confirmedInvite = structuredClone(base);
confirmedInvite.parties.p1.status = "COMPOSITION_CONFIRMED";
confirmedInvite.parties.p1.confirmedBy = ["leader", "member2"];
const acceptedDuringConfirmation = api.acceptInviteState(confirmedInvite, "p1", "member");
assert.equal(acceptedDuringConfirmation.characters.member.currentPartyId, "p1", "composition-confirmed pending invites must still be accepted");
assert.equal(acceptedDuringConfirmation.parties.p1.status, "COMPOSITION_CONFIRMED");
assert.ok(acceptedDuringConfirmation.parties.p1.confirmedBy.includes("member"), "a late accepted member must be composition-confirmed atomically");
assert.ok(!api.effectiveReady(acceptedDuringConfirmation.parties.p1, "member"), "a late accepted member must remain unready");

const locked = api.lockCompositionState(accepted, "p1", "leader", 1000);
assert.equal(locked.parties.p1.status, "COMPOSITION_CONFIRMED", "leader alone locks composition");
assert.deepEqual(Array.from(locked.parties.p1.confirmedBy), ["leader", "member2", "member"]);
assert.equal(api.readyCount(locked.parties.p1), 1, "the leader is automatically ready when composition is confirmed");
assert.equal(api.effectiveReady(locked.parties.p1, "leader"), true);
assert.equal(api.effectiveReady(locked.parties.p1, "member"), false);

const memberReady = api.toggleReadyState(locked, "p1", "member", 1100);
assert.equal(memberReady.parties.p1.status, "COMPOSITION_CONFIRMED", "member readiness must not move the leader-owned ready-stage transition");
assert.equal(api.effectiveReady(memberReady.parties.p1, "member"), true);
assert.ok(memberReady.parties.p1.readyBy.includes("member"));

const leaderAlreadyReady = structuredClone(locked);
leaderAlreadyReady.parties.p1.readyStateBy.leader = { ready: true, at: 1105 };
leaderAlreadyReady.parties.p1.readyBy = ["leader"];
const leaderEnteredReady = api.enterReadyCheckState(leaderAlreadyReady, "p1", "leader", 1106);
assert.equal(leaderEnteredReady.snapshot.parties.p1.status, "COMPOSITION_CONFIRMED", "the removed ready-check transition must leave the party in composition confirmation");
assert.deepEqual(Array.from(leaderEnteredReady.cancelledIds), [], "composition confirmation must retain pending invitations until the explicit departure decision");
assert.equal(leaderEnteredReady.shouldNotify, false);
assert.equal(api.effectiveReady(leaderEnteredReady.snapshot.parties.p1, "leader"), true, "leader remains automatically ready in the collapsed confirmation stage");
assert.ok(leaderEnteredReady.snapshot.parties.p1.readyBy.includes("leader"));

const leaderReadyNoop = api.toggleReadyState(leaderEnteredReady.snapshot, "p1", "leader", 1107);
assert.deepEqual(JSON.parse(JSON.stringify(leaderReadyNoop)), JSON.parse(JSON.stringify(leaderEnteredReady.snapshot)), "the leader must not get a readiness toggle in the collapsed confirmation stage");

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
assert.match(renderParty, /data-party-flow-back-recruiting/);
assert.match(renderParty, /← 이전 단계/);
assert.match(renderHome, /data-party-member-roster/, "member roster must render directly on home");
assert.doesNotMatch(source, /partyFlowBriefingRosterFixed/, "briefing roster conversion must be absorbed into the renderer");
assert.match(renderParty, /● 준비 완료/);
assert.match(renderParty, /○ 준비 대기/);
assert.match(source, /readyStateBy/);
assert.match(source, /data-member-confirm-composition/);
assert.match(source, /removeAttribute\("data-member-confirm-composition"\)/, "legacy member composition button must be converted away");
assert.match(css, /party-ready-state\.is-ready/);
assert.match(css, /party-ready-state\.is-waiting/);
assert.match(css, /party-ready-count\.is-all-ready/);
assert.match(index, /party-flow-ux-fix\.css\?v=0\.3\.81/);
assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.87&departure-capture-guard=1&stage3a=1/);
const partyFlowUxIndex = index.indexOf("party-flow-ux-fix.js?v=0.3.87&departure-capture-guard=1&stage3a=1");
assert.ok(partyFlowUxIndex >= 0, "party flow UX guard script must be present before checking its load order");
assert.ok(partyFlowUxIndex < index.indexOf("party-leadership-flow.js?v=0.3.68"), "fixed invite interception must run before legacy leadership capture handlers");
assert.ok(partyFlowUxIndex < index.indexOf("party-flow-sync.js?v=0.3.67"), "fixed state flow must own invite/ready clicks before legacy flow sync");
assert.doesNotMatch(source, /function decorateLeaderParty/, "party UI must render directly instead of being decorated after paint");
assert.doesNotMatch(source, /function decorateMemberHome|function decorateBriefingRoster/, "home and briefing must render directly instead of being decorated after paint");

const preflightSandbox = { window: {}, console, structuredClone };
vm.createContext(preflightSandbox);
vm.runInContext(runtimeUtils, preflightSandbox, { filename: "runtime-utils.js" });
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
assert.equal(backComposition.parties.p1.status, "COMPOSITION_CONFIRMED", "a legacy ready-check record must normalize into the collapsed confirmation stage");
assert.equal(preflightApi.effectiveReady(backComposition.parties.p1, "leader"), true, "legacy normalization must preserve the leader's automatic readiness");
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
assert.equal(briefingBack.parties.p1.status, "COMPOSITION_CONFIRMED", "briefing rollback must return to the collapsed confirmed-ready stage");
assert.equal(briefingBack.characters.leader.currentSessionId, null);
assert.equal(briefingBack.characters.member2.currentSessionId, null);
assert.deepEqual(Array.from(briefingBack.parties.p1.readyBy), ["leader", "member2"], "briefing back preserves readiness so departure can be retried");

const activeBriefingWorld = structuredClone(briefingWorld);
activeBriefingWorld.sessions.s1.status = "ACTIVE";
const cannotBackAfterEntry = preflightApi.rollbackBriefingState(activeBriefingWorld, "s1", "leader", 3600);
assert.ok(cannotBackAfterEntry.sessions.s1, "back navigation must be blocked after investigation actually starts");
assert.equal(cannotBackAfterEntry.parties.p1.sessionId, "s1");

assert.match(preflightSource, /data-preflight-member-ready/, "recruiting members need an early ready button");
assert.match(app, /● 준비 완료/);
assert.match(app, /○ 준비 대기/);
assert.match(renderParty, /조사 출발/, "leader start button copy must render directly");
assert.doesNotMatch(renderParty, /data-party-preflight-back-confirmed/, "the removed ready-check step must not render a previous-step control");
assert.match(preflightSource, /data-party-preflight-briefing-back/, "briefing needs a leader-only back button");
assert.match(renderBriefing, /data-party-preflight-briefing-back/, "briefing back button must render directly");
assert.doesNotMatch(renderBriefing, /조사조 확인/, "redundant briefing roster button must never render");
assert.match(preflightCss, /\[data-preflight-member-ready\]\.is-ready/);
assert.match(preflightCss, /\[data-preflight-member-ready\]\.is-waiting/);
assert.match(index, /party-preflight-flow-fix\.css\?v=0\.3\.90/);
assert.match(index, /party-preflight-flow-fix\.js\?v=0\.3\.96/);
assert.ok(index.indexOf("party-membership-ux-fix.js?v=0.3.87") < index.indexOf("party-preflight-flow-fix.js?v=0.3.96"), "preflight behavior must run after guarded-departure membership UI normalization");
assert.doesNotMatch(preflightSource, /function decorateLeaderParty/, "preflight party UI must not patch the rendered party page");
assert.doesNotMatch(preflightSource, /function decorateMemberHome|function decorateBriefing/, "preflight runtime must not patch home or briefing");

const stabilitySandbox = { window: {}, console, structuredClone };
vm.createContext(stabilitySandbox);
vm.runInContext(runtimeUtils, stabilitySandbox, { filename: "runtime-utils.js" });
vm.runInContext(stabilitySource, stabilitySandbox, { filename: "party-ui-stability.js" });
const namingApi = stabilitySandbox.window.__BAEKJI_PARTY_NAME_UI_TEST__;
assert.ok(namingApi, "party naming and stability test API must be exposed");
assert.equal(namingApi.isDefaultPartyName("해오름역 조사조 12"), true);
assert.equal(namingApi.isDefaultPartyName("붉은빛 탐사대"), false);

const renameBase = structuredClone(base);
renameBase.parties.p1.memberIds = ["leader"];
const renamed = namingApi.renamePartyState(renameBase, "p1", "leader", "  붉은빛   탐사대  ", 4000);
assert.equal(renamed.parties.p1.name, "붉은빛 탐사대", "leader must be able to rename the party during preflight");
assert.equal(renamed.parties.p1.nameCustomized, true);
assert.equal(renameBase.parties.p1.name, "해오름역 조사조 1", "party rename helper must stay pure");
assert.equal(namingApi.partyDisplayName(renameBase, renameBase.parties.p1, (id) => id === "leader" ? "테스트A" : ""), "테스트A", "unnamed solo party must be represented by the character name");
assert.equal(namingApi.partyDisplayName(renamed, renamed.parties.p1, () => "테스트A"), "붉은빛 탐사대", "custom party name must remain visible even for a solo party");

const lockedRename = structuredClone(renameBase);
lockedRename.parties.p1.status = "SESSION_CREATED";
lockedRename.parties.p1.sessionId = "s1";
assert.equal(namingApi.renamePartyState(lockedRename, "p1", "leader", "변경 금지", 4100).parties.p1.name, "해오름역 조사조 1", "party name edits must stop after session creation");

assert.match(renderHome, /!party \? `<article class="card pad">/, "joined member home must omit the impossible invitation box on first paint");
assert.doesNotMatch(renderParty, /data-party-preflight-back-confirmed/, "the original party markup must expose only the collapsed three-stage flow");
assert.match(stabilitySource, /data-party-name-edit/, "leader hero must expose a party rename control");
assert.match(renderParty, /data-party-name-edit/, "party name control must render directly");
assert.match(stabilitySource, /RECRUITING.*COMPOSITION_CONFIRMED.*READY_CHECK/s, "party rename must stay available through all three preflight steps");
assert.match(stabilityCss, /party-name-edit-button/, "party rename control needs visible styling");
assert.match(stabilityCss, /party-name-edit-modal/, "party rename editor needs a dedicated modal style");
assert.match(presenceLabelSource, /entryPresenceFix/, "special entry presence logs must be normalized");
assert.match(presenceLabelSource, /PARTY_NAME_UI/, "presence labels must reuse the party display-name contract");
assert.match(index, /party-ui-stability\.css\?v=0\.3\.91/);
assert.match(index, /party-ui-stability\.js\?v=0\.3\.93/);
assert.match(index, /entry-presence-party-label-fix\.js\?v=0\.3\.91/);
assert.ok(index.indexOf("party-preflight-flow-fix.js?v=0.3.96") < index.indexOf("party-ui-stability.js?v=0.3.93"), "preflight behavior must load before the party naming runtime");
assert.ok(index.indexOf("party-ui-stability.js?v=0.3.93") < index.indexOf("entry-presence-party-label-fix.js?v=0.3.91"), "presence label normalizer must consume the party display-name API");
assert.doesNotMatch(stabilitySource, /function ensureReadyBackButton/, "the stability layer must not recreate the party back button");
assert.doesNotMatch(stabilitySource, /function ensurePartyNameControl/, "the stability layer must not recreate the party name control");

console.log("PASS: party preflight stays paint-stable, party names are editable, and unnamed solo parties use character labels");
