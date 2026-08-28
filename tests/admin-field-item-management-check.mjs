import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { applyOperation } from "../api/admin-control.mjs";

const item = Object.freeze({
  itemId: "ITEM_039::used",
  baseItemId: "ITEM_039",
  catalogItemId: "ITEM_039",
  name: "사용한 볼펜",
  category: "일반",
  quantity: 2,
  state: "USED",
  condition: "ink-low",
  remainingUses: 3,
  nested: { marks: ["A", "B"] },
});

function world() {
  return {
    version: 3,
    eventSeq: 0,
    adminControlSeq: 2,
    adminControlPatches: [],
    characters: {
      test_a: { id: "test_a", inventory: { pen: structuredClone(item) } },
      test_b: { id: "test_b", inventory: {} },
    },
    parties: {},
    sessions: {},
    itemTransferOffers: [],
    itemTransferResolutions: [],
    itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    fieldItemPlacementsByVariant: { a: {}, b: {}, c: {}, d: {} },
    fieldItemPlacementClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    unrelated: { keep: true },
  };
}

function place(source = world(), requestId = "place-manage") {
  return applyOperation(source, {
    operation: "INVENTORY_TRANSFER",
    mode: "CHARACTER_PLACE",
    targetCharacterId: "test_a",
    sourceCharacterId: "test_a",
    sourceInventoryKey: "pen",
    variant: "c",
    objectId: "E_OBJ_002",
  }, requestId, 1000);
}

const placed = place();
const placementId = "field_item_place-manage";

const recalled = applyOperation(placed.state, {
  operation: "INVENTORY_TRANSFER",
  mode: "FIELD_RECALL",
  variant: "c",
  placementId,
}, "recall-1", 2000);
assert.deepEqual(recalled.state.characters.test_a.inventory.pen, item, "recall restores the whole stateful entry to the original owner");
assert.equal(recalled.state.characters.test_a.inventory.pen._fieldPlacementId, undefined, "admin recall is not marked as a player pickup");
assert.equal(recalled.state.fieldItemPlacementsByVariant.c[placementId].id, placementId, "placement history remains durable");
assert.deepEqual(recalled.state.fieldItemPlacementClaimsByVariant.c[placementId], {
  placementId,
  characterId: "test_a",
  targetInventoryKey: "pen",
  claimedAt: recalled.state.fieldItemPlacementClaimsByVariant.c[placementId].claimedAt,
  adminRecalled: true,
});
assert.ok(Number(recalled.state.fieldItemPlacementClaimsByVariant.c[placementId].claimedAt) > 0);
assert.deepEqual(recalled.patch.data.inventoryChanges, [{ characterId: "test_a", inventoryKey: "pen", item }]);
assert.equal(recalled.patch.data.fieldPlacementClaimChange.claim.adminRecalled, true);
assert.deepEqual(recalled.state.unrelated, { keep: true });

const collisionPlaced = place(world(), "place-collision");
collisionPlaced.state.characters.test_a.inventory.pen = { itemId: "pen", name: "다른 물건", quantity: 1, state: "CLEAN" };
const collisionPlacementId = "field_item_place-collision";
const collisionRecall = applyOperation(collisionPlaced.state, {
  operation: "INVENTORY_TRANSFER",
  mode: "FIELD_RECALL",
  variant: "c",
  placementId: collisionPlacementId,
}, "recall-collision", 2001);
const collisionClaim = collisionRecall.state.fieldItemPlacementClaimsByVariant.c[collisionPlacementId];
assert.notEqual(collisionClaim.targetInventoryKey, "pen", "recall never overwrites a later item at the original key");
assert.equal(collisionRecall.state.characters.test_a.inventory.pen.name, "다른 물건");
assert.deepEqual(collisionRecall.state.characters.test_a.inventory[collisionClaim.targetInventoryKey].nested, item.nested);

const deletedPlaced = place(world(), "place-delete");
const deletedPlacementId = "field_item_place-delete";
const deleted = applyOperation(deletedPlaced.state, {
  operation: "INVENTORY_TRANSFER",
  mode: "FIELD_DELETE",
  variant: "c",
  placementId: deletedPlacementId,
}, "delete-1", 2100);
assert.deepEqual(deleted.state.characters.test_a.inventory, {}, "field delete does not return the item to any inventory");
assert.deepEqual(deleted.state.fieldItemPlacementClaimsByVariant.c[deletedPlacementId], {
  placementId: deletedPlacementId,
  characterId: null,
  targetInventoryKey: null,
  claimedAt: deleted.state.fieldItemPlacementClaimsByVariant.c[deletedPlacementId].claimedAt,
  adminDeleted: true,
});
assert.ok(Number(deleted.state.fieldItemPlacementClaimsByVariant.c[deletedPlacementId].claimedAt) > 0);
assert.deepEqual(deleted.patch.data.inventoryChanges, []);
assert.equal(deleted.patch.data.fieldPlacementClaimChange.claim.adminDeleted, true);

