import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tester-login-fastpath.js", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const testerId = "755ccd33-676f-48c8-a825-c9a28b56ac3e";

let submitHandler = null;
let fetchCount = 0;
let registeredUser = null;
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

const message = { textContent: "" };
const submit = { disabled: false };
const nameInput = { value: "산" };
const passwordInput = { value: "4826" };
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

const context = vm.createContext({
  console,
  AbortController,
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
  },
  sessionStorage: {
    getItem(key) { return session.has(key) ? session.get(key) : null; },
    setItem(key, value) { session.set(key, String(value)); },
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
context.__BAEKJI_TESTER_REGISTRY_GUARD__ = {
  registerTester(user) { registeredUser = user; return true; },
};

vm.runInContext(source, context, { filename: "tester-login-fastpath.js" });
assert.equal(typeof submitHandler, "function", "fast login submit handler must be registered immediately");
assert.equal(context.__BAEKJI_TESTER_LOGIN_FASTPATH_TEST__.shouldHandleLoginName("캐릭터A"), false, "demo accounts remain on the built-in login path");
assert.equal(context.__BAEKJI_TESTER_LOGIN_FASTPATH_TEST__.shouldHandleLoginName("산"), true, "tester names use the direct RPC login path");

const event = {
  target: form,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopImmediatePropagation() { this.stopped = true; },
};
await submitHandler(event);

assert.equal(fetchCount, 1, "one tester login attempt must perform its own RPC without waiting for account directory preload");
assert.equal(event.prevented, true);
assert.equal(event.stopped, true);
assert.equal(registeredUser?.id, testerId);
assert.equal(session.get(USER_KEY), testerId, "successful login must set the current tester immediately");
assert.equal(context.location.hash, "#/home", "successful tester login must navigate immediately");
const state = JSON.parse(local.get(GLOBAL_KEY));
assert.equal(state.characters[testerId]?.id, testerId, "tester character state must be ready before navigation");
assert.equal(message.textContent, "");
assert.equal(submit.disabled, false);

console.log("PASS: tester login performs an independent direct RPC and navigates immediately");
