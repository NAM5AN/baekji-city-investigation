import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { applyOperation } from "../api/admin-control.mjs";

const item = Object.freeze({
  itemId: "ITEM_039::used", baseItemId: "ITEM_039", catalogItemId: "ITEM_039",
  name: "사용한 볼펜", category: "일반", quantity: 2, state: "USED",
  condition: "ink-low", remainingUses: 3, nested: { marks: ["A", "B"] },
});

function world() {
  return {
    version: 3, eventSeq: 0, adminControlSeq: 4, adminControlPatches: [],
    characters: {
      test_a: { id: "test_a", inventory: { pen: structuredClone(item) } },
      test_b: { id: "test_b", inventory: {} },
      test_c: { id: "test_c", inventory: {} },
    },
    parties: {}, sessions: {}, itemTransferOffers: [], itemTransferResolutions: [],
    itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    fieldItemPlacementsByVariant: { a: {}, b: {}, c: {}, d: {} },
    fieldItemPlacementClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    unrelated: { keep: true },
  };
}

const removed = applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_REMOVE", targetCharacterId: "test_a",
  sourceCharacterId: "test_a", sourceInventoryKey: "pen",
}, "remove-1", 1000);
assert.equal(removed.state.characters.test_a.inventory.pen, undefined, "REMOVE deletes the exact inventory entry");
assert.deepEqual(removed.before.source.item, item, "REMOVE audit preserves the complete prior item");
assert.equal(removed.after.source.item, null);
assert.deepEqual(removed.patch.data.inventoryChanges, [{ characterId: "test_a", inventoryKey: "pen", item: null }]);
assert.deepEqual(removed.state.unrelated, { keep: true });

const placed = applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_PLACE", targetCharacterId: "test_a",
  sourceCharacterId: "test_a", sourceInventoryKey: "pen", variant: "c", objectId: "E_OBJ_002",
}, "place-1", 1234);
const placementId = "field_item_place-1";
assert.equal(placed.state.characters.test_a.inventory.pen, undefined, "PLACE consumes the whole source entry atomically");
const placement = placed.state.fieldItemPlacementsByVariant.c[placementId];
assert.equal(placement.objectId, "E_OBJ_002");
assert.equal(placement.sourceInventoryKey, "pen");
assert.ok(Number(placement.placedAt) > 0);
assert.deepEqual(placement.item, item, "PLACE retains state, quantity, custom fields, and nested data");
assert.deepEqual(placed.patch.data.inventoryChanges, [{ characterId: "test_a", inventoryKey: "pen", item: null }]);
assert.deepEqual(placed.patch.data.fieldPlacementChange.placement, placement, "cloud patch includes the immutable placement payload");
assert.equal(placed.metadata.placeId, "E_G_PLAZA");
assert.equal(placed.metadata.detailId, "E_G_INFO");
assert.throws(() => applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_PLACE", targetCharacterId: "test_a",
  sourceCharacterId: "test_a", sourceInventoryKey: "pen", variant: "c", objectId: "NOT_AN_OBJECT",
}, "bad-place"), /ADMIN_FIELD_OBJECT_NOT_FOUND/);
assert.throws(() => applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_REMOVE", targetCharacterId: "test_b",
  sourceCharacterId: "test_a", sourceInventoryKey: "pen",
}, "bad-remove"), /ADMIN_ITEM_DISPOSITION_TARGET_MISMATCH/);

