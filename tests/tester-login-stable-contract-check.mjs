// Regression contract for the sole tester-login owner.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tester-login-stable.js", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
const testerId = "6554b60a-be87-4c08-b8b5-8abda89faf5b";

let submitHandler = null;
let initialFetchCount = 0;
let lateFetchCount = 0;
let reloadCount = 0;
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

const location = {
  pathname: "/",
  search: "",
  hash: "#/login",
  reload() { reloadCount += 1; },
};

const context = vm.createContext({
  console,
  AbortController,
  Event: TestEvent,
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
  location,
  history: {
    replaceState(_state, _title, url) {
      const hashIndex = String(url).indexOf("#");
      location.hash = hashIndex >= 0 ? String(url).slice(hashIndex) : "";
    },
  },
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
assert.equal(first.submit.disabled, true, "successful login remains locked until the clean reload takes over");
assert.equal(first.message.textContent, "접속 중입니다…");
assert.equal(session.get(USER_KEY), testerId);
assert.equal(context.location.hash, "#/home");
assert.equal(reloadCount, 1, "verified login must force a full document reload instead of an in-page hash render");
assert.equal(JSON.parse(local.get(GLOBAL_KEY)).characters[testerId]?.id, testerId);
const savedProfile = JSON.parse(session.get(SESSION_PROFILE_KEY));
assert.equal(savedProfile.id, testerId);
assert.equal(savedProfile.name, "테스트 캐릭터 A");
assert.equal(savedProfile.password, "", "session bridge must never persist the tester PIN");

session.delete(USER_KEY);
session.delete(SESSION_PROFILE_KEY);
const second = await submitLogin("#/home");
assert.equal(initialFetchCount, 2);
assert.equal(session.get(USER_KEY), testerId);
assert.equal(context.location.hash, "#/home");
assert.equal(reloadCount, 2, "stale #/home + login DOM also recovers through a clean reload");
assert.equal(second.nameInput.value, "캐릭터A");
assert.equal(second.submit.disabled, true);

console.log("PASS: tester login uses captured same-origin fetch and a clean full reload into the authenticated home");
