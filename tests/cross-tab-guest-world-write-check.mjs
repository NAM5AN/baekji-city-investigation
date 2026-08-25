import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const cloudSource = fs.readFileSync("cloud-state-sync.js", "utf8");
const testerAuthSource = fs.readFileSync("tester-auth.js", "utf8");
const guestIsolationSource = fs.readFileSync("guest-world-isolation.js", "utf8");
const worldPersistenceSource = fs.readFileSync("world-persistence.js", "utf8");

const initialWorld = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: {
    logged_user: {
      id: "logged_user",
      contamination: 0,
      symptom: "안정",
      inventory: {},
      currentPartyId: null,
      currentSessionId: null,
      onlineAt: null,
    },
  },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const remoteWorld = structuredClone(initialWorld);
remoteWorld.eventSeq = 7;

function sleep(ms = 35) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTimerSet() {
  const active = new Set();
  return {
    setTimeout(fn, delay = 0, ...args) {
      if (Number(delay) > 80) return 0;
      const handle = setTimeout(() => {
        active.delete(handle);
        fn(...args);
      }, delay);
      active.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      if (!handle) return;
      clearTimeout(handle);
      active.delete(handle);
    },
    clearAll() {
      active.forEach((handle) => clearTimeout(handle));
      active.clear();
    },
  };
}

function createTab({ shared, sessionEntries = [], fetchImpl, countSharedWrites = false }) {
  const timers = makeTimerSet();
  let sharedWrites = 0;
  let crossTabStorageEvents = 0;
  const listeners = new Map();

  class FakeStorage {
    constructor(backing, sharedArea = false) {
      this.backing = backing;
      this.sharedArea = sharedArea;
    }
    getItem(key) {
      return this.backing.has(String(key)) ? this.backing.get(String(key)) : null;
    }
    setItem(key, value) {
      const normalizedKey = String(key);
      const normalizedValue = String(value);
      const previous = this.getItem(normalizedKey);
      this.backing.set(normalizedKey, normalizedValue);
      if (this.sharedArea && countSharedWrites && normalizedKey === GLOBAL_KEY && previous !== normalizedValue) {
        sharedWrites += 1;
        crossTabStorageEvents += 1;
      }
    }
    removeItem(key) {
      this.backing.delete(String(key));
    }
  }

  const localStorage = new FakeStorage(shared, true);
  const sessionStorage = new FakeStorage(new Map(sessionEntries), false);
  const documentElement = { dataset: {}, classList: { toggle() {} } };

  class BasicEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  const context = vm.createContext({
    console,
    structuredClone,
    queueMicrotask,
    AbortController,
    Event: BasicEvent,
    CustomEvent: BasicEvent,
    StorageEvent: BasicEvent,
    HashChangeEvent: BasicEvent,
    Storage: FakeStorage,
    localStorage,
    sessionStorage,
    location: { href: "https://example.test/#/login", hash: "#/login", pathname: "/", search: "" },
    history: { replaceState() {} },
    document: {
      hidden: false,
      documentElement,
      body: { append() {}, appendChild() {} },
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, dataset: {}, append() {}, remove() {} }; },
    },
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval() { return 0; },
    clearInterval() {},
    fetch: fetchImpl,
  });

  context.window = context;
  context.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  context.removeEventListener = () => {};
  context.dispatchEvent = (event) => {
    (listeners.get(event?.type) || []).forEach((listener) => listener(event));
    return true;
  };

  return {
    context,
    timers,
    stats() { return { sharedWrites, crossTabStorageEvents }; },
  };
}

async function probeCloudSyncGuest() {
  const shared = new Map([[GLOBAL_KEY, JSON.stringify(initialWorld)]]);
  const tab = createTab({
    shared,
    countSharedWrites: true,
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("baekji_mvp_get_state")) {
        return { ok: true, status: 200, async json() { return [{ state: remoteWorld, revision: 2 }]; } };
      }
      if (target.includes("baekji_mvp_get_revision")) {
        return { ok: true, status: 200, async json() { return 2; } };
      }
      if (target.includes("baekji_mvp_put_state")) {
        return { ok: true, status: 200, async json() { return [{ accepted: true, revision: 2, state: remoteWorld }]; } };
      }
      throw new Error(`unexpected fetch: ${target}`);
    },
  });

  vm.runInContext(cloudSource, tab.context, { filename: "cloud-state-sync.js" });
  await sleep();
  tab.timers.clearAll();
  return tab.stats();
}

async function probeTesterDirectoryGuest() {
  const shared = new Map([[GLOBAL_KEY, JSON.stringify(initialWorld)]]);
  const tab = createTab({
    shared,
    countSharedWrites: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return [{
          id: "755ccd33-676f-48c8-a825-c9a28b56ac3e",
          character_name: "산",
          profile_photo: "data:image/jpeg;base64,AA==",
        }];
      },
    }),
  });

  vm.runInContext(guestIsolationSource, tab.context, { filename: "guest-world-isolation.js" });
  vm.runInContext(worldPersistenceSource, tab.context, { filename: "world-persistence.js" });
  vm.runInContext(testerAuthSource, tab.context, { filename: "tester-auth.js" });
  await sleep();
  tab.timers.clearAll();
  return tab.stats();
}

const cloudGuest = await probeCloudSyncGuest();
const directoryGuest = await probeTesterDirectoryGuest();

console.log("diagnostic: guest cloud sync shared writes =", cloudGuest.sharedWrites);
console.log("diagnostic: guest tester directory shared writes =", directoryGuest.sharedWrites);

assert.equal(
  cloudGuest.sharedWrites,
  0,
  "a logged-out tab must not replace the shared world through cloud-state-sync",
);
assert.equal(
  directoryGuest.sharedWrites,
  0,
  "a logged-out tab must not repair/write the shared world while loading the tester directory",
);
assert.equal(
  cloudGuest.crossTabStorageEvents + directoryGuest.crossTabStorageEvents,
  0,
  "opening a logged-out sibling tab must not emit shared-world storage events into the logged-in tab",
);
assert.equal(
  String(new Map().get(USER_KEY) || ""),
  "",
  "diagnostic harness intentionally represents a logged-out sibling tab",
);

console.log("PASS: logged-out sibling tabs stay read-only against the shared game world");
