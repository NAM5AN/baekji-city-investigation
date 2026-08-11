import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";
const source = fs.readFileSync("cloud-state-sync.js", "utf8");

const blankCharacter = (id) => ({ id, contamination: 0, symptom: "안정", inventory: {}, currentPartyId: null, currentSessionId: null, onlineAt: null });
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
const localWorld = structuredClone(remoteWorld);
localWorld.characters[USER_B] = blankCharacter(USER_B);

let remoteState = structuredClone(remoteWorld);
let revision = 1;
let putCount = 0;
const localValues = new Map([[GLOBAL_KEY, JSON.stringify(localWorld)]]);
const sessionValues = new Map([[USER_KEY, USER_B]]); // page reload starts already authenticated
const listeners = new Map();
const timers = new Set();

class BasicEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
class FakeStorage {
  constructor(backing) { this.backing = backing; }
  getItem(key) { return this.backing.has(String(key)) ? this.backing.get(String(key)) : null; }
  setItem(key, value) { this.backing.set(String(key), String(value)); }
  removeItem(key) { this.backing.delete(String(key)); }
}
const localStorage = new FakeStorage(localValues);
const sessionStorage = new FakeStorage(sessionValues);
function shortTimeout(fn, delay = 0, ...args) {
  if (Number(delay) > 200) return 0;
  const handle = setTimeout(() => { timers.delete(handle); fn(...args); }, delay);
  timers.add(handle);
  return handle;
}
function clearShortTimeout(handle) { if (handle) { clearTimeout(handle); timers.delete(handle); } }

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
  location: { href: "https://example.test/#/home", hash: "#/home" },
  document: { hidden: false, documentElement: { dataset: {} }, addEventListener() {} },
  setTimeout: shortTimeout,
  clearTimeout: clearShortTimeout,
  fetch: async (url, options = {}) => {
    const target = String(url);
    if (target.includes("baekji_mvp_get_state")) return { ok: true, status: 200, async json() { return [{ state: structuredClone(remoteState), revision }]; } };
    if (target.includes("baekji_mvp_get_revision")) return { ok: true, status: 200, async json() { return revision; } };
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
await new Promise((resolve) => setTimeout(resolve, 180));

const localAfter = JSON.parse(localStorage.getItem(GLOBAL_KEY));
assert.equal(localAfter.characters[USER_B]?.id, USER_B, "post-login reload bootstrap must keep B in local shared state");
assert.equal(remoteState.characters[USER_B]?.id, USER_B, "post-login reload bootstrap must publish B when remote is stale");
assert.ok(putCount <= 2, "post-login reload recovery must use bounded cloud writes");

const stableRaw = localStorage.getItem(GLOBAL_KEY);
await new Promise((resolve) => setTimeout(resolve, 80));
assert.equal(localStorage.getItem(GLOBAL_KEY), stableRaw, "post-login reload bootstrap must settle without local write churn");

timers.forEach((handle) => clearTimeout(handle));
console.log("PASS: full-reload authenticated bootstrap preserves B and publishes it to a stale cloud snapshot without looping");
