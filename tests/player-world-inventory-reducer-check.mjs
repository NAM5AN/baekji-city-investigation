import assert from "node:assert/strict";
import { reducePlayerWorldInventoryCommand as reduce, reconcileItemTransfers } from "../lib/player-world-inventory-reducer.mjs";

let sequence = 0;
const idFactory = (prefix) => `${prefix}_${++sequence}`;
const baseState = () => ({
  version: 3,
  characters: {
    a: { id: "a", currentSessionId: "s1", inventory: { water: { itemId: "water", name: "물", quantity: 2, state: "CLEAN" } } },
    b: { id: "b", currentSessionId: "s2", inventory: {} },
  },
  parties: {},
  sessions: {
    s1: { id: "s1", status: "ACTIVE", variant: "a", currentNode: "E_G_PLAZA", memberIds: ["a"], logs: [] },
    s2: { id: "s2", status: "ACTIVE", variant: "a", currentNode: "E_G_PLAZA", memberIds: ["b"], logs: [] },
  },
});
const call = (state, actorId, command, payload, nowMs = 1000) => reduce({ state, actorId, command, payload, nowMs, idFactory, names: { a: "가", b: "나" } });

let state = baseState();
let result = call(state, "a", "OFFER_ITEM_TRANSFER_V1", { receiverId: "b", inventoryKey: "water", quantity: 1, actionText: "물을 건넨다", source: "free-action" });
assert.equal(result.status, "APPLIED");
assert.equal(state.itemTransferOffers, undefined, "input must stay immutable");
state = result.state;
const offerId = state.itemTransferOffers[0].id;
assert.equal(call(state, "a", "RESOLVE_ITEM_TRANSFER_V1", { transferId: offerId, decision: "ACCEPT" }).status, "OUT_OF_SCOPE");
result = call(state, "b", "RESOLVE_ITEM_TRANSFER_V1", { transferId: offerId, decision: "ACCEPT" }, 1200);
assert.equal(result.status, "APPLIED");
assert.equal(result.state.characters.a.inventory.water.quantity, 1);
assert.equal(result.state.characters.b.inventory.water.quantity, 1);

state = baseState();
result = call(state, "a", "OFFER_ITEM_TRANSFER_V1", { receiverId: "b", inventoryKey: "water", quantity: 1 });
state = result.state;
state.sessions.s2.currentNode = "E_G_CONCOURSE";
assert.equal(reconcileItemTransfers(state, { nowMs: 1300, idFactory, names: {} }), true);
assert.equal(state.itemTransferResolutions[0].decision, "CANCELLED");

console.log("PASS: authoritative inventory reducer owns offer, resolution, reservation and location cancellation");
