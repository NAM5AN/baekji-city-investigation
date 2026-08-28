import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-membership-ux-fix.js", import.meta.url), "utf8");
const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const worldPersistence = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const domainRules = fs.readFileSync(new URL("../runtime-domain-rules.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sandbox = { window: {}, localStorage: { getItem() { return null; }, setItem() {} }, queueMicrotask(callback) { callback(); }, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, sandbox, { filename: "world-persistence.js" });
vm.runInContext(domainRules, sandbox, { filename: "runtime-domain-rules.js" });
vm.runInContext(source, sandbox, { filename: "party-membership-ux-fix.js" });
const api = sandbox.window.__BAEKJI_PARTY_MEMBERSHIP_UX_TEST__;
assert.ok(api, "party membership UX test API must exist");
const plain = (value) => JSON.parse(JSON.stringify(value));

function world() {
  return {
    version: 3,
    characters: {
      leader: { id: "leader", currentPartyId: "p1", currentSessionId: null },
      member_b: { id: "member_b", currentPartyId: "p1", currentSessionId: null },
      member_c: { id: "member_c", currentPartyId: "p1", currentSessionId: null },
    },
    parties: {
      p1: {
        id: "p1",
        name: "해오름역 조사조 1",
        creatorId: "leader",
        status: "READY_CHECK",
        sessionId: null,
        memberIds: ["leader", "member_b", "member_c"],
        invitedIds: [],
        declinedIds: [],
        confirmedBy: ["leader", "member_b", "member_c"],
        readyBy: ["leader", "member_b"],
        readyStateBy: {
          leader: { ready: true, at: 10 },
          member_b: { ready: true, at: 11 },
          member_c: { ready: false, at: 12 },
        },
      },
    },
    sessions: {},
  };
}

assert.equal(api.membershipChangeAllowed(world().parties.p1), true, "membership can change before session creation");
const sessionWorld = world();
sessionWorld.parties.p1.sessionId = "s1";
assert.equal(api.membershipChangeAllowed(sessionWorld.parties.p1), false, "membership is locked after a session exists");

const selfLeft = api.removeMemberState(world(), "p1", "member_b", "member_b", 1000, "캐릭터 B");
assert.deepEqual(plain(selfLeft.parties.p1.memberIds), ["leader", "member_c"], "member can leave their own party");
assert.equal(selfLeft.characters.member_b.currentPartyId, null);
assert.equal(selfLeft.parties.p1.status, "COMPOSITION_CONFIRMED", "confirmed-stage membership changes must remain at composition confirmation for guarded departure");
assert.deepEqual(plain(selfLeft.parties.p1.confirmedBy), ["leader", "member_c"], "remaining members stay composition-confirmed after a pre-departure removal");
assert.deepEqual(plain(selfLeft.parties.p1.readyBy), ["leader"], "removing a ready member preserves the remaining leader and unready member readiness");
assert.equal(selfLeft.parties.p1.readyStateBy.member_c.ready, false, "an already-unready remaining member must stay unready after another member leaves");
assert.equal(selfLeft.partyMembershipRemovals["p1:member_b"].kind, "SELF_LEAVE");
assert.equal(selfLeft.partyMembershipRemovals["p1:member_b"].active, true);
const selfNotice = Object.values(selfLeft.partyMembershipNotices)[0];
assert.equal(selfNotice.memberName, "캐릭터 B", "leave notice stores the visible character name");
assert.equal(selfNotice.leaderId, "leader", "leave notice targets the party leader too");

const kicked = api.removeMemberState(world(), "p1", "member_c", "leader", 1100, "캐릭터 C");
assert.deepEqual(plain(kicked.parties.p1.memberIds), ["leader", "member_b"], "leader can remove another member");
assert.equal(kicked.characters.member_c.currentPartyId, null);
assert.deepEqual(plain(kicked.parties.p1.readyBy), ["leader", "member_b"], "removing an unready member must preserve another remaining member's ready state");
assert.equal(kicked.parties.p1.readyStateBy.member_b.ready, true);
assert.equal(kicked.partyMembershipRemovals["p1:member_c"].kind, "LEADER_KICK");
assert.equal(Object.values(kicked.partyMembershipNotices)[0].memberName, "캐릭터 C");

const cannotKickLeader = api.removeMemberState(world(), "p1", "leader", "leader", 1200);
assert.deepEqual(plain(cannotKickLeader.parties.p1.memberIds), ["leader", "member_b", "member_c"], "leader cannot remove themselves with the kick action");

const cannotLeaveAfterSession = api.removeMemberState(sessionWorld, "p1", "member_b", "member_b", 1300);
assert.deepEqual(plain(cannotLeaveAfterSession.parties.p1.memberIds), ["leader", "member_b", "member_c"], "party membership is not mutated after session creation");

const staleMerge = structuredClone(selfLeft);
staleMerge.parties.p1.memberIds.push("member_b");
staleMerge.parties.p1.invitedIds.push("member_b");
staleMerge.parties.p1.confirmedBy.push("member_b");
staleMerge.parties.p1.readyBy.push("member_b");
staleMerge.characters.member_b.currentPartyId = "p1";
const repaired = api.repairMembershipRemovals(staleMerge);
assert.equal(repaired.changed, true, "removal tombstone must repair stale cloud array unions");
assert.equal(repaired.snapshot.parties.p1.memberIds.includes("member_b"), false);
assert.equal(repaired.snapshot.parties.p1.invitedIds.includes("member_b"), false, "an old pre-removal invite must not come back through a stale merge");
assert.equal(repaired.snapshot.characters.member_b.currentPartyId, null);

const reinvited = structuredClone(selfLeft);
reinvited.parties.p1.invitedIds.push("member_b");
const stamped = api.markReinviteState(reinvited, "p1", "member_b", 1500);
assert.equal(stamped.parties.p1.membershipReinvitedAtBy.member_b, 1500, "a new invitation after removal gets a fresh timestamp");
const repairedReinvite = api.repairMembershipRemovals(stamped);
assert.equal(repairedReinvite.snapshot.parties.p1.invitedIds.includes("member_b"), true, "a genuine later reinvite must survive tombstone repair");
assert.equal(repairedReinvite.snapshot.parties.p1.memberIds.includes("member_b"), false, "reinvite alone must not silently rejoin the member");
assert.equal(repairedReinvite.snapshot.partyMembershipRemovals["p1:member_b"].active, true, "tombstone remains active until the invitation is accepted");

const explicitRejoin = structuredClone(repairedReinvite.snapshot);
explicitRejoin.parties.p1.memberIds.push("member_b");
explicitRejoin.parties.p1.invitedIds = explicitRejoin.parties.p1.invitedIds.filter((id) => id !== "member_b");
explicitRejoin.characters.member_b.currentPartyId = "p1";
const joined = api.markMemberJoinedState(explicitRejoin, "p1", "member_b", 2000);
assert.equal(joined.partyMembershipRemovals["p1:member_b"].active, false, "accepting the later reinvite clears the old removal tombstone");
assert.equal(joined.parties.p1.membershipJoinedAtBy.member_b, 2000);
const rejoinRepair = api.repairMembershipRemovals(joined);
assert.equal(rejoinRepair.snapshot.parties.p1.memberIds.includes("member_b"), true, "cleared tombstone must not remove a later rejoin");

assert.equal(api.readyStateText(world().parties.p1, "member_b"), "● 준비 완료");
assert.equal(api.readyStateText(world().parties.p1, "member_c"), "○ 준비 대기");
assert.match(source, /data-party-member-kick/, "leader participant rows need a remove-member action");
assert.match(source, /data-party-self-leave/, "roster modal needs a self-leave action");
assert.match(source, /data-party-membership-confirm/, "leave confirmation must use an in-site modal");
assert.match(source, /data-party-membership-notice/, "membership changes must surface an in-site notice popup");
assert.doesNotMatch(source, /window\.confirm/, "party leave must not use the browser confirm dialog");
assert.match(source, /data-party-member-id=.*>탈퇴<\/button>/, "leader remove-member action should be labeled simply as 탈퇴");
assert.match(source, /button\.textContent = "탈퇴"/, "roster self-leave action should be labeled simply as 탈퇴");
assert.match(source, /const markup = `\$\{kick\}\$\{readyMarkup\}`/, "leader row should place 탈퇴 before the readiness indicator");
assert.match(source, /membershipReinvitedAtBy/, "reinvites need a post-removal timestamp so tombstone repair can distinguish them from stale invites");
assert.match(app, /\$\{!party \? `<article class="card pad">/, "received invitations must not render while the user belongs to a party");
assert.match(app, /party-member-home-grid/, "member roster must render directly without button normalization");
assert.match(source, /party-membership-ready-only/, "leader participant status must be reduced to readiness only");
assert.doesNotMatch(source, /function decorateInviteVisibility|function normalizeMemberHomeButtons/, "membership runtime must not post-process home UI");
assert.doesNotMatch(source, /queueMicrotask\(refresh\)/, "membership observer refresh must yield to the browser instead of creating an unbounded microtask chain");
assert.match(source, /setTimeout\(refresh, 16\)/, "membership observer refresh should be frame-throttled");
assert.match(index, /party-membership-ux-fix\.js\?v=0\.3\.89&stage3a=1&stage3b=1&stage6b=1&stage8b-b5=1/, "B4 membership marker repair boundary must use a fresh exact cache key");

const reinviteSource = fs.readFileSync(new URL("../party-reinvite-runtime-fix.js", import.meta.url), "utf8");
const reinviteSandbox = { window: {}, localStorage: { getItem() { return null; }, setItem() {} }, queueMicrotask(callback) { callback(); }, console, structuredClone };
vm.createContext(reinviteSandbox);
vm.runInContext(runtimeUtils, reinviteSandbox, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, reinviteSandbox, { filename: "world-persistence.js" });
vm.runInContext(domainRules, reinviteSandbox, { filename: "runtime-domain-rules.js" });
vm.runInContext(reinviteSource, reinviteSandbox, { filename: "party-reinvite-runtime-fix.js" });
const reinviteApi = reinviteSandbox.window.__BAEKJI_PARTY_REINVITE_RUNTIME_TEST__;
assert.ok(reinviteApi, "same-party reinvite runtime test API must exist");

const reinviteBase = structuredClone(selfLeft);
reinviteBase.parties.p1.status = "RECRUITING";
const atomicReinvite = reinviteApi.reinviteState(reinviteBase, "p1", "member_b", "leader", 1500);
assert.equal(atomicReinvite.parties.p1.invitedIds.includes("member_b"), true, "same-party reinvite must add the invitation atomically");
assert.equal(atomicReinvite.parties.p1.membershipReinvitedAtBy.member_b, 1500, "same-party reinvite must stamp the new invite in the same write");

const atomicAccept = reinviteApi.acceptReinviteState(atomicReinvite, "p1", "member_b", 2000);
assert.equal(atomicAccept.characters.member_b.currentPartyId, "p1", "accepting a same-party reinvite must restore membership immediately");
assert.equal(atomicAccept.parties.p1.memberIds.includes("member_b"), true);
assert.equal(atomicAccept.parties.p1.invitedIds.includes("member_b"), false, "accepted member must disappear from the invite list");
assert.equal(atomicAccept.partyMembershipRemovals["p1:member_b"].active, false, "accept and tombstone clear must be one atomic state change");
assert.equal(atomicAccept.parties.p1.membershipJoinedAtBy.member_b, 2000);

const visibleBrokenInvite = structuredClone(reinviteBase);
visibleBrokenInvite.parties.p1.invitedIds = ["member_b"];
const acceptedVisibleBrokenInvite = reinviteApi.acceptReinviteState(visibleBrokenInvite, "p1", "member_b", 2100);
assert.equal(acceptedVisibleBrokenInvite.characters.member_b.currentPartyId, "p1", "a reinvite popup already visible from the old broken build must still be accept-able");
assert.equal(acceptedVisibleBrokenInvite.partyMembershipRemovals["p1:member_b"].active, false);

const stalePostJoinUnion = structuredClone(atomicAccept);
stalePostJoinUnion.parties.p1.invitedIds.push("member_b");
stalePostJoinUnion.parties.p1.declinedIds.push("member_b");
stalePostJoinUnion.parties.p1.membershipReinvitedAtBy = { member_b: 1500 };
const postJoinRepair = reinviteApi.repairRejoinedState(stalePostJoinUnion);
assert.equal(postJoinRepair.changed, true, "cloud array union after a successful rejoin must be normalized");
assert.equal(postJoinRepair.snapshot.parties.p1.memberIds.includes("member_b"), true, "post-join repair must keep the member joined");
assert.equal(postJoinRepair.snapshot.characters.member_b.currentPartyId, "p1");
assert.equal(postJoinRepair.snapshot.parties.p1.invitedIds.includes("member_b"), false, "stale invite must not reappear after acceptance");
assert.equal(postJoinRepair.snapshot.parties.p1.declinedIds.includes("member_b"), false);

const staleActiveTombstone = structuredClone(atomicAccept);
staleActiveTombstone.partyMembershipRemovals["p1:member_b"].active = true;
staleActiveTombstone.parties.p1.invitedIds = ["member_b"];
const activeRepair = reinviteApi.repairRejoinedState(staleActiveTombstone);
assert.equal(activeRepair.snapshot.partyMembershipRemovals["p1:member_b"].active, false, "a later joinedAt must beat a stale active tombstone");
assert.equal(activeRepair.snapshot.parties.p1.memberIds.includes("member_b"), true);
assert.equal(activeRepair.snapshot.parties.p1.invitedIds.includes("member_b"), false);

const laterSecondLeave = structuredClone(atomicAccept);
laterSecondLeave.partyMembershipRemovals["p1:member_b"] = { partyId: "p1", memberId: "member_b", active: true, at: 3000 };
laterSecondLeave.parties.p1.memberIds = laterSecondLeave.parties.p1.memberIds.filter((id) => id !== "member_b");
laterSecondLeave.characters.member_b.currentPartyId = null;
const secondLeaveRepair = reinviteApi.repairRejoinedState(laterSecondLeave);
assert.equal(secondLeaveRepair.snapshot.partyMembershipRemovals["p1:member_b"].active, true, "an older joinedAt must never undo a later leave");
assert.equal(secondLeaveRepair.snapshot.parties.p1.memberIds.includes("member_b"), false);

assert.doesNotMatch(reinviteSource, /target\.closest\(\s*["']\[data-invite\]["']\s*\)[\s\S]{0,600}?(?:handleReinvite|writeState|persistence\.writeRaw)|(?:handleReinvite|stampReinvite)[\s\S]{0,600}?writeState\(\s*next\s*,\s*["']reinvite-atomic["']/, "B4 moves the production same-party invite click and marker stamp to the authoritative command; pure fixture helpers remain");
assert.doesNotMatch(reinviteSource, /target\.closest\(\s*["'](?:\[data-party-flow-accept\]|\[data-accept\])/, "B5 removes the reinvite sidecar accept capture; the server command is the only production acceptance writer");
assert.doesNotMatch(reinviteSource, /acceptReinviteState[\s\S]{0,500}writeState\(/, "B5 retains the pure reinvite reducer but cannot locally persist its acceptance result");
assert.doesNotMatch(reinviteSource, /rejoin-invariant-repair|persistence\.writeRaw/, "post-join repair is no longer a browser writer after command settlement");
assert.match(index, /party-reinvite-runtime-fix\.js\?v=0\.3\.90&stage3a=1&stage3b=1&stage6b=1&stage8b-b5=1/, "B4 reinvite sidecar must be loaded with a fresh exact cache key");
assert.ok(index.indexOf("party-reinvite-runtime-fix.js?v=0.3.90&stage3a=1&stage3b=1&stage6b=1&stage8b-b5=1") < index.indexOf("party-membership-ux-fix.js?v=0.3.89&stage3a=1&stage3b=1&stage6b=1&stage8b-b5=1"), "reinvite repair must run before guarded-departure membership repair");

class MembershipClickTarget {
  constructor(matches = {}, dataset = {}) { this.matches = matches; this.dataset = dataset; }
  closest(selector) { return this.matches[selector] ? this : null; }
  remove() { this.removed = true; }
}

const runtimeLocal = new Map([["baekji_city_mvp_state_v3", JSON.stringify(world())]]);
const runtimeSession = new Map([["baekji_city_mvp_current_user_v034", "member_b"]]);
const runtimeHandlers = new Map();
let membershipClickHandler = null;
let membershipWrites = 0;
const dispatchedMembershipCommands = [];
const membershipModal = {
  children: [],
  _html: "",
  get innerHTML() { return this._html; },
  set innerHTML(value) { this._html = String(value || ""); this.children = this._html ? [{}] : []; },
  querySelector() { return null; },
  replaceChildren() { this._html = ""; this.children = []; },
};
const membershipDocument = {
  documentElement: { dataset: {} },
  getElementById(id) { return id === "modal-root" ? membershipModal : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener(type, handler) { if (type === "click") membershipClickHandler = handler; },
};
const membershipRuntime = vm.createContext({
  console,
  structuredClone,
  Element: MembershipClickTarget,
  document: membershipDocument,
  location: { hash: "#/home", href: "https://example.test/#/home" },
  localStorage: {
    getItem(key) { return runtimeLocal.has(key) ? runtimeLocal.get(key) : null; },
    setItem(key, value) { membershipWrites += 1; runtimeLocal.set(key, String(value)); },
  },
  sessionStorage: {
    getItem(key) { return runtimeSession.has(key) ? runtimeSession.get(key) : null; },
    setItem(key, value) { runtimeSession.set(key, String(value)); },
  },
  Event: class Event { constructor(type) { this.type = type; } },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  StorageEvent: class StorageEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
  setTimeout() { return 1; },
  setInterval() { return 1; },
  queueMicrotask(callback) { callback(); },
  clearTimeout() {},
});
membershipRuntime.window = membershipRuntime;
membershipRuntime.__BAEKJI_PLAYER_WORLD_COMMANDS__ = { dispatch(command, payload) { dispatchedMembershipCommands.push({ command, payload }); return Promise.resolve({ status: "APPLIED" }); } };
membershipRuntime.addEventListener = (type, handler) => runtimeHandlers.set(type, handler);
membershipRuntime.dispatchEvent = () => true;
vm.runInContext(runtimeUtils, membershipRuntime, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, membershipRuntime, { filename: "world-persistence.js" });
vm.runInContext(domainRules, membershipRuntime, { filename: "runtime-domain-rules.js" });
vm.runInContext(source, membershipRuntime, { filename: "party-membership-ux-fix-runtime.js" });
assert.equal(typeof membershipClickHandler, "function", "membership UX must own an executable click capture handler");

function membershipClick(target) {
  const event = {
    target,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
  membershipClickHandler(event);
  return event;
}

const leaveClick = membershipClick(new MembershipClickTarget({ "[data-party-self-leave]": true }, { partySelfLeave: "p1" }));
assert.equal(membershipWrites, 0, "self-leave click must wait for its in-site confirmation before writing");
assert.ok(membershipModal.children.length, "self-leave must open the existing confirmation modal");
assert.equal(leaveClick.prevented, true);
assert.equal(leaveClick.stopped, true);
const leaveConfirm = membershipClick(new MembershipClickTarget({ "[data-party-membership-confirm-ok]": true }));
await Promise.resolve();
const runtimeAfterLeave = JSON.parse(runtimeLocal.get("baekji_city_mvp_state_v3"));
assert.equal(membershipWrites, 0, "confirmed self-leave must not write a browser world snapshot");
assert.equal(dispatchedMembershipCommands.length, 1, "confirmed self-leave dispatches one actor-bound command");
assert.equal(dispatchedMembershipCommands[0].command, "LEAVE_PARTY_V1");
assert.equal(dispatchedMembershipCommands[0].payload.partyId, "p1");
assert.equal(runtimeAfterLeave.characters.member_b.currentPartyId, "p1", "the browser waits for authoritative projection settlement");
assert.equal(leaveConfirm.prevented, true);
assert.equal(leaveConfirm.stopped, true);

console.log("PASS: polished leave controls, in-site confirmation/notices, atomic same-party reinvite acceptance, stale merge repair, readiness layout, and observer-loop guard");
