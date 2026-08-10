import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tester-login-stable.js", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const testerId = "6554b60a-be87-4c08-b8b5-8abda89faf5b";

let submitHandler = null;
let initialFetchCount = 0;
let lateFetchCount = 0;
let hashRenderCount = 0;
let registeredUser = null;
let remembered = 0;
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
  HashChangeEvent: TestEvent,
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
    initialFetchCount += 1;
    assert.equal(url, "/api/tester-login");
    const body = JSON.parse(init.body);
    assert.equal(body.characterName, "테스트 캐릭터 A");
    assert.equal(body.pin, "1234");
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, user: { id: testerId, characterName: "테스트 캐릭터 A", profilePhoto: "" } };
      },
    };
  },
});
context.window = context;
context.dispatchEvent = (event) => {
  if (event?.type === "hashchange") hashRenderCount += 1;
  return true;
};
context.__BAEKJI_TESTER_REGISTRY_GUARD__ = {
  registerTester(user) { registeredUser = user; return true; },
  rememberCurrentTester() { remembered += 1; return true; },
};

vm.runInContext(source, context, { filename: "tester-login-stable.js" });
assert.equal(typeof submitHandler, "function");
assert.equal(context.__BAEKJI_TESTER_LOGIN_STABLE_TEST__.shouldHandleLoginName("AD01"), false, "admin login stays owned by admin bridge");
assert.equal(context.__BAEKJI_TESTER_LOGIN_STABLE_TEST__.shouldHandleLoginName("캐릭터A"), true);
assert.equal(context.__BAEKJI_TESTER_LOGIN_STABLE_TEST__.loginQueryName("캐릭터A"), "테스트 캐릭터 A");

// Replace global fetch after module load. The login path must keep using the captured fetch
// so later runtime fetch wrappers cannot strand the form in a permanent checking state.
context.fetch = async () => { lateFetchCount += 1; return new Promise(() => {}); };

function makeForm(name = "캐릭터A", pin = "1234") {
  const message = { textContent: "", isConnected: true };
  const submit = { disabled: false, isConnected: true };
  const nameInput = { value: name, isConnected: true };
  const passwordInput = { value: pin, isConnected: true };
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

async function submitLogin(startHash = "#/login") {
  context.location.hash = startHash;
  const view = makeForm();
  const event = new TestEvent("submit", { bubbles: true, cancelable: true });
  event.target = view.form;
  await submitHandler(event);
  return { ...view, event };
}

const first = await submitLogin();
assert.equal(initialFetchCount, 1, "captured fetch performs the login request");
assert.equal(lateFetchCount, 0, "later fetch wrappers must not own login");
assert.equal(first.event.defaultPrevented, true);
assert.equal(first.event.stopped, true);
assert.equal(first.nameInput.value, "캐릭터A", "internal UUID must never replace the visible login name");
assert.equal(first.submit.disabled, false, "login button must always recover");
assert.equal(first.message.textContent, "");
assert.equal(session.get(USER_KEY), testerId);
assert.equal(context.location.hash, "#/home");
assert.equal(registeredUser?.id, testerId);
assert.equal(registeredUser?.password, "1234");
assert.equal(remembered, 1);
assert.equal(JSON.parse(local.get(GLOBAL_KEY)).characters[testerId]?.id, testerId);
assert.equal(hashRenderCount, 0, "normal login relies on the real hash change instead of double-rendering synchronously");

session.delete(USER_KEY);
const second = await submitLogin("#/home");
assert.equal(initialFetchCount, 2);
assert.equal(session.get(USER_KEY), testerId);
assert.equal(hashRenderCount, 1, "stale #/home + login DOM gets exactly one explicit recovery render");
assert.equal(second.nameInput.value, "캐릭터A");
assert.equal(second.submit.disabled, false);

console.log("PASS: single-owner tester login uses captured same-origin fetch, never exposes UUID, and recovers stale home/login DOM");
