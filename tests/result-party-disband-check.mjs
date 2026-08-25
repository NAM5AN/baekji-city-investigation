import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const appSource = fs.readFileSync("app.js", "utf8");
const runtimeUtilsSource = fs.readFileSync("runtime-utils.js", "utf8");
const worldStoreSource = fs.readFileSync("world-store.js", "utf8");
const domainRulesSource = fs.readFileSync("runtime-domain-rules.js", "utf8");
const cloudSource = fs.readFileSync("cloud-state-sync.js", "utf8");

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function json(value) { return JSON.parse(JSON.stringify(value)); }

function completedFixture() {
  return {
    version: 3,
    adminControlSeq: 8,
    adminControlPatches: [{ seq: 8, action: "CHARACTER_STATUS", targetId: "test_c", data: { contamination: 12, symptom: "WATCH" }, at: 88 }],
    characters: {
      test_a: { id: "test_a", name: "A", currentPartyId: "p1", currentSessionId: "s1", inventory: { lamp: { quantity: 1 } }, contamination: 31, symptom: "WATCH", profilePhoto: "data:a", unrelated: { keep: true } },
      test_b: { id: "test_b", name: "B", currentPartyId: "p1", currentSessionId: "s1", inventory: { key: { quantity: 2 } }, contamination: 64, symptom: "DANGER", profilePhoto: "data:b", unrelated: { keep: true } },
      test_c: { id: "test_c", name: "C", currentPartyId: null, currentSessionId: null, inventory: { coin: { quantity: 3 } }, contamination: 12, symptom: "WATCH", unrelated: { keep: true } },
    },
    parties: {
      p1: { id: "p1", creatorId: "test_a", status: "SESSION_CREATED", memberIds: ["test_a", "test_b"], invitedIds: ["test_c"], declinedIds: ["old"], confirmedBy: ["test_a", "test_b"], readyBy: ["test_a", "test_b"], readyStateBy: { test_a: { ready: true }, test_b: { ready: true } }, sessionId: "s1", unrelated: "party-keep" },
      p2: { id: "p2", creatorId: "test_c", status: "SESSION_CREATED", memberIds: ["test_c"], invitedIds: [], declinedIds: [], confirmedBy: ["test_c"], readyBy: ["test_c"], readyStateBy: { test_c: { ready: true } }, sessionId: "s2" },
    },
    sessions: {
      s1: { id: "s1", partyId: "p1", memberIds: ["test_a", "test_b"], status: "COMPLETED", currentNode: "E_EXIT", inspectedObjectIds: ["E_OBJ_001"], takenItemKeys: ["E_OBJ_001:key"], logs: [{ id: "result-log", type: "scene", at: 42, text: "complete" }], endedAt: 42, unrelated: { keep: true } },
      s2: { id: "s2", partyId: "p2", memberIds: ["test_c"], status: "ACTIVE", currentNode: "E_ENTRY", inspectedObjectIds: [], takenItemKeys: [], logs: [] },
    },
  };
}

function appReducer() {
  const end = appSource.indexOf("  function renderParty(");
  assert.ok(end > 0, "party result reducer seam must precede the party renderer");
  const context = vm.createContext({ window: {}, document: { getElementById() { return null; } }, localStorage: { getItem() { return null; } }, DAY1_DATA: { meta: { startNode: "E_ENTRY" } }, console, structuredClone, Date, JSON, String, Object, Array, Set, Map });
  context.window = context;
  vm.runInContext(runtimeUtilsSource, context, { filename: "runtime-utils.js" });
  vm.runInContext(worldStoreSource, context, { filename: "world-store.js" });
  vm.runInContext(domainRulesSource, context, { filename: "runtime-domain-rules.js" });
  vm.runInContext(`${appSource.slice(0, end)}\n})();`, context, { filename: "result-party-disband-reducer.js" });
  const api = context.window.__BAEKJI_PENDING_PARTY_INVITES_TEST__;
  assert.equal(typeof api?.disbandCompletedPartyState, "function", "completed result disband reducer must be exposed for atomic regression coverage");
  return api;
}

