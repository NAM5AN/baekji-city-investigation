import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("cross-party-hazard-interaction.js", "utf8");

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
  places: { A: { name: "출발" }, B: { name: "도착" }, C: { name: "다른 구역" } },
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

vm.runInContext(source, context, { filename: "cross-party-hazard-interaction.js" });
const api = context.__BAEKJI_CROSS_PARTY_HAZARD__;
assert(api, "cross-party hazard test API should be exposed");

function encounter(fromNode = "A", targetNode = "B") {
  return {
    fromNode,
    targetNode,
    ambientRuleId: "EXP_AMBIENT_A",
    hazards: ["H1", "H2"],
    currentIndex: 0,
    overview: "발판과 잔류물이 겹친 통로",
    resolutions: [],
  };
}

const state = {
  version: 3,
  characters: {
    test_a: { id: "test_a", contamination: 0, symptom: "안정", inventory: {}, currentSessionId: "s1" },
    test_b: { id: "test_b", contamination: 0, symptom: "안정", inventory: {}, currentSessionId: "s1" },
    test_c: { id: "test_c", contamination: 0, symptom: "안정", inventory: {}, currentSessionId: "s2" },
    remote: { id: "remote", contamination: 0, symptom: "안정", inventory: {}, currentSessionId: "s3" },
  },
  sessions: {
    s1: { id: "s1", status: "ACTIVE", variant: "c", memberIds: ["test_a", "test_b"], currentNode: "A", currentDetailId: null, logs: [], activeEncounter: encounter() },
    s2: { id: "s2", status: "ACTIVE", variant: "c", memberIds: ["test_c"], currentNode: "A", currentDetailId: null, logs: [], activeEncounter: encounter() },
    s3: { id: "s3", status: "ACTIVE", variant: "c", memberIds: ["remote"], currentNode: "C", currentDetailId: null, logs: [], activeEncounter: encounter("C", "B") },
  },
};

assert.equal(api.spatialScopeKey(state.sessions.s1), "route:A:B");
assert.deepEqual(Array.from(api.fieldSessions(state, state.sessions.s1), (item) => item.id), ["s2"], "only sessions in the exact same live field should be interactable");

const present = api.presentCharacters(state, state.sessions.s1);
assert(present.some((item) => item.id === "test_c" && item.ownParty === false), "other party member in the same field should be present");
assert(!present.some((item) => item.id === "remote"), "character in another field must not be targetable");

const external = api.externalTargetForAction(state, state.sessions.s1, "test_a", "테스트 캐릭터 C를 밀어 앞세운다");
assert.equal(external?.id, "test_c", "explicitly named member of another party in the same field should resolve as a target");
assert.equal(external?.sessionId, "s2");

const ownPartyTarget = api.externalTargetForAction(state, state.sessions.s1, "test_a", "테스트 캐릭터 B를 밀어 앞세운다");
assert.equal(ownPartyTarget, null, "same-party targets should remain with the normal flexible hazard handler");

const contextPayload = api.hazardContext(state, state.sessions.s1, "test_a", "테스트 캐릭터 C를 밀어 앞세운다");
assert(contextPayload.partyMembers.some((item) => item.id === "test_c"), "AI context should include other-party characters sharing the field");
assert(!contextPayload.partyMembers.some((item) => item.id === "remote"), "AI context must not expose characters in another field");

const beforeTargetProgress = state.sessions.s2.activeEncounter.currentIndex;
const result = api.applyDecision(state, "s1", "test_a", "테스트 캐릭터 C를 밀어 앞세운다", external, {
  outcome: "PARTIAL",
  progress: "CURRENT",
  selfExposure: "NONE",
  targetName: "테스트 캐릭터 C",
  targetExposure: "MEDIUM",
  observationNote: "",
  usedItemId: "",
  usedItemContaminated: false,
  narration: "테스트 캐릭터 A가 같은 통로의 테스트 캐릭터 C를 앞으로 밀어낸다.",
});
assert.equal(result.applied, true);
assert.equal(result.targetId, "test_c");
assert(state.characters.test_c.contamination >= 4, "other-party target should receive its own exposure result");
assert.equal(state.characters.test_a.contamination, 0, "actor exposure should remain independently judged");
assert.equal(state.sessions.s1.activeEncounter.currentIndex, 1, "actor party progress may advance");
assert.equal(state.sessions.s2.activeEncounter.currentIndex, beforeTargetProgress, "target party progress must not be hijacked by another party's action");
assert(state.sessions.s2.logs.some((entry) => entry.kind === "CROSS_PARTY_HAZARD_IMPACT"), "target party should see the cross-party incident in its own log");

