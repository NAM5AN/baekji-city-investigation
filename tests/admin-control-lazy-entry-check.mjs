import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
class Element { constructor(match) { this.match = match; } closest(selector) { return this.match?.(selector) || null; } matches() { return false; } }
const listeners = new Map();
const roots = new Map();
const body = { append(node) { node.isConnected = true; roots.set(node.id, node); } };
const document = {
  body,
  getElementById: (id) => roots.get(id) || null,
  querySelector: () => null,
  addEventListener(type, handler) { listeners.set(type, handler); },
  createElement() { return { dataset: {}, isConnected: false, innerHTML: "", querySelector: () => null, querySelectorAll: () => [], append(node) { this.child = node; } }; },
};
const dashboardBody = { removed: false, querySelector: () => null, append(node) { this.injected = node; } };
const dashboardRoot = { querySelector: (selector) => selector === ".admin-modal-body" ? dashboardBody : null };
const payload = { ok: true, revision: 7, directory: [{ id: "c1", name: "테스트 캐릭터" }], state: { characters: { c1: { inventory: {}, contamination: 0, symptom: "안정" } }, parties: {}, sessions: {} } };
const window = { DAY1_DATA: { places: {}, variants: {}, itemCatalog: {} }, addEventListener() {}, dispatchEvent() {} };
const context = { window, document, console, JSON, Object, Array, String, Number, Math, Date, Promise, queueMicrotask, Element, MutationObserver: class { observe() {} }, fetch: async () => ({ ok: true, json: async () => payload }), setTimeout, clearTimeout };
context.globalThis = context;
window.window = window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "admin-control-mvp4.js" });

roots.set("admin-modal-root", dashboardRoot);
listeners.get("click")({ target: new Element((selector) => selector === "[data-admin-detail]" ? { dataset: { adminDetail: "character", adminId: "c1" } } : null) });
await Promise.resolve();
assert.match(dashboardBody.injected?.innerHTML || "", /data-admin-control-open="character"/, "late-created dashboard modal receives the control entry after the detail click");

listeners.get("click")({ preventDefault() {}, stopPropagation() {}, target: new Element((selector) => selector === "[data-admin-control-open]" ? { dataset: { adminControlOpen: "character", adminControlId: "c1" } } : null) });
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.match(roots.get("admin-control-mvp4-root")?.innerHTML || "", /data-control-inventory-transfer="WORLD_CLAIM"/, "injected entry opens the character control modal");

console.log("PASS: lazy dashboard modal lookup injects the control entry and opens character control");
