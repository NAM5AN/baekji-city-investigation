import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const OVERLAY_PREFIX = "baekji_city_cloud_unsynced_v1:";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function eventually(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

function makeWorld(userId, label) {
  return {
    version: 3,
    characters: { [userId]: { id: userId, label, contamination: userId === "test_a" ? 17 : 0, inventory: {} } },
    sessions: userId === "test_a" ? {
      sA: {
        id: "sA", status: "ACTIVE", variant: "a", memberIds: ["test_a"], currentNode: "E_G_PLAZA",
        currentDetailId: null, movement: null, activeEncounter: null, choiceReveal: null,
        lastMovementTransition: { token: "move-a", kind: "ARRIVED", routeId: "E_R001", fromNode: "E_ENTRY", targetNode: "E_G_PLAZA", completedAt: 1900 },
        inspectedObjectIds: [], takenItemKeys: [], logs: [{ id: `a-${label}`, type: "interaction", actorId: "test_a", at: 200, text: label }],
      },
    } : {
      sB: { id: "sB", status: "ACTIVE", variant: "b", memberIds: ["test_b"], currentNode: "E_ENTRY", currentDetailId: null, movement: null, activeEncounter: null, choiceReveal: null, inspectedObjectIds: [], takenItemKeys: [], logs: [] },
    },
    parties: {},
  };
}

function makeOverlayRecord(ownerId, state, base = state, generation = 1) {
  return JSON.stringify({
    format: 1,
    ownerId,
    generation,
    baseRaw: JSON.stringify(base),
    stateRaw: JSON.stringify(state),
  });
}

function overlayState(raw) {
  const record = JSON.parse(raw || "null");
  return record?.stateRaw ? JSON.parse(record.stateRaw) : null;
}

function createHarness(startAt = 100_000) {
  class FakeStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }

  let now = startAt;
  let nextTimerId = 0;
  const timers = new Map();
  function setTimeout(callback, delay = 0) {
    const id = ++nextTimerId;
    timers.set(id, { callback, delay: Number(delay) || 0, dueAt: now + (Number(delay) || 0) });
    return id;
  }
  function clearTimeout(id) { timers.delete(id); }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  async function advance(ms) {
    const target = now + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.dueAt;
      await timer.callback();
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    }
    now = target;
  }

  function target() {
    const listeners = new Map();
    return {
      addEventListener(type, callback) { const list = listeners.get(type) || []; list.push(callback); listeners.set(type, list); },
      dispatchEvent(event) { (listeners.get(event.type) || []).forEach((callback) => callback(event)); return true; },
    };
  }
  class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
  class FakeStorageEvent extends FakeEvent {}
  class FakeCustomEvent extends FakeEvent { constructor(type, init = {}) { super(type, init); this.detail = init.detail; } }

  const localStorage = new FakeStorage();
  const sessionStorage = new FakeStorage();
  const window = target();
  const document = { ...target(), hidden: false, documentElement: { dataset: {} } };
  const fetchCalls = [];
  const fetchPlans = [];
  async function fetch(url, options = {}) {
    const call = { url, body: JSON.parse(options.body || "null"), userId: sessionStorage.getItem(USER_KEY) };
    fetchCalls.push(call);
    const plan = fetchPlans.shift();
    if (plan === undefined) throw new Error("unexpected cloud request");
    const result = typeof plan === "function" ? await plan(call) : await plan;
    return { ok: true, status: 200, async json() { return result; } };
  }

  const storageDispatches = [];
  window.addEventListener("storage", () => storageDispatches.push(sessionStorage.getItem(USER_KEY)));

  let source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
  const footer = /  ensureBootstrap\(\);\r?\n\}\)\(\);\s*$/;
  assert.match(source, footer);
  source = source.replace(footer, `
    window.__AUTH_RACE_RUNTIME__ = Object.freeze({
      flushPush, pollOnce, bootstrap, scheduleRecovery, recoverUnsyncedOverlay,
      prime(raw, revisionValue = 0, pending = true) {
        clearTimeout(pushTimer); clearTimeout(pollTimer); clearTimeout(recoveryTimer);
        nativeSetItem.call(localStorage, GLOBAL_KEY, raw);
        initialized = true; bootstrapInFlight = false; applyingRemote = false; pushInFlight = false;
        pendingRaw = pending ? raw : null; revision = revisionValue;
        pushTimer = 0; pollTimer = 0; recoveryTimer = 0; recoveryNotBefore = 0;
        unsyncedRaw = null; loadUnsyncedOverlay();
      },
      nativeGlobal(raw) { nativeSetItem.call(localStorage, GLOBAL_KEY, raw); },
      state() { return { initialized, pendingRaw, pendingGeneration, revision, unsyncedRaw, unsyncedGeneration, recoveryTimer, recoveryNotBefore, pushInFlight }; },
    });
  })();`);

  const context = vm.createContext({
    window, document, localStorage, sessionStorage, Storage: FakeStorage,
    StorageEvent: FakeStorageEvent, CustomEvent: FakeCustomEvent, Event: FakeEvent,
    location: { href: "https://example.test/" }, fetch, AbortController,
    Date: ClockDate, Math, JSON, String, Object, Array, Set, Map, Promise,
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(source, context, { filename: "cloud-state-sync.js" });
  return {
    api: window.__BAEKJI_CLOUD_SYNC_TEST__, runtime: window.__AUTH_RACE_RUNTIME__,
    localStorage, sessionStorage, fetchCalls, fetchPlans, storageDispatches, timers,
    advance, now: () => now,
  };
}

async function runFlushRace(resultKind) {
  const h = createHarness();
  const a = makeWorld("test_a", `flush-${resultKind}`);
  const b = makeWorld("test_b", "B-safe");
  h.sessionStorage.setItem(USER_KEY, "test_a");
  h.localStorage.setItem(`${OVERLAY_PREFIX}test_a`, makeOverlayRecord("test_a", a));
  h.runtime.prime(JSON.stringify(a), 10, true);
  const response = deferred();
  h.fetchPlans.push(response.promise);
  if (resultKind === "conflict") {
    h.fetchPlans.push([{ accepted: false, revision: 12, state: makeWorld("test_a", "remote-2") }]);
    h.fetchPlans.push([{ accepted: false, revision: 13, state: makeWorld("test_a", "remote-3") }]);
  }
  const flush = h.runtime.flushPush();
  await eventually(() => h.fetchCalls.length === 1, "A flush must reach its deferred PUT");
  h.sessionStorage.removeItem(USER_KEY);
  h.sessionStorage.setItem(USER_KEY, "test_b");
  h.runtime.nativeGlobal(JSON.stringify(b));
  const bOverlayBefore = h.localStorage.getItem(`${OVERLAY_PREFIX}test_b`);
  const dispatchesBefore = h.storageDispatches.length;
  response.resolve(resultKind === "accepted"
    ? [{ accepted: true, revision: 11, state: a }]
    : [{ accepted: false, revision: 11, state: makeWorld("test_a", "remote-1") }]);
  await flush;
  assert.deepEqual(JSON.parse(h.localStorage.getItem(GLOBAL_KEY)), b, `late A ${resultKind} response must not change B's GLOBAL state`);
  assert.equal(h.localStorage.getItem(`${OVERLAY_PREFIX}test_b`), bOverlayBefore, `late A ${resultKind} response must not touch B's overlay`);
  assert.equal(h.storageDispatches.length, dispatchesBefore, `late A ${resultKind} response must not dispatch under B`);
  assert.equal([...h.timers.values()].filter((timer) => timer.delay === 350 || timer.delay >= 4000).length, 0, `late A ${resultKind} response must not schedule B timers`);
  assert.ok(overlayState(h.localStorage.getItem(`${OVERLAY_PREFIX}test_a`))?.sessions?.sA?.lastMovementTransition, "A's captured overlay must remain recoverable after identity switch");
  assert.equal(h.fetchCalls.length, 1, "identity switch must stop the old logical batch after its deferred response");
  h.sessionStorage.setItem(USER_KEY, "test_a");
  assert.equal(h.api.loadUnsyncedOverlay()?.sessions.sA.lastMovementTransition.token, "move-a", "A re-authentication must load only A's captured overlay");
}

await runFlushRace("accepted");
await runFlushRace("conflict");

{
  const h = createHarness();
  const a = makeWorld("test_a", "poll-A");
  const b = makeWorld("test_b", "poll-B");
  h.sessionStorage.setItem(USER_KEY, "test_a");
  h.runtime.prime(JSON.stringify(a), 20, false);
  const revisionResponse = deferred();
  h.fetchPlans.push(revisionResponse.promise);
  const poll = h.runtime.pollOnce(false);
  await eventually(() => h.fetchCalls.length === 1, "A poll must reach its deferred revision request");
  h.sessionStorage.setItem(USER_KEY, "test_b");
  h.runtime.nativeGlobal(JSON.stringify(b));
  const dispatchesBefore = h.storageDispatches.length;
  revisionResponse.resolve(21);
  await poll;
  assert.deepEqual(JSON.parse(h.localStorage.getItem(GLOBAL_KEY)), b, "late A poll revision must not apply under B");
  assert.equal(h.fetchCalls.length, 1, "late A poll revision must not issue a state read as B");
  assert.equal(h.storageDispatches.length, dispatchesBefore);
}

{
  const h = createHarness();
  const a = makeWorld("test_a", "recover-A");
  const b = makeWorld("test_b", "recover-B");
  h.sessionStorage.setItem(USER_KEY, "test_a");
  h.localStorage.setItem(`${OVERLAY_PREFIX}test_a`, makeOverlayRecord("test_a", a));
  h.runtime.prime(JSON.stringify(a), 30, false);
  h.api.loadUnsyncedOverlay();
  h.runtime.scheduleRecovery();
  const recovery = [...h.timers.entries()].find(([, timer]) => timer.delay >= 4000);
  assert.ok(recovery);
  h.sessionStorage.setItem(USER_KEY, "test_b");
  h.runtime.nativeGlobal(JSON.stringify(b));
  h.timers.delete(recovery[0]);
  await recovery[1].callback();
  assert.equal(h.fetchCalls.length, 0, "A recovery timer firing after B login must not PUT under B");
  assert.deepEqual(JSON.parse(h.localStorage.getItem(GLOBAL_KEY)), b);
  assert.equal(h.localStorage.getItem(`${OVERLAY_PREFIX}test_b`), null);
  assert.equal(h.storageDispatches.length, 0);

  const bNext = structuredClone(b);
  bNext.characters.test_b.label = "B-independent";
  h.fetchPlans.push([{ accepted: true, revision: 31, state: bNext }]);
  h.localStorage.setItem(GLOBAL_KEY, JSON.stringify(bNext));
  const bPush = [...h.timers.entries()].find(([, timer]) => timer.delay === 120);
  assert.ok(bPush, "B must retain independent sync after stale A recovery is rejected");
  h.timers.delete(bPush[0]);
  await bPush[1].callback();
  await eventually(() => h.fetchCalls.length === 1, "B independent PUT must complete");
  assert.equal(h.fetchCalls[0].userId, "test_b");
  assert.equal(h.fetchCalls[0].body.p_state.characters.test_b.label, "B-independent");
}

{
  const h = createHarness(200_000);
  const a = makeWorld("test_a", "starvation");
  h.sessionStorage.setItem(USER_KEY, "test_a");
  h.localStorage.setItem(`${OVERLAY_PREFIX}test_a`, makeOverlayRecord("test_a", a));
  h.runtime.prime(JSON.stringify(a), 40, false);
  h.api.loadUnsyncedOverlay();
  h.runtime.scheduleRecovery();
  const initialTimerId = h.runtime.state().recoveryTimer;
  const initialDueAt = h.timers.get(initialTimerId).dueAt;
  for (let poll = 0; poll < 2; poll += 1) {
    await h.advance(1500);
    h.fetchPlans.push(40);
    await h.runtime.pollOnce(false);
    assert.equal(h.runtime.state().recoveryTimer, initialTimerId, "same-revision poll cadence must not replace the recovery timer");
    assert.equal(h.timers.get(initialTimerId).dueAt, initialDueAt, "same-revision poll cadence must not postpone the quiet deadline");
    assert.equal(h.fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length, 0);
  }
  h.fetchPlans.push([{ accepted: true, revision: 41, state: a }]);
  await h.advance(1000);
  assert.equal(h.fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length, 1, "the original quiet deadline must fire one recovery PUT despite same-revision polls");
  assert.equal(h.localStorage.getItem(`${OVERLAY_PREFIX}test_a`), null);
  assert.equal(h.runtime.state().recoveryTimer, 0);
  await h.advance(500);
  h.fetchPlans.push(41);
  await h.runtime.pollOnce(false);
  assert.equal(h.fetchCalls.filter((call) => call.url.includes("baekji_mvp_put_state")).length, 1, "the third 1.5s cadence poll after recovery must not duplicate the completed PUT");
}

console.log("PASS: cloud sync async responses stay identity-scoped and same-revision polling cannot starve durable recovery");
