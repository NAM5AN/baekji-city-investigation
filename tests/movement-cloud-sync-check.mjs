import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /cloud-state-sync\.js\?v=0\.4\.2&fix=0b1&movement-terminal=1&result-party-disband=1&stage4-item-transfer=1/, "movement cloud reconciliation must ship behind a fresh browser cache key");
assert.match(index, /app\.js\?v=0\.4\.9&fix=0b1[^"']*movement-terminal=1[^"']*stage3a=1[^"']*stage3b=1[^"']*stage3c=1/, "movement terminal markers must ship behind a fresh browser cache key");

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.writesByKey = new Map();
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    this.values.set(key, String(value));
    this.writesByKey.set(key, (this.writesByKey.get(key) || 0) + 1);
  }
  removeItem(key) { this.values.delete(key); }
  writes(key) { return this.writesByKey.get(key) || 0; }
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      const entries = listeners.get(type) || [];
      entries.push(callback);
      listeners.set(type, entries);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((callback) => callback.call(this, event));
      return true;
    },
  };
}

const timerQueue = new Map();
let nextTimerId = 0;
function fakeSetTimeout(callback, delay = 0) {
  const id = ++nextTimerId;
  timerQueue.set(id, { callback, delay: Number(delay) || 0 });
  return id;
}
function fakeClearTimeout(id) { timerQueue.delete(id); }

const localStorage = new FakeStorage();
const sessionStorage = new FakeStorage();
const window = eventTarget();
const document = {
  ...eventTarget(),
  hidden: false,
  documentElement: { dataset: {} },
};
let storageEvents = 0;
window.addEventListener("storage", () => { storageEvents += 1; });

class FakeEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
}
class FakeStorageEvent extends FakeEvent {}
class FakeCustomEvent extends FakeEvent {
  constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
}

const fetchCalls = [];
const fetchResults = [];
async function fetch(url, options = {}) {
  fetchCalls.push({ url, body: JSON.parse(options.body || "null") });
  const planned = fetchResults.shift();
  if (planned === undefined) throw new Error("unexpected cloud request");
  const result = typeof planned === "function"
    ? await planned({ url, body: fetchCalls.at(-1).body, callNumber: fetchCalls.length })
    : planned;
  return { ok: true, status: 200, async json() { return result; } };
}

let source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const footer = /  ensureBootstrap\(\);\r?\n\}\)\(\);\s*$/;
assert.match(source, footer, "cloud sync test harness requires the runtime footer");
source = source.replace(footer, `
  window.__MOVEMENT_CLOUD_RUNTIME_TEST__ = Object.freeze({
    flushPush,
    pollOnce,
    bootstrap,
    prime(raw, revisionValue = 0, basisRaw = null) {
      nativeSetItem.call(localStorage, GLOBAL_KEY, raw);
      initialized = true;
      applyingRemote = false;
      pushInFlight = false;
      pendingRaw = raw;
      revision = revisionValue;
      remoteBasisRaw = basisRaw;
    },
    simulateReload() {
      clearTimeout(pushTimer);
      clearTimeout(pollTimer);
      clearTimeout(recoveryTimer);
      initialized = false;
      applyingRemote = false;
      pushInFlight = false;
      pendingRaw = null;
      unsyncedRaw = null;
      unsyncedOwnerKey = "";
      unsyncedGeneration = 0;
      remoteBasisRaw = null;
      pushTimer = 0;
      pollTimer = 0;
      recoveryTimer = 0;
      recoveryNotBefore = 0;
      recoveryOwnerId = "";
      recoveryOwnerKey = "";
      revision = 0;
    },
    async drainPush() {
      for (let attempt = 0; attempt < 50 && pushInFlight; attempt += 1) await Promise.resolve();
      if (pushInFlight) throw new Error("cloud push did not settle in the test microtask budget");
    },
    state() { return { initialized, applyingRemote, pushInFlight, pendingRaw, pendingGeneration, revision, unsyncedRaw, unsyncedGeneration, recoveryTimer, recoveryNotBefore }; },
  });
  ensureBootstrap();
})();`);

const context = vm.createContext({
  window, document, localStorage, sessionStorage,
  Storage: FakeStorage,
  StorageEvent: FakeStorageEvent,
  CustomEvent: FakeCustomEvent,
  Event: FakeEvent,
  location: { href: "https://example.test/#/investigate/sA" },
  fetch,
  AbortController,
  Date, Math, JSON, String, Object, Array, Set, Map, Promise,
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  console,
});
vm.runInContext(source, context, { filename: "cloud-state-sync.js" });

const api = window.__BAEKJI_CLOUD_SYNC_TEST__;
const runtime = window.__MOVEMENT_CLOUD_RUNTIME_TEST__;
assert.ok(api && runtime, "movement cloud sync test APIs must be available");
assert.equal(typeof api.movementTerminalMarker, "function", "cloud reconciliation must use the explicit terminal movement marker contract");

function movement(token, startedAt = 100) {
  return {
    token,
    routeId: "E_R001",
    fromNode: "E_ENTRY",
    targetNode: "E_G_PLAZA",
    actorId: "test_a",
    startedAt,
    resolveAt: startedAt + 1800,
  };
}

