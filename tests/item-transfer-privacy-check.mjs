import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

for (const file of ["app.js", "action-log-sync.js", "render-motion-stability.js", "runtime-baseline-stability.js"]) {
  const consumer = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(consumer, /recipientCharacterIds/, `${file} must retain participant-only lifecycle visibility`);
  assert.match(consumer, /excludedCharacterIds/, `${file} must retain public-observation visibility`);
}

const clients = ["item-transfer-button.js", "item-transfer-input.js", "item-transfer-modal.js", "item-transfer-sender.js", "item-transfer-timeout.js", "item-transfer-lifecycle.js"];
const commandNames = ["OFFER_ITEM_TRANSFER_V1", "RESOLVE_ITEM_TRANSFER_V1", "CANCEL_ITEM_TRANSFER_V1", "EXPIRE_ITEM_TRANSFER_V1"];
const sources = new Map(clients.map((file) => [file, fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8")]));
for (const source of sources.values()) assert.doesNotMatch(source, /(?:UI\.write|persistence\.writeRaw|T\.(?:createOffer|resolveOffer)|L\.cancel)/, "browser transfer paths must only send intents, never mutate canonical world state");
for (const name of commandNames) assert.ok([...sources.values()].some((source) => source.includes(name)), `${name} must have a browser intent owner`);

const core = fs.readFileSync(new URL("../item-transfer-core.js", import.meta.url), "utf8");
const box = { window: { __BAEKJI_DOMAIN_RULES__: { spatialScopeKey: (session) => `node:${session.currentNode}` } }, globalThis: {}, Date, JSON, Map, Set, Object, String, Number, Math, console, sessionStorage: { getItem: () => "" } };
box.globalThis.window = box.window;
vm.createContext(box);
vm.runInContext(core, box);
const T = box.window.__BAEKJI_ITEM_TRANSFER_TEST__;
const state = { version: 3, characters: { test_a: { currentSessionId: "a", inventory: { lamp: { itemId: "lamp", name: "손전등", quantity: 1, state: "CLEAN" } } }, test_b: { currentSessionId: "b", inventory: {} }, test_c: { currentSessionId: "c", inventory: {} } }, sessions: { a: { id: "a", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_a"], logs: [] }, b: { id: "b", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_b"], logs: [] }, c: { id: "c", status: "ACTIVE", variant: "a", currentNode: "N", memberIds: ["test_c"], logs: [] } } };
const offer = T.createOffer(state, { giverId: "test_a", receiverId: "test_b", inventoryKey: "lamp", actionText: "손전등을 건넨다" });
assert.equal(offer.ok, true);
assert.ok(state.sessions.a.logs.some((entry) => entry.recipientCharacterIds?.includes("test_a") && entry.recipientCharacterIds?.includes("test_b")), "server-side offer semantics retain participant-only detail");
assert.ok(state.sessions.c.logs.some((entry) => entry.excludedCharacterIds?.includes("test_a") && entry.excludedCharacterIds?.includes("test_b")), "server-side offer semantics retain privacy-safe observer text");

console.log("PASS: item transfer preserves privacy metadata while browser paths dispatch only authoritative command intents");
