import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { applyOperation, adminControlHandler } from "../api/admin-control.mjs";

const sourceItem = Object.freeze({
  itemId: "ITEM_LAMP::variant_old", catalogItemId: "ITEM_LAMP", baseItemId: "ITEM_LAMP",
  name: "해오름 손전등", category: "도구", quantity: 3, state: "DAMAGED",
  condition: "wet", charge: 17, remainingUses: 2, customState: "🧭 메모", equipped: true,
  nested: { provenance: { objectId: "OBJ_LOCKER", tags: ["a", "b"] } },
});

function world() {
  return {
    version: 3, adminControlSeq: 10, adminControlPatches: [],
    characters: {
      a: { id: "a", inventory: { lamp: structuredClone(sourceItem) } },
      b: { id: "b", inventory: {} },
    },
    parties: {}, sessions: {},
    itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    itemTransferOffers: [], itemTransferResolutions: [], unrelated: { stay: true },
  };
}

const original = world();
const moved = applyOperation(original, {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_MOVE", targetCharacterId: "b",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}, "move-1");
assert.deepEqual(original.characters.a.inventory.lamp, sourceItem, "transfer reducer must not mutate the input snapshot");
assert.equal(moved.state.characters.a.inventory.lamp, undefined, "whole-stack MOVE must delete the source only after target construction");
const moveKey = Object.keys(moved.state.characters.b.inventory)[0];
assert.equal(moveKey, "lamp", "non-collision MOVE must preserve the source inventory key");
assert.deepEqual(moved.state.characters.b.inventory[moveKey], sourceItem, "MOVE must preserve the complete source item, including its itemId, while preserving the inventory key");
assert.equal(moved.patch.action, "INVENTORY_TRANSFER");
assert.equal(moved.patch.seq, 11);
assert.equal(moved.state.adminControlPatches.length, 1, "one transfer is one admin patch/audit mutation");
assert.equal(moved.patch.data.mode, "CHARACTER_MOVE");
assert.equal(moved.patch.data.inventoryChanges.length, 2, "cloud replay needs the source deletion and target insert in the same patch");
assert.deepEqual(moved.state.unrelated, { stay: true });

const coexist = world();
coexist.characters.b.inventory.lamp = { itemId: "lamp", catalogItemId: "ITEM_LAMP", name: "해오름 손전등", quantity: 1, state: "CLEAN", charge: 99 };
const coexistMove = applyOperation(coexist, {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_MOVE", targetCharacterId: "b",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}, "move-variant");
assert.equal(coexistMove.state.characters.b.inventory.lamp.state, "CLEAN", "target inventory key collision must never overwrite a distinct variant state");
const coexistNewKey = Object.keys(coexistMove.state.characters.b.inventory).find((key) => key !== "lamp");
assert.ok(coexistNewKey, "collision must allocate a separate instance key");
assert.equal(coexistMove.state.characters.b.inventory[coexistNewKey].state, "DAMAGED");

assert.throws(() => applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_MOVE", targetCharacterId: "a",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}, "same-target"), /ADMIN_ITEM_TRANSFER_SAME_CHARACTER/);

const reserved = world();
reserved.itemTransferOffers.push({ id: "offer-1", giverId: "a", sourceInventoryKey: "lamp", quantity: 1, expiresAt: Date.now() + 60_000 });
assert.throws(() => applyOperation(reserved, {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_MOVE", targetCharacterId: "b",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}, "reserved-source"), /ADMIN_ITEM_TRANSFER_RESERVED/);
const reservedCopy = applyOperation(reserved, {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_COPY", targetCharacterId: "b",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}, "reserved-copy");
assert.deepEqual(reservedCopy.state.characters.a.inventory.lamp, sourceItem, "COPY must remain allowed for a reserved source and never consume it");
assert.equal(Object.keys(reservedCopy.state.characters.b.inventory).length, 1);

const copied = applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "CHARACTER_COPY", targetCharacterId: "a",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}, "copy-1");
const copyKeys = Object.keys(copied.state.characters.a.inventory);
assert.equal(copyKeys.length, 2, "COPY inside one character must retain the source and create a fresh identity");
const copyKey = copyKeys.find((key) => key !== "lamp");
assert.ok(copyKey && copyKey !== "lamp");
assert.deepEqual(copied.state.characters.a.inventory.lamp, sourceItem, "COPY must leave the source byte-for-byte intact");
assert.deepEqual(copied.state.characters.a.inventory[copyKey], { ...sourceItem, itemId: copyKey });
copied.state.characters.a.inventory[copyKey].nested.provenance.tags.push("clone-only");
assert.deepEqual(copied.state.characters.a.inventory.lamp.nested.provenance.tags, ["a", "b"], "COPY must deep-clone nested mutable state");

const claimed = applyOperation(world(), {
  operation: "INVENTORY_TRANSFER", mode: "WORLD_CLAIM", targetCharacterId: "b",
  variant: "a", objectId: "E_OBJ_002", catalogItemId: "ITEM_117",
}, "claim-1");
const claimKey = "E_OBJ_002:ITEM_117";
assert.equal(claimed.state.itemClaimsByVariant.a[claimKey].characterId, "b", "WORLD_CLAIM must atomically write the exact variant/object claim");
assert.equal(claimed.state.sessions && Object.keys(claimed.state.sessions).length, 0, "admin claim must not manufacture a session");
assert.equal(claimed.state.characters.b.inventory.ITEM_117.quantity, 1, "WORLD_CLAIM must use data/day1.json objectItems mapping.default as its quantity");
assert.equal(claimed.patch.data.mode, "WORLD_CLAIM");
assert.ok(claimed.patch.data.claimChange, "claim replay must have an explicit claim delta");
assert.throws(() => applyOperation(claimed.state, {
  operation: "INVENTORY_TRANSFER", mode: "WORLD_CLAIM", targetCharacterId: "a",
  variant: "a", objectId: "E_OBJ_002", catalogItemId: "ITEM_117",
}, "claim-duplicate"), /ADMIN_WORLD_ITEM_ALREADY_CLAIMED/);

function response() { return { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(v = "") { this.body += v; } }; }
function request(body, cookie = "baekji_admin_session=token") { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: cookie ? { cookie } : {}, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const noCookie = response();
await adminControlHandler(request({ operation: "INVENTORY_TRANSFER" }, ""), noCookie, { env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } });
assert.equal(noCookie.statusCode, 401);
assert.equal(JSON.parse(noCookie.body).code, "ADMIN_SESSION_REQUIRED");

const rpcCalls = [];
let getStateCount = 0;
const casResponse = response();
await adminControlHandler(request({
  requestId: "cas-move", operation: "INVENTORY_TRANSFER", mode: "CHARACTER_MOVE", targetCharacterId: "b",
  sourceCharacterId: "a", sourceInventoryKey: "lamp",
}), casResponse, {
  env: {},
  fetchImpl: async (url, options) => {
    const rpcName = String(url).split("/").pop();
    const body = JSON.parse(options.body);
    rpcCalls.push({ rpcName, body });
    if (rpcName === "baekji_admin_session_verify") return { ok: true, status: 200, json: async () => [{ login_id: "AD1", display_name: "관리자" }] };
    if (rpcName === "baekji_mvp_get_state") {
      getStateCount += 1;
      return { ok: true, status: 200, json: async () => [{ state: world(), revision: getStateCount === 1 ? 7 : 8 }] };
    }
    if (rpcName === "baekji_admin_state_apply") {
      const writes = rpcCalls.filter((call) => call.rpcName === "baekji_admin_state_apply");
      if (writes.length === 1) return { ok: true, status: 200, json: async () => [{ accepted: false, state: world(), revision: 8 }] };
      return { ok: true, status: 200, json: async () => [{ accepted: true, already_applied: false, state: body.p_state, revision: 9, audit_id: 4 }] };
    }
    throw new Error(`unexpected rpc ${rpcName}`);
  },
});
assert.equal(casResponse.statusCode, 200, "CAS retry must complete against the latest world snapshot");
const casWrites = rpcCalls.filter((call) => call.rpcName === "baekji_admin_state_apply");
assert.equal(casWrites.length, 2, "one stale CAS result must retry exactly once");
assert.deepEqual(casWrites.map((call) => call.body.p_expected_revision), [7, 8]);
assert.equal(casWrites[1].body.p_action, "INVENTORY_TRANSFER");
assert.equal(casWrites[1].body.p_before_state.source.characterId, "a");
assert.equal(casWrites[1].body.p_after_state.target.characterId, "b");

const invalid = response();
let invalidReads = 0;
await adminControlHandler(request({ requestId: "invalid", operation: "INVENTORY_TRANSFER" }), invalid, { env: {}, fetchImpl: async () => { invalidReads += 1; return { ok: true, status: 200, json: async () => [] }; } });
assert.equal(invalid.statusCode, 401);
assert.equal(JSON.parse(invalid.body).code, "ADMIN_SESSION_INVALID");
assert.equal(invalidReads, 1, "invalid authentication must stop before any world/CAS write");

const apiSource = fs.readFileSync(new URL("../api/admin-control.mjs", import.meta.url), "utf8");
const adminUi = fs.readFileSync(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
const shellUi = fs.readFileSync(new URL("../admin-shell-runtime.js", import.meta.url), "utf8");
const cloudSource = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
assert.match(apiSource, /operation === "INVENTORY_TRANSFER"/);
assert.match(apiSource, /inventoryTransferMutation/);
assert.match(adminUi, /data-control-inventory-transfer="WORLD_CLAIM"/);
assert.match(adminUi, /data-control-inventory-transfer="CHARACTER_MOVE"/);
assert.match(adminUi, /data-control-inventory-transfer="CHARACTER_COPY"/);
assert.match(adminUi, /data-control-world-variant/);
assert.match(adminUi, /data-control-world-source/);
assert.match(adminUi, /data-control-character-move-source/);
assert.match(adminUi, /data-control-character-copy-source/);
assert.match(adminUi, /Object\.entries\(character\?\.inventory \|\| \{\}\)/, "admin UI must identify source rows by inventory key, not itemId");
assert.match(adminUi, /const moveSources = characterItemOptions\(payload, characterId, "CHARACTER_MOVE"\);/);
assert.match(adminUi, /const copySources = characterItemOptions\(payload, characterId, "CHARACTER_COPY"\);/, "COPY source options must retain the current target character while MOVE excludes it");
assert.match(adminUi, /Object\.values\(DATA\.objectsByDetail \|\| \{\}\)\.flat\(\)\.find\(/, "world item options must resolve object IDs through objectsByDetail arrays");
assert.match(adminUi, /data-object-id="\$\{esc\(entry\.objectId\)\}"/, "world item options must retain the object ID in data attributes, not visible copy");
assert.match(adminUi, /data-control-inventory-transfer[\s\S]*operation: "INVENTORY_TRANSFER"/, "the actual delegated click path must send one transfer operation");
assert.match(adminUi, /busy\) return/);
assert.match(cloudSource, /action === "INVENTORY_TRANSFER"/);
const adminHtml = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(adminHtml, /admin-control-mvp4\.css\?v=0\.4\.3&stage4-item-transfer=1&item-disposition=1&field-item-management=1/);
assert.match(adminHtml, /admin-control-mvp4\.js\?v=0\.4\.7&stage4-item-transfer=1&lazy-entry=1&async-entry=1&shell-capture=1&item-disposition=1&field-item-management=1/);
assert.match(indexHtml, /cloud-state-sync\.js\?v=0\.4\.5&fix=0b1&movement-terminal=1&result-party-disband=1&stage4-item-transfer=1&item-disposition=1&field-item-management=1&stage6c-ingress=1/);

const Storage = class { getItem() { return null; } setItem() {} removeItem() {} };
const cloudContext = { console, window: { addEventListener() {}, dispatchEvent() {} }, document: { hidden: false, documentElement: { dataset: {} }, addEventListener() {} }, Storage, localStorage: new Storage(), sessionStorage: new Storage(), CustomEvent: class {}, Event: class {}, StorageEvent: class {}, AbortController, setTimeout: () => 0, clearTimeout() {}, fetch: async () => ({ ok: true, status: 200, json: async () => [] }), Math, Date, JSON, Object, Array, Number, String, Boolean, Set, Map };
cloudContext.globalThis = cloudContext;
vm.createContext(cloudContext);
vm.runInContext(cloudSource, cloudContext, { filename: "cloud-state-sync.js" });
const replay = world();
cloudContext.window.__BAEKJI_CLOUD_SYNC_TEST__.applyAdminControlPatch(replay, moved.patch);
assert.equal(replay.characters.a.inventory.lamp, undefined, "cloud replay must delete MOVE source");
assert.deepEqual(replay.characters.b.inventory[moveKey], moved.state.characters.b.inventory[moveKey], "cloud replay must insert the exact MOVE target");
cloudContext.window.__BAEKJI_CLOUD_SYNC_TEST__.applyAdminControlPatch(replay, moved.patch);
assert.equal(Object.keys(replay.characters.b.inventory).length, 1, "replaying the same transfer patch must be idempotent");

class FakeElement {
  constructor(dataset = {}) { this.dataset = dataset; this.isConnected = true; this.disabled = false; this.childElementCount = 1; this.selectedOptions = []; this.value = ""; }
  closest(selector) {
    if (selector === "[data-admin-control-open]" && this.dataset.adminControlOpen) return this;
    if (selector === "[data-control-inventory-transfer]" && this.dataset.controlInventoryTransfer) return this;
    if (selector === "[data-control-field-recall]" && this.dataset.controlFieldRecall) return this;
    if (selector === "[data-control-field-manage-confirm]" && this.dataset.controlFieldManageConfirm) return this;
    return null;
  }
  matches() { return false; }
  querySelectorAll() { return []; }
  replaceChildren() {}
  append() {}
  remove() {}
  click() { this.clicked = (this.clicked || 0) + 1; }
}
let capturedClick;
const rootNodes = new Map();
const fakeRoot = new FakeElement();
fakeRoot.querySelector = (selector) => rootNodes.get(selector) || null;
const fakeDocument = {
  body: { append() {} },
  getElementById(id) { return id === "admin-modal-root" ? fakeRoot : null; },
  createElement() { return fakeRoot; },
  querySelector(selector) { return selector === "[data-admin-refresh]" ? new FakeElement() : null; },
  querySelectorAll() { return []; },
  addEventListener(type, handler) { if (type === "click") capturedClick = handler; },
};
const uiCalls = [];
let uiRequestCount = 0;
const uiWindow = { DAY1_DATA: { places: {}, variants: {}, itemCatalog: {}, objectItems: {} }, addEventListener(type, handler, capture = false) { if (type === "click" && capture === true) capturedClick = handler; }, dispatchEvent() {} };
const uiContext = { window: uiWindow, document: fakeDocument, Element: FakeElement, MutationObserver: class { observe() {} }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, crypto: { randomUUID: () => `ui-request${uiRequestCount++ ? "-2" : ""}` }, fetch: async (url, options = {}) => { uiCalls.push({ url, options }); return { ok: true, status: 200, json: async () => String(url) === "/api/admin-snapshot" ? { ok: true, revision: 1, state: { characters: { b: { id: "b", inventory: {} } }, itemClaimsByVariant: { a: {} }, fieldItemPlacementsByVariant: { a: { field_1: { id: "field_1", variant: "a", objectId: "E_OBJ_002", sourceCharacterId: "b", sourceInventoryKey: "pen", item: { itemId: "pen", name: "볼펜", quantity: 1, state: "USED" }, placedAt: 1 } }, b: {}, c: {}, d: {} }, fieldItemPlacementClaimsByVariant: { a: {}, b: {}, c: {}, d: {} } }, directory: [{ id: "b", name: "테스트B" }] } : { ok: true, revision: 2, summary: "ok" } }; }, setTimeout: () => 0, queueMicrotask, console, Date, Math, JSON, Object, Array, Number, String, Boolean, Set, Map };
uiContext.globalThis = uiContext;
vm.createContext(uiContext);
vm.runInContext(shellUi, uiContext, { filename: "admin-shell-runtime.js" });
vm.runInContext(adminUi, uiContext, { filename: "admin-control-mvp4.js" });
assert.ok(capturedClick, "shared shell must register the one physical capture click handler");
capturedClick({ target: new FakeElement({ adminControlOpen: "character", adminControlId: "b" }), preventDefault() {}, stopPropagation() {} });
await new Promise((resolve) => setImmediate(resolve));
const sourceOption = new FakeElement({ sourceCharacterId: "a", sourceInventoryKey: "lamp" });
rootNodes.set("[data-control-character-move-source]", { selectedOptions: [sourceOption] });
const transferButton = new FakeElement({ controlInventoryTransfer: "CHARACTER_MOVE" });
capturedClick({ target: transferButton, preventDefault() {}, stopPropagation() {} });
capturedClick({ target: transferButton, preventDefault() {}, stopPropagation() {} });
await new Promise((resolve) => setImmediate(resolve));
const uiPosts = uiCalls.filter((call) => call.url === "/api/admin-control");
assert.equal(uiPosts.length, 1, "capture handler and busy guard must issue exactly one POST for duplicate move clicks");
assert.deepEqual(JSON.parse(uiPosts[0].options.body), { requestId: "ui-request", operation: "INVENTORY_TRANSFER", mode: "CHARACTER_MOVE", targetCharacterId: "b", sourceCharacterId: "a", sourceInventoryKey: "lamp" });

capturedClick({ target: new FakeElement({ controlFieldRecall: "field_1", fieldVariant: "a" }), preventDefault() {}, stopPropagation() {} });
capturedClick({ target: new FakeElement({ controlFieldManageConfirm: "FIELD_RECALL", placementId: "field_1", fieldVariant: "a" }), preventDefault() {}, stopPropagation() {} });
await new Promise((resolve) => setImmediate(resolve));
const recallPosts = uiCalls.filter((call) => call.url === "/api/admin-control");
assert.equal(recallPosts.length, 2, "field recall confirmation issues one additional POST");
assert.deepEqual(JSON.parse(recallPosts[1].options.body), { requestId: "ui-request-2", operation: "INVENTORY_TRANSFER", mode: "FIELD_RECALL", variant: "a", placementId: "field_1" });

console.log("PASS: admin world claim, character move/copy, auth, cloud replay, and UI wiring contracts");