const interactionSource = fs.readFileSync("character-interaction-ai.js", "utf8");
const interactionContext = vm.createContext({ console, window: {}, structuredClone });
interactionContext.window = interactionContext;
interactionContext.DAY1_DATA = {};
vm.runInContext(interactionSource, interactionContext, { filename: "character-interaction-ai.js" });
const interactionApi = interactionContext.__BAEKJI_CHARACTER_INTERACTION_TEST__;
assert(interactionApi, "general character interaction test API should be exposed");

const sceneState = {
  version: 3,
  characters: {
    test_b: { id: "test_b", currentSessionId: "scene1" },
    test_a: { id: "test_a", currentSessionId: "scene2" },
  },
  sessions: {
    scene1: { id: "scene1", status: "ACTIVE", variant: "a", memberIds: ["test_b"], currentNode: "E_ENTRY", currentDetailId: null, logs: [] },
    scene2: { id: "scene2", status: "ACTIVE", variant: "a", memberIds: ["test_a"], currentNode: "E_ENTRY", currentDetailId: null, logs: [] },
  },
};
const sceneTarget = interactionApi.targetForAction(sceneState, sceneState.sessions.scene1, "test_b", "캐릭터A를 밀친다");
assert.equal(sceneTarget?.id, "test_a", "demo login alias 캐릭터A should resolve the real same-field target");
assert.equal(sceneTarget?.sessionId, "scene2");
assert.equal(interactionApi.particleFor("산", "이/가"), "이");
assert.equal(interactionApi.particleFor("하늘", "을/를"), "을");
assert.equal(interactionApi.particleFor("소라", "을/를"), "를");
assert.equal(interactionApi.particleFor("테스트 캐릭터 A", "을/를"), "를");
assert.equal(
  interactionApi.fixNameParticles("산가 테스트 캐릭터 A을 밀친다.", ["산", "테스트 캐릭터 A"]),
  "산이 테스트 캐릭터 A를 밀친다.",
  "name particles should be corrected after AI narration",
);
const fallbackInteraction = interactionApi.fallbackDecision("캐릭터A를 밀친다", "산", "테스트 캐릭터 A", "stable-seed");
assert.match(fallbackInteraction.narration, /산이/);
assert.match(fallbackInteraction.narration, /테스트 캐릭터 A를/);
assert.equal(interactionApi.shouldDeferToHazard({ activeEncounter: {} }, "캐릭터A를 밀친다"), false, "plain character interaction inside a hazard should still get its own immediate result");
assert.equal(interactionApi.shouldDeferToHazard({ activeEncounter: {} }, "캐릭터A를 앞세워 위험을 통과한다"), true, "hazard-progress character action should stay with the hazard resolver");
assert.match(interactionSource, /fieldObservationBroadcasted: true/, "general interaction input must suppress duplicate generic field observation");
assert.match(interactionSource, /CHARACTER_INTERACTION_RESULT/, "resolved interaction must be copied as one canonical result to observers");

const apiIndexSource = fs.readFileSync("api/index.mjs", "utf8");
const indexSource = fs.readFileSync("index.html", "utf8");
assert.match(apiIndexSource, /\/api\/resolve-character-interaction/);
assert.match(apiIndexSource, /character_interaction_resolution/);
assert.match(apiIndexSource, /밀기, 당기기, 붙잡기, 때리기/);
assert.match(indexSource, /character-interaction-ai\.js\?v=0\.3\.98/);
assert(indexSource.indexOf("character-interaction-ai.js?v=0.3.98") < indexSource.indexOf("cross-party-hazard-interaction.js?v=0.3.76"), "general interaction interceptor must load before the hazard-specific interceptor");

console.log("PASS: same-field characters from other investigation parties can be targeted, general character interactions get AI outcomes, and Korean name particles are normalized");
