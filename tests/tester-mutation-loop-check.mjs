import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const guardSource = fs.readFileSync("tester-registry-guard.js", "utf8");
const authSource = fs.readFileSync("tester-auth.js", "utf8");
const testerId = "755ccd33-676f-48c8-a825-c9a28b56ac3e";
const globalKey = "baekji_city_mvp_state_v3";
const userKey = "baekji_city_mvp_current_user_v034";

const blankCharacter = (id) => ({
  id,
  contamination: 0,
  symptom: "안정",
  inventory: {},
  currentPartyId: null,
  currentSessionId: null,
  onlineAt: null,
});
const initialWorld = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: {
    test_a: blankCharacter("test_a"),
    test_b: blankCharacter("test_b"),
    test_c: blankCharacter("test_c"),
    [testerId]: blankCharacter(testerId),
  },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const localValues = new Map([[globalKey, JSON.stringify(initialWorld)]]);
const sessionValues = new Map([[userKey, testerId]]);
let mutationCallback = null;
let numberWrites = 0;
let currentText = "999%";
const number = {};
Object.defineProperty(number, "textContent", {
  get() { return currentText; },
  set(value) {
    numberWrites += 1;
    if (numberWrites > 3) throw new Error("MutationObserver loop reproduced");
    currentText = String(value);
    queueMicrotask(() => mutationCallback?.());
  },
});
const bar = { style: { width: "999%" } };
const label = { textContent: "개인 오염도" };
const card = {
  querySelector(selector) {
    if (selector === ".muted.small") return label;
    if (selector === ".kpi-value") return number;
    if (selector === ".progress > span") return bar;
    return null;
  },
};

class TestEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
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
  location: { hash: "#/home", href: "https://example.test/" },
  document: {
    documentElement: {},
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === ".card.kpi") return [card];
      return [];
    },
    createElement() { return {}; },
  },
  MutationObserver: class {
    constructor(callback) { mutationCallback = callback; }
    observe() {}
  },
  fetch: async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{ id: testerId, character_name: "산", profile_photo: "" }];
    },
  }),
});
context.window = context;
context.addEventListener = () => {};
context.removeEventListener = () => {};
context.dispatchEvent = () => true;

vm.runInContext(guardSource, context, { filename: "tester-registry-guard.js" });
context.__registry = {
  test_a: { id: "test_a", loginId: "캐릭터A", password: "1234" },
  test_b: { id: "test_b", loginId: "캐릭터B", password: "1234" },
  test_c: { id: "test_c", loginId: "캐릭터C", password: "1234" },
};
assert.equal(vm.runInContext("window.__BAEKJI_TESTER_REGISTRY_GUARD__.attachRegistry(__registry)", context), true);

vm.runInContext(authSource, context, { filename: "tester-auth.js" });
await new Promise((resolve) => setTimeout(resolve, 30));

assert.equal(currentText, "0%", "tester contamination display should be repaired to the current value");
assert.equal(bar.style.width, "0%", "tester contamination bar should be repaired to the current value");
assert.equal(numberWrites, 1, "MutationObserver re-entry must not write the same contamination text again");

mutationCallback?.();
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(numberWrites, 1, "an unrelated later mutation must also remain a no-op when contamination text is already current");

console.log("PASS: tester contamination decoration settles after one DOM write without a MutationObserver loop");