for (const mode of ["FIELD_RECALL", "FIELD_DELETE"]) {
  assert.throws(() => applyOperation(recalled.state, {
    operation: "INVENTORY_TRANSFER", mode, variant: "c", placementId,
  }, `claimed-${mode}`, 2200), /ADMIN_FIELD_ITEM_ALREADY_CLAIMED/, `${mode} cannot alter an already recalled placement`);
}

const picked = place(world(), "place-picked");
const pickedPlacementId = "field_item_place-picked";
picked.state.fieldItemPlacementClaimsByVariant.c[pickedPlacementId] = {
  placementId: pickedPlacementId,
  characterId: "test_b",
  targetInventoryKey: "picked-pen",
  sessionId: "s1",
  claimedAt: 2300,
};
picked.state.characters.test_b.inventory["picked-pen"] = { ...structuredClone(item), itemId: "picked-pen", _fieldPlacementId: pickedPlacementId };
for (const mode of ["FIELD_RECALL", "FIELD_DELETE"]) {
  assert.throws(() => applyOperation(picked.state, {
    operation: "INVENTORY_TRANSFER", mode, variant: "c", placementId: pickedPlacementId,
  }, `picked-${mode}`, 2301), /ADMIN_FIELD_ITEM_ALREADY_CLAIMED/, `${mode} loses the race to a completed player pickup`);
}

assert.throws(() => applyOperation(placed.state, {
  operation: "INVENTORY_TRANSFER", mode: "FIELD_RECALL", variant: "a", placementId,
}, "wrong-variant"), /ADMIN_FIELD_ITEM_PLACEMENT_NOT_FOUND/);
assert.throws(() => applyOperation(placed.state, {
  operation: "INVENTORY_TRANSFER", mode: "FIELD_DELETE", variant: "c", placementId: "missing",
}, "missing-placement"), /ADMIN_FIELD_ITEM_PLACEMENT_NOT_FOUND/);

const cloudSource = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
assert.match(cloudSource, /\/api\/player-world-projection/);
assert.doesNotMatch(cloudSource, /(?:applyAdminControlPatch|reconcileFieldItemPlacements|mergeValues)/, "admin field-item changes converge through the next authoritative projection, never a client merge");

const adminUi = fs.readFileSync(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
const adminApi = fs.readFileSync(new URL("../api/admin-control.mjs", import.meta.url), "utf8");
assert.match(adminUi, /현장 배치 물품/);
assert.match(adminUi, /data-control-field-recall/);
assert.match(adminUi, /data-control-field-delete/);
assert.match(adminUi, /원 소유자에게 회수/);
assert.match(adminUi, /현장에서 삭제/);
assert.match(adminUi, /fieldPlacementEntries/);
assert.match(adminUi, /fieldItemPlacementClaimsByVariant/);
assert.match(adminUi, /profileFor\(payload, placement\.sourceCharacterId\)/);
assert.match(adminUi, /data-control-field-manage-confirm/);
assert.match(adminUi, /sendControl\(\{ operation: "INVENTORY_TRANSFER", mode, variant, placementId \},[\s\S]*?, true\)/);
assert.match(adminUi, /이미 습득되었거나 현장에서 사라진 물품입니다/);
assert.match(adminApi, /ADMIN_FIELD_ITEM_PLACEMENT_NOT_FOUND/);
assert.match(adminApi, /ADMIN_FIELD_ITEM_ALREADY_CLAIMED/);

const sessionOpsSource = fs.readFileSync(new URL("../api/admin-session-ops.mjs", import.meta.url), "utf8");
assert.match(sessionOpsSource, /fieldItemPlacementsByVariant: \{ a: \{\}, b: \{\}, c: \{\}, d: \{\} \}/);
assert.match(sessionOpsSource, /fieldItemPlacementClaimsByVariant: \{ a: \{\}, b: \{\}, c: \{\}, d: \{\} \}/);

console.log("PASS: active field item listing, recall/delete, pickup race, collision, cloud replay, and reset contract");
