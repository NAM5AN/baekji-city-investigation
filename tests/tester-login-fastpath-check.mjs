import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const guardSource = fs.readFileSync("tester-registry-guard.js", "utf8");
const source = fs.readFileSync("tester-login-fastpath.js", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const testerId = "755ccd33-676f-48c8-a825-c9a28b56ac3e";

let submitHandler = null;
let fetchCount = 0;
let hashRenderCount = 0;
let fastLoginEventCount = 0;
const local = new Map([[GLOBAL_KEY, JSON.stringify({
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: {},
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
})]]);
const session = new Map();

class TestEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
    this.stopped = false;
    this.target = null;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopImmediatePropagation() { this.stopped = true; }
}

const context = vm.createContext({
  console,
  AbortController,
  Event: TestEvent,
  CustomEvent: class CustomEvent extends TestEvent {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
  },
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
  },
  sessionStorage: {
    getItem(key) { return session.has(key) ? session.get(key) : null; },
    setItem(key, value) { session.set(key, String(value)); },
    removeItem(key) { session.delete(key); },
  },
  location: { hash: "#/login" },
  document: {
    addEventListener(type, handler) { if (type === "submit") submitHandler = handler; },
  },
  fetch: async (url, init) => {
    fetchCount += 1;
    assert.match(String(url), /baekji_tester_login$/);
    const body = JSON.parse(init.body);
    assert.equal(body.p_character_name, "산");
    assert.equal(body.p_pin, "4826");
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ id: testerId, character_name: "산", profile_photo: "data:image/jpeg;base64,AA==" }];
      },
    };
  },
});
context.window = context;
context.dispatchEvent = (event) => {
  if (event?.type === "hashchange") hashRenderCount += 1;
  if (event?.type === "baekji-tester-fast-login") fastLoginEventCount += 1;
  return true;
};
context.__demoRegistry = {
  test_a: { id: "test_a", loginId: "캐릭터A", password: "1234", name: "테스트 캐릭터 A" },
  test_b: { id: "test_b", loginId: "캐릭터B", password: "1234", name: "테스트 캐릭터 B" },
  test_c: { id: "test_c", loginId: "캐릭터C", password: "1234", name: "테스트 캐릭터 C" },
};

vm.runInContext(guardSource, context, { filename: "tester-registry-guard.js" });
// Simulate app.js touching Object.values(DEMO_USERS) during startup so the guard captures
// the real in-memory registry before a tester account logs in.
vm.runInContext("Object.values(__demoRegistry)", context);
assert.equal(context.__BAEKJI_TESTER_REGISTRY_GUARD__.registryAttached(), true);
vm.runInContext(source, context, { filename: "tester-login-fastpath.js" });

assert.equal(typeof submitHandler, "function", "fast login submit handler must be registered immediately");
assert.equal(context.__BAEKJI_TESTER_LOGIN_FASTPATH_TEST__.shouldHandleLoginName("캐릭터A"), true, "legacy demo login labels must now use the Supabase tester path too");
assert.equal(context.__BAEKJI_TESTER_LOGIN_FASTPATH_TEST__.loginQueryName("캐릭터A"), "테스트 캐릭터 A", "legacy A/B/C labels are only login aliases for Supabase rows");
assert.equal(context.__BAEKJI_TESTER_LOGIN_FASTPATH_TEST__.shouldHandleLoginName("산"), true, "tester names use the direct RPC login path");

function makeForm() {
  const message = { textContent: "", isConnected: true };
  const submit = { disabled: false, isConnected: true };
  const nameInput = { value: "산", isConnected: true };
  const passwordInput = { value: "4826", isConnected: true };
  const form = {
    matches(selector) { return selector === "[data-login-form]"; },
    querySelector(selector) {
      if (selector === "[data-login-id]") return nameInput;
      if (selector === "[data-login-password]") return passwordInput;
      if (selector === "[data-login-error]") return message;
      if (selector === 'button[type="submit"], input[type="submit"]') return submit;
      return null;
    },
  };
  return { form, message, submit, nameInput, passwordInput };
}

async function attemptLogin(startHash = "#/login") {
  context.location.hash = startHash;
  const view = makeForm();
  const event = new TestEvent("submit", { bubbles: true, cancelable: true });
  event.target = view.form;
  await submitHandler(event);
  return { ...view, event };
}

const first = await attemptLogin();
assert.equal(fetchCount, 1, "first tester login performs exactly one RPC");
assert.equal(first.event.defaultPrevented, true);
assert.equal(first.event.stopped, true);
assert.equal(session.get(USER_KEY), testerId, "verified login must establish the current tester session directly");
assert.equal(context.location.hash, "#/home", "successful tester login must move to home");
assert.equal(hashRenderCount, 1, "successful login must synchronously request one home render instead of waiting on a form replay");
assert.equal(fastLoginEventCount, 1);
assert.equal(context.__demoRegistry[testerId]?.password, "4826", "verified tester must be installed in the in-memory app registry");
const state = JSON.parse(local.get(GLOBAL_KEY));
assert.equal(state.characters[testerId]?.id, testerId, "tester character state must exist before home renders");
assert.equal(first.nameInput.value, "산", "login must never replace the visible character name with an internal UUID");
assert.equal(first.passwordInput.value, "4826", "login must not erase the PIN");
assert.equal(first.submit.disabled, false);

session.delete(USER_KEY);
const second = await attemptLogin("#/home");
assert.equal(fetchCount, 2, "a later retry must remain usable and perform one fresh RPC");
assert.equal(session.get(USER_KEY), testerId, "repeat login must also establish the session without another account acting first");
assert.equal(context.location.hash, "#/home");
assert.equal(hashRenderCount, 2, "when the URL is already #/home, login must still force the app to render home immediately");
assert.equal(second.nameInput.value, "산", "retry must also keep the human-readable character name in the field");
assert.equal(second.passwordInput.value, "4826");
assert.equal(second.submit.disabled, false);

console.log("PASS: tester login completes directly, keeps the visible name, and forces home render without UUID form replay");
