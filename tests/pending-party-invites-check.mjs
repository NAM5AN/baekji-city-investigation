import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const apiEnd = app.indexOf("  function renderParty(partyId)");
assert.ok(apiEnd > 0, "pending-invite helpers must be declared before the party renderer");
const helperSource = `${app.slice(0, apiEnd)}\n})();`;
const sandbox = {
  console,
  structuredClone,
  document: { getElementById() { return null; } },
  localStorage: { getItem() { return null; } },
};
sandbox.window = sandbox;
sandbox.DAY1_DATA = {};
vm.createContext(sandbox);
vm.runInContext(helperSource, sandbox, { filename: "app-pending-invite-helpers.js" });
const api = sandbox.window.__BAEKJI_PENDING_PARTY_INVITES_TEST__;
assert.ok(api, "pending-invite flow must expose a test API");
[
  "activePendingInviteIds",
  "inviteCandidateIds",
  "inviteState",
  "cancelInviteState",
  "declineInviteState",
  "acceptInviteState",
  "enterReadyCheckState",
  "startSessionState",
].forEach((name) => assert.equal(typeof api[name], "function", `pending-invite test API needs ${name}`));

function fixture(status = "RECRUITING") {
  return {
    version: 3,
    characters: {
      leader: { currentPartyId: "p1", currentSessionId: null },
      member: { currentPartyId: "p1", currentSessionId: null },
      test_a: { currentPartyId: "elsewhere", currentSessionId: null },
      test_b: { currentPartyId: null, currentSessionId: null },
      test_c: { currentPartyId: null, currentSessionId: null },
    },
    parties: {
      p1: {
        id: "p1",
        name: "테스트 조사조",
        creatorId: "leader",
        status,
        memberIds: ["leader", "member"],
        invitedIds: [],
        declinedIds: [],
        confirmedBy: status === "RECRUITING" ? [] : ["leader", "member"],
        readyBy: [],
        readyStateBy: {},
        sessionId: null,
      },
    },
    sessions: {},
  };
}

const initial = fixture();
assert.deepEqual(Array.from(api.inviteCandidateIds(initial, "p1", "leader")), ["test_b", "test_c"], "only idle non-leader characters can be invited");

const invited = api.inviteState(initial, "p1", "test_b", "leader", 1000);
assert.deepEqual(Array.from(api.activePendingInviteIds(invited, "p1")), ["test_b"], "a sent invite is a single active pending invite");
assert.deepEqual(Array.from(api.inviteCandidateIds(invited, "p1", "leader")), ["test_c"], "a pending invitee must leave the invitation candidate list");
assert.deepEqual(Array.from(invited.parties.p1.memberIds), ["leader", "member"], "a pending invite must never become a party member before acceptance");
assert.equal(invited.characters.test_b.currentPartyId, null, "a pending invite must not assign party membership");

const duplicateInvite = api.inviteState(invited, "p1", "test_b", "leader", 1001);
assert.deepEqual(Array.from(api.activePendingInviteIds(duplicateInvite, "p1")), ["test_b"], "duplicate invite writes must not duplicate the pending row");
const participantOrder = [
  ...duplicateInvite.parties.p1.memberIds,
  ...api.activePendingInviteIds(duplicateInvite, "p1"),
];
assert.deepEqual(participantOrder, ["leader", "member", "test_b"], "pending invitees must appear after every joined member");

const cancelled = api.cancelInviteState(invited, "p1", "test_b", "leader", 1100);
assert.deepEqual(Array.from(api.activePendingInviteIds(cancelled, "p1")), [], "leader cancel must remove the active invitation");
assert.deepEqual(Array.from(api.inviteCandidateIds(cancelled, "p1", "leader")), ["test_b", "test_c"], "cancelled character must return to invitation candidates immediately");
assert.deepEqual(Array.from(cancelled.parties.p1.memberIds), ["leader", "member"], "cancelling must not modify joined members");
assert.equal(cancelled.characters.test_b.currentPartyId, null, "cancelling must not assign party membership");

const cancelledThenAccept = api.acceptInviteState(cancelled, "p1", "test_b", 1200);
assert.equal(cancelledThenAccept.characters.test_b.currentPartyId, null, "a stale accept after cancellation must not join the party");
assert.ok(!cancelledThenAccept.parties.p1.memberIds.includes("test_b"), "cancelled invite must not be resurrected by a stale accept");

