import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("flexible-hazard-resolution.js", "utf8");
const values = new Map();
const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
const sessionStorage = { getItem: (key) => values.get(`session:${key}`) ?? null, setItem: (key, value) => values.set(`session:${key}`, String(value)), removeItem: (key) => values.delete(`session:${key}`) };
const listeners = new Map();
const input = { value: "", disabled: false, matches: (selector) => selector === "[data-chat-input]", dispatchEvent() {} };
const button = { disabled: false, textContent: "" };
const commits = [];
const document = {
  addEventListener(type, callback) { (listeners.get(type) || listeners.set(type, []).get(type)).push(callback); },
  querySelector(selector) { return selector === "[data-chat-input]" ? input : selector === "[data-send-chat]" ? button : null; },
  dispatchEvent(event) { (listeners.get(event.type) || []).forEach((callback) => callback(event)); },
};

const state = {
  version: 3,
  characters: { test_a: { id: "test_a", contamination: 0, inventory: {}, currentSessionId: "s1" } },
  sessions: {
    s1: {
      id: "s1", status: "ACTIVE", memberIds: ["test_a"], currentNode: "A", logs: [],
      lastMovementTransition: { token: "move-flex", kind: "ENCOUNTER", routeId: "R1", fromNode: "A", targetNode: "B" },
      activeEncounter: { routeId: "R1", fromNode: "A", targetNode: "B", hazards: ["H1", "H2"], currentIndex: 0, resolutions: [] },
    },
  },
};
localStorage.setItem("baekji_city_mvp_state_v3", JSON.stringify(state));
sessionStorage.setItem("baekji_city_mvp_current_user_v034", "test_a");

const context = vm.createContext({
  window: null, document, localStorage, sessionStorage, location: { hash: "#/investigate/s1" },
  console, setTimeout, clearTimeout, AbortController,
  Event: class Event { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  fetch: async (url) => String(url).includes("list_accounts")
    ? { ok: true, json: async () => [] }
    : { ok: true, json: async () => ({ outcome: "SUCCESS", progress: "CURRENT", selfExposure: "NONE", targetName: "", targetExposure: "NONE", narration: "resolved" }) },
});
context.window = context;
context.dispatchEvent = () => true;
context.DAY1_DATA = {
  places: { A: { name: "A" }, B: { name: "B" } },
  hazardTemplates: { H1: { name: "H1", kind: "route" }, H2: { name: "H2", kind: "route" } },
};
context.__BAEKJI_FLEX_HAZARD_RUNTIME__ = Object.freeze({
  commitDecision(inputValue) { commits.push(inputValue); return { applied: true }; },
});

vm.runInContext(source, context, { filename: "flexible-hazard-resolution.js" });
const api = context.__BAEKJI_FLEX_HAZARD__;
assert(api, "flex hazard capture API should be exposed");

const runFallback = api.fallbackDecision("끝까지 달려나간다", 2, { memberIds: ["test_a"] }, "test_a");
assert.equal(runFallback.progress, "ALL", "one continuous dash may clear all remaining hazards");
assert.notEqual(runFallback.outcome, "FAIL");
const observeFallback = api.fallbackDecision("주변 움직임을 관찰한다", 2, { memberIds: ["test_a"] }, "test_a");
assert.equal(observeFallback.outcome, "INFO");
assert.equal(observeFallback.progress, "NONE");
assert.equal(observeFallback.selfExposure, "NONE");

input.value = "/careful crossing";
const keydown = { type: "keydown", key: "Enter", shiftKey: false, isComposing: false, target: input, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
document.dispatchEvent(keydown);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(keydown.defaultPrevented, true, "the actual Enter capture path must intercept slash hazard input");
assert.equal(commits.length, 1, "the capture layer must delegate exactly one atomic commit to app runtime");
assert.deepEqual({
  sessionId: commits[0].sessionId,
  actorId: commits[0].actorId,
  movementToken: commits[0].movementToken,
  hazardId: commits[0].hazardId,
  hazardIndex: commits[0].hazardIndex,
  action: commits[0].action,
}, { sessionId: "s1", actorId: "test_a", movementToken: "move-flex", hazardId: "H1", hazardIndex: 0, action: "careful crossing" });
assert.equal(commits[0].decision.selfExposure, "NONE", "exposure remains independent from the success outcome");
assert.equal(JSON.parse(localStorage.getItem("baekji_city_mvp_state_v3")).sessions.s1.logs.length, 0, "the capture layer must not mutate world state or append legacy random logs");
assert.equal(api.shouldHandle("/careful crossing", state, "test_a"), true);

console.log("PASS: flexible hazard capture preserves fallbacks and delegates actual slash submission to one atomic movement-token commit");
