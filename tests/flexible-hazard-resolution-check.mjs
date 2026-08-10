import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("flexible-hazard-resolution.js", "utf8");

function store() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  location: { hash: "#/investigate/s1" },
  localStorage: store(),
  sessionStorage: store(),
  fetch: async () => ({ ok: true, json: async () => [] }),
  Event: class Event { constructor(type, init = {}) { this.type = type; this.bubbles = Boolean(init.bubbles); } },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  AbortController,
  document: {
    addEventListener() {},
    querySelector() { return null; },
  },
});
context.window = context;
context.dispatchEvent = () => true;
context.DAY1_DATA = {
  places: { A: { name: "출발" }, B: { name: "도착" } },
  hazardTemplates: {
    H1: { name: "흔들리는 발판", kind: "구조" },
    H2: { name: "퍼지는 흰 잔류물", kind: "접촉 오염" },
  },
  contaminationRules: {
    EXP_CONTACT_NONE: { min: 0, max: 0 },
    EXP_CONTACT_LOW: { min: 1, max: 3 },
    EXP_CONTACT_MEDIUM: { min: 4, max: 7 },
    EXP_CONTACT_HIGH: { min: 8, max: 12 },
    EXP_AMBIENT_A: { min: 0, max: 0 },
  },
};
context.sessionStorage.setItem("baekji_city_mvp_current_user_v034", "test_a");

vm.runInContext(source, context, { filename: "flexible-hazard-resolution.js" });
const api = context.__BAEKJI_FLEX_HAZARD__;
assert(api, "flex hazard test API should be exposed");

const runFallback = api.fallbackDecision("끝까지 달려나간다", 2, { memberIds: ["test_a", "test_b"] }, "test_a");
assert.equal(runFallback.progress, "ALL", "one continuous dash may clear all remaining hazards");
assert.notEqual(runFallback.outcome, "FAIL", "running must not be a keyword-forced failure");

const observeFallback = api.fallbackDecision("주변의 움직임을 관찰한다", 2, { memberIds: ["test_a", "test_b"] }, "test_a");
assert.equal(observeFallback.outcome, "INFO");
assert.equal(observeFallback.progress, "NONE", "observation should not consume a hazard step");
assert.equal(observeFallback.selfExposure, "NONE");

function makeState() {
  return {
    version: 3,
    characters: {
      test_a: { id: "test_a", contamination: 0, symptom: "안정", inventory: {}, currentSessionId: "s1" },
      test_b: { id: "test_b", contamination: 0, symptom: "안정", inventory: {}, currentSessionId: "s1" },
    },
    sessions: {
      s1: {
        id: "s1",
        status: "ACTIVE",
        memberIds: ["test_a", "test_b"],
        currentNode: "A",
        currentDetailId: null,
        choiceReveal: null,
        logs: [],
        activeEncounter: {
          fromNode: "A",
          targetNode: "B",
          ambientRuleId: "EXP_AMBIENT_A",
          hazards: ["H1", "H2"],
          currentIndex: 0,
          overview: "발판과 흰 잔류물이 겹친 통로",
          resolutions: [],
        },
      },
    },
  };
}

const dashState = makeState();
const dashResult = api.applyDecisionToState(dashState, "s1", "test_a", "끝까지 달려나간다", {
  outcome: "SUCCESS",
  progress: "ALL",
  selfExposure: "NONE",
  targetName: "",
  targetExposure: "NONE",
  observationNote: "",
  usedItemId: "",
  usedItemContaminated: false,
  narration: "테스트 캐릭터 A는 두 구간을 한 번에 가로지른다.",
});
assert.equal(dashResult.arrived, true, "ALL progress should finish a two-hazard encounter in one action");
assert.equal(dashState.sessions.s1.activeEncounter, null);
assert.equal(dashState.sessions.s1.currentNode, "B");
assert.equal(dashState.characters.test_a.contamination, 0, "clean traversal must not force contact contamination");
const dashNarration = dashState.sessions.s1.logs.at(-1);
assert.equal(dashNarration.kind, "FLEX_HAZARD_RESPONSE");
assert.equal(dashNarration.actorId, null, "hazard result narration must stay visible in the player SYSTEM feed");
assert.equal(dashNarration.hazardActorId, "test_a", "source actor identity should remain available as metadata");
assert.equal(dashNarration.systemNarration, true);

const observeState = makeState();
api.applyDecisionToState(observeState, "s1", "test_a", "주변을 관찰한다", {
  outcome: "INFO",
  progress: "NONE",
  selfExposure: "NONE",
  targetName: "",
  targetExposure: "NONE",
  observationNote: "발판이 세 번 흔들린 뒤 잠시 멎는다.",
  usedItemId: "",
  usedItemContaminated: false,
  narration: "테스트 캐릭터 A는 흔들림의 간격을 살핀다.",
});
assert.equal(observeState.sessions.s1.activeEncounter.currentIndex, 0);
assert.deepEqual(Array.from(observeState.sessions.s1.activeEncounter.flexInsights), ["발판이 세 번 흔들린 뒤 잠시 멎는다."]);

const pushState = makeState();
const pushResult = api.applyDecisionToState(pushState, "s1", "test_a", "테스트 캐릭터 B를 밀어 앞세운다", {
  outcome: "PARTIAL",
  progress: "CURRENT",
  selfExposure: "NONE",
  targetName: "테스트 캐릭터 B",
  targetExposure: "MEDIUM",
  observationNote: "",
  usedItemId: "",
  usedItemContaminated: false,
  narration: "테스트 캐릭터 A가 B를 앞쪽으로 밀어낸다.",
});
assert.equal(pushResult.targetId, "test_b");
assert.equal(pushState.characters.test_a.contamination, 0);
assert(pushState.characters.test_b.contamination >= 4, "named teammate can receive separate exposure");
assert.equal(pushState.sessions.s1.activeEncounter.currentIndex, 1, "CURRENT should advance only one unresolved hazard");

assert(source.includes("/api/resolve-hazard-flex"), "runtime should use the flexible AI endpoint");
assert(source.includes("selfExposure"), "exposure must be independent from success/failure");
assert(source.includes("flexInsights"), "observations should persist for later hazard actions");
assert(source.includes('appendLog(latestSession, "action-input", cleanAction, uid'), "slash hazard actions must be recorded as SYSTEM action-input, not chat interaction");
assert(!source.includes('appendLog(latestSession, "interaction", action, uid'), "hazard actions must never be routed into the ordinary chat timeline");

console.log("PASS: flexible hazards support one-action clears, observation memory, teammate impact, SYSTEM action routing, and non-forced contamination");