const declined = api.declineInviteState(invited, "p1", "test_b", 1300);
assert.ok(declined.parties.p1.declinedIds.includes("test_b"), "declining records the response");
assert.deepEqual(Array.from(api.inviteCandidateIds(declined, "p1", "leader")), ["test_b", "test_c"], "declined character must return to invitation candidates immediately");
const reinvited = api.inviteState(declined, "p1", "test_b", "leader", 1400);
assert.ok(!reinvited.parties.p1.declinedIds.includes("test_b"), "a fresh reinvite must clear an earlier decline");
assert.deepEqual(Array.from(api.activePendingInviteIds(reinvited, "p1")), ["test_b"], "reinvitation restores exactly one pending row");

const confirmed = fixture("COMPOSITION_CONFIRMED");
confirmed.parties.p1.invitedIds = ["test_b"];
const acceptedConfirmed = api.acceptInviteState(confirmed, "p1", "test_b", 1500);
assert.equal(acceptedConfirmed.parties.p1.status, "COMPOSITION_CONFIRMED", "accepting during composition confirmation must preserve the stage");
assert.equal(acceptedConfirmed.characters.test_b.currentPartyId, "p1", "confirmed-stage invite acceptance must join the party");
assert.ok(acceptedConfirmed.parties.p1.memberIds.includes("test_b"));
assert.ok(!acceptedConfirmed.parties.p1.invitedIds.includes("test_b"));
assert.ok(acceptedConfirmed.parties.p1.confirmedBy.includes("test_b"), "a member accepted after composition lock must be composition-confirmed atomically");
assert.ok(!acceptedConfirmed.parties.p1.readyBy.includes("test_b"), "confirmed-stage acceptance must start the new member unready");
assert.equal(acceptedConfirmed.parties.p1.readyStateBy?.test_b?.ready ?? false, false, "confirmed-stage acceptance must initialise unready state");

const staleCancelAfterAccept = api.cancelInviteState(acceptedConfirmed, "p1", "test_b", "leader", 1600);
assert.equal(staleCancelAfterAccept.characters.test_b.currentPartyId, "p1", "a stale cancel must never remove an accepted member");
assert.ok(staleCancelAfterAccept.parties.p1.memberIds.includes("test_b"), "an accepted member must survive stale cancellation");
assert.ok(!staleCancelAfterAccept.parties.p1.invitedIds.includes("test_b"), "a stale cancel must not recreate an invitation");

const readyFixture = fixture("COMPOSITION_CONFIRMED");
readyFixture.parties.p1.invitedIds = ["test_b", "test_c", "test_b"];
const enteredReady = api.enterReadyCheckState(readyFixture, "p1", "leader", 1700);
assert.equal(enteredReady.snapshot.parties.p1.status, "COMPOSITION_CONFIRMED", "leader readiness is automatic inside the collapsed confirmed state");
assert.deepEqual(Array.from(enteredReady.cancelledIds), [], "confirmation must not pre-emptively cancel pending invitations");
assert.equal(enteredReady.shouldNotify, false, "a collapsed ready state must not emit the retired cancellation notice");
assert.deepEqual(Array.from(enteredReady.snapshot.parties.p1.invitedIds), ["test_b", "test_c", "test_b"], "pending invitations remain until the leader explicitly confirms departure");
assert.equal(enteredReady.snapshot.parties.p1.readyStateBy.leader.ready, true, "composition confirmation must make the leader effectively ready");
assert.ok(enteredReady.snapshot.parties.p1.readyBy.includes("leader"));
assert.deepEqual(Array.from(enteredReady.snapshot.parties.p1.memberIds), ["leader", "member"], "pending invitees must never become members before accepting");
assert.equal(enteredReady.snapshot.characters.test_b.currentPartyId, null);
assert.equal(enteredReady.snapshot.characters.test_c.currentPartyId, null);

const readyAgain = api.enterReadyCheckState(enteredReady.snapshot, "p1", "leader", 1800);
assert.equal(readyAgain.snapshot.parties.p1.status, "COMPOSITION_CONFIRMED", "re-entering the legacy helper must retain the collapsed state");
assert.deepEqual(Array.from(readyAgain.cancelledIds), [], "the legacy helper must not cancel invitations");
const readyWithoutPending = api.enterReadyCheckState(fixture("COMPOSITION_CONFIRMED"), "p1", "leader", 1900);
assert.equal(readyWithoutPending.shouldNotify, false, "automatic readiness has no invitation-cancellation alert");