function runningSession(id, memberIds, token) {
  return {
    id,
    partyId: `p-${id}`,
    memberIds,
    status: "ACTIVE",
    variant: "a",
    currentNode: "E_ENTRY",
    currentDetailId: null,
    activeEncounter: null,
    movement: movement(token),
    choiceReveal: null,
    inspectedObjectIds: [],
    takenItemKeys: [],
    logs: [],
  };
}

function terminalSession(session, kind = "ENCOUNTER") {
  const completed = structuredClone(session);
  const activeMovement = completed.movement;
  completed.movement = null;
  completed.currentDetailId = null;
  completed.choiceReveal = null;
  completed.currentNode = kind === "ARRIVED" ? activeMovement.targetNode : activeMovement.fromNode;
  completed.activeEncounter = kind === "ENCOUNTER"
    ? { routeId: activeMovement.routeId, fromNode: activeMovement.fromNode, targetNode: activeMovement.targetNode, hazards: ["HZ_TEMP_04"], currentIndex: 0 }
    : null;
  completed.lastMovementTransition = {
    token: activeMovement.token,
    kind,
    routeId: activeMovement.routeId,
    fromNode: activeMovement.fromNode,
    targetNode: activeMovement.targetNode,
    completedAt: activeMovement.resolveAt,
  };
  return completed;
}

function world(sA, sC) {
  return {
    version: 3,
    characters: {
      test_a: { id: "test_a", inventory: {} },
      test_b: { id: "test_b", inventory: {} },
      test_c: { id: "test_c", inventory: {} },
    },
    sessions: { sA, sC },
    parties: {},
  };
}

const runningAB = runningSession("sA", ["test_a", "test_b"], "move-ab");
const runningC = runningSession("sC", ["test_c"], "move-c");
const completedAB = terminalSession(runningAB, "ENCOUNTER");
const completedC = terminalSession(runningC, "ARRIVED");
assert.equal(api.movementTerminalMarker(completedAB, runningAB.movement)?.token, "move-ab");
assert.equal(api.movementTerminalMarker(completedC, runningC.movement)?.kind, "ARRIVED");