const reserved = world();
reserved.itemTransferOffers.push({ id: "offer", giverId: "test_a", sourceInventoryKey: "pen", expiresAt: Date.now() + 60_000 });
for (const mode of ["CHARACTER_REMOVE", "CHARACTER_PLACE"]) {
  assert.throws(() => applyOperation(reserved, {
    operation: "INVENTORY_TRANSFER", mode, targetCharacterId: "test_a", sourceCharacterId: "test_a", sourceInventoryKey: "pen",
    variant: "c", objectId: "E_OBJ_002",
  }, `reserved-${mode}`), /ADMIN_ITEM_TRANSFER_RESERVED/, `${mode} cannot invalidate an active player offer`);
}
assert.throws(() => applyOperation(reserved, {
  operation: "INVENTORY_SET", characterId: "test_a", itemId: "pen", quantity: 0,
}, "reserved-legacy-remove"), /ADMIN_ITEM_TRANSFER_RESERVED/, "legacy quantity-zero removal cannot bypass an active player offer");

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const worldPersistence = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const worldStore = fs.readFileSync(new URL("../world-store.js", import.meta.url), "utf8");
const domainRules = fs.readFileSync(new URL("../runtime-domain-rules.js", import.meta.url), "utf8");
const dataSource = fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8");
const end = appSource.indexOf("  function endSession(");
assert.ok(end > 0, "field item runtime seam precedes session result rendering");
const appContext = vm.createContext({
  window: {}, document: { getElementById() { return null; } },
  localStorage: { getItem() { return null; } }, sessionStorage: { getItem() { return "test_b"; } },
  console, structuredClone, Intl, Date, Math, JSON, String, Object, Array, Set, Map, queueMicrotask(callback) { callback(); },
});
appContext.window = appContext;
vm.runInContext(dataSource, appContext, { filename: "day1-data.js" });
vm.runInContext(runtimeUtils, appContext, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, appContext, { filename: "world-persistence.js" });
vm.runInContext(worldStore, appContext, { filename: "world-store.js" });
vm.runInContext(domainRules, appContext, { filename: "runtime-domain-rules.js" });
vm.runInContext(`${appSource.slice(0, end)}\nwindow.__FIELD_ITEM_RUNTIME__ = { fieldObjectItems, availableObjectItems, takeFieldPlacementItemState };\n})();`, appContext, { filename: "field-item-runtime.js" });
const fieldApi = appContext.window.__FIELD_ITEM_RUNTIME__;

function activeFieldState() {
  const state = structuredClone(placed.state);
  state.sessions.s1 = { id: "s1", status: "ACTIVE", variant: "c", currentNode: "E_G_PLAZA", memberIds: ["test_b", "test_c"], inspectedObjectIds: ["E_OBJ_002"], takenItemKeys: [], logs: [] };
  state.characters.test_b.currentSessionId = "s1";
  state.characters.test_c.currentSessionId = "s1";
  return state;
}

const fieldState = activeFieldState();
const visible = fieldApi.availableObjectItems(fieldState, fieldState.sessions.s1, "E_OBJ_002");
const dynamic = visible.find((entry) => entry.fieldPlacementId === placementId);
assert.ok(dynamic, "admin-placed inventory appears in the ordinary inspected-object item list");
assert.equal(dynamic.name, "사용한 볼펜");
assert.equal(dynamic.default, 2);
const pickup = fieldApi.takeFieldPlacementItemState(fieldState, { sessionId: "s1", objectId: "E_OBJ_002", placementId, characterId: "test_b", at: 2000 });
assert.equal(pickup.ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(fieldState.characters.test_b.inventory.pen)), { ...item, _fieldPlacementId: placementId }, "pickup restores the whole stateful item to inventory");
assert.equal(fieldState.fieldItemPlacementClaimsByVariant.c[placementId].characterId, "test_b");
assert.equal(fieldApi.availableObjectItems(fieldState, fieldState.sessions.s1, "E_OBJ_002").some((entry) => entry.fieldPlacementId === placementId), false, "claimed placement disappears from the field");
assert.equal(fieldApi.takeFieldPlacementItemState(fieldState, { sessionId: "s1", objectId: "E_OBJ_002", placementId, characterId: "test_c", at: 2001 }).ok, false, "repeat or competing pickup cannot duplicate the item");
assert.equal(Object.keys(fieldState.characters.test_c.inventory).length, 0);

const collisionState = activeFieldState();
collisionState.characters.test_b.inventory.pen = { itemId: "pen", name: "다른 볼펜", quantity: 1, state: "CLEAN" };
const collisionPickup = fieldApi.takeFieldPlacementItemState(collisionState, { sessionId: "s1", objectId: "E_OBJ_002", placementId, characterId: "test_b", at: 2002 });
assert.equal(collisionPickup.ok, true);
assert.notEqual(collisionPickup.targetInventoryKey, "pen", "pickup never overwrites an existing inventory key");
assert.equal(collisionState.characters.test_b.inventory.pen.name, "다른 볼펜");
assert.equal(collisionState.characters.test_b.inventory[collisionPickup.targetInventoryKey].state, "USED");
assert.deepEqual(collisionState.characters.test_b.inventory[collisionPickup.targetInventoryKey].nested, item.nested);

