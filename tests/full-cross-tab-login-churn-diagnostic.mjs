import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const appSource = fs.readFileSync("app.js", "utf8");
const entrySource = fs.readFileSync("entry-presence-fix.js", "utf8");
const guardSource = fs.readFileSync("guest-world-isolation.js", "utf8");
const indexSource = fs.readFileSync("index.html", "utf8");

// The original failure mechanism remains documented here: app.js rebuilds the
// page for every shared-world storage event. The early guest isolation guard must
// therefore be loaded before every world module so this listener is unreachable
// while the tab is logged out.
const storageListenerIndex = appSource.indexOf('window.addEventListener("storage"');
assert.ok(storageListenerIndex >= 0, "app storage listener must exist for the regression model");
const storageListenerSnippet = appSource.slice(storageListenerIndex, storageListenerIndex + 260);
const baseAppWorldReactive = storageListenerSnippet.includes("GLOBAL_KEY")
  && storageListenerSnippet.includes("renderExternalUpdate");
assert.equal(baseAppWorldReactive, true, "test model expects the base app to remain world-reactive after login");

const guardTag = 'guest-world-isolation.js?v=0.4.1';
const guardIndex = indexSource.indexOf(guardTag);
assert.ok(guardIndex >= 0, "guest isolation must be loaded by index.html");
[
  "cloud-state-sync.js",
  "action-log-sync.js",
  "observation-final-guard.js",
  "sound-event-sync.js",
  "app.js",
  "entry-presence-fix.js",
].forEach((scriptName) => {
  const scriptIndex = indexSource.indexOf(scriptName);
  assert.ok(scriptIndex > guardIndex, `${scriptName} must load after guest isolation`);
});

class BasicEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.defaultPrevented = false;
    this.__stopped = false;
    Object.assign(this, init);
  }
  stopImmediatePropagation() { this.__stopped = true; }
  preventDefault() { this.defaultPrevented = true; }
}

class FakeStorage {
  constructor(backing, writeCounter = null) {
    this.backing = backing;
    this.writeCounter = writeCounter;
  }
  getItem(key) { return this.backing.has(String(key)) ? this.backing.get(String(key)) : null; }
  setItem(key, value) {
    this.backing.set(String(key), String(value));
    this.writeCounter?.(String(key));
  }
  removeItem(key) {
    this.backing.delete(String(key));
    this.writeCounter?.(String(key));
  }
}

const sourceSession = {
  id: "session_source",
  partyId: "party_source",
  status: "ACTIVE",
  variant: "a",
  currentNode: "E_ENTRY",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [],
};
const witnessSession = {
  id: "session_witness",
  partyId: "party_witness",
  status: "ACTIVE",
  variant: "a",
  currentNode: "E_ENTRY",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [],
};
const world = {
  version: 3,
  characters: {},
  parties: {
    party_source: { id: "party_source", name: "A조" },
    party_witness: { id: "party_witness", name: "관찰조" },
  },
  sessions: {
    [sourceSession.id]: sourceSession,
    [witnessSession.id]: witnessSession,
  },
};

