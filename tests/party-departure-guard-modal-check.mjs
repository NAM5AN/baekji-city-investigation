import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync("app.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const domainRules = fs.readFileSync("runtime-domain-rules.js", "utf8");
const membership = fs.readFileSync("party-membership-ux-fix.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";

function json(value) { return JSON.parse(JSON.stringify(value)); }

// A confirmed party must remain in the collapsed confirmation stage after a
// pre-departure removal.  Rolling it back to recruiting makes the leader
// restart an already-confirmed flow and used to hide the departure guard.
const membershipContext = vm.createContext({ window: {}, console, structuredClone, Date });
vm.runInContext(runtimeUtils, membershipContext, { filename: "runtime-utils.js" });
vm.runInContext(domainRules, membershipContext, { filename: "runtime-domain-rules.js" });
vm.runInContext(membership, membershipContext, { filename: "party-membership-ux-fix.js" });
const membershipApi = membershipContext.window.__BAEKJI_PARTY_MEMBERSHIP_UX_TEST__;
assert.ok(membershipApi, "membership reducer seam must be available");
const membershipBase = {
  version: 3,
  characters: { leader: { currentPartyId: "p1", currentSessionId: null }, member: { currentPartyId: "p1", currentSessionId: null }, ready_other: { currentPartyId: "p1", currentSessionId: null }, waiting_other: { currentPartyId: "p1", currentSessionId: null } },
  parties: { p1: { id: "p1", creatorId: "leader", status: "COMPOSITION_CONFIRMED", memberIds: ["leader", "member", "ready_other", "waiting_other"], invitedIds: [], declinedIds: [], confirmedBy: ["leader", "member", "ready_other", "waiting_other"], readyBy: ["leader", "member", "ready_other"], readyStateBy: { leader: { ready: true }, member: { ready: true }, ready_other: { ready: true }, waiting_other: { ready: false } }, sessionId: null } },
};
for (const [memberId, actorId, label] of [["member", "leader", "leader kick"], ["member", "member", "self leave"]]) {
  const next = json(membershipApi.removeMemberState(membershipBase, "p1", memberId, actorId, 1000, memberId));
  const party = next.parties.p1;
  assert.equal(party.status, "COMPOSITION_CONFIRMED", `${label} must keep the party at collapsed confirmation step 2`);
  assert.deepEqual(party.memberIds, ["leader", "ready_other", "waiting_other"]);
  assert.deepEqual(party.confirmedBy, ["leader", "ready_other", "waiting_other"], `${label} must keep all remaining members composition-confirmed`);
  assert.equal(party.readyStateBy.leader.ready, true, `${label} must retain automatic leader readiness`);
  assert.equal(party.readyStateBy.ready_other.ready, true, `${label} must preserve an already-ready remaining member`);
  assert.equal(party.readyStateBy.waiting_other.ready, false, `${label} must preserve an already-unready remaining member`);
  assert.deepEqual(party.readyBy, ["leader", "ready_other"], `${label} must preserve remaining readiness projection`);
  assert.equal(next.characters.member.currentPartyId, null);
  assert.ok(Object.keys(next.partyMembershipRemovals || {}).length, `${label} must retain a stale-merge tombstone`);
  assert.ok(Object.keys(next.partyMembershipNotices || {}).length, `${label} must retain a membership notice`);
}

const renderStart = app.indexOf("  function renderParty(");
const renderEnd = app.indexOf("  function inviteUser(", renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, "party renderer must be discoverable");
const renderPartySource = app.slice(renderStart, renderEnd);
assert.match(renderPartySource, /isCreator\s*&&\s*readyStage[\s\S]*?data-start-session/, "the leader departure button must remain available throughout the confirmed ready stage");
assert.doesNotMatch(renderPartySource, /isCreator\s*&&\s*allReady\s*&&\s*readyStage\s*\?\s*`<button[^>]*data-start-session/, "departure must not disappear merely because invites or member readiness are unresolved");
assert.match(app, /초대 중인 캐릭터가 있습니다/, "pending-only departure guard copy must be rendered in-app");
assert.match(app, /준비 중인 캐릭터가 있습니다/, "unready-only departure guard copy must be rendered in-app");
assert.match(app, /초대 및 준비 중인 캐릭터가 있습니다/, "combined departure guard copy must be rendered in-app");
assert.match(index, /app\.js\?v=0\.4\.9[^"']*departure-guards=1[^"']*stage3a=1[^"']*stage3b=1[^"']*stage3c=1/, "app cache key must identify the departure guard and Stage 3-C caller-adoption release");

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.listeners = new Map(); }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  click() { (this.listeners.get("click") || []).forEach((listener) => listener({ target: this, currentTarget: this, preventDefault() {}, stopImmediatePropagation() {} })); }
  focus() {}
  remove() {}
}

function fixture({ pending = [], memberReady = true, status = "COMPOSITION_CONFIRMED" } = {}) {
  return {
    version: 3, sessionSeq: 0,
    characters: {
      test_a: { id: "test_a", currentPartyId: "p1", currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
      test_b: { id: "test_b", currentPartyId: "p1", currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
      test_c: { id: "test_c", currentPartyId: null, currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
      test_d: { id: "test_d", currentPartyId: null, currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
    },
    parties: { p1: { id: "p1", name: "guard", creatorId: "test_a", status, memberIds: ["test_a", "test_b"], invitedIds: pending, declinedIds: [], confirmedBy: ["test_a", "test_b"], readyBy: ["test_a", ...(memberReady ? ["test_b"] : [])], readyStateBy: { test_a: { ready: true }, test_b: { ready: memberReady } }, sessionId: null } },
    sessions: {},
  };
}

function runtime(initial, userId = "test_a") {
  const local = new Map([[GLOBAL_KEY, JSON.stringify(initial)]]); const session = new Map([[USER_KEY, userId]]);
  let writes = 0; let start = null; let modalElements = {}; let modalMarkup = ""; const toasts = [];
  const appRoot = { _html: "", set innerHTML(value) { this._html = String(value); start = this._html.includes("data-start-session") ? new Element() : null; }, get innerHTML() { return this._html; } };
  const modalRoot = {
    _html: "", get childElementCount() { return this._html ? 1 : 0; },
    set innerHTML(value) {
      this._html = String(value); modalMarkup = this._html; modalElements = {};
      if (!this._html) return;
      modalElements.backdrop = new Element(); modalElements.cancel = new Element();
      const partyId = this._html.match(/data-[\w-]*confirm="([^"]+)"/)?.[1] || "p1";
      modalElements.confirm = new Element({ partyStartPendingConfirm: partyId, partyDepartureConfirm: partyId });
    }, get innerHTML() { return this._html; }, replaceChildren() { this._html = ""; modalElements = {}; },
    querySelector(selector) { if (selector.includes("modal")) return modalElements.backdrop || null; if (selector.includes("cancel")) return modalElements.cancel || null; if (selector.includes("confirm")) return modalElements.confirm || null; return null; },
  };
  const document = {
    body: { classList: { add() {}, remove() {} } }, documentElement: { dataset: {} }, fonts: { ready: Promise.resolve() },
    getElementById(id) { return id === "app" ? appRoot : id === "modal-root" ? modalRoot : id === "toast-root" ? { appendChild(node) { toasts.push(node); } } : null; },
    querySelector(selector) { if (selector === "[data-start-session]") return start; return modalRoot.querySelector(selector); }, querySelectorAll() { return []; },
    createElement() { return new Element(); }, addEventListener() {}, removeEventListener() {},
  };
  const context = vm.createContext({ window: {}, document, localStorage: { getItem(key) { return local.get(key) || null; }, setItem(key, value) { writes += 1; local.set(key, String(value)); } }, sessionStorage: { getItem(key) { return session.get(key) || null; }, setItem(key, value) { session.set(key, String(value)); } }, location: { hash: "#/party/p1" }, history: { pushState() {} }, navigator: {}, Intl, Date, Math, JSON, String, Object, Array, Set, Map, Promise, structuredClone, setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, requestAnimationFrame(callback) { callback(); return 1; }, console });
  context.window = context; context.addEventListener = () => {};
  vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
  vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
  vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
  const footer = app.lastIndexOf("})();");
  vm.runInContext(`${app.slice(0, footer)}window.__DEPARTURE_GUARD_RUNTIME__ = { renderParty, startSession };\n})();`, context, { filename: "party-departure-guard-runtime.js" });
  return { render() { context.window.__DEPARTURE_GUARD_RUNTIME__.renderParty("p1"); }, clickStart() { assert.ok(start, "authorized confirmed leader must have a departure action"); start.click(); }, clickCancel() { assert.ok(modalElements.cancel, "modal must bind a back action"); modalElements.cancel.click(); }, clickConfirm() { assert.ok(modalElements.confirm, "modal must bind a confirmation action"); modalElements.confirm.click(); }, replace(next) { local.set(GLOBAL_KEY, JSON.stringify(next)); }, writes: () => writes, snapshot: () => JSON.parse(local.get(GLOBAL_KEY)), modal: () => modalMarkup, modalOpen: () => Boolean(modalRoot.childElementCount), hasStart: () => Boolean(start), toasts: () => toasts.length, markup: () => appRoot.innerHTML };
}

const cases = [
  { name: "pending", options: { pending: ["test_c"], memberReady: true }, heading: "초대 중인 캐릭터가 있습니다", primary: "초대 취소 후 조사 출발" },
  { name: "unready", options: { pending: [], memberReady: false }, heading: "준비 중인 캐릭터가 있습니다", primary: "탈퇴 후 조사 출발" },
  { name: "both", options: { pending: ["test_c"], memberReady: false }, heading: "초대 및 준비 중인 캐릭터가 있습니다", primary: "탈퇴·초대 취소 후 조사 출발" },
];
for (const entry of cases) {
  const r = runtime(fixture(entry.options)); r.render();
  assert.equal(r.hasStart(), true, `${entry.name}: leader departure stays visible before all-clear`);
  r.clickStart();
  assert.match(r.modal(), new RegExp(`<h2>${entry.heading}</h2>`), `${entry.name}: modal heading must be exact`);
  assert.match(r.modal(), new RegExp(`>${entry.primary}</button>`), `${entry.name}: modal primary label must be exact`);
  assert.equal(r.writes(), 0, `${entry.name}: opening guard must not write`);
  r.clickCancel(); assert.equal(r.writes(), 0, `${entry.name}: back must not write`); assert.equal(r.modalOpen(), false);
}

const both = runtime(fixture({ pending: ["test_c"], memberReady: false })); both.render(); both.clickStart(); both.clickConfirm();
const bothState = both.snapshot();
assert.equal(both.writes(), 1, "guard confirmation must commit one atomic write");
assert.equal(bothState.parties.p1.status, "SESSION_CREATED");
assert.deepEqual(bothState.parties.p1.invitedIds, []);
assert.deepEqual(bothState.sessions[bothState.parties.p1.sessionId].memberIds, ["test_a"], "unready members and pending invitees must not enter the session");
assert.equal(bothState.characters.test_b.currentPartyId, null, "unready removed member must lose the party pointer");
assert.equal(bothState.characters.test_c.currentSessionId, null, "pending invitee must never gain a session pointer");
assert.ok(Object.keys(bothState.partyMembershipRemovals || {}).length, "departure removal must retain a tombstone for stale merge repair");
const staleResurrection = json(bothState);
staleResurrection.parties.p1.memberIds.push("test_b");
staleResurrection.parties.p1.readyBy.push("test_b");
staleResurrection.characters.test_b.currentPartyId = "p1";
const repairedDeparture = membershipApi.repairMembershipRemovals(staleResurrection);
assert.equal(repairedDeparture.snapshot.parties.p1.memberIds.includes("test_b"), false, "departure tombstone must prevent a stale member-array resurrection");
assert.equal(repairedDeparture.snapshot.characters.test_b.currentPartyId, null, "departure tombstone must repair stale member pointers");
assert.equal(repairedDeparture.snapshot.parties.p1.status, "SESSION_CREATED", "post-departure tombstone repair must never roll a live session back to recruiting");
assert.equal(repairedDeparture.snapshot.parties.p1.sessionId, bothState.parties.p1.sessionId, "post-departure tombstone repair must keep the active party session pointer");
assert.deepEqual(repairedDeparture.snapshot.sessions[bothState.parties.p1.sessionId].memberIds, ["test_a"], "post-departure tombstone repair must keep the session's final member list");
assert.deepEqual(Array.from(repairedDeparture.snapshot.parties.p1.readyBy), ["test_a"], "post-departure tombstone repair must retain remaining-member readiness");

const direct = runtime(fixture({ pending: [], memberReady: true })); direct.render(); direct.clickStart();
assert.equal(direct.modalOpen(), false, "all-clear leader departure must start directly without a modal");
assert.equal(direct.writes(), 1, "all-clear departure must write once");
assert.deepEqual(direct.snapshot().sessions[direct.snapshot().parties.p1.sessionId].memberIds, ["test_a", "test_b"], "all-clear departure must retain the ready leader and ready member");
const nonleader = runtime(fixture({ pending: ["test_c"], memberReady: true }), "test_b"); nonleader.render();
assert.equal(nonleader.hasStart(), false, "nonleaders cannot trigger the leader departure guard");
const recruiting = runtime(fixture({ pending: [], memberReady: true, status: "RECRUITING" })); recruiting.render();
assert.equal(recruiting.hasStart(), false, "the departure guard must not appear outside the confirmed ready stage");

const stale = runtime(fixture({ pending: ["test_c"], memberReady: false })); stale.render(); stale.clickStart();
const replaced = stale.snapshot(); replaced.parties.p1.invitedIds = ["test_d"]; replaced.parties.p1.readyStateBy.test_b = { ready: true }; replaced.parties.p1.readyBy = ["test_a", "test_b"]; stale.replace(replaced); stale.clickConfirm();
assert.equal(stale.writes(), 0, "same-count pending replacement or readiness change must abort stale departure confirmation");
assert.equal(Object.keys(stale.snapshot().sessions).length, 0);
assert.equal(stale.toasts(), 1, "stale departure confirmation must use an in-site toast");

const acceptedRace = runtime(fixture({ pending: ["test_c"], memberReady: true })); acceptedRace.render(); acceptedRace.clickStart();
const accepted = acceptedRace.snapshot();
accepted.parties.p1.invitedIds = [];
accepted.parties.p1.memberIds.push("test_c");
accepted.parties.p1.confirmedBy.push("test_c");
accepted.parties.p1.readyStateBy.test_c = { ready: false };
accepted.characters.test_c.currentPartyId = "p1";
acceptedRace.replace(accepted); acceptedRace.clickConfirm();
assert.equal(acceptedRace.writes(), 0, "an invite accepted while the departure modal is open must abort without a write");
assert.equal(Object.keys(acceptedRace.snapshot().sessions).length, 0, "accepted-invitation race must not create a session");
assert.ok(acceptedRace.snapshot().parties.p1.memberIds.includes("test_c"), "accepted-invitation race must preserve the latest member");
assert.equal(acceptedRace.snapshot().characters.test_c.currentPartyId, "p1");
assert.equal(acceptedRace.toasts(), 1, "accepted-invitation race must explain the abort with an in-site toast");

console.log("PASS: confirmed departure guards keep membership progression stable and atomically resolve pending/unready blockers");