const reducer = appReducer();
const initial = completedFixture();
const beforeCharacters = clone(initial.characters);
const beforeSession = clone(initial.sessions.s1);
const disbanded = reducer.disbandCompletedPartyState(initial, "s1", "test_a", 1234);
assert.equal(disbanded.changed, true, "a completed-session member may disband the completed party");
const closed = json(disbanded.snapshot);
assert.equal(closed.parties.p1.status, "CLOSED");
assert.equal(closed.parties.p1.sessionId, null);
assert.deepEqual(closed.parties.p1.memberIds, []);
assert.deepEqual(closed.parties.p1.invitedIds, []);
assert.deepEqual(closed.parties.p1.declinedIds, []);
assert.deepEqual(closed.parties.p1.confirmedBy, []);
assert.deepEqual(closed.parties.p1.readyBy, []);
assert.deepEqual(closed.parties.p1.readyStateBy, {});
assert.equal(closed.sessions.s1.status, "COMPLETED", "disbanding must never mutate the immutable result status");
assert.equal(closed.sessions.s1.partyDisbandedAt, 1234);
assert.equal(closed.sessions.s1.partyDisbandedBy, "test_a");
assert.deepEqual(closed.sessions.s1.memberIds, beforeSession.memberIds, "result membership remains historical evidence");
assert.deepEqual(closed.sessions.s1.logs, beforeSession.logs, "result logs remain historical evidence");
assert.deepEqual(closed.sessions.s1.inspectedObjectIds, beforeSession.inspectedObjectIds);
assert.deepEqual(closed.sessions.s1.takenItemKeys, beforeSession.takenItemKeys);
["test_a", "test_b"].forEach((memberId) => {
  assert.equal(closed.characters[memberId].currentPartyId, null, `${memberId} must leave the closed party`);
  assert.equal(closed.characters[memberId].currentSessionId, null, `${memberId} must leave the completed session`);
  const expected = clone(beforeCharacters[memberId]);
  expected.currentPartyId = null;
  expected.currentSessionId = null;
  assert.deepEqual(closed.characters[memberId], expected, `${memberId} inventory, contamination, symptom, and unrelated fields must be untouched`);
});
assert.deepEqual(closed.characters.test_c, beforeCharacters.test_c, "non-members and unrelated character fields must be untouched");
assert.deepEqual(closed.adminControlPatches, initial.adminControlPatches, "unrelated admin state must be untouched");

const unauthorized = reducer.disbandCompletedPartyState(initial, "s1", "test_c", 1235);
assert.equal(unauthorized.changed, false, "a non-member cannot disband another party's completed session");
assert.deepEqual(json(unauthorized.snapshot), initial, "unauthorized disband is a true no-op");
const active = completedFixture();
active.sessions.s1.status = "ACTIVE";
assert.equal(reducer.disbandCompletedPartyState(active, "s1", "test_a", 1235).changed, false, "active sessions cannot be disbanded from a result flow");
const repeat = reducer.disbandCompletedPartyState(disbanded.snapshot, "s1", "test_a", 1236);
assert.equal(repeat.changed, false, "repeat result disband must be idempotent");
assert.deepEqual(json(repeat.snapshot), closed, "repeat result disband must not introduce a second mutation");

const laterAssignment = completedFixture();
laterAssignment.characters.test_b.currentPartyId = "p2";
laterAssignment.characters.test_b.currentSessionId = "s2";
laterAssignment.parties.p2.creatorId = "test_b";
laterAssignment.parties.p2.memberIds = ["test_b"];
laterAssignment.parties.p2.confirmedBy = ["test_b"];
laterAssignment.parties.p2.readyBy = ["test_b"];
laterAssignment.parties.p2.readyStateBy = { test_b: { ready: true } };
laterAssignment.sessions.s2.memberIds = ["test_b"];
const laterClosed = json(reducer.disbandCompletedPartyState(laterAssignment, "s1", "test_a", 1237).snapshot);
assert.equal(laterClosed.characters.test_b.currentPartyId, "p2", "a member's later party assignment must survive stale disband cleanup");
assert.equal(laterClosed.characters.test_b.currentSessionId, "s2", "a member's later session assignment must survive stale disband cleanup");

