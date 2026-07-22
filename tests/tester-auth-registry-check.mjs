import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("tester-auth.js", "utf8");
const testerId = "11111111-2222-4333-8444-555555555555";
const globalKey = "baekji_city_mvp_state_v3";
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
  },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const localValues = new Map([[globalKey, JSON.stringify(initialWorld)]]);
const sessionValues = new Map();
const context = vm.createContext({
  console,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  addEventListener() {},
  removeEventListener() {},
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
  location: { hash: "#/login" },
  document: {
    documentElement: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return {}; },
  },
  MutationObserver: class {
    constructor(callback) { this.callback = callback; }
    observe() {}
  },
  fetch: async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{
        id: testerId,
        character_name: "신규 테스터",
        profile_photo: "data:image/jpeg;base64,AA==",
      }];
    },
  }),
});
context.window = context;

vm.runInContext(source, context, { filename: "tester-auth.js" });
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

const result = JSON.parse(vm.runInContext(`JSON.stringify((() => {
  const state = JSON.parse(localStorage.getItem(${JSON.stringify(globalKey)}));
  const registry = {
    test_a: { id: "test_a", loginId: "캐릭터A", password: "1234" },
    test_b: { id: "test_b", loginId: "캐릭터B", password: "1234" },
    test_c: { id: "test_c", loginId: "캐릭터C", password: "1234" },
  };
  const ordinaryObject = {
    test_a: state.characters.test_a,
    test_b: state.characters.test_b,
    test_c: state.characters.test_c,
  };
  const characterValues = Object.values(state.characters);
  return {
    characterCount: characterValues.length,
    validCharacterCount: characterValues.filter((entry) => entry && typeof entry.contamination === "number" && entry.inventory && typeof entry.inventory === "object").length,
    registryCount: Object.values(registry).length,
    registryTesterName: registry[${JSON.stringify(testerId)}]?.name || null,
    ordinaryTesterLookup: ordinaryObject[${JSON.stringify(testerId)}] || null,
    testerCharacterId: state.characters[${JSON.stringify(testerId)}]?.id || null,
  };
})())`, context));

assert.equal(result.characterCount, 4, "world character enumeration must not append a duplicate tester account profile");
assert.equal(result.validCharacterCount, 4, "every enumerated world entry must remain a character state record");
assert.equal(result.registryCount, 4, "the demo user registry should include the dynamic tester exactly once");
assert.equal(result.registryTesterName, "신규 테스터", "direct demo registry lookup should resolve the dynamic tester");
assert.equal(result.ordinaryTesterLookup, null, "ordinary objects must not inherit tester account records");
assert.equal(result.testerCharacterId, testerId, "the tester character state should be created normally");

console.log("PASS: tester login registry bridge stays isolated from world character state");
