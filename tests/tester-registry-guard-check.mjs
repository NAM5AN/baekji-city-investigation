import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const guardSource = fs.readFileSync("tester-registry-guard.js", "utf8");
const authSource = fs.readFileSync("tester-auth.js", "utf8");
const testerId = "755ccd33-676f-48c8-a825-c9a28b56ac3e";
const futureId = "11111111-2222-4333-8444-555555555555";
const userKey = "baekji_city_mvp_current_user_v034";
const sessionProfileKey = "baekji_city_tester_session_profile_v1";

const localValues = new Map([["baekji_city_mvp_state_v3", JSON.stringify({
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: {
    test_a: { id: "test_a", contamination: 0, symptom: "안정", inventory: {}, currentPartyId: null, currentSessionId: null, onlineAt: null },
    test_b: { id: "test_b", contamination: 0, symptom: "안정", inventory: {}, currentPartyId: null, currentSessionId: null, onlineAt: null },
    test_c: { id: "test_c", contamination: 0, symptom: "안정", inventory: {}, currentPartyId: null, currentSessionId: null, onlineAt: null },
  },
  parties: {}, sessions: {}, itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
})]]);
const sessionValues = new Map();

class TestEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.detail = init.detail;
  }
}

const context = vm.createContext({
  console,
  Event: TestEvent,
  CustomEvent: TestEvent,
  HashChangeEvent: TestEvent,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  setInterval() { return 1; },
  clearInterval() {},
  localStorage: {
    getItem(key) { return localValues.has(key) ? localValues.get(key) : null; },
    setItem(key, value) { localValues.set(key, String(value)); },
    removeItem(key) { localValues.delete(key); },
  },
  sessionStorage: {
    getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
    setItem(key, value) { sessionValues.set(key, String(value)); },
    removeItem(key) { sessionValues.delete(key); },
  },
  location: { hash: "#/login", href: "https://example.test/" },
  document: {
    documentElement: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return {}; },
  },
  MutationObserver: class { observe() {} },
  fetch: async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{ id: testerId, character_name: "산", profile_photo: "data:image/jpeg;base64,AA==" }];
    },
  }),
});
context.window = context;
context.addEventListener = () => {};
context.removeEventListener = () => {};
context.dispatchEvent = () => true;

vm.runInContext(guardSource, context, { filename: "tester-registry-guard.js" });
vm.runInContext(authSource, context, { filename: "tester-auth.js" });
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

context.__registry = {
  test_a: { id: "test_a", loginId: "캐릭터A", password: "1234", name: "테스트 캐릭터 A" },
  test_b: { id: "test_b", loginId: "캐릭터B", password: "1234", name: "테스트 캐릭터 B" },
  test_c: { id: "test_c", loginId: "캐릭터C", password: "1234", name: "테스트 캐릭터 C" },
};

const attached = vm.runInContext("window.__BAEKJI_TESTER_REGISTRY_GUARD__.attachRegistry(__registry)", context);
assert.equal(attached, true, "guard should attach the real app user registry");
assert.equal(vm.runInContext(`__registry[${JSON.stringify(testerId)}]?.name`, context), "산", "existing tester should be copied into the app registry");
assert.equal(vm.runInContext(`Object.prototype.hasOwnProperty.call(Object.prototype, ${JSON.stringify(testerId)})`, context), false, "tester UUID must never remain on Object.prototype after registry attachment");
assert.equal(vm.runInContext(`({})[${JSON.stringify(testerId)}]`, context), undefined, "ordinary objects must not inherit tester profiles");

context.__futureUser = { id: futureId, name: "미래 테스터", loginId: "미래 테스터", profilePhoto: "", isTestOnly: true };
vm.runInContext(`Object.defineProperty(Object.prototype, ${JSON.stringify(futureId)}, {
  configurable: true,
  enumerable: false,
  get() { return __futureUser; },
  set(value) { Object.defineProperty(this, ${JSON.stringify(futureId)}, { configurable: true, enumerable: true, writable: true, value }); }
})`, context);

assert.equal(vm.runInContext(`__registry[${JSON.stringify(futureId)}]?.name`, context), "미래 테스터", "future signup should be injected directly into the attached app registry");
assert.equal(vm.runInContext(`Object.prototype.hasOwnProperty.call(Object.prototype, ${JSON.stringify(futureId)})`, context), false, "future tester UUID must also stay off Object.prototype");
assert.equal(vm.runInContext("Object.values(__registry).filter((entry) => entry?.isTestOnly).length", context), 2, "native Object.values should enumerate tester users from own registry properties only");
assert.equal(vm.runInContext("window.__BAEKJI_TESTER_REGISTRY_GUARD__.prototypeClean(__futureUser.id)", context), true);

// Reload regression: sessionStorage survives a refresh, but the app registry is recreated.
// The guard must make the current tester available synchronously before app routing runs.
const reloadSession = new Map([
  [userKey, testerId],
  [sessionProfileKey, JSON.stringify({
    id: testerId,
    loginId: "산",
    name: "산",
    initial: "산",
    note: "초대 테스터 계정",
    profilePhoto: "data:image/jpeg;base64,AA==",
    isTestOnly: true,
  })],
]);
const reloadListeners = new Map();
const reloadContext = vm.createContext({
  console,
  sessionStorage: {
    getItem(key) { return reloadSession.has(key) ? reloadSession.get(key) : null; },
    setItem(key, value) { reloadSession.set(key, String(value)); },
    removeItem(key) { reloadSession.delete(key); },
  },
  addEventListener(type, handler) { reloadListeners.set(type, handler); },
  removeEventListener() {},
});
reloadContext.window = reloadContext;
vm.runInContext(guardSource, reloadContext, { filename: "tester-registry-guard.js:reload" });
vm.runInContext(`globalThis.__registry = {
  test_a: { id: "test_a", loginId: "캐릭터A", password: "1234", name: "테스트 캐릭터 A" },
  test_b: { id: "test_b", loginId: "캐릭터B", password: "1234", name: "테스트 캐릭터 B" },
  test_c: { id: "test_c", loginId: "캐릭터C", password: "1234", name: "테스트 캐릭터 C" },
};`, reloadContext);

assert.equal(vm.runInContext(`__registry[${JSON.stringify(testerId)}]?.name`, reloadContext), "산", "refresh must resolve the current tester before any async account fetch");
assert.equal(vm.runInContext(`({})[${JSON.stringify(testerId)}]`, reloadContext), undefined, "the temporary refresh bridge must stay limited to the app user registry");
assert.equal(vm.runInContext(`Object.values(__registry).some((entry) => entry?.id === ${JSON.stringify(testerId)})`, reloadContext), true, "first DEMO_USERS enumeration should attach the restored tester as an own property");
assert.equal(vm.runInContext(`Object.prototype.hasOwnProperty.call(Object.prototype, ${JSON.stringify(testerId)})`, reloadContext), false, "temporary refresh bridge must be removed after registry attachment");
assert.equal(vm.runInContext(`__registry[${JSON.stringify(testerId)}]?.password`, reloadContext), "", "refresh persistence must never store the PIN");

console.log("PASS: tester registry guard avoids prototype pollution and restores tester login across refresh");