const legacy = completedFixture();
legacy.sessions.s1.partyId = "missing-party";
legacy.characters.test_a.currentPartyId = "missing-party";
legacy.characters.test_b.currentPartyId = "missing-party";
const legacyClosed = reducer.disbandCompletedPartyState(legacy, "s1", "test_a", 1238);
assert.equal(legacyClosed.changed, true, "legacy completed sessions with a missing party must close safely");
assert.equal(legacyClosed.snapshot.characters.test_a.currentPartyId, null);
assert.equal(legacyClosed.snapshot.characters.test_b.currentSessionId, null);

// Exercise the real result renderer binding: the displayed action must write
// once, route home, and an external update for another member must redirect
// their stale result route instead of leaving a zombie result screen.
function resultRuntime(snapshot, userId) {
  const local = new Map([[GLOBAL_KEY, JSON.stringify(snapshot)]]);
  const session = new Map([[USER_KEY, userId]]);
  let writes = 0;
  let button = null;
  const app = {
    _html: "",
    set innerHTML(value) {
      this._html = String(value);
      const id = this._html.match(/data-result-disband-home="([^"]+)"/)?.[1];
      button = id ? { dataset: { resultDisbandHome: id }, listeners: [], addEventListener(type, listener) { if (type === "click") this.listeners.push(listener); }, click() { this.listeners.forEach((listener) => listener({ currentTarget: this })); } } : null;
    },
    get innerHTML() { return this._html; },
  };
  const document = {
    body: { classList: { add() {}, remove() {} } }, documentElement: { dataset: {} }, fonts: { ready: Promise.resolve() },
    getElementById(id) { return id === "app" ? app : { appendChild() {}, replaceChildren() {}, querySelector() { return null; } }; },
    querySelector(selector) { return selector === "[data-result-disband-home]" ? button : null; },
    querySelectorAll() { return []; }, createElement() { return { classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, style: {}, dataset: {} }; }, addEventListener() {}, removeEventListener() {},
  };
  const window = { addEventListener() {} };
  const context = vm.createContext({ window, document, localStorage: { getItem(key) { return local.get(key) || null; }, setItem(key, value) { writes += 1; local.set(key, String(value)); } }, sessionStorage: { getItem(key) { return session.get(key) || null; }, setItem(key, value) { session.set(key, String(value)); } }, location: { hash: "#/result/s1" }, history: { pushState() {} }, navigator: {}, Intl, Date, Math, JSON, String, Object, Array, Set, Map, Promise, structuredClone, setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, requestAnimationFrame(callback) { callback(); return 1; }, console });
  context.window = context;
  context.addEventListener = () => {};
  vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
  vm.runInContext(runtimeUtilsSource, context, { filename: "runtime-utils.js" });
  vm.runInContext(worldStoreSource, context, { filename: "world-store.js" });
  vm.runInContext(domainRulesSource, context, { filename: "runtime-domain-rules.js" });
  const footer = appSource.lastIndexOf("})();");
  assert.ok(footer > 0, "app runtime footer must be discoverable");
  vm.runInContext(`${appSource.slice(0, footer)}window.__RESULT_PARTY_RUNTIME__ = { renderResult, renderExternalUpdate, getState: () => clone(store.get()) };\n})();`, context, { filename: "result-party-disband-runtime.js" });
  return { api: context.window.__RESULT_PARTY_RUNTIME__, app, click() { assert.ok(button, "completed result must bind a disband action rather than a generic home link"); button.click(); }, writes: () => writes, snapshot: () => JSON.parse(local.get(GLOBAL_KEY)), replaceState(next) { local.set(GLOBAL_KEY, JSON.stringify(next)); }, location: context.location };
}

