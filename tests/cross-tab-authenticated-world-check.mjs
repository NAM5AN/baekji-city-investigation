import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const cloudSource = fs.readFileSync("cloud-state-sync.js", "utf8");
const testerAuthSource = fs.readFileSync("tester-auth.js", "utf8");
const identitySource = fs.readFileSync("tester-identity-state-repair.js", "utf8");

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";

const blankCharacter = (id) => ({
  id,
  contamination: 0,
  symptom: "안정",
  inventory: {},
  currentPartyId: null,
  currentSessionId: null,
  onlineAt: null,
});

const baseWorld = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: {
    [USER_A]: blankCharacter(USER_A),
    [USER_B]: blankCharacter(USER_B),
  },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const directoryRows = [
  { id: USER_A, character_name: "알파", profile_photo: "data:image/jpeg;base64,QQ==" },
  { id: USER_B, character_name: "베타", profile_photo: "data:image/jpeg;base64,Qg==" },
];

const sleep = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

function timerSet() {
  const active = new Set();
  return {
    setTimeout(fn, delay = 0, ...args) {
      if (Number(delay) > 200) return 0;
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

function remoteServer(initialState) {
  let state = structuredClone(initialState);
  let revision = 1;
  let puts = 0;
  let conflicts = 0;
  const writers = [];
  return {
    async fetch(url, options = {}) {
      const target = String(url);
      if (target.includes("kfgtvifupumjuewwxzmz.supabase.co")) {
        return { ok: true, status: 200, async json() { return structuredClone(directoryRows); } };
      }
      if (target.includes("baekji_mvp_get_state")) {
        return { ok: true, status: 200, async json() { return [{ state: structuredClone(state), revision }]; } };
      }
      if (target.includes("baekji_mvp_get_revision")) {
        return { ok: true, status: 200, async json() { return revision; } };
      }
      if (target.includes("baekji_mvp_put_state")) {
        const body = JSON.parse(options.body || "{}");
        puts += 1;
        writers.push(String(body.p_writer_id || ""));
        const expected = body.p_expected_revision == null ? null : Number(body.p_expected_revision);
        if (expected != null && expected !== revision) {
          conflicts += 1;
          return { ok: true, status: 200, async json() { return [{ accepted: false, revision, state: structuredClone(state) }]; } };
        }
        state = structuredClone(body.p_state);
        revision += 1;
        return { ok: true, status: 200, async json() { return [{ accepted: true, revision, state: structuredClone(state) }]; } };
      }
      throw new Error(`unexpected fetch: ${target}`);
    },
    snapshot() { return structuredClone(state); },
    stats() { return { revision, puts, conflicts, writers: [...writers] }; },
  };
}

function makeHub(initialWorld) {
  const backing = new Map([[GLOBAL_KEY, JSON.stringify(initialWorld)]]);
  const tabs = new Set();
  let globalWrites = 0;
  let nativeStorageEvents = 0;

  function register(tab) { tabs.add(tab); }

  function write(origin, key, value) {
    const k = String(key);
    const next = String(value);
    const previous = backing.has(k) ? backing.get(k) : null;
    backing.set(k, next);
    if (k === GLOBAL_KEY && previous !== next) {
      globalWrites += 1;
      for (const tab of tabs) {
        if (tab === origin) continue;
        nativeStorageEvents += 1;
        tab.emit(new tab.context.StorageEvent("storage", {
          key: k,
          oldValue: previous,
          newValue: next,
          storageArea: tab.context.localStorage,
          url: origin?.context?.location?.href || "https://example.test/",
        }));
      }
    }
  }

  return {
    backing,
    register,
    write,
    stats() { return { globalWrites, nativeStorageEvents }; },
  };
}

function createTab({ name, hub, server, userId = "" }) {
  const timers = timerSet();
  const listeners = new Map();
  const session = new Map(userId ? [[USER_KEY, userId]] : []);

  class BasicEvent {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  }

  let tab;
  class FakeStorage {
    constructor(kind) { this.kind = kind; }
    getItem(key) {
      const source = this.kind === "local" ? hub.backing : session;
      return source.has(String(key)) ? source.get(String(key)) : null;
    }
    setItem(key, value) {
      if (this.kind === "local") hub.write(tab, key, value);
      else session.set(String(key), String(value));
    }
    removeItem(key) {
      if (this.kind === "local") hub.backing.delete(String(key));
      else session.delete(String(key));
    }
  }

  const localStorage = new FakeStorage("local");
  const sessionStorage = new FakeStorage("session");
  const documentListeners = new Map();
  const documentElement = { dataset: {}, classList: { toggle() {} } };

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
    location: { href: `https://example.test/${name}#/login`, hash: "#/login", pathname: "/", search: "" },
    history: { replaceState() {} },
    document: {
      hidden: false,
      documentElement,
      body: { append() {}, appendChild() {} },
      addEventListener(type, fn) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(fn);
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, dataset: {}, append() {}, remove() {} }; },
    },
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval() { return 0; },
    clearInterval() {},
    fetch: server.fetch,
  });
  context.window = context;

  tab = {
    name,
    context,
    timers,
    emit(event) {
      (listeners.get(event?.type) || []).forEach((listener) => listener(event));
    },
    loginAs(id) { sessionStorage.setItem(USER_KEY, id); },
  };

  context.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  context.removeEventListener = () => {};
  context.dispatchEvent = (event) => { tab.emit(event); return true; };

  hub.register(tab);
  return tab;
}

