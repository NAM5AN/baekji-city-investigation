import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const guardSource = fs.readFileSync("tester-registry-guard.js", "utf8");
const source = fs.readFileSync("tester-auth.js", "utf8");
const testerId = "11111111-2222-4333-8444-555555555555";
const demoAId = "aaaaaaaa-1111-4111-8111-111111111111";
const demoBId = "bbbbbbbb-2222-4222-8222-222222222222";
const demoCId = "cccccccc-3333-4333-8333-333333333333";
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
  },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const localValues = new Map([[globalKey, JSON.stringify(initialWorld)]]);
// This regression covers the authenticated path. Logged-out read-only behavior is
// covered separately by cross-tab-guest-world-write-check.mjs.
const sessionValues = new Map([[userKey, testerId]]);
class TestEvent {
  constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
}
const context = vm.createContext({
  console,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  setInterval() { return 1; },
  clearInterval() {},
  Event: TestEvent,
  CustomEvent: class CustomEvent extends TestEvent {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
  },
  HashChangeEvent: TestEvent,
  StorageEvent: TestEvent,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
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
      return [
        { id: demoAId, character_name: "테스트 캐릭터 A", profile_photo: "" },
        { id: demoBId, character_name: "테스트 캐릭터 B", profile_photo: "" },
        { id: demoCId, character_name: "테스트 캐릭터 C", profile_photo: "" },
        { id: testerId, character_name: "신규 테스터", profile_photo: "data:image/jpeg;base64,AA==" },
      ];
    },
  }),
});
context.window = context;

vm.runInContext(guardSource, context, { filename: "tester-registry-guard.js" });
vm.runInContext(source, context, { filename: "tester-auth.js" });
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

const result = JSON.parse(vm.runInContext(`JSON.stringify((() => {
  const state = JSON.parse(localStorage.getItem(${JSON.stringify(globalKey)}));
  const registry = {
    test_a: { id: "test_a", loginId: "캐릭터A", password: "1234", name: "테스트 캐릭터 A" },
    test_b: { id: "test_b", loginId: "캐릭터B", password: "1234", name: "테스트 캐릭터 B" },
    test_c: { id: "test_c", loginId: "캐릭터C", password: "1234", name: "테스트 캐릭터 C" },
  };
  const registryValues = Object.values(registry);
  const ordinaryObject = { value: 1 };
  const characterValues = Object.values(state.characters);
  return {
    characterCount: characterValues.length,
    validCharacterCount: characterValues.filter((entry) => entry && typeof entry.contamination === "number" && entry.inventory && typeof entry.inventory === "object").length,
    legacyWorldCount: ["test_a","test_b","test_c"].filter((id) => state.characters[id]).length,
    registryCount: registryValues.length,
    registryTesterName: registry[${JSON.stringify(testerId)}]?.name || null,
    registryAName: registry[${JSON.stringify(demoAId)}]?.name || null,
    legacyRegistryCount: ["test_a","test_b","test_c"].filter((id) => Object.prototype.hasOwnProperty.call(registry, id)).length,
    ordinaryTesterLookup: ordinaryObject[${JSON.stringify(testerId)}] || null,
    testerCharacterId: state.characters[${JSON.stringify(testerId)}]?.id || null,
    demoACharacterId: state.characters[${JSON.stringify(demoAId)}]?.id || null,
  };
})())`, context));

assert.equal(result.characterCount, 4, "world characters should come only from the four Supabase tester rows");
assert.equal(result.validCharacterCount, 4, "every Supabase tester must have a valid character state");
assert.equal(result.legacyWorldCount, 0, "legacy test_a/test_b/test_c world records must be pruned when they are not referenced");
assert.equal(result.registryCount, 4, "app user registry should expose one unified Supabase tester category");
assert.equal(result.registryTesterName, "신규 테스터");
assert.equal(result.registryAName, "테스트 캐릭터 A", "A/B/C must be real Supabase directory accounts");
assert.equal(result.legacyRegistryCount, 0, "legacy built-in demo registry entries must be suppressed after matching Supabase rows load");
assert.equal(result.ordinaryTesterLookup, null, "ordinary objects must not inherit tester account records");
assert.equal(result.testerCharacterId, testerId);
assert.equal(result.demoACharacterId, demoAId);

assert.doesNotMatch(source, /requiredIds = new Set\(\[\.\.\.DEMO_USER_IDS/, "tester auth must not force legacy demo IDs into every world state");
console.log("PASS: authenticated A/B/C and newly signed-up users share one Supabase tester directory and one UUID character path");