const renderPartyStart = app.indexOf("  function renderParty(partyId)");
const renderPartyEnd = app.length;
assert.ok(renderPartyStart >= 0 && renderPartyEnd > renderPartyStart, "party renderer must be discoverable");
const renderParty = app.slice(renderPartyStart, renderPartyEnd);
assert.match(renderParty, /data-party-invite-cancel/, "direct participant markup needs a stable pending-invite cancel hook");
assert.match(renderParty, /members\.map\(\(memberId\) => memberRow\(party, memberId\)\)\.join\(""\)[\s\S]*?pendingInviteIds\.map\(\(memberId\) => pendingInviteRow\(memberId, isCreator, pendingInviteLabel\)\)\.join\(""\)/, "pending rows must render after joined member rows");
assert.match(renderParty, /\[data-party-invite-cancel\][\s\S]*?cancelInvite\(partyId, el\.dataset\.partyInviteCancel\)/, "pending cancel button must be wired to the cancel action");
const pendingRowStart = app.indexOf("  function pendingInviteRow(");
const pendingRowEnd = app.indexOf("  function inviteUser(", pendingRowStart);
assert.ok(pendingRowStart >= 0 && pendingRowEnd > pendingRowStart, "pending invite row renderer must be discoverable");
const pendingRow = app.slice(pendingRowStart, pendingRowEnd);
assert.match(pendingRow, /status-pills">\$\{cancelMarkup\}<span[^>]*>\$\{escapeHtml\(pendingInviteLabel\)\}<\/span>/, "cancel markup must be left of the invitation-status box");
assert.match(pendingRow, /초대 취소/, "pending row must use the exact cancel label");
assert.match(pendingRow, /초대하는 중\.\.\./, "pending row must use the exact waiting label");
assert.match(renderParty, /초대하는 중\.\.\./, "pending participant markup must show the waiting-invitation label");
assert.match(renderParty, /pending/i, "party renderer must explicitly render pending invite rows");
assert.match(index, /app\.js\?v=0\.4\.5[^"']*pending-party-invites=1[^"']*party-member-readiness-ux=1[^"']*party-invite-grid-stability=1[^"']*party-confirmed-ready-collapse=1/, "app cache key must identify the collapsed confirmed-ready departure flow");
assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.86/);
assert.match(index, /party-leadership-flow\.js\?v=0\.3\.68/);
assert.match(index, /party-flow-sync\.js\?v=0\.3\.67/);
assert.match(index, /party-preflight-flow-fix\.js\?v=0\.3\.96/);

const uxSource = fs.readFileSync(new URL("../party-flow-ux-fix.js", import.meta.url), "utf8");
const UX_GLOBAL_KEY = "baekji_city_mvp_state_v3";
const UX_USER_KEY = "baekji_city_mvp_current_user_v034";

class FakeElement {
  constructor(matches = {}, dataset = {}) { this.matches = matches; this.dataset = dataset; }
  closest(selector) { return this.matches[selector] ? this : null; }
  remove() { this.removed = true; }
}

function clickEvent(target) {
  return {
    target,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
}

function uxRuntime(initialState, userId) {
  const local = new Map([[UX_GLOBAL_KEY, JSON.stringify(initialState)]]);
  const session = new Map([[UX_USER_KEY, userId]]);
  let clickHandler = null;
  let writes = 0;
  const alerts = [];
  const modalRoot = { querySelector() { return null; }, replaceChildren() {} };
  const document = {
    documentElement: { dataset: {} },
    getElementById(id) { return id === "modal-root" ? modalRoot : null; },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { if (type === "click") clickHandler = handler; },
  };
  const context = vm.createContext({
    console,
    structuredClone,
    Element: FakeElement,
    document,
    location: { hash: "#/party/p1", href: "https://example.test/#/party/p1" },
    localStorage: {
      getItem(key) { return local.has(key) ? local.get(key) : null; },
      setItem(key, value) { writes += 1; local.set(key, String(value)); },
    },
    sessionStorage: {
      getItem(key) { return session.has(key) ? session.get(key) : null; },
      setItem(key, value) { session.set(key, String(value)); },
    },
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    StorageEvent: class StorageEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
    HashChangeEvent: class HashChangeEvent { constructor(type) { this.type = type; } },
  });
  context.window = context;
  context.dispatchEvent = () => true;
  context.alert = (message) => alerts.push(String(message));
  vm.runInContext(uxSource, context, { filename: "party-flow-ux-fix.js" });
  assert.equal(typeof clickHandler, "function", "party flow UX must register a capture click handler");
  return {
    click(target) { const event = clickEvent(target); clickHandler(event); return event; },
    snapshot() { return JSON.parse(local.get(UX_GLOBAL_KEY)); },
    writes: () => writes,
    alerts,
  };
}

const clickAcceptedFixture = fixture("COMPOSITION_CONFIRMED");
clickAcceptedFixture.parties.p1.invitedIds = ["test_b"];
const acceptRuntime = uxRuntime(clickAcceptedFixture, "test_b");
const acceptClick = acceptRuntime.click(new FakeElement({ "[data-party-flow-accept], [data-accept]": true }, { partyFlowAccept: "p1" }));
assert.equal(acceptRuntime.writes(), 1, "confirmed-stage accept capture click must produce one atomic state write");
assert.equal(acceptRuntime.snapshot().characters.test_b.currentPartyId, "p1");
assert.ok(acceptRuntime.snapshot().parties.p1.memberIds.includes("test_b"));
assert.ok(!acceptRuntime.snapshot().parties.p1.invitedIds.includes("test_b"));
assert.equal(acceptClick.prevented, true);
assert.equal(acceptClick.stopped, true);

const clickReadyFixture = fixture("COMPOSITION_CONFIRMED");
clickReadyFixture.parties.p1.invitedIds = ["test_b", "test_c"];
const readyRuntime = uxRuntime(clickReadyFixture, "leader");
const readyClick = readyRuntime.click(new FakeElement({ "[data-ready]": true }));
assert.equal(readyRuntime.writes(), 0, "the retired leader ready control must not mutate the collapsed confirmed state");
assert.equal(readyRuntime.alerts.length, 0, "the retired leader ready control must not show the deleted auto-cancel alert");
assert.equal(readyRuntime.snapshot().parties.p1.status, "COMPOSITION_CONFIRMED");
assert.deepEqual(Array.from(readyRuntime.snapshot().parties.p1.invitedIds), ["test_b", "test_c"], "the retired control must leave pending invitations for the explicit departure confirmation");
assert.equal(readyClick.prevented, true);
assert.equal(readyClick.stopped, true);
readyRuntime.click(new FakeElement({ "[data-ready]": true }));
assert.equal(readyRuntime.alerts.length, 0, "retired leader-ready clicks must never show a cancellation alert");
assert.equal(readyRuntime.writes(), 0, "retired leader-ready clicks remain write-free");

const alreadyReadyFixture = fixture("COMPOSITION_CONFIRMED");
alreadyReadyFixture.parties.p1.readyStateBy = { leader: { ready: true, at: 1 } };
alreadyReadyFixture.parties.p1.readyBy = ["leader"];
const alreadyReadyRuntime = uxRuntime(alreadyReadyFixture, "leader");
alreadyReadyRuntime.click(new FakeElement({ "[data-ready]": true }));
assert.equal(alreadyReadyRuntime.snapshot().parties.p1.status, "COMPOSITION_CONFIRMED");
assert.equal(alreadyReadyRuntime.snapshot().parties.p1.readyStateBy.leader.ready, true, "leader remains automatically ready without a separate ready step");
assert.ok(alreadyReadyRuntime.snapshot().parties.p1.readyBy.includes("leader"));

const memberReadyFixture = fixture("COMPOSITION_CONFIRMED");
const memberRuntime = uxRuntime(memberReadyFixture, "member");
const memberReadyClick = memberRuntime.click(new FakeElement({ "[data-member-ready]": true }, { memberReady: "p1" }));
assert.equal(memberRuntime.writes(), 1, "member ready capture click must write its own readiness once");
assert.equal(memberRuntime.snapshot().parties.p1.status, "COMPOSITION_CONFIRMED", "member readiness must not advance the leader-owned ready stage");
assert.ok(memberRuntime.snapshot().parties.p1.readyBy.includes("member"));
assert.equal(memberReadyClick.prevented, true);
assert.equal(memberReadyClick.stopped, true);

const readyCheckMemberFixture = fixture("READY_CHECK");
readyCheckMemberFixture.parties.p1.readyStateBy = { leader: { ready: true, at: 1 }, member: { ready: false, at: 1 } };
readyCheckMemberFixture.parties.p1.readyBy = ["leader"];
const readyCheckMemberRuntime = uxRuntime(readyCheckMemberFixture, "member");
readyCheckMemberRuntime.click(new FakeElement({ "[data-member-ready]": true }, { memberReady: "p1" }));
assert.equal(readyCheckMemberRuntime.writes(), 1, "a nonleader must be able to become ready during READY_CHECK");
assert.equal(readyCheckMemberRuntime.snapshot().parties.p1.status, "COMPOSITION_CONFIRMED", "the first legacy READY_CHECK member update must normalize into the collapsed state");
assert.equal(readyCheckMemberRuntime.snapshot().parties.p1.readyStateBy.member.ready, true);
readyCheckMemberRuntime.click(new FakeElement({ "[data-member-ready]": true }, { memberReady: "p1" }));
assert.equal(readyCheckMemberRuntime.writes(), 2, "a nonleader must be able to cancel readiness during READY_CHECK");
assert.equal(readyCheckMemberRuntime.snapshot().parties.p1.status, "COMPOSITION_CONFIRMED");
assert.equal(readyCheckMemberRuntime.snapshot().parties.p1.readyStateBy.member.ready, false);

console.log("PASS: pending invite state, ordering, cancellation, confirmed-stage acceptance, explicit departure cancellation, renderer, and capture-click contracts");