function loadRuntime(tab) {
  vm.runInContext(testerAuthSource, tab.context, { filename: `${tab.name}:tester-auth.js` });
  vm.runInContext(cloudSource, tab.context, { filename: `${tab.name}:cloud-state-sync.js` });
  vm.runInContext(identitySource, tab.context, { filename: `${tab.name}:tester-identity-state-repair.js` });
}

function writeCharacter(tab, userId, patch) {
  const raw = tab.context.localStorage.getItem(GLOBAL_KEY);
  const state = JSON.parse(raw);
  state.characters ||= {};
  state.characters[userId] ||= blankCharacter(userId);
  Object.assign(state.characters[userId], patch);
  const nextRaw = JSON.stringify(state);
  tab.context.localStorage.setItem(GLOBAL_KEY, nextRaw);
  tab.context.dispatchEvent(new tab.context.StorageEvent("storage", {
    key: GLOBAL_KEY,
    oldValue: raw,
    newValue: nextRaw,
    storageArea: tab.context.localStorage,
    url: tab.context.location.href,
  }));
}

async function settle(ms = 190) { await sleep(ms); }

{
  const server = remoteServer(baseWorld);
  const hub = makeHub(baseWorld);
  const a = createTab({ name: "A", hub, server, userId: USER_A });
  const b = createTab({ name: "B", hub, server });
  loadRuntime(a);
  loadRuntime(b);
  await sleep(40);

  const beforeLogin = hub.stats();
  b.loginAs(USER_B);
  writeCharacter(b, USER_B, { onlineAt: 123456 });
  b.context.location.hash = "#/home";
  b.context.dispatchEvent(new b.context.HashChangeEvent("hashchange"));
  await settle();

  const afterLogin = hub.stats();
  const worldAfterLogin = JSON.parse(hub.backing.get(GLOBAL_KEY));
  assert.ok(worldAfterLogin.characters[USER_A], "A must remain in the shared world after B logs in");
  assert.ok(worldAfterLogin.characters[USER_B], "B must remain in the shared world after B logs in");
  assert.ok(afterLogin.globalWrites - beforeLogin.globalWrites <= 3, "B login must settle without a shared-world write storm");

  const stableWrites = hub.stats().globalWrites;
  const stableEvents = hub.stats().nativeStorageEvents;
  await sleep(80);
  assert.equal(hub.stats().globalWrites, stableWrites, "B login must quiesce instead of looping world writes");
  assert.equal(hub.stats().nativeStorageEvents, stableEvents, "B login must quiesce instead of looping cross-tab storage events");

  writeCharacter(a, USER_A, { symptom: "A_ACTION" });
  await settle();
  writeCharacter(b, USER_B, { symptom: "B_ACTION", contamination: 7 });
  await settle();

  const sharedAfterActions = JSON.parse(hub.backing.get(GLOBAL_KEY));
  assert.equal(sharedAfterActions.characters[USER_A].symptom, "A_ACTION");
  assert.equal(sharedAfterActions.characters[USER_B].symptom, "B_ACTION");
  assert.equal(sharedAfterActions.characters[USER_B].contamination, 7);

  writeCharacter(a, USER_A, { contamination: 11 });
  writeCharacter(b, USER_B, { contamination: 22 });
  await settle();
  const remoteAfterRace = server.snapshot();
  assert.equal(remoteAfterRace.characters[USER_A].contamination, 11, "concurrent A update must survive cloud reconciliation");
  assert.equal(remoteAfterRace.characters[USER_B].contamination, 22, "concurrent B update must survive cloud reconciliation");

  const raceStableWrites = hub.stats().globalWrites;
  const raceStableEvents = hub.stats().nativeStorageEvents;
  await sleep(80);
  assert.equal(hub.stats().globalWrites, raceStableWrites, "two authenticated tabs must settle after concurrent writes");
  assert.equal(hub.stats().nativeStorageEvents, raceStableEvents, "two authenticated tabs must not ping-pong storage events");
  const syncStats = server.stats();
  console.log("diagnostic: dual-auth cloud stats =", JSON.stringify(syncStats));
  assert.ok(syncStats.conflicts <= 6, "cloud revision conflicts must stay bounded rather than loop");
  assert.ok(syncStats.puts <= 10, "normal dual-tab activity must not cause runaway cloud writes");

  a.timers.clearAll();
  b.timers.clearAll();
}

