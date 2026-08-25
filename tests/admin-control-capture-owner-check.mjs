import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
const shellSource = fs.readFileSync(new URL("../admin-shell-runtime.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.children = []; this.isConnected = true; this._html = ""; }
  closest(selector) {
    if (selector === "[data-admin-detail]" && this.dataset.adminDetail) return this;
    if (selector === "[data-admin-control-open]" && this.dataset.adminControlOpen) return this;
    if (selector === "[data-admin-audit-open]" && this.dataset.adminAuditOpen !== undefined) return this;
    if (selector === "[data-control-inventory-transfer]" && this.dataset.controlInventoryTransfer) return this;
    return null;
  }
  matches() { return false; }
  append(node) { this.children.push(node); node.parentNode = this; }
  querySelector(selector) {
    if (selector === "[data-admin-control-entry]") return this.children.find((node) => node.dataset.adminControlEntry !== undefined) || null;
    return this.nodes?.get(selector) || null;
  }
  querySelectorAll() { return []; }
  replaceChildren(...nodes) { this.children = nodes; this._html = ""; }
  remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); }
}
Object.defineProperty(Element.prototype, "innerHTML", { get() { return this._html; }, set(value) { this._html = String(value ?? ""); } });

const listeners = [];
const roots = new Map();
const body = new Element();
body.append = (node) => { node.isConnected = true; roots.set(node.id, node); };
const detailBody = new Element();
const dashboardRoot = new Element();
dashboardRoot.querySelector = (selector) => selector === ".admin-modal-body" ? detailBody : null;
roots.set("admin-modal-root", dashboardRoot);
const document = {
  body, documentElement: new Element(),
  getElementById: (id) => roots.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => new Element(),
  addEventListener(type, handler, capture = false) { if (type === "click") listeners.push({ handler, capture: capture === true }); },
};
// The legacy detail handler is a document-capture owner and stops later document capture listeners.
document.addEventListener("click", (event) => event.stopImmediatePropagation(), true);
const calls = [];
const payload = { ok: true, revision: 1, directory: [{ id: "a", name: "캐릭터 A" }], state: { characters: { a: { inventory: {} } }, itemClaimsByVariant: { a: {} }, parties: {}, sessions: {} } };
const windowListeners = [];
const window = {
  DAY1_DATA: { places: {}, variants: {}, itemCatalog: {}, objectItems: {}, objectsByDetail: {} },
  addEventListener(type, handler, capture = false) { if (type === "click") windowListeners.push({ handler, capture: capture === true }); },
  dispatchEvent() {},
};
const context = {
  window, document, Element, MutationObserver: class { constructor() {} observe() {} }, console, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map,
  crypto: { randomUUID: () => "capture-request" }, queueMicrotask, setTimeout: () => 0,
  fetch: async (url, options = {}) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => url === "/api/admin-snapshot" ? payload : { ok: true, entries: [], revision: 2 } }; },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(shellSource, context, { filename: "admin-shell-runtime.js" });
vm.runInContext(source, context, { filename: "admin-control-mvp4.js" });
assert.equal(windowListeners.filter((entry) => entry.capture).length, 1, "shared shell registers one click owner on window capture before legacy document capture handlers");

async function dispatch(target) {
  let stopped = false;
  const event = { target, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { stopped = true; } };
  for (const entry of windowListeners.filter((entry) => entry.capture)) entry.handler(event);
  for (const entry of listeners.filter((entry) => entry.capture)) { if (stopped) break; entry.handler(event); }
  for (const entry of listeners.filter((entry) => !entry.capture)) { if (stopped) break; entry.handler(event); }
  await new Promise((resolve) => setImmediate(resolve));
}

await dispatch(new Element({ adminDetail: "character", adminId: "a" }));
assert.equal(detailBody.children.length, 1, "capture detail handling injects exactly one entry despite dashboard bubble consumption");
await dispatch(new Element({ adminAuditOpen: "" }));
assert.ok(roots.get("admin-control-mvp4-root"), "capture audit handling creates the control root despite dashboard bubble consumption");

await dispatch(new Element({ adminControlOpen: "character", adminControlId: "a" }));
const controlRoot = roots.get("admin-control-mvp4-root");
assert.match(controlRoot?.innerHTML || "", /data-control-inventory-transfer="WORLD_CLAIM"/, "captured entry opens the snapshot-backed character control");
controlRoot.nodes = new Map([["[data-control-character-move-source]", { selectedOptions: [{ dataset: { sourceCharacterId: "a", sourceInventoryKey: "lamp" } }] }]]);
const transfer = new Element({ controlInventoryTransfer: "CHARACTER_MOVE" });
await Promise.all([dispatch(transfer), dispatch(transfer)]);
assert.equal(calls.filter((call) => call.url === "/api/admin-control").length, 1, "capture owner and busy guard issue one transfer mutation for duplicate clicks");

assert.match(html, /admin-control-mvp4\.js\?v=0\.4\.7&stage4-item-transfer=1&lazy-entry=1&async-entry=1&shell-capture=1&item-disposition=1&field-item-management=1/);
console.log("PASS: capture-phase admin control survives dashboard bubble ownership and preserves one mutation path");
