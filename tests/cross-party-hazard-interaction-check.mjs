import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("cross-party-hazard-interaction.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const domainRules = fs.readFileSync("runtime-domain-rules.js", "utf8");
const listeners = new Map();
const dispatches = [];
let localWrites = 0;
const input = { value: "/테스트 캐릭터 C를 밀어 앞세운다", disabled: false, matches: (selector) => selector === "[data-chat-input]", dispatchEvent() {} };
const button = { disabled: false, textContent: "", click() {} };
const localStorage = { getItem: () => null, setItem: () => { localWrites += 1; }, removeItem: () => { localWrites += 1; } };
const sessionStorage = { getItem: (key) => key === "baekji_city_mvp_current_user_v034" ? "test_a" : null, setItem() {}, removeItem() {} };
const state = {
  version: 3,
  characters: {
    test_a: { id: "test_a", contamination: 0, inventory: {}, currentSessionId: "s1" },
    test_c: { id: "test_c", contamination: 0, inventory: {}, currentSessionId: "s2" },
  },
  sessions: {
    s1: { id: "s1", status: "ACTIVE", variant: "c", memberIds: ["test_a"], currentNode: "A", logs: [], lastMovementTransition: { kind: "ENCOUNTER", token: "move-cross", routeId: "R1" }, activeEncounter: { routeId: "R1", fromNode: "A", targetNode: "B", hazards: ["H1"], currentIndex: 0 } },
    s2: { id: "s2", status: "ACTIVE", variant: "c", memberIds: ["test_c"], currentNode: "A", logs: [], activeEncounter: { routeId: "R1", fromNode: "A", targetNode: "B", hazards: ["H1"], currentIndex: 0 } },
  },
};

const context = vm.createContext({
  console, setTimeout, clearTimeout, queueMicrotask, location: { hash: "#/investigate/s1" },
  localStorage, sessionStorage, fetch: async () => ({ ok: true, json: async () => [] }),
  Event: class Event { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  AbortController,
  document: {
    addEventListener(type, callback) { (listeners.get(type) || listeners.set(type, []).get(type)).push(callback); },
    querySelector(selector) { return selector === "[data-chat-input]" ? input : selector === "[data-send-chat]" ? button : null; },
  },
});
context.window = context;
context.dispatchEvent = () => true;
context.DAY1_DATA = { places: { A: { name: "출발" }, B: { name: "도착" } }, hazardTemplates: { H1: { name: "흔들리는 발판", kind: "구조" } }, contaminationRules: { EXP_CONTACT_NONE: { min: 0, max: 0 } } };
context.__BAEKJI_WORLD_PERSISTENCE__ = { readRaw: () => JSON.stringify(state) };
context.__BAEKJI_PLAYER_WORLD_COMMANDS__ = { dispatch(command, payload) { dispatches.push({ command, payload }); return Promise.resolve({ ok: true, status: "APPLIED", revision: 3, commandId: "cross-command" }); } };

vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
vm.runInContext(source, context, { filename: "cross-party-hazard-interaction.js" });
const api = context.__BAEKJI_CROSS_PARTY_HAZARD__;
assert(api, "cross-party hazard API should remain available for field-target detection");
assert.equal(api.spatialScopeKey(state.sessions.s1), "route:A:B");
assert.equal(api.externalTargetForAction(state, state.sessions.s1, "test_a", "테스트 캐릭터 C를 밀어 앞세운다")?.id, "test_c");

await new Promise((resolve) => setImmediate(resolve));
const keydown = { key: "Enter", shiftKey: false, isComposing: false, target: input, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
(listeners.get("keydown") || []).forEach((listener) => listener(keydown));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(keydown.defaultPrevented, true, "cross-party hazard capture owns the matching slash action");
assert.deepEqual(JSON.parse(JSON.stringify(dispatches)), [{ command: "RESOLVE_FLEXIBLE_HAZARD_V1", payload: { sessionId: "s1", movementToken: "move-cross", hazardIndex: 0, hazardId: "H1", actionText: "테스트 캐릭터 C를 밀어 앞세운다", targetId: "test_c" } }]);
assert.equal(input.value, "", "composer clears only after authoritative APPLIED/REPLAY");
assert.equal(localWrites, 0, "cross-party handling cannot write a local world snapshot");
assert.doesNotMatch(source, /(?:writeRaw|replaceRemoteRaw|localStorage\.setItem)\s*\(/, "production handler must not retain a local state writer");

console.log("PASS: cross-party hazard routes one same-field target action through the authoritative command boundary");
