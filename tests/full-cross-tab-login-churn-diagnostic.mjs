import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const GUEST_KEY = "baekji_city_mvp_guest_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const ACTOR_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const appSource = fs.readFileSync("app.js", "utf8");
const cloudSource = fs.readFileSync("cloud-state-sync.js", "utf8");
const persistenceSource = fs.readFileSync("world-persistence.js", "utf8");
const indexSource = fs.readFileSync("index.html", "utf8");

assert.doesNotMatch(cloudSource, /Storage\.prototype|baekji_mvp_put_state/, "cloud sync must be projection-only");
assert.doesNotMatch(indexSource, /guest-world-isolation\.js|entry-presence-fix\.js|entry-presence-party-label-fix\.js/, "legacy guest/presence snapshot writers must stay outside the production boot path");

class FakeStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

class EventHub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const entries = this.listeners.get(type) || [];
    entries.push(callback);
    this.listeners.set(type, entries);
  }
  dispatchEvent(event) {
    for (const callback of [...(this.listeners.get(event?.type) || [])]) callback(event);
    return true;
  }
}

class BrowserEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
}

class FakeBroadcastChannel extends EventHub {
  static channels = [];
  constructor(name) { super(); this.name = name; FakeBroadcastChannel.channels.push(this); }
  postMessage(data) {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this && channel.name === this.name) queueMicrotask(() => channel.dispatchEvent(new BrowserEvent("message", { data })));
    }
  }
}

const canonical = JSON.stringify({ version: 3, storyDay: 1, characters: {}, parties: {}, sessions: {} });
const guest = JSON.stringify({ version: 3, storyDay: 90, characters: {}, parties: {}, sessions: {} });
const localStorage = new FakeStorage({ [GLOBAL_KEY]: canonical, [GUEST_KEY]: guest });
const sessionStorage = new FakeStorage();
const window = new EventHub();
const document = new EventHub();
document.hidden = false;
window.window = window;
window.localStorage = localStorage;
window.sessionStorage = sessionStorage;

let serverRevision = 7;
let serverState = { version: 3, storyDay: 2, characters: { [ACTOR_ID]: { id: ACTOR_ID } }, parties: {}, sessions: {} };
const fetchCalls = [];
const timers = new Map();
let timerSequence = 0;
const context = vm.createContext({
  console,
  window,
  globalThis: window,
  document,
  localStorage,
  sessionStorage,
  navigator: { onLine: true },
  BroadcastChannel: FakeBroadcastChannel,
  CustomEvent: BrowserEvent,
  Event: BrowserEvent,
  queueMicrotask,
  setTimeout(callback, delay = 0) { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  async fetch(url, options) {
    fetchCalls.push({ url, options });
    return { ok: true, status: 200, async json() { return { ok: true, revision: serverRevision, actorId: ACTOR_ID, state: structuredClone(serverState) }; } };
  },
});
window.navigator = context.navigator;
vm.runInContext(persistenceSource, context, { filename: "world-persistence.js" });
vm.runInContext(cloudSource, context, { filename: "cloud-state-sync.js" });

const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
const sync = window.__BAEKJI_CLOUD_SYNC__;
const observed = [];
persistence.subscribe((raw) => observed.push(raw));

assert.equal(persistence.readRaw(), guest, "a logged-out tab must read only its isolated guest world");
const guestUpdate = JSON.stringify({ version: 3, storyDay: 91, characters: {}, parties: {}, sessions: {} });
persistence.writeRaw(guestUpdate);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(localStorage.getItem(GUEST_KEY), guestUpdate);
assert.equal(localStorage.getItem(GLOBAL_KEY), canonical, "guest writes must never alter the canonical legacy key");

sessionStorage.setItem(USER_KEY, ACTOR_ID);
window.dispatchEvent(new BrowserEvent("baekji-player-session-adopted", { detail: { user: { id: ACTOR_ID } } }));
await new Promise((resolve) => setImmediate(resolve));
const firstProjection = JSON.stringify(serverState);
assert.equal(fetchCalls.at(-1)?.url, "/api/player-world-projection", "login adoption must execute the real projection request path");
assert.equal(persistence.isRemoteActive(), true);
assert.equal(persistence.readRaw(), firstProjection, "login adoption must settle the actor-bound projection in memory");
assert.equal(sync.actorId(), ACTOR_ID);

// Execute the exact app ingress function in isolation. It deliberately ignores
// the StorageEvent bytes and re-reads the projection adapter, so a stale sibling
// write cannot replace an authenticated render snapshot.
const ingestStart = appSource.indexOf("  function ingestWorldRaw(raw) {");
const ingestEnd = appSource.indexOf("\n\n  persistence.subscribe(ingestWorldRaw);", ingestStart);
assert.ok(ingestStart >= 0 && ingestEnd > ingestStart, "the production app ingress function must remain extractable for churn verification");
const ingestSource = appSource.slice(ingestStart, ingestEnd);
const appHarness = vm.createContext({
  projectionRaw: firstProjection,
  worldRaw: firstProjection,
  renderCount: 0,
  persistence: { readRaw() { return appHarness.projectionRaw; } },
  renderExternalUpdate() { appHarness.renderCount += 1; },
});
vm.runInContext(`${ingestSource}\nglobalThis.ingestWorldRaw = ingestWorldRaw;`, appHarness, { filename: "app-ingest-world-raw.js" });

const staleSiblingRaw = JSON.stringify({ version: 3, storyDay: 999, characters: {}, parties: {}, sessions: {} });
localStorage.setItem(GLOBAL_KEY, staleSiblingRaw);
appHarness.ingestWorldRaw(staleSiblingRaw);
assert.equal(appHarness.renderCount, 0, "authenticated app ingress must ignore stale sibling legacy-world bytes");
assert.equal(persistence.readRaw(), firstProjection, "legacy storage churn cannot replace the authoritative in-memory projection");

serverRevision = 8;
serverState = { ...serverState, storyDay: 3 };
const siblingChannel = new FakeBroadcastChannel("baekji-player-world-v1");
siblingChannel.postMessage({ type: "revision", revision: serverRevision, actorId: ACTOR_ID });
await new Promise((resolve) => setImmediate(resolve));
const secondProjection = JSON.stringify(serverState);
assert.equal(persistence.readRaw(), secondProjection, "a sibling revision invalidation must refetch the actor projection");
assert.equal(sync.revision(), 8);
appHarness.projectionRaw = secondProjection;
appHarness.ingestWorldRaw(staleSiblingRaw);
assert.equal(appHarness.renderCount, 1, "the app must repaint once when the adapter projection actually advances");

sessionStorage.removeItem(USER_KEY);
window.dispatchEvent(new BrowserEvent("baekji-player-session-logged-out"));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(persistence.isRemoteActive(), false, "logout must clear the private in-memory projection");
assert.equal(persistence.readRaw(), guestUpdate, "logout must return to the isolated guest snapshot");
assert.equal(sync.actorId(), "");
assert.ok(observed.includes(firstProjection) && observed.includes(secondProjection) && observed.includes(guestUpdate), "the app subscription path must observe login, cross-tab revision, and logout settlements");

console.log("PASS: real cloud sync and app ingress keep guest/login/cross-tab/logout churn projection-safe");