const memberA = resultRuntime(completedFixture(), "test_a");
memberA.api.renderResult("s1");
assert.match(memberA.app.innerHTML, /data-result-disband-home="s1"/, "result markup must expose the dedicated disband action");
assert.match(memberA.app.innerHTML, />해산<\//, "the result action must explicitly communicate party disband instead of a generic home navigation");
memberA.click();
assert.equal(memberA.writes(), 1, "the bound completed-result action must write exactly once");
assert.equal(memberA.location.hash, "#/home", "the bound completed-result action must route home");
memberA.click();
assert.equal(memberA.writes(), 1, "a stale duplicate bound click must not write again");

const memberB = resultRuntime(completedFixture(), "test_b");
memberB.api.renderResult("s1");
const externallyDisbanded = memberA.snapshot();
memberB.replaceState(externallyDisbanded);
memberB.api.renderExternalUpdate();
assert.equal(memberB.location.hash, "#/home", "a second completed member must be redirected home by the external disband update");
assert.ok(Number(externallyDisbanded.sessions.s1.partyDisbandedAt) > 0, "A's disband result must carry a durable session marker for other members");

function cloudHarness(localState) {
  class Storage { constructor() { this.values = new Map(); } getItem(key) { return this.values.has(key) ? this.values.get(key) : null; } setItem(key, value) { this.values.set(key, String(value)); } removeItem(key) { this.values.delete(key); } }
  class Event { constructor(type) { this.type = type; } }
  class StorageEvent extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } }
  class CustomEvent extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } }
  const localStorage = new Storage(); const sessionStorage = new Storage();
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(localState)); sessionStorage.setItem(USER_KEY, "test_a");
  const window = { addEventListener() {}, dispatchEvent() {} }; const document = { hidden: false, documentElement: { dataset: {} }, addEventListener() {} };
  const footer = /  ensureBootstrap\(\);\r?\n\}\)\(\);\s*$/;
  assert.match(cloudSource, footer, "cloud runtime footer must be discoverable");
  const source = cloudSource.replace(footer, "  window.__RESULT_CLOUD_RUNTIME__ = { applyRemoteState };\n})();");
  const context = vm.createContext({ window, document, localStorage, sessionStorage, Storage, Event, StorageEvent, CustomEvent, location: { href: "https://example.test/" }, fetch: async () => ({ ok: true, json: async () => [] }), AbortController, Date, Math, JSON, String, Object, Array, Set, Map, Promise, setTimeout() { return 0; }, clearTimeout() {}, console });
  vm.runInContext(source, context, { filename: "cloud-result-party-disband.js" });
  return { api: context.window.__BAEKJI_CLOUD_SYNC_TEST__, runtime: context.window.__RESULT_CLOUD_RUNTIME__, localStorage };
}

const staleRemote = completedFixture();
const cloud = cloudHarness(disbanded.snapshot);
const cloudMerged = json(cloud.api.mergeCloudStates(staleRemote, disbanded.snapshot));
assert.equal(cloudMerged.parties.p1.status, "CLOSED", "stale cloud state cannot reopen a closed completed party");
assert.deepEqual(cloudMerged.parties.p1.memberIds, [], "stale cloud state cannot restore closed-party members");
assert.equal(cloudMerged.characters.test_a.currentPartyId, null, "stale cloud state cannot restore old member party pointers");
assert.equal(cloudMerged.characters.test_b.currentSessionId, null, "stale cloud state cannot restore old member session pointers");
const rebased = json(cloud.api.rebaseUnsyncedOverlay(initial, disbanded.snapshot, staleRemote));
assert.equal(rebased.parties.p1.status, "CLOSED", "unsynced-overlay rebase must retain completed-party closure");
assert.deepEqual(rebased.parties.p1.memberIds, [], "unsynced-overlay rebase must retain empty closed-party membership");
cloud.runtime.applyRemoteState({ revision: 9, state: staleRemote });
const ingress = JSON.parse(cloud.localStorage.getItem(GLOBAL_KEY));
assert.equal(ingress.parties.p1.status, "CLOSED", "direct remote ingress must preserve a local completed-party closure against stale remote state");
assert.deepEqual(ingress.parties.p1.memberIds, []);
assert.equal(ingress.characters.test_a.currentPartyId, null);