const cloudSource = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
class Storage { getItem() { return null; } setItem() {} removeItem() {} }
const cloudWindow = { addEventListener() {}, dispatchEvent() {} };
const cloudContext = vm.createContext({ window: cloudWindow, document: { hidden: false, documentElement: { dataset: {} }, addEventListener() {} }, Storage, localStorage: new Storage(), sessionStorage: new Storage(), CustomEvent: class {}, Event: class {}, StorageEvent: class {}, AbortController, setTimeout: () => 0, clearTimeout() {}, fetch: async () => ({ ok: true, status: 200, json: async () => [] }), console, Date, Math, JSON, Object, Array, Number, String, Boolean, Set, Map });
cloudContext.globalThis = cloudContext;
vm.runInContext(cloudSource, cloudContext, { filename: "cloud-state-sync.js" });
const cloudApi = cloudWindow.__BAEKJI_CLOUD_SYNC_TEST__;
const replay = world();
cloudApi.applyAdminControlPatch(replay, placed.patch);
assert.equal(replay.characters.test_a.inventory.pen, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(replay.fieldItemPlacementsByVariant.c[placementId])), placement, "stale tabs replay field placement with source deletion");

const remoteWinner = activeFieldState();
fieldApi.takeFieldPlacementItemState(remoteWinner, { sessionId: "s1", objectId: "E_OBJ_002", placementId, characterId: "test_b", at: 3000 });
const staleLoser = activeFieldState();
fieldApi.takeFieldPlacementItemState(staleLoser, { sessionId: "s1", objectId: "E_OBJ_002", placementId, characterId: "test_c", at: 3001 });
const converged = cloudApi.reconcileFieldItemPlacements(remoteWinner, staleLoser, cloudApi.mergeValues(remoteWinner, staleLoser));
assert.equal(converged.fieldItemPlacementClaimsByVariant.c[placementId].characterId, "test_b", "server-known remote claim wins a stale competing pickup");
assert.ok(Object.values(converged.characters.test_b.inventory).some((entry) => entry._fieldPlacementId === placementId));
assert.equal(Object.values(converged.characters.test_c.inventory).some((entry) => entry._fieldPlacementId === placementId), false, "losing stale inventory copy is removed during convergence");

const resetRemote = world();
resetRemote.fieldItemPlacementsByVariant = { a: {}, b: {}, c: {}, d: {} };
resetRemote.fieldItemPlacementClaimsByVariant = { a: {}, b: {}, c: {}, d: {} };
const resetRebase = cloudApi.rebaseUnsyncedOverlay(placed.state, placed.state, resetRemote);
assert.deepEqual(JSON.parse(JSON.stringify(resetRebase.fieldItemPlacementsByVariant)), resetRemote.fieldItemPlacementsByVariant, "admin reset deletion is not resurrected by an unchanged stale overlay");
assert.deepEqual(JSON.parse(JSON.stringify(resetRebase.fieldItemPlacementClaimsByVariant)), JSON.parse(JSON.stringify(resetRemote.fieldItemPlacementClaimsByVariant)), "admin reset also clears field pickup tombstones");

const adminUi = fs.readFileSync(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
assert.match(adminUi, /data-control-item-remove/);
assert.match(adminUi, /mode: "CHARACTER_REMOVE"/);
assert.match(adminUi, /data-control-inventory-transfer="CHARACTER_PLACE"/);
assert.match(adminUi, /data-control-field-source/);
assert.match(adminUi, /data-control-field-variant/);
assert.match(adminUi, /data-control-field-object/);
assert.match(adminUi, /fieldObjectEntries/);

console.log("PASS: admin remove/place, stateful field visibility/pickup, collision, reservation, cloud replay, and competing claim convergence");