{
  const staleRemote = structuredClone(baseWorld);
  delete staleRemote.characters[USER_B];
  const server = remoteServer(staleRemote);
  const hub = makeHub(staleRemote);
  const a = createTab({ name: "A-stale", hub, server, userId: USER_A });
  const b = createTab({ name: "B-stale", hub, server });
  loadRuntime(a);
  loadRuntime(b);
  await sleep(40);

  b.loginAs(USER_B);
  writeCharacter(b, USER_B, { onlineAt: 987654 });
  b.context.location.hash = "#/home";
  b.context.dispatchEvent(new b.context.HashChangeEvent("hashchange"));
  await settle();

  const local = JSON.parse(hub.backing.get(GLOBAL_KEY));
  const remote = server.snapshot();
  assert.equal(local.characters[USER_B]?.id, USER_B, "B must still have a valid character after first authenticated cloud bootstrap");
  assert.equal(remote.characters[USER_B]?.id, USER_B, "B character must be published to cloud state after first authenticated bootstrap");
  assert.ok(local.characters[USER_B]?.inventory && typeof local.characters[USER_B].inventory === "object", "B character shape must remain valid");

  const stableWrites = hub.stats().globalWrites;
  const stableEvents = hub.stats().nativeStorageEvents;
  await sleep(80);
  assert.equal(hub.stats().globalWrites, stableWrites, "stale-cloud login recovery must settle without a loop");
  assert.equal(hub.stats().nativeStorageEvents, stableEvents, "stale-cloud login recovery must stop cross-tab event propagation after settling");

  a.timers.clearAll();
  b.timers.clearAll();
}

console.log("PASS: A and B can stay authenticated in separate tabs, exchange bounded shared-world updates, and settle without storage/cloud loops");