const staleWithoutResult = completedFixture();
delete staleWithoutResult.sessions.s1;
delete staleWithoutResult.parties.p1;
const missingResultCloud = cloudHarness(disbanded.snapshot);
missingResultCloud.runtime.applyRemoteState({ revision: 10, state: staleWithoutResult });
const restoredResult = JSON.parse(missingResultCloud.localStorage.getItem(GLOBAL_KEY));
assert.equal(restoredResult.sessions.s1.status, "COMPLETED", "direct ingress must restore a locally completed result missing from a stale whole-world snapshot");
assert.equal(restoredResult.sessions.s1.partyDisbandedAt, 1234, "direct ingress must restore the durable disband tombstone");
assert.deepEqual(restoredResult.sessions.s1.logs, beforeSession.logs, "direct ingress must restore historical result logs");
assert.deepEqual(restoredResult.sessions.s1.inspectedObjectIds, beforeSession.inspectedObjectIds, "direct ingress must restore historical inspected results");
assert.equal(restoredResult.characters.test_a.currentPartyId, null, "restored result must keep old party pointers cleared");
assert.equal(restoredResult.characters.test_b.currentSessionId, null, "restored result must keep old session pointers cleared");

const movedLocal = reducer.disbandCompletedPartyState(laterAssignment, "s1", "test_a", 1239).snapshot;
movedLocal.characters.test_b.inventory = { postInvestigation: { quantity: 7, provenance: "after-result" } };
movedLocal.characters.test_b.contamination = 77;
movedLocal.characters.test_b.symptom = "POST_INVESTIGATION";
movedLocal.characters.test_b.unrelated = { keep: true, persistent: "post-investigation" };
const movedCloud = cloudHarness(movedLocal);
movedCloud.runtime.applyRemoteState({ revision: 11, state: staleRemote });
const movedIngress = JSON.parse(movedCloud.localStorage.getItem(GLOBAL_KEY));
assert.equal(movedIngress.characters.test_b.currentPartyId, "p2", "direct ingress must preserve a newer party pointer after disband");
assert.equal(movedIngress.characters.test_b.currentSessionId, "s2", "direct ingress must preserve a newer session pointer after disband");
assert.deepEqual(movedIngress.characters.test_b, movedLocal.characters.test_b, "a stale pre-investigation character record must not erase post-result inventory, contamination, symptom, or persistent fields");

const missingCharacterRemote = clone(staleRemote);
delete missingCharacterRemote.characters.test_b;
const missingCharacterCloud = cloudHarness(movedLocal);
missingCharacterCloud.runtime.applyRemoteState({ revision: 12, state: missingCharacterRemote });
const restoredCharacter = JSON.parse(missingCharacterCloud.localStorage.getItem(GLOBAL_KEY));
assert.deepEqual(restoredCharacter.characters.test_b, movedLocal.characters.test_b, "direct ingress must restore the full local character when a stale whole-world snapshot omits it");

const newerRemote = clone(staleRemote);
newerRemote.sessions.s1.partyDisbandedAt = 2000;
newerRemote.sessions.s1.partyDisbandedBy = "test_b";
newerRemote.characters.test_b = { ...clone(movedLocal.characters.test_b), currentPartyId: "p2", currentSessionId: "s2", inventory: { remoteProgress: { quantity: 9 } }, contamination: 88, symptom: "REMOTE_LATER", unrelated: { keep: true, persistent: "remote-later" } };
const newerCloud = cloudHarness(movedLocal);
newerCloud.runtime.applyRemoteState({ revision: 13, state: newerRemote });
const newerIngress = JSON.parse(newerCloud.localStorage.getItem(GLOBAL_KEY));
assert.equal(newerIngress.sessions.s1.partyDisbandedAt, 2000, "an equal-or-newer remote disband marker must win over the local tombstone");
assert.deepEqual(newerIngress.characters.test_b, newerRemote.characters.test_b, "a newer remote marker must retain later character progression instead of freezing it at local values");

const equalRemote = clone(newerRemote);
equalRemote.sessions.s1.partyDisbandedAt = 1239;
equalRemote.characters.test_b = { ...clone(newerRemote.characters.test_b), contamination: 86, symptom: "REMOTE_EQUAL", unrelated: { keep: true, persistent: "remote-equal" } };
const equalCloud = cloudHarness(movedLocal);
equalCloud.runtime.applyRemoteState({ revision: 14, state: equalRemote });
const equalIngress = JSON.parse(equalCloud.localStorage.getItem(GLOBAL_KEY));
assert.deepEqual(equalIngress.characters.test_b, equalRemote.characters.test_b, "an equal remote marker with later character values must not be frozen behind local post-result state");

console.log("PASS: completed result disband is member-authorized, atomic, idempotent, externally routable, and stale-cloud safe");