let underlyingWorldWrites = 0;
const localValues = new Map([[GLOBAL_KEY, JSON.stringify(world)]]);
const sessionValues = new Map();
const localStorage = new FakeStorage(localValues, (key) => { if (key === GLOBAL_KEY) underlyingWorldWrites += 1; });
const sessionStorage = new FakeStorage(sessionValues);
const listeners = new Map();
let nextTimer = null;
const windowObject = {
  DAY1_DATA: { places: { E_ENTRY: { name: "입구" }, E_NEXT: { name: "다음" } } },
  addEventListener(type, listener, options) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push({ listener, capture: options === true || options?.capture === true });
  },
  dispatchEvent(event) {
    const ordered = [...(listeners.get(event?.type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const { listener } of ordered) {
      listener(event);
      if (event.__stopped) break;
    }
    return !event.defaultPrevented;
  },
};
const context = vm.createContext({
  console,
  window: windowObject,
  globalThis: windowObject,
  Storage: FakeStorage,
  localStorage,
  sessionStorage,
  StorageEvent: BasicEvent,
  Event: BasicEvent,
  CustomEvent: BasicEvent,
  Date,
  location: { href: "https://example.test/#/login", hash: "#/login" },
  clearTimeout() {},
  setTimeout(callback) { nextTimer = callback; return 1; },
});
windowObject.window = windowObject;
windowObject.localStorage = localStorage;
windowObject.sessionStorage = sessionStorage;

vm.runInContext(guardSource, context, { filename: "guest-world-isolation.js" });

// Simulate app.js registering after the early capture guard.
let baseAppRenderCount = 0;
windowObject.addEventListener("storage", (event) => {
  if (event.key === GLOBAL_KEY) baseAppRenderCount += 1;
});

const beforeGuestWrite = localStorage.getItem(GLOBAL_KEY);
localStorage.setItem(GLOBAL_KEY, JSON.stringify({ ...world, storyDay: 99 }));
assert.equal(localStorage.getItem(GLOBAL_KEY), beforeGuestWrite,
  "logged-out tabs must not write the shared world");
assert.equal(underlyingWorldWrites, 0, "guest write must be stopped before the underlying Storage implementation");

windowObject.dispatchEvent(new BasicEvent("storage", {
  key: GLOBAL_KEY,
  oldValue: beforeGuestWrite,
  newValue: JSON.stringify({ ...world, storyDay: 2 }),
  storageArea: localStorage,
}));
assert.equal(baseAppRenderCount, 0,
  "logged-out login UI must not rebuild on sibling world changes");

// The previously reproduced entry-presence path is loaded globally even on the
// login route. It must now stay inert until this tab is authenticated.
vm.runInContext(entrySource, context, { filename: "entry-presence-fix.js" });
assert.equal(typeof nextTimer, "function", "guest presence reconciler may keep a low-frequency wake-up for same-document legacy login");
const externallyChanged = JSON.parse(localValues.get(GLOBAL_KEY));
externallyChanged.sessions.session_source.movement = {
  token: "move_1",
  fromNode: "E_ENTRY",
  targetNode: "E_NEXT",
  startedAt: Date.now(),
};
localValues.set(GLOBAL_KEY, JSON.stringify(externallyChanged)); // A sibling tab's legitimate write
const guestReconcile = nextTimer;
nextTimer = null;
guestReconcile();
assert.equal(underlyingWorldWrites, 0,
  "entry presence must not write from an unauthenticated B tab");
assert.equal(baseAppRenderCount, 0,
  "guest B must remain paint-stable while A changes the world");

// Once B authenticates, the same primitives must work normally.
sessionStorage.setItem(USER_KEY, "bbbbbbbb-2222-4222-8222-222222222222");
const authenticatedRaw = JSON.stringify({ ...externallyChanged, storyDay: 3 });
localStorage.setItem(GLOBAL_KEY, authenticatedRaw);
assert.equal(localStorage.getItem(GLOBAL_KEY), authenticatedRaw, "authenticated tab must retain normal shared-world writes");
assert.equal(underlyingWorldWrites, 1, "authenticated write should reach the underlying Storage implementation once");
windowObject.dispatchEvent(new BasicEvent("storage", {
  key: GLOBAL_KEY,
  oldValue: beforeGuestWrite,
  newValue: authenticatedRaw,
  storageArea: localStorage,
}));
assert.equal(baseAppRenderCount, 1, "authenticated tabs must still receive world updates");

const stats = windowObject.__BAEKJI_GUEST_WORLD_ISOLATION__.stats();
console.log("diagnostic: guest isolation stats =", JSON.stringify(stats));
console.log("PASS: logged-out sibling tabs cannot write the shared world or churn the login DOM; authenticated tabs remain synchronized");
