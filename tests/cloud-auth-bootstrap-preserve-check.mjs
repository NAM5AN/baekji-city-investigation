import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";
const source = fs.readFileSync("cloud-state-sync.js", "utf8");

const blankCharacter = (id) => ({
  id,
  contamination: 0,
  symptom: "안정",
  inventory: {},
  currentPartyId: null,
  currentSessionId: null,
  onlineAt: null,
});

const remoteWorld = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: { [USER_A]: blankCharacter(USER_A) },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

let remoteState = structuredClone(remoteWorld);
let revision = 1;
let putCount = 0;
const localValues = new Map([[GLOBAL_KEY, JSON.stringify(remoteWorld)]]);
const sessionValues = new Map();
const listeners = new Map();

class BasicEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
}
class FakeStorage {
  constructor(backing) { this.backing = backing; }
  getItem(key) { return this.backing.has(String(key)) ? this.backing.get(String(key)) : null; }
  setItem(key, value) { this.backing.set(String(key), String(value)); }
  removeItem(key) { this.backing.delete(String(key)); }
}

const localStorage = new FakeStorage(localValues);
const sessionStorage = new FakeStorage(sessionValues);
const timers = new Set();
function shortTimeout(fn, delay = 0, ...args) {
  if (Number(delay) > 200) return 0;
  const handle = setTimeout(() => { timers.delete(handle); fn(...args); }, delay);
  timers.add(handle);
  return handle;
}
function clearShortTimeout(handle) {
  if (!handle) return;
  clearTimeout(handle);
  timers.delete(handle);
}

const context = vm.createContext({
  console,
  structuredClone,
  AbortController,
  Event: BasicEvent,
  CustomEvent: BasicEvent,
  StorageEvent: BasicEvent,
  HashChangeEvent: BasicEvent,
  Storage: FakeStorage,
  localStorage,
  sessionStorage,
  location: { href: "https://example.test/#/login", hash: "#/login" },
  document: {
    hidden: false,
    documentElement: { dataset: {} },
    addEventListener() {},
  },
  setTimeout: shortTimeout,
  clearTimeout: clearShortTimeout,
  fetch: async (url, options = {}) => {
    const target = String(url);
    if (target.includes("baekji_mvp_get_state")) {
      return { ok: true, status: 200, async json() { return [{ state: structuredClone(remoteState), revision }]; } };
    }
    if (target.includes("baekji_mvp_get_revision")) {
      return { ok: true, status: 200, async json() { return revision; } };
    }
    if (target.includes("baekji_mvp_put_state")) {
      const body = JSON.parse(options.body || "{}");
      putCount += 1;
      if (body.p_expected_revision != null && Number(body.p_expected_revision) !== revision) {
        return { ok: true, status: 200, async json() { return [{ accepted: false, revision, state: structuredClone(remoteState) }]; } };
      }
      remoteState = structuredClone(body.p_state);
      revision += 1;
      return { ok: true, status: 200, async json() { return [{ accepted: true, revision, state: structuredClone(remoteState) }]; } };
    }
    throw new Error(`unexpected fetch ${target}`);
  },
});
context.window = context;
context.addEventListener = (type, listener) => {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(listener);
};
context.dispatchEvent = (event) => {
  (listeners.get(event?.type) || []).forEach((listener) => listener(event));
  return true;
};

vm.runInContext(source, context, { filename: "cloud-state-sync.js" });
await new Promise((resolve) => setTimeout(resolve, 10));

// Successful tester login order: session is set first, then ensureCharacter writes local world,
// then hash navigation wakes cloud sync in the same document.
sessionStorage.setItem(USER_KEY, USER_B);
const localLoginWorld = structuredClone(remoteWorld);
localLoginWorld.characters[USER_B] = { ...blankCharacter(USER_B), onlineAt: 987654 };
localStorage.setItem(GLOBAL_KEY, JSON.stringify(localLoginWorld));
context.location.hash = "#/home";
context.dispatchEvent(new context.HashChangeEvent("hashchange"));
await new Promise((resolve) => setTimeout(resolve, 160));

const localAfterBootstrap = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.ok(localAfterBootstrap.characters[USER_B], "first authenticated bootstrap must not erase the just-created B character");
assert.equal(localAfterBootstrap.characters[USER_B].onlineAt, 987654, "first authenticated bootstrap must preserve B login state");
assert.ok(remoteState.characters[USER_B], "first authenticated bootstrap must merge/publish B into cloud state");
assert.ok(putCount <= 2, "auth bootstrap recovery must use bounded cloud writes");

timers.forEach((handle) => clearTimeout(handle));
console.log("PASS: guest-to-auth cloud bootstrap preserves and publishes the just-created authenticated character");
