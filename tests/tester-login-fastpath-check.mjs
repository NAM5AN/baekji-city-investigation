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
let legacyCaptureCount = 0;
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
context.dispatchEvent = () => true;
context.__demoRegistry = {
  test_a: { id: "test_a", loginId: "캐릭터A", password: "1234", name: "테스트 캐릭터 A" },
  test_b: { id: "test_b", loginId: "캐릭터B", password: "1234", name: "테스트 캐릭터 B" },
  test_c: { id: "test_c", loginId: "캐릭터C", password: "1234", name: "테스트 캐릭터 C" },
};

vm.runInContext(guardSource, context, { filename: "tester-registry-guard.js" });
vm.runInContext(`
  window.__legacyTesterCapture = function(event) {
    const typed = String(event.target.querySelector("[data-login-id]")?.value || "").replace(/\\s+/g, "").toLowerCase();
    if (typed !== "산") return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  window.__appSubmit = function(event) {
    event.preventDefault();
    const loginId = String(event.target.querySelector("[data-login-id]")?.value || "").replace(/\\s+/g, "").toLowerCase();
    const password = String(event.target.querySelector("[data-login-password]")?.value || "");
    const user = Object.values(__demoRegistry).find((candidate) => {
      const aliases = [candidate.loginId, candidate.name, candidate.id].map((value) => String(value || "").replace(/\\s+/g, "").toLowerCase());
      return aliases.includes(loginId) && password === candidate.password;
    }) || null;
    if (!user) return false;
    sessionStorage.setItem(${JSON.stringify(USER_KEY)}, user.id);
    location.hash = "#/home";
    return true;
  };
`, context);
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
    dispatchEvent(replay) {
      replay.target = form;
      submitHandler(replay);
      if (replay.stopped) return !replay.defaultPrevented;
      legacyCaptureCount += context.__legacyTesterCapture(replay) ? 1 : 0;
      if (!replay.stopped) context.__appSubmit(replay);
      return !replay.defaultPrevented;
    },
  };
  return { form, message, submit, nameInput, passwordInput };
}

async function attemptLogin() {
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
assert.equal(legacyCaptureCount, 0, "the legacy tester-name interceptor must not capture the verified app handoff");
assert.equal(session.get(USER_KEY), testerId, "app login handoff must establish the current tester session");
assert.equal(context.location.hash, "#/home", "successful tester login must remain on home instead of bouncing to login");
assert.equal(context.__demoRegistry[testerId]?.password, "4826", "RPC-verified PIN must be present only in the in-memory app registry for the final app auth check");
const state = JSON.parse(local.get(GLOBAL_KEY));
assert.equal(state.characters[testerId]?.id, testerId, "tester character state must exist before the app login handoff");
assert.equal(first.passwordInput.value, "4826", "login handoff must not erase the PIN");
assert.equal(first.submit.disabled, false);

session.delete(USER_KEY);
context.location.hash = "#/login";
const second = await attemptLogin();
assert.equal(fetchCount, 2, "a later retry must remain usable and perform one fresh RPC");
assert.equal(legacyCaptureCount, 0, "retries must continue to bypass the legacy name interceptor");
assert.equal(session.get(USER_KEY), testerId, "repeat login must also establish the session without another account acting first");
assert.equal(context.location.hash, "#/home");
assert.equal(second.passwordInput.value, "4826");
assert.equal(second.submit.disabled, false);

console.log("PASS: every tester login, including A/B/C aliases, uses the Supabase account path and remains retryable");
