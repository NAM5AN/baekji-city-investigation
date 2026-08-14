import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../item-transfer-core.js", import.meta.url), "utf8");
const lifecycleSource = fs.readFileSync(new URL("../item-transfer-lifecycle.js", import.meta.url), "utf8");
for (const file of ["app.js", "action-log-sync.js", "render-motion-stability.js", "runtime-baseline-stability.js"]) {
  const consumer = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(consumer, /recipientCharacterIds/, `${file} must retain participant-only lifecycle visibility`);
  assert.match(consumer, /excludedCharacterIds/, `${file} must retain public-observation visibility`);
}

const box = {
  window: { __BAEKJI_DOMAIN_RULES__: { spatialScopeKey: (session) => `node:${session.currentNode}` } },
  globalThis: {}, Date, JSON, Map, Set, Object, String, Number, Math, console,
};
box.globalThis.window = box.window;
box.window.addEventListener = () => {};
box.localStorage = { getItem: () => null, setItem: () => {} };
box.sessionStorage = { getItem: () => "" };
box.setInterval = () => 0;
box.queueMicrotask = () => {};
vm.createContext(box);
vm.runInContext(source, box);
box.window.BAEKJI_ITEM_TRANSFER_UI = {};
vm.runInContext(lifecycleSource, box);
const T = box.window.__BAEKJI_ITEM_TRANSFER_TEST__;
const L = box.window.BAEKJI_ITEM_TRANSFER_LIFECYCLE;

const ids = ["test_a", "test_b", "test_c", "test_d"];
const state = {
  version: 3,
  characters: Object.fromEntries(ids.map((id) => [id, { currentSessionId: id === "test_d" ? "s_d" : "s_abc", inventory: {} }])),
  sessions: {
    s_abc: { id: "s_abc", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_a", "test_b", "test_c"], logs: [] },
    s_d: { id: "s_d", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_d"], logs: [] },
  },
};
state.characters.test_a.inventory.lamp = { itemId: "lamp", name: "손전등", quantity: 1, state: "CLEAN" };

const created = T.createOffer(state, {
  giverId: "test_a",
  receiverId: "test_b",
  inventoryKey: "lamp",
  actionText: "테스트 캐릭터 B에게 손전등을 건넨다",
});
assert.equal(created.ok, true);

const detailedAudience = ["test_a", "test_b"];
const publicAudience = detailedAudience;
const lifecycle = (sessionId, type) => state.sessions[sessionId].logs.filter((entry) => entry.type === type);
const assertDualAudience = (type, decision) => {
  const mixed = lifecycle("s_abc", type);
  const observer = lifecycle("s_d", type);
  assert.equal(mixed.filter((entry) => entry.recipientCharacterIds).length, 1, `A/B receive one detailed ${decision} lifecycle line`);
  assert.equal(mixed.filter((entry) => entry.excludedCharacterIds).length, 1, `same-party nonparticipant C receives one generic ${decision} observation`);
  assert.equal(observer.length, 1, `other-party D receives one generic ${decision} observation`);
  for (const entry of mixed.filter((entry) => entry.recipientCharacterIds)) {
    assert.deepEqual([...entry.recipientCharacterIds].sort(), detailedAudience, "detail is allowlisted to the two participants only");
    assert.match(entry.text, /테스트 캐릭터 A|테스트 캐릭터 B/, "detailed lifecycle uses canonical registry names");
    assert.doesNotMatch(entry.text, /test_[a-z]|undefined|\?/, "detailed lifecycle never leaks IDs or fallbacks");
  }
  for (const entry of [...mixed.filter((entry) => entry.excludedCharacterIds), ...observer]) {
    assert.deepEqual([...entry.excludedCharacterIds].sort(), publicAudience, "generic observation excludes both detailed participants");
    assert.doesNotMatch(entry.text, /손전등|테스트 캐릭터|test_[a-z]|×1/, "generic observation leaks no identity, item, or quantity");
  }
};

assertDualAudience("item-transfer-offer", "offer");
const input = lifecycle("s_abc", "action-input");
assert.equal(input.length, 1, "the free-action request remains as one source log before a decision");
assert.deepEqual([...input[0].recipientCharacterIds].sort(), detailedAudience, "raw transfer action-input is participant-allowlisted");
assert.equal(input[0].fieldObservationBroadcasted, true, "action-log sync must not synthesize a second public field-action");
assert.equal(lifecycle("s_d", "action-input").length, 0, "other-party observers never receive raw free-action text");
assert.equal(lifecycle("s_d", "field-action").length, 0, "the allowlisted action must not duplicate as a field action");

assert.equal(T.resolveOffer(state, created.offer.id, "test_b", "REJECT").ok, true);
assertDualAudience("item-transfer-reject", "reject");
assert.equal(lifecycle("s_d", "field-action").length, 0, "decision broadcast still produces no duplicate observer field-action");

const freshState = () => ({
  version: 3,
  characters: Object.fromEntries(ids.map((id) => [id, { currentSessionId: id === "test_d" ? "s_d" : "s_abc", inventory: {} }])),
  sessions: {
    s_abc: { id: "s_abc", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_a", "test_b", "test_c"], logs: [] },
    s_d: { id: "s_d", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_d"], logs: [] },
  },
});
const assertCancellationAudience = (next, mode) => {
  const mixed = next.sessions.s_abc.logs.filter((entry) => entry.type === "item-transfer-cancelled");
  const observer = next.sessions.s_d.logs.filter((entry) => entry.type === "item-transfer-cancelled");
  assert.equal(mixed.filter((entry) => entry.recipientCharacterIds).length, 1, `${mode} cancellation keeps exactly one detailed participant line`);
  assert.equal(mixed.filter((entry) => entry.excludedCharacterIds).length, 1, `${mode} cancellation gives same-party C exactly one generic line`);
  assert.equal(observer.length, 1, `${mode} cancellation gives other-party D exactly one generic line`);
  for (const entry of [...mixed.filter((entry) => entry.excludedCharacterIds), ...observer]) {
    assert.doesNotMatch(entry.text, /손전등|테스트 캐릭터|test_[a-z]|×1/, `${mode} generic cancellation leaks no identity, item, or quantity`);
  }
};
const manualState = freshState();
manualState.characters.test_a.inventory.lamp = { itemId: "lamp", name: "손전등", quantity: 1, state: "CLEAN" };
const manualOffer = T.createOffer(manualState, { giverId: "test_a", receiverId: "test_b", inventoryKey: "lamp" }).offer;
assert.equal(L.cancel(manualState, manualOffer.id, "test_a").ok, true, "giver can manually cancel the unresolved offer");
assertCancellationAudience(manualState, "manual");

const autoState = freshState();
autoState.characters.test_a.inventory.lamp = { itemId: "lamp", name: "손전등", quantity: 1, state: "CLEAN" };
const autoOffer = T.createOffer(autoState, { giverId: "test_a", receiverId: "test_b", inventoryKey: "lamp" }).offer;
autoState.sessions.s_abc.currentNode = "N";
autoState.characters.test_b.currentSessionId = "s_b";
autoState.sessions.s_b = { id: "s_b", status: "ACTIVE", variant: "a", currentNode: "OTHER", memberIds: ["test_b"], logs: [] };
L.reconcile(autoState);
assert.equal(autoState.itemTransferResolutions?.find((entry) => entry.transferId === autoOffer.id)?.decision, "CANCELLED", "separation auto-cancels the unresolved offer");
assertCancellationAudience(autoState, "automatic");

console.log("PASS: same-session participants receive canonical detail while C/D receive one privacy-safe observation without duplicate field actions");