const concurrentRemote = world(structuredClone(runningAB), structuredClone(runningC));
concurrentRemote.sessions.sC.logs.push({ id: "c-chat", type: "interaction", actorId: "test_c", at: 120, text: "C", scopeKey: "node:E_ENTRY" });
concurrentRemote.sessions.sA.logs.push({ id: "entry-presence", type: "presence", actorId: null, at: 121, text: "entry" });
const concurrentLocal = world(structuredClone(runningAB), structuredClone(runningC));
concurrentLocal.sessions.sA.logs.push({ id: "ab-chat", type: "interaction", actorId: "test_b", at: 122, text: "B", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
const inFlightMerged = api.mergeCloudStates(concurrentRemote, concurrentLocal);
assert.equal(inFlightMerged.sessions.sA.movement.token, "move-ab", "A/B movement token must survive concurrent C chat and entry-presence merges");
assert.equal(inFlightMerged.sessions.sC.movement.token, "move-c", "solo C movement token must survive concurrent A/B writes");
assert.ok(inFlightMerged.sessions.sA.logs.some((entry) => entry.id === "entry-presence"));
assert.ok(inFlightMerged.sessions.sC.logs.some((entry) => entry.id === "c-chat"));

const staleNullAB = structuredClone(concurrentRemote);
staleNullAB.sessions.sA.movement = null;
delete staleNullAB.sessions.sA.lastMovementTransition;
const nullMerged = api.mergeCloudStates(staleNullAB, concurrentLocal);
assert.equal(nullMerged.sessions.sA.movement.token, "move-ab", "a stale null without the matching terminal marker must not delete an in-flight movement");

const legacyArrival = structuredClone(runningAB);
legacyArrival.movement = null;
legacyArrival.currentNode = "E_G_PLAZA";
legacyArrival.activeEncounter = null;
delete legacyArrival.lastMovementTransition;
const legacyArrivalMerged = api.mergeCloudStates(
  world(structuredClone(runningAB), structuredClone(runningC)),
  world(legacyArrival, structuredClone(runningC)),
);
assert.equal(legacyArrivalMerged.sessions.sA.movement, null, "pre-marker arrival evidence must remain terminal during migration");
assert.equal(legacyArrivalMerged.sessions.sA.lastMovementTransition?.token, "move-ab", "legacy arrival evidence must synthesize the movement terminal token");
assert.equal(legacyArrivalMerged.sessions.sA.lastMovementTransition?.kind, "ARRIVED", "legacy target-node evidence must synthesize an ARRIVED marker");

const legacyEncounter = structuredClone(runningAB);
legacyEncounter.movement = null;
legacyEncounter.activeEncounter = { routeId: "E_R001", fromNode: "E_ENTRY", targetNode: "E_G_PLAZA", hazards: ["HZ_TEMP_04"], currentIndex: 0 };
delete legacyEncounter.lastMovementTransition;
const legacyEncounterMerged = api.mergeCloudStates(
  world(structuredClone(runningAB), structuredClone(runningC)),
  world(legacyEncounter, structuredClone(runningC)),
);
assert.equal(legacyEncounterMerged.sessions.sA.movement, null, "pre-marker encounter evidence must remain terminal during migration");
assert.equal(legacyEncounterMerged.sessions.sA.lastMovementTransition?.token, "move-ab", "legacy encounter evidence must synthesize the movement terminal token");
assert.equal(legacyEncounterMerged.sessions.sA.lastMovementTransition?.kind, "ENCOUNTER", "legacy route encounter evidence must synthesize an ENCOUNTER marker");

const legacyStaleNullAtOrigin = structuredClone(runningAB);
legacyStaleNullAtOrigin.movement = null;
legacyStaleNullAtOrigin.currentNode = "E_ENTRY";
legacyStaleNullAtOrigin.activeEncounter = null;
delete legacyStaleNullAtOrigin.lastMovementTransition;
const legacyOriginMerged = api.mergeCloudStates(
  world(structuredClone(runningAB), structuredClone(runningC)),
  world(legacyStaleNullAtOrigin, structuredClone(runningC)),
);
assert.equal(legacyOriginMerged.sessions.sA.movement?.token, "move-ab", "marker-absent null at the origin must preserve the remote in-flight movement");

const terminalLocal = world(structuredClone(completedAB), structuredClone(completedC));
const staleRemote = world(structuredClone(runningAB), structuredClone(runningC));
const terminalWinsLocal = api.mergeCloudStates(staleRemote, terminalLocal);
assert.equal(terminalWinsLocal.sessions.sA.movement, null, "a stale remote movement must not revive terminal A/B movement");
assert.equal(terminalWinsLocal.sessions.sA.lastMovementTransition.token, "move-ab");
assert.equal(terminalWinsLocal.sessions.sA.activeEncounter.routeId, "E_R001", "terminal transition fields must be copied atomically");
assert.equal(terminalWinsLocal.sessions.sC.movement, null, "a stale remote movement must not revive terminal solo C movement");
assert.equal(terminalWinsLocal.sessions.sC.currentNode, "E_G_PLAZA");

const terminalRemote = world(structuredClone(completedAB), structuredClone(completedC));
const terminalWinsRemote = api.mergeCloudStates(terminalRemote, staleRemote);
assert.equal(terminalWinsRemote.sessions.sA.movement, null, "a stale local movement must not revive a remote terminal marker");
assert.equal(terminalWinsRemote.sessions.sC.movement, null);

sessionStorage.setItem(USER_KEY, "test_a");
const stagedTerminal = world(structuredClone(completedAB), structuredClone(completedC));
stagedTerminal.characters.test_a.contamination = 17;
stagedTerminal.sessions.sA.logs.push({ id: "terminal-action", type: "interaction", actorId: "test_a", at: 190, text: "terminal action", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
runtime.prime(JSON.stringify(stagedTerminal), 40);
for (let index = 0; index < 3; index += 1) {
  const conflictState = world(structuredClone(runningAB), structuredClone(runningC));
  conflictState.sessions.sC.logs.push({ id: `c-conflict-${index}`, type: "interaction", actorId: "test_c", at: 200 + index, text: `C${index}`, scopeKey: "node:E_ENTRY" });
  if (index === 2) conflictState.characters.test_c.remoteNewest = "revision-43";
  fetchResults.push([{ accepted: false, revision: 41 + index, state: conflictState }]);
}

const globalWritesBefore = localStorage.writes(GLOBAL_KEY);
await runtime.flushPush();
const putCalls = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putCalls.length, 3, "one flush must stop after three CAS conflicts");
assert.deepEqual(putCalls.map((call) => call.body.p_expected_revision), [40, 41, 42], "bounded CAS retries must advance through the observed revisions");
for (const call of putCalls) {
  assert.equal(call.body.p_state.sessions.sA.movement, null, "every retry candidate must keep the terminal A/B movement authoritative");
  assert.equal(call.body.p_state.sessions.sA.lastMovementTransition.token, "move-ab");
  assert.equal(call.body.p_state.sessions.sC.movement, null, "every retry candidate must keep solo C completion authoritative");
}
assert.equal(localStorage.writes(GLOBAL_KEY), globalWritesBefore + 1, "exhausted conflicts must apply the authoritative remote once without ping-pong");
assert.equal(storageEvents, 1, "exhausted conflicts must dispatch one external update, not a render/write loop");
assert.equal(runtime.state().pendingRaw, null, "the exhausted batch must stop instead of staging an infinite retry");
assert.equal([...timerQueue.values()].filter((timer) => timer.delay === 350).length, 0, "the exhausted batch must not schedule another conflict retry by itself");

const exhaustedState = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.equal(exhaustedState.sessions.sA.movement, null, "conflict exhaustion must not revive terminal A/B movement in final local state");
assert.equal(exhaustedState.sessions.sA.lastMovementTransition?.token, "move-ab", "conflict exhaustion must retain A/B terminal token");
assert.equal(exhaustedState.sessions.sA.lastMovementTransition?.kind, "ENCOUNTER", "conflict exhaustion must retain encounter semantics");
assert.equal(exhaustedState.sessions.sA.activeEncounter?.routeId, "E_R001", "conflict exhaustion must retain the terminal encounter atomically");
assert.equal(exhaustedState.sessions.sC.movement, null, "conflict exhaustion must not revive terminal solo C movement");
assert.equal(exhaustedState.sessions.sC.currentNode, "E_G_PLAZA", "conflict exhaustion must retain solo C target arrival");
assert.ok(exhaustedState.sessions.sA.logs.some((entry) => entry.id === "terminal-action"), "conflict exhaustion must retain the candidate action log");
assert.equal(exhaustedState.characters.test_a.contamination, 17, "conflict exhaustion must retain the candidate character mutation");
assert.equal(exhaustedState.characters.test_c.remoteNewest, "revision-43", "conflict exhaustion must also retain the newest unrelated remote field");

const overlayKeyA = api.unsyncedKey();
const persistedOverlayA = overlayRecord(localStorage.getItem(overlayKeyA)).state;
assert.match(overlayKeyA, /:test_a$/, "the durable overlay key must be scoped to the authenticated user");
assert.equal(persistedOverlayA.sessions.sA.lastMovementTransition?.token, "move-ab", "conflict exhaustion must durably persist the terminal overlay");
sessionStorage.setItem(USER_KEY, "test_c");
assert.match(api.unsyncedKey(), /:test_c$/, "another user must resolve a different overlay key");
assert.equal(api.loadUnsyncedOverlay(), null, "another user must not load test_a's unsynced overlay");
sessionStorage.removeItem(USER_KEY);
assert.equal(api.unsyncedKey(), "", "logout must expose no overlay key or cross-user durable state");
assert.equal(api.loadUnsyncedOverlay(), null, "logout must not load a previous user's overlay");
sessionStorage.setItem(USER_KEY, "test_a");
assert.equal(api.loadUnsyncedOverlay()?.sessions.sA.lastMovementTransition?.token, "move-ab", "the owner must recover their durable overlay after re-authentication");

timerQueue.clear();
runtime.simulateReload();
const reloadRemote43 = world(structuredClone(runningAB), structuredClone(runningC));
reloadRemote43.characters.test_c.remoteNewest = "revision-43";
fetchResults.push([{ revision: 43, state: reloadRemote43 }]);
await runtime.bootstrap();
const reloadedState = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.equal(reloadedState.sessions.sA.movement, null, "reload/bootstrap must merge the persisted overlay before painting remote movement");
assert.equal(reloadedState.sessions.sA.lastMovementTransition?.token, "move-ab", "reload/bootstrap must retain the durable terminal marker");
assert.ok(reloadedState.sessions.sA.logs.some((entry) => entry.id === "terminal-action"), "reload/bootstrap must retain unsynced action logs");
assert.equal(reloadedState.characters.test_a.contamination, 17, "reload/bootstrap must retain unsynced character changes");
assert.equal(runtime.state().revision, 43, "reload/bootstrap must resume from the remote overlay base revision");

const putsBeforeOverlayPoll = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
const storageEventsBeforeOverlayPoll = storageEvents;
const remoteRevision44 = world(structuredClone(runningAB), structuredClone(runningC));
remoteRevision44.characters.test_c.remoteAfterExhaustion = "revision-44";
remoteRevision44.sessions.sC.logs.push({ id: "remote-after-exhaustion", type: "interaction", actorId: "test_c", at: 290, text: "remote 44", scopeKey: "node:E_ENTRY" });
fetchResults.push(44, [{ revision: 44, state: remoteRevision44 }]);
await runtime.pollOnce(false);
const afterOverlayPoll = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.equal(afterOverlayPoll.sessions.sA.movement, null, "a newer remote poll must not revive movement after conflict exhaustion");
assert.equal(afterOverlayPoll.sessions.sA.lastMovementTransition?.token, "move-ab", "a newer remote poll must retain the durable terminal marker");
assert.equal(afterOverlayPoll.sessions.sA.lastMovementTransition?.kind, "ENCOUNTER");
assert.ok(afterOverlayPoll.sessions.sA.logs.some((entry) => entry.id === "terminal-action"), "a newer remote poll must retain the unsynced terminal action");
assert.equal(afterOverlayPoll.characters.test_a.contamination, 17, "a newer remote poll must retain unsynced contamination");
assert.equal(afterOverlayPoll.characters.test_c.remoteAfterExhaustion, "revision-44", "a newer remote poll must also preserve unrelated newest remote data");
assert.equal(fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length, putsBeforeOverlayPoll, "poll reconciliation must not immediately start another put batch");
assert.equal(storageEvents, storageEventsBeforeOverlayPoll + 1, "poll reconciliation must apply once without UI/storage ping-pong");

const recoveryTimersAfter44 = [...timerQueue.entries()].filter(([, timer]) => timer.delay >= 4000);
assert.equal(recoveryTimersAfter44.length, 1, "a newer remote revision must leave at most one quiet recovery timer");
const remoteRevision45 = structuredClone(remoteRevision44);
remoteRevision45.characters.test_c.remoteAfterExhaustion = "revision-45";
fetchResults.push(45, [{ revision: 45, state: remoteRevision45 }]);
await runtime.pollOnce(false);
const recoveryTimersAfter45 = [...timerQueue.entries()].filter(([, timer]) => timer.delay >= 4000);
assert.equal(recoveryTimersAfter45.length, 1, "repeated remote revisions must reset/coalesce to one quiet recovery timer");
assert.notEqual(recoveryTimersAfter45[0][0], recoveryTimersAfter44[0][0], "new remote activity must replace the previous quiet timer");
assert.equal(fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length, putsBeforeOverlayPoll, "remote churn must perform zero recovery puts until quiet");

timerQueue.clear();
const laterIndependent = structuredClone(afterOverlayPoll);
laterIndependent.characters.test_a.contamination = 18;
laterIndependent.sessions.sA.logs.push({ id: "later-independent", type: "interaction", actorId: "test_a", at: 300, text: "later", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
const putsBeforeIndependent = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
fetchResults.push([{ accepted: true, revision: 46, state: laterIndependent }]);
localStorage.setItem(GLOBAL_KEY, JSON.stringify(laterIndependent));
const independentTimerEntry = [...timerQueue.entries()].find(([, timer]) => timer.delay === 120);
assert.ok(independentTimerEntry, "a later independent mutation must schedule a new logical cloud write");
timerQueue.delete(independentTimerEntry[0]);
await independentTimerEntry[1].callback();
const putsAfterIndependent = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putsAfterIndependent.length, putsBeforeIndependent + 1, "a later independent mutation must produce one new bounded logical put");
assert.equal(putsAfterIndependent.at(-1).body.p_expected_revision, 45, "the later mutation must start from the latest polled revision");
assert.equal(putsAfterIndependent.at(-1).body.p_state.characters.test_a.contamination, 18);
assert.equal(runtime.state().pendingRaw, null);

timerQueue.clear();
const nextBatch = structuredClone(exhaustedState);
nextBatch.sessions.sA.logs.push({ id: "batch-before-concurrent", type: "interaction", actorId: "test_b", at: 400, text: "batch", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
runtime.prime(JSON.stringify(nextBatch), 50);
const putsBeforeConcurrent = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
const storageEventsBeforeConcurrent = storageEvents;
let concurrentPending = null;
for (let index = 0; index < 3; index += 1) {
  fetchResults.push(async () => {
    const conflictState = world(structuredClone(runningAB), structuredClone(runningC));
    conflictState.characters.test_c.concurrentRemote = `remote-${index}`;
    if (index === 1) {
      concurrentPending = structuredClone(nextBatch);
      concurrentPending.sessions.sA.logs.push({ id: "new-during-retry", type: "interaction", actorId: "test_a", at: 410, text: "new during retry", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
      localStorage.setItem(GLOBAL_KEY, JSON.stringify(concurrentPending));
    }
    return [{ accepted: false, revision: 51 + index, state: conflictState }];
  });
}
await runtime.flushPush();
const putsAfterConcurrentBatch = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putsAfterConcurrentBatch.length, putsBeforeConcurrent + 3, "a concurrent new write must not extend the exhausted batch beyond three puts");
const preservedPending = JSON.parse(runtime.state().pendingRaw || "null");
assert.ok(preservedPending?.sessions.sA.logs.some((entry) => entry.id === "new-during-retry"), "a genuinely newer pending generation must survive exhaustion");
assert.equal(preservedPending.sessions.sA.movement, null, "the preserved newer generation must retain terminal movement semantics");
assert.equal(preservedPending.sessions.sA.lastMovementTransition.token, "move-ab");
const followUpTimers = [...timerQueue.entries()].filter(([, timer]) => timer.delay === 350);
assert.equal(followUpTimers.length, 1, "the newer generation must schedule exactly one later flush");
assert.ok(storageEvents - storageEventsBeforeConcurrent <= 1, "the newer generation reconciliation may dispatch at most one update but must not loop");

fetchResults.push([{ accepted: true, revision: 54, state: preservedPending }]);
timerQueue.delete(followUpTimers[0][0]);
await followUpTimers[0][1].callback();
const putsAfterFollowUp = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putsAfterFollowUp.length, putsBeforeConcurrent + 4, "the preserved newer generation must flush exactly once after the exhausted batch");
assert.ok(putsAfterFollowUp.at(-1).body.p_state.sessions.sA.logs.some((entry) => entry.id === "new-during-retry"), "the follow-up put must not lose the concurrent action");
assert.equal(runtime.state().pendingRaw, null, "the accepted follow-up must drain the newer generation");
assert.equal([...timerQueue.values()].filter((timer) => timer.delay === 350).length, 0, "the accepted follow-up must not form a timer loop");

timerQueue.clear();
const quietBase = structuredClone(preservedPending);
quietBase.sessions.sA.logs.push({ id: "quiet-overlay-action", type: "interaction", actorId: "test_a", at: 500, text: "quiet overlay", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
runtime.prime(JSON.stringify(quietBase), 60);
for (let index = 0; index < 3; index += 1) {
  const conflictState = world(structuredClone(runningAB), structuredClone(runningC));
  conflictState.characters.test_c.quietRemote = `conflict-${index}`;
  fetchResults.push([{ accepted: false, revision: 61 + index, state: conflictState }]);
}
await runtime.flushPush();
assert.ok(overlayRecord(localStorage.getItem(overlayKeyA)).state?.sessions.sA.logs.some((entry) => entry.id === "quiet-overlay-action"), "a newly exhausted batch must persist a durable quiet-recovery overlay");
const quietRemote64 = world(structuredClone(runningAB), structuredClone(runningC));
quietRemote64.characters.test_c.quietRemote = "revision-64";
fetchResults.push(64, [{ revision: 64, state: quietRemote64 }]);
const putsBeforeQuietPoll = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
await runtime.pollOnce(false);
assert.equal(fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length, putsBeforeQuietPoll, "quiet recovery must not put before its timer fires");
const quietRecoveryTimers = [...timerQueue.entries()].filter(([, timer]) => timer.delay >= 4000);
assert.equal(quietRecoveryTimers.length, 1, "quiet recovery must own exactly one coalesced timer");

const quietOverlay = overlayRecord(localStorage.getItem(overlayKeyA)).state;
assert.equal(runtime.state().recoveryTimer, quietRecoveryTimers[0][0], "the selected quiet timer must be the runtime recovery timer");
assert.equal(runtime.state().pendingRaw, null);
assert.equal(runtime.state().pushInFlight, false);
assert.equal(runtime.state().initialized, true);
assert.ok(runtime.state().unsyncedRaw);
assert.equal(api.syncEnabled(), true);
fetchResults.push([{ accepted: true, revision: 65, state: quietOverlay }]);
const putsBeforeQuietRecovery = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
timerQueue.delete(quietRecoveryTimers[0][0]);
quietRecoveryTimers[0][1].callback();
await runtime.drainPush();
const putsAfterQuietRecovery = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putsAfterQuietRecovery.length, putsBeforeQuietRecovery + 1, "the actual quiet timer must perform one successful recovery put");
assert.equal(putsAfterQuietRecovery.at(-1).body.p_expected_revision, 64, "quiet recovery must write against the latest polled revision");
assert.ok(putsAfterQuietRecovery.at(-1).body.p_state.sessions.sA.logs.some((entry) => entry.id === "quiet-overlay-action"));
assert.equal(runtime.state().pendingRaw, null, "successful quiet recovery must drain pending state");
assert.equal(runtime.state().unsyncedRaw, null, "successful quiet recovery must clear the in-memory overlay");
assert.equal(localStorage.getItem(overlayKeyA), null, "successful quiet recovery must remove the durable overlay");
assert.equal([...timerQueue.values()].filter((timer) => timer.delay === 350 || timer.delay >= 4000).length, 0, "successful quiet recovery must leave no recovery/push timer");

timerQueue.clear();
const exhaustedRecoveryBase = structuredClone(quietOverlay);
exhaustedRecoveryBase.sessions.sA.logs.push({ id: "recovery-conflict-action", type: "interaction", actorId: "test_b", at: 600, text: "recovery conflict", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
runtime.prime(JSON.stringify(exhaustedRecoveryBase), 70);
for (let index = 0; index < 3; index += 1) {
  const conflictState = world(structuredClone(runningAB), structuredClone(runningC));
  conflictState.characters.test_c.recoveryConflict = `initial-${index}`;
  fetchResults.push([{ accepted: false, revision: 71 + index, state: conflictState }]);
}
await runtime.flushPush();
const remoteRecovery74 = world(structuredClone(runningAB), structuredClone(runningC));
remoteRecovery74.characters.test_c.recoveryConflict = "revision-74";
fetchResults.push(74, [{ revision: 74, state: remoteRecovery74 }]);
await runtime.pollOnce(false);
const recoveryConflictTimers = [...timerQueue.entries()].filter(([, timer]) => timer.delay >= 4000);
assert.equal(recoveryConflictTimers.length, 1, "recovery-conflict setup must still coalesce to one quiet timer");
for (let index = 0; index < 3; index += 1) {
  const conflictState = structuredClone(remoteRecovery74);
  conflictState.characters.test_c.recoveryConflict = `recovery-${index}`;
  fetchResults.push([{ accepted: false, revision: 75 + index, state: conflictState }]);
}
const putsBeforeRecoveryConflict = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
timerQueue.delete(recoveryConflictTimers[0][0]);
recoveryConflictTimers[0][1].callback();
await runtime.drainPush();
const putsAfterRecoveryConflict = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putsAfterRecoveryConflict.length, putsBeforeRecoveryConflict + 3, "a recovery conflict must remain bounded to three puts");
const overlayAfterRecoveryConflict = overlayRecord(localStorage.getItem(overlayKeyA)).state;
assert.ok(overlayAfterRecoveryConflict?.sessions.sA.logs.some((entry) => entry.id === "recovery-conflict-action"), "recovery exhaustion must keep the durable overlay and its local action");
assert.equal(overlayAfterRecoveryConflict.sessions.sA.movement, null, "recovery exhaustion must not revive terminal movement");
assert.equal(overlayAfterRecoveryConflict.sessions.sA.lastMovementTransition?.token, "move-ab");
assert.equal(runtime.state().pendingRaw, null, "the exhausted recovery batch must stop without self-requeue");
assert.equal([...timerQueue.values()].filter((timer) => timer.delay === 350).length, 0, "recovery exhaustion must not create a 350ms put storm");

function overlayRecord(raw) {
  const parsed = JSON.parse(raw || "null");
  return {
    record: parsed,
    base: parsed?.baseRaw ? JSON.parse(parsed.baseRaw) : parsed?.base || parsed?.baseState || null,
    state: parsed?.stateRaw ? JSON.parse(parsed.stateRaw) : parsed?.state || parsed?.desired || parsed,
  };
}

timerQueue.clear();
sessionStorage.setItem(USER_KEY, "test_a");
api.clearUnsyncedOverlay();
const threeWayBase = world(structuredClone(runningAB), structuredClone(runningC));
threeWayBase.characters.test_a.contamination = 0;
threeWayBase.characters.test_c.contamination = 5;
threeWayBase.characters.test_c.status = "old";
threeWayBase.adminFlag = "old";
const threeWayDesired = structuredClone(threeWayBase);
threeWayDesired.sessions.sA = structuredClone(completedAB);
threeWayDesired.sessions.sA.logs.push({ id: "three-local-action", type: "interaction", actorId: "test_a", at: 800, text: "local only", scopeKey: "route:E_ENTRY:E_G_PLAZA" });
threeWayDesired.characters.test_a.contamination = 23;
runtime.prime(JSON.stringify(threeWayDesired), 80, JSON.stringify(threeWayBase));
for (let index = 0; index < 3; index += 1) {
  const remote = structuredClone(threeWayBase);
  remote.sessions.sA.logs.push({ id: `three-remote-${index}`, type: "presence", actorId: null, at: 810 + index, text: `remote ${index}` });
  fetchResults.push([{ accepted: false, revision: 81 + index, state: remote }]);
}
await runtime.flushPush();
const threeOverlayKey = api.unsyncedKey();
const afterThreeExhaustion = overlayRecord(localStorage.getItem(threeOverlayKey));
assert.ok(afterThreeExhaustion.base, "a durable three-way overlay record must persist its latest remote base");
assert.equal(afterThreeExhaustion.base.characters.test_c.contamination, 5);
assert.equal(afterThreeExhaustion.state.sessions.sA.lastMovementTransition?.token, "move-ab");
assert.ok(afterThreeExhaustion.state.sessions.sA.logs.some((entry) => entry.id === "three-local-action"));

const remote84 = structuredClone(threeWayBase);
remote84.characters.test_c.contamination = 60;
remote84.characters.test_c.status = "new";
remote84.adminFlag = "new";
remote84.sessions.sC.logs.push({ id: "three-remote-c84", type: "interaction", actorId: "test_c", at: 840, text: "remote C84", scopeKey: "node:E_ENTRY" });
remote84.sessions.sA.logs.push({ id: "three-remote-same-path", type: "presence", actorId: null, at: 841, text: "remote same path" });
fetchResults.push(84, [{ revision: 84, state: remote84 }]);
await runtime.pollOnce(false);
const rebased84 = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.equal(rebased84.characters.test_c.contamination, 60, "three-way rebase must keep a newer remote scalar untouched by local intent");
assert.equal(rebased84.characters.test_c.status, "new");
assert.equal(rebased84.adminFlag, "new");
assert.equal(rebased84.sessions.sA.movement, null, "atomic movement resolution must retain the local terminal transition");
assert.equal(rebased84.sessions.sA.lastMovementTransition?.token, "move-ab");
assert.equal(rebased84.characters.test_a.contamination, 23);
assert.ok(rebased84.sessions.sA.logs.some((entry) => entry.id === "three-local-action"));
assert.ok(rebased84.sessions.sA.logs.some((entry) => entry.id === "three-remote-same-path"), "same-session logs must add local intent while retaining new remote entries");
assert.ok(rebased84.sessions.sC.logs.some((entry) => entry.id === "three-remote-c84"));

const record84 = overlayRecord(localStorage.getItem(threeOverlayKey));
assert.equal(record84.base.characters.test_c.contamination, 60, "persisted overlay base must advance after the first rebase");
assert.equal(record84.state.characters.test_c.contamination, 60, "persisted desired state must include the new remote scalar");
assert.equal(record84.state.sessions.sA.lastMovementTransition?.token, "move-ab");

const remote85 = structuredClone(remote84);
remote85.characters.test_c.contamination = 70;
remote85.sessions.sC.logs.push({ id: "three-remote-c85", type: "interaction", actorId: "test_c", at: 850, text: "remote C85", scopeKey: "node:E_ENTRY" });
fetchResults.push(85, [{ revision: 85, state: remote85 }]);
await runtime.pollOnce(false);
const rebased85 = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.equal(rebased85.characters.test_c.contamination, 70, "a second remote scalar update must not be overwritten by the stale original overlay");
assert.equal(rebased85.sessions.sA.lastMovementTransition?.token, "move-ab");
assert.ok(rebased85.sessions.sA.logs.some((entry) => entry.id === "three-local-action"));
const record85 = overlayRecord(localStorage.getItem(threeOverlayKey));
assert.equal(record85.base.characters.test_c.contamination, 70, "persisted overlay base must advance incrementally on every rebase");
assert.equal(record85.state.characters.test_c.contamination, 70);

timerQueue.clear();
runtime.simulateReload();
const bootstrapRemote86 = structuredClone(remote85);
delete bootstrapRemote86.characters.test_a;
delete bootstrapRemote86.sessions.sA;
bootstrapRemote86.characters.test_b = { id: "test_b", contamination: 9, status: "remote-b", inventory: {} };
bootstrapRemote86.characters.test_c.contamination = 77;
bootstrapRemote86.characters.test_c.status = "bootstrap-new";
bootstrapRemote86.adminFlag = "bootstrap-new";
bootstrapRemote86.sessions.sC.logs.push({ id: "bootstrap-remote-c86", type: "interaction", actorId: "test_c", at: 860, text: "remote C86", scopeKey: "node:E_ENTRY" });
fetchResults.push([{ revision: 86, state: bootstrapRemote86 }]);
await runtime.bootstrap();
const afterOverlayBootstrap = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.ok(afterOverlayBootstrap.characters.test_a, "bootstrap must restore the current A character from its durable three-way overlay");
assert.equal(afterOverlayBootstrap.characters.test_a.contamination, 23, "bootstrap must retain A's unsynced character delta when remote no longer contains A");
assert.equal(afterOverlayBootstrap.sessions.sA.lastMovementTransition?.token, "move-ab", "bootstrap must restore A/B terminal movement from the overlay even when remote lacks the session");
assert.ok(afterOverlayBootstrap.sessions.sA.logs.some((entry) => entry.id === "three-local-action"), "bootstrap must restore A's unsynced action log");
assert.equal(afterOverlayBootstrap.characters.test_b.status, "remote-b", "bootstrap must retain an unrelated character introduced only by remote");
assert.equal(afterOverlayBootstrap.characters.test_c.contamination, 77);
assert.equal(afterOverlayBootstrap.characters.test_c.status, "bootstrap-new");
assert.equal(afterOverlayBootstrap.adminFlag, "bootstrap-new");
assert.ok(afterOverlayBootstrap.sessions.sC.logs.some((entry) => entry.id === "bootstrap-remote-c86"));

const bootstrapRecord = overlayRecord(localStorage.getItem(threeOverlayKey));
assert.equal(bootstrapRecord.record?.format, 1);
assert.equal(bootstrapRecord.record?.ownerId, "test_a");
assert.equal(bootstrapRecord.base.characters.test_a, undefined, "bootstrap must advance the persisted base to the actual remote snapshot");
assert.equal(bootstrapRecord.base.characters.test_c.contamination, 77);
assert.equal(bootstrapRecord.state.characters.test_a.contamination, 23, "bootstrap must persist the rebased desired state separately from its remote base");
assert.equal(bootstrapRecord.state.sessions.sA.lastMovementTransition?.token, "move-ab");
assert.equal(bootstrapRecord.state.characters.test_b.status, "remote-b");

const putsBeforeBootstrapRecovery = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length;
fetchResults.push([{ accepted: true, revision: 87, state: afterOverlayBootstrap }]);
assert.equal(await api.recoverUnsyncedOverlay(), true, "the restored bootstrap overlay must remain recoverable through the real bounded flush path");
const putsAfterBootstrapRecovery = fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state"));
assert.equal(putsAfterBootstrapRecovery.length, putsBeforeBootstrapRecovery + 1);
assert.equal(putsAfterBootstrapRecovery.at(-1).body.p_expected_revision, 86);
assert.equal(putsAfterBootstrapRecovery.at(-1).body.p_state.characters.test_a.contamination, 23);
assert.equal(putsAfterBootstrapRecovery.at(-1).body.p_state.sessions.sA.lastMovementTransition?.token, "move-ab");
assert.ok(putsAfterBootstrapRecovery.at(-1).body.p_state.sessions.sA.logs.some((entry) => entry.id === "three-local-action"));
assert.equal(putsAfterBootstrapRecovery.at(-1).body.p_state.characters.test_b.status, "remote-b");
assert.equal(putsAfterBootstrapRecovery.at(-1).body.p_state.characters.test_c.contamination, 77);
assert.ok(putsAfterBootstrapRecovery.at(-1).body.p_state.sessions.sC.logs.some((entry) => entry.id === "bootstrap-remote-c86"));
assert.equal(localStorage.getItem(threeOverlayKey), null, "accepted bootstrap recovery must clear the durable overlay record");
assert.equal(runtime.state().pendingRaw, null);
assert.equal(runtime.state().unsyncedRaw, null);

console.log("PASS: movement lifecycle markers survive concurrent cloud merges, bound CAS conflicts, and prevent stale movement revival");
