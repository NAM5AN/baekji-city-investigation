import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const sharedValues = new Map();

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

function storageClass(values = sharedValues) {
  return class SharedStorage {
    getItem(key) { return values.has(key) ? values.get(key) : null; }
    setItem(key, value) { values.set(key, String(value)); }
    removeItem(key) { values.delete(key); }
  };
}

class FakeEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
}
class FakeStorageEvent extends FakeEvent {}
class FakeCustomEvent extends FakeEvent {
  constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
}

function makeClock(startAt = 100_000) {
  let now = startAt;
  let nextId = 0;
  const timers = new Map();
  return {
    get now() { return now; },
    timers,
    setTimeout(callback, delay = 0) {
      const id = ++nextId;
      timers.set(id, { callback, dueAt: now + Math.max(0, Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = now + Math.max(0, Number(ms) || 0);
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= target)
          .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.dueAt;
        timer.callback();
      }
      now = target;
    },
  };
}

function movementWorld() {
  const movement = {
    token: "move-c-shared-tab",
    routeId: "E_R001_REV",
    fromNode: "E_G_PLAZA",
    targetNode: "E_ENTRY",
    actorId: "test_c",
    startedAt: 100_000,
    resolveAt: 101_800,
    actionText: "",
    itemUse: null,
  };
  return {
    version: 3,
    storyDay: 1,
    loopId: "LOOP-001",
    eventSeq: 0,
    sessionSeq: 0,
    characters: {
      test_a: { id: "test_a", contamination: 0, symptom: "안정", inventory: {} },
      test_b: { id: "test_b", contamination: 0, symptom: "안정", inventory: {} },
      test_c: { id: "test_c", contamination: 0, symptom: "안정", inventory: {} },
    },
    sessions: {
      sAB: {
        id: "sAB", status: "ACTIVE", variant: "c", memberIds: ["test_a", "test_b"],
        currentNode: "E_G_PLAZA", currentDetailId: null, movement: null,
        activeEncounter: { routeId: "E_R001_REV", fromNode: "E_G_PLAZA", targetNode: "E_ENTRY", hazards: ["HZ_TEMP_03", "HZ_CONT_01"], currentIndex: 0, resolutions: [] },
        choiceReveal: null, inspectedObjectIds: [], takenItemKeys: [], logs: [],
      },
      sC: {
        id: "sC", status: "ACTIVE", variant: "c", memberIds: ["test_c"],
        currentNode: "E_G_PLAZA", currentDetailId: null, movement,
        activeEncounter: null, choiceReveal: null, inspectedObjectIds: [], takenItemKeys: [], logs: [],
      },
    },
    parties: {},
    itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
  };
}

function makeAppRuntime({ gameplayVariance = false } = {}) {
  const Storage = storageClass();
  const localStorage = new Storage();
  const sessionStorage = new Storage(new Map());
  sessionStorage.setItem(USER_KEY, "test_c");
  const clock = makeClock();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const window = eventTarget();
  const document = {
    ...eventTarget(),
    body: { classList: { add() {}, remove() {} } },
    fonts: { ready: Promise.resolve() },
    getElementById() { return { innerHTML: "", querySelectorAll() {} }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { classList: { add() {}, remove() {} }, style: {}, dataset: {}, appendChild() {}, remove() {} }; },
  };
  const context = vm.createContext({
    window, document, localStorage, sessionStorage, Storage,
    Event: FakeEvent, StorageEvent: FakeStorageEvent, CustomEvent: FakeCustomEvent,
    location: { hash: "#/investigate/sC", href: "https://example.test/#/investigate/sC" },
    history: { pushState() {} }, navigator: {}, fetch: async () => ({ ok: false }),
    Date: ClockDate, Intl, Math, JSON, String, Object, Array, Set, Map, Promise,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: () => 0,
    requestAnimationFrame: (callback) => callback(), queueMicrotask,
    MutationObserver: class { observe() {} }, console,
  });
  vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
  if (gameplayVariance) vm.runInContext(fs.readFileSync(new URL("../gameplay-variance.js", import.meta.url), "utf8"), context);
  let source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const footer = source.indexOf('  window.addEventListener("hashchange", render);');
  assert.ok(footer > 0);
  source = `${source.slice(0, footer)}
  render = () => {};
  flushPendingNarrations = () => {};
  window.__SHARED_APP__ = Object.freeze({
    scheduleMovement, completeMovement, resolveHazard, loadState,
    timer(sessionId) { return movementTimers.get(sessionId) || null; },
  });
})();`;
  vm.runInContext(source, context, { filename: "app.js" });
  return { api: window.__SHARED_APP__, clock };
}

function makeCloudRuntime(userId) {
  const Storage = storageClass();
  const localStorage = new Storage();
  const sessionStorage = new Storage(new Map());
  sessionStorage.setItem(USER_KEY, userId);
  const window = eventTarget();
  const document = { ...eventTarget(), hidden: false, documentElement: { dataset: {} } };
  const timers = new Map();
  let nextTimer = 0;
  const setTimeout = (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  let source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
  const footer = /  ensureBootstrap\(\);\r?\n\}\)\(\);\s*$/;
  assert.match(source, footer);
  source = source.replace(footer, `
  window.__SHARED_CLOUD__ = Object.freeze({
    applyRemoteState,
    preserveAcceptedLocalMovementTransitions,
    initialize(revisionValue = 1) { initialized = true; applyingRemote = false; pendingRaw = null; revision = revisionValue; },
  });
})();`);
  const context = vm.createContext({
    window, document, localStorage, sessionStorage, Storage,
    Event: FakeEvent, StorageEvent: FakeStorageEvent, CustomEvent: FakeCustomEvent,
    location: { href: `https://example.test/#/${userId}` },
    fetch: async () => { throw new Error("unexpected network request"); }, AbortController,
    Date, Math, JSON, String, Object, Array, Set, Map, Promise,
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(source, context, { filename: `cloud-${userId}.js` });
  window.__SHARED_CLOUD__.initialize();
  return window.__SHARED_CLOUD__;
}

const running = movementWorld();
sharedValues.set(GLOBAL_KEY, JSON.stringify(running));
const cloudA = makeCloudRuntime("test_a");
const cloudB = makeCloudRuntime("test_b");
const cloudC = makeCloudRuntime("test_c");
const appC = makeAppRuntime();

appC.api.scheduleMovement(appC.api.loadState().sessions.sC);
assert.ok(appC.api.timer("sC"), "C must schedule the real movement completion timer");
appC.clock.advance(1800);

function currentWorld() { return JSON.parse(sharedValues.get(GLOBAL_KEY)); }
function tokenLogs(state, sessionId, token = "move-c-shared-tab") {
  return state.sessions[sessionId].logs.filter((entry) => entry.movementToken === token);
}

const firstTerminal = currentWorld();
assert.equal(firstTerminal.sessions.sC.movement, null);
assert.equal(firstTerminal.sessions.sC.lastMovementTransition?.token, "move-c-shared-tab");
assert.equal(firstTerminal.sessions.sC.lastMovementTransition?.kind, "ENCOUNTER");
assert.equal(tokenLogs(firstTerminal, "sC").filter((entry) => entry.type === "chat-divider").length, 1);
assert.equal(tokenLogs(firstTerminal, "sC").filter((entry) => entry.type === "risk").length, 1);
assert.equal(tokenLogs(firstTerminal, "sC").filter((entry) => entry.type === "presence").length, 1);
assert.equal(tokenLogs(firstTerminal, "sAB").filter((entry) => entry.type === "presence").length, 1);

// A and B independently receive the same stale cloud snapshot while C's terminal
// write has not reached the server. Each runtime reads the shared current GLOBAL.
assert.equal(cloudA.applyRemoteState({ revision: 2, state: structuredClone(running) }), false, "A's stale apply must be absorbed without replacing the accepted terminal state");
appC.api.scheduleMovement(appC.api.loadState().sessions.sC);
appC.clock.advance(1);
assert.equal(cloudB.applyRemoteState({ revision: 3, state: structuredClone(running) }), false);
appC.api.scheduleMovement(appC.api.loadState().sessions.sC);
appC.clock.advance(1);

// C's own poll sees the same stale movement too. Direct overdue callbacks model
// callbacks already queued by a stale render before the terminal state won.
assert.equal(cloudC.applyRemoteState({ revision: 4, state: structuredClone(running) }), false);
appC.api.completeMovement("sC", "move-c-shared-tab");
appC.api.completeMovement("sC", "move-c-shared-tab");

const finalState = currentWorld();
assert.equal(finalState.sessions.sC.movement, null, "stale A/B/C applies must never resurrect C's accepted movement");
assert.equal(finalState.sessions.sC.lastMovementTransition?.token, "move-c-shared-tab");
assert.equal(finalState.sessions.sC.lastMovementTransition?.kind, "ENCOUNTER");
assert.equal(finalState.sessions.sC.activeEncounter?.routeId, "E_R001_REV");
assert.equal(finalState.sessions.sC.activeEncounter?.currentIndex, 0);
assert.equal(finalState.sessions.sC.activeEncounter?.resolutions?.length, 0);
assert.equal(tokenLogs(finalState, "sC").filter((entry) => entry.type === "chat-divider").length, 1, "the route divider must be emitted exactly once");
assert.equal(tokenLogs(finalState, "sC").filter((entry) => entry.type === "risk").length, 1, "the risk result must be emitted exactly once");
assert.equal(tokenLogs(finalState, "sC").filter((entry) => entry.type === "presence").length, 1, "C route presence must be emitted exactly once");
assert.equal(tokenLogs(finalState, "sAB").filter((entry) => entry.type === "presence").length, 1, "A/B witness presence must be emitted exactly once");
assert.equal(finalState.characters.test_c.contamination, 0, "encounter completion retries must not duplicate contamination");

// Exercise ARRIVED as well as ENCOUNTER. Variant D has a guaranteed positive
// ambient delta, while this token deterministically rolls 97 against a 90%
// hazard chance and therefore takes the real chance-miss arrival path.
const arrivalRunning = movementWorld();
arrivalRunning.sessions.sAB.variant = "d";
arrivalRunning.sessions.sAB.currentNode = "E_ENTRY";
arrivalRunning.sessions.sAB.activeEncounter = null;
arrivalRunning.sessions.sAB.logs = [];
arrivalRunning.sessions.sAB.choiceReveal = { type: "persistent-menu", at: 1 };
delete arrivalRunning.sessions.sC;
arrivalRunning.sessions.sD = {
  id: "sD", status: "ACTIVE", variant: "d", memberIds: ["test_c"],
  currentNode: "E_G_PLAZA", currentDetailId: null,
  movement: {
    token: "arrive-26", routeId: "E_R001_REV", fromNode: "E_G_PLAZA", targetNode: "E_ENTRY",
    actorId: "test_c", startedAt: 100_000, resolveAt: 101_800, actionText: "", itemUse: null,
  },
  activeEncounter: null, choiceReveal: null, inspectedObjectIds: [], takenItemKeys: [], logs: [],
};
sharedValues.set(GLOBAL_KEY, JSON.stringify(arrivalRunning));
const arrivalApp = makeAppRuntime({ gameplayVariance: true });
arrivalApp.api.scheduleMovement(arrivalApp.api.loadState().sessions.sD);
arrivalApp.clock.advance(1800);
const arrivedOnce = currentWorld();
assert.equal(arrivedOnce.sessions.sD.movement, null);
assert.equal(arrivedOnce.sessions.sD.activeEncounter, null);
assert.equal(arrivedOnce.sessions.sD.currentNode, "E_ENTRY");
assert.equal(arrivedOnce.sessions.sD.lastMovementTransition?.kind, "ARRIVED");
assert.equal(arrivedOnce.sessions.sD.lastMovementTransition?.token, "arrive-26");
assert.equal(arrivedOnce.sessions.sD.lastMovementTransition?.contaminationDeltas?.test_c, 1, "the terminal marker must record the positive ambient delta");
assert.equal(arrivedOnce.characters.test_c.contamination, 1, "actual chance-miss arrival must apply ambient contamination once");

for (const [index, runtime] of [cloudA, cloudB, cloudC].entries()) {
  assert.equal(runtime.applyRemoteState({ revision: 10 + index, state: structuredClone(arrivalRunning) }), false, "a canonical stale ARRIVED snapshot must be absorbed without a redundant GLOBAL write");
  const afterStaleArrival = currentWorld();
  assert.equal(afterStaleArrival.sessions.sD.movement, null, "each stale runtime must preserve the accepted ARRIVED transition");
  assert.equal(afterStaleArrival.sessions.sD.lastMovementTransition?.token, "arrive-26");
  assert.equal(afterStaleArrival.characters.test_c.contamination, 1, "each stale runtime must replay the marker delta exactly once onto its remote basis");
  arrivalApp.api.scheduleMovement(arrivalApp.api.loadState().sessions.sD);
  arrivalApp.clock.advance(1);
}
arrivalApp.api.completeMovement("sD", "arrive-26");
arrivalApp.api.completeMovement("sD", "arrive-26");

const finalArrival = currentWorld();
const arrivalLogs = (sessionId) => finalArrival.sessions[sessionId].logs.filter((entry) => entry.movementToken === "arrive-26");
assert.equal(finalArrival.sessions.sD.movement, null);
assert.equal(finalArrival.sessions.sD.currentNode, "E_ENTRY");
assert.equal(finalArrival.sessions.sD.lastMovementTransition?.token, "arrive-26");
assert.equal(finalArrival.characters.test_c.contamination, 1, "stale applies and duplicate callbacks must not reapply the positive ambient delta");
assert.equal(finalArrival.sessions.sD.lastMovementTransition?.contaminationDeltas?.test_c, 1);
assert.equal(arrivalLogs("sD").filter((entry) => entry.type === "chat-divider").length, 1, "arrival divider must be emitted exactly once");
assert.equal(arrivalLogs("sD").filter((entry) => entry.type === "scene").length, 1, "arrival result must be emitted exactly once");
assert.equal(arrivalLogs("sAB").filter((entry) => entry.type === "presence").length, 1, "arrival witness presence must be emitted exactly once");

// Exercise the production failure topology all the way through a two-hazard
// encounter. The movement first terminates as ENCOUNTER, then two actual
// resolveHazard mutations must promote that same token to ARRIVED atomically.
// A/B/C subsequently receive the original in-flight snapshot independently.
const hazardRunning = movementWorld();
hazardRunning.sessions.sAB.variant = "d";
hazardRunning.sessions.sAB.currentNode = "E_G_PLAZA";
hazardRunning.sessions.sAB.activeEncounter = {
  routeId: "E_R001_REV", fromNode: "E_G_PLAZA", targetNode: "E_ENTRY",
  hazards: ["HZ_TEMP_04", "HZ_WATER_02"], currentIndex: 0, resolutions: [],
};
hazardRunning.sessions.sAB.logs = [];
hazardRunning.sessions.sAB.choiceReveal = { type: "persistent-menu", at: 1 };
delete hazardRunning.sessions.sC;
hazardRunning.sessions.sH = {
  id: "sH", status: "ACTIVE", variant: "d", memberIds: ["test_c"],
  currentNode: "E_G_PLAZA", currentDetailId: null,
  movement: {
    token: "hazard-0", routeId: "E_R001_REV", fromNode: "E_G_PLAZA", targetNode: "E_ENTRY",
    actorId: "test_c", startedAt: 100_000, resolveAt: 101_800, actionText: "", itemUse: null,
  },
  activeEncounter: null, choiceReveal: null, inspectedObjectIds: [], takenItemKeys: [], logs: [],
};
sharedValues.set(GLOBAL_KEY, JSON.stringify(hazardRunning));
const hazardApp = makeAppRuntime({ gameplayVariance: true });
hazardApp.api.scheduleMovement(hazardApp.api.loadState().sessions.sH);
hazardApp.clock.advance(1800);

const hazardEncounter = currentWorld();
assert.equal(hazardEncounter.sessions.sH.lastMovementTransition?.kind, "ENCOUNTER");
assert.equal(hazardEncounter.sessions.sH.lastMovementTransition?.token, "hazard-0");
assert.equal(hazardEncounter.sessions.sH.activeEncounter?.hazards?.length, 2, "variant D must enter its real two-hazard route");
assert.equal(hazardEncounter.sessions.sH.activeEncounter?.currentIndex, 0);

// A/B finish their own route while C is resolving the encounter. This leaves
// both a route witness and an arrival witness in the same real interleaving.
hazardEncounter.sessions.sAB.currentNode = "E_ENTRY";
hazardEncounter.sessions.sAB.activeEncounter = null;
sharedValues.set(GLOBAL_KEY, JSON.stringify(hazardEncounter));

hazardApp.api.resolveHazard("sH", "first careful attempt");
const afterFirstHazard = currentWorld();
assert.equal(afterFirstHazard.sessions.sH.activeEncounter?.currentIndex, 1, "the first real hazard action must advance only one step");
assert.equal(afterFirstHazard.sessions.sH.lastMovementTransition?.kind, "ENCOUNTER");
const partialHazardContamination = afterFirstHazard.characters.test_c.contamination;
assert.ok(partialHazardContamination > 0, "the partial ENCOUNTER fixture must carry a real cumulative hazard delta");
const staleInFlightAfterWitness = structuredClone(hazardRunning);
staleInFlightAfterWitness.sessions.sAB = structuredClone(afterFirstHazard.sessions.sAB);
hazardApp.api.resolveHazard("sH", "second careful attempt");

const completedHazards = currentWorld();
const completedMarker = completedHazards.sessions.sH.lastMovementTransition;
const completedContamination = completedHazards.characters.test_c.contamination;
assert.equal(completedHazards.sessions.sH.activeEncounter, null, "the final hazard action must clear the encounter");
assert.equal(completedHazards.sessions.sH.currentNode, "E_ENTRY", "the final hazard action must perform the arrival");
assert.equal(completedHazards.sessions.sH.movement, null);
assert.equal(completedMarker?.kind, "ARRIVED", "the accepted ENCOUNTER marker must be promoted to ARRIVED");
assert.equal(completedMarker?.token, "hazard-0", "hazard completion must retain the original movement identity");
assert.ok(completedMarker?.contaminationDeltas?.test_c > 0, "the marker must capture the cumulative hazard and ambient delta");
assert.equal(completedContamination, completedMarker.contaminationBaselines.test_c + completedMarker.contaminationDeltas.test_c);
assert.ok(completedContamination > partialHazardContamination, "the final ARRIVED terminal must include work beyond the partial ENCOUNTER");

// A remote partial marker may also contain contamination unrelated to this
// movement. Preserve that excess while replacing only the cumulative movement
// component with the accepted local terminal delta.
const partialWithUnrelatedContamination = structuredClone(afterFirstHazard);
const unrelatedDelta = 4;
partialWithUnrelatedContamination.characters.test_c.contamination += unrelatedDelta;
assert.equal(cloudA.applyRemoteState({ revision: 19, state: partialWithUnrelatedContamination }), true);
assert.equal(currentWorld().characters.test_c.contamination, completedContamination + unrelatedDelta, "unrelated remote contamination must survive terminal reconciliation");
assert.equal(cloudA.applyRemoteState({ revision: 19, state: partialWithUnrelatedContamination }), false, "repeated partial ingress with unrelated contamination must remain idempotent");
sharedValues.set(GLOBAL_KEY, JSON.stringify(completedHazards));

for (const [index, runtime] of [cloudA, cloudB, cloudC].entries()) {
  assert.equal(runtime.applyRemoteState({ revision: 20 + index, state: structuredClone(afterFirstHazard) }), false, "a stale partial ENCOUNTER must be absorbed after final hazard arrival");
  assert.equal(currentWorld().characters.test_c.contamination, completedContamination, "partial and terminal cumulative deltas must not be added together");
  assert.notEqual(currentWorld().characters.test_c.contamination, partialHazardContamination + completedContamination, "partial ingress must never turn a cumulative delta into an additive delta");
  assert.equal(runtime.applyRemoteState({ revision: 30 + index, state: structuredClone(afterFirstHazard) }), false, "repeated partial ingress must remain idempotent");
  assert.equal(runtime.applyRemoteState({ revision: 40 + index, state: structuredClone(staleInFlightAfterWitness) }), false, "the original stale in-flight snapshot must also be absorbed");
  const afterStaleHazard = currentWorld();
  assert.equal(afterStaleHazard.sessions.sH.movement, null, "stale A/B/C state must not revive the resolved movement");
  assert.equal(afterStaleHazard.sessions.sH.activeEncounter, null, "stale A/B/C state must not revive the resolved encounter");
  assert.equal(afterStaleHazard.sessions.sH.currentNode, "E_ENTRY");
  assert.equal(afterStaleHazard.sessions.sH.lastMovementTransition?.kind, "ARRIVED");
  assert.equal(afterStaleHazard.sessions.sH.lastMovementTransition?.token, "hazard-0");
  assert.equal(afterStaleHazard.characters.test_c.contamination, completedContamination, "marker contamination must be replayed exactly once");
  hazardApp.api.scheduleMovement(hazardApp.api.loadState().sessions.sH);
  assert.equal(hazardApp.api.timer("sH"), null, "an ARRIVED marker must never schedule another movement callback");
  hazardApp.clock.advance(1);
}
hazardApp.api.completeMovement("sH", "hazard-0");
hazardApp.api.completeMovement("sH", "hazard-0");

const finalHazardArrival = currentWorld();
const hazardTokenLogs = (sessionId) => tokenLogs(finalHazardArrival, sessionId, "hazard-0");
assert.equal(finalHazardArrival.sessions.sH.movement, null);
assert.equal(finalHazardArrival.sessions.sH.activeEncounter, null);
assert.equal(finalHazardArrival.sessions.sH.currentNode, "E_ENTRY");
assert.equal(finalHazardArrival.sessions.sH.lastMovementTransition?.kind, "ARRIVED");
assert.equal(finalHazardArrival.characters.test_c.contamination, completedContamination, "stale applies and overdue callbacks must not duplicate terminal exposure");
assert.equal(hazardTokenLogs("sH").filter((entry) => entry.movementEffect === "encounter-divider").length, 1);
assert.equal(hazardTokenLogs("sH").filter((entry) => entry.movementEffect === "encounter-risk").length, 1);
assert.equal(hazardTokenLogs("sH").filter((entry) => entry.movementEffect === "arrival-divider").length, 1, "final hazard arrival divider must be emitted exactly once");
assert.equal(hazardTokenLogs("sH").filter((entry) => entry.movementEffect?.startsWith("hazard:")).length, 2, "each real hazard result must be emitted once");
assert.equal(hazardTokenLogs("sAB").filter((entry) => entry.movementEffect === "route-presence").length, 1);
assert.equal(hazardTokenLogs("sAB").filter((entry) => entry.movementEffect === "arrival-presence").length, 1, "final hazard arrival witness presence must be emitted exactly once");
assert.equal(hazardApp.api.timer("sH"), null);

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.match(appSource, /data-suggested-action[\s\S]*?ui\.actionText\s*=\s*`\//, "suggestion click must keep its pre-existing fill-only behavior");
assert.doesNotMatch(appSource.match(/querySelectorAll\("\[data-suggested-action\]"\)[\s\S]*?\}\)\);/)?.[0] || "", /handleChatInput|resolveHazard/, "suggestion click must not silently submit the selected action");

console.log("PASS: three independent auth runtimes sharing localStorage preserve one movement terminal transition and one set of side effects");
