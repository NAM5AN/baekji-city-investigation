import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
class Element { constructor(match) { this.match = match; } closest(selector) { return this.match?.(selector) || null; } matches() { return false; } }
class MutationObserver { static callbacks = []; static instances = []; constructor(callback) { this.callback = callback; MutationObserver.callbacks.push(callback); MutationObserver.instances.push(this); } observe(target) { this.target = target; } }
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
const makeDetailBody = () => ({ injected: null, appendCount: 0, querySelector(selector) { return selector === "[data-admin-control-entry]" && this.injected ? this.injected : null; }, append(node) { this.injected = node; this.appendCount += 1; } });
const dashboardRoot = { detailBody: null, querySelector(selector) { return selector === ".admin-modal-body" ? this.detailBody : null; } };
const payload = { ok: true, revision: 7, directory: [{ id: "c1", name: "테스트 캐릭터" }], state: { characters: { c1: { inventory: {}, contamination: 0, symptom: "안정" } }, parties: {}, sessions: {} } };
const window = { DAY1_DATA: { places: {}, variants: {}, itemCatalog: {} }, addEventListener() {}, dispatchEvent() {} };
const context = { window, document, console, JSON, Object, Array, String, Number, Math, Date, Promise, queueMicrotask, Element, MutationObserver, fetch: async () => ({ ok: true, json: async () => payload }), setTimeout, clearTimeout };
context.globalThis = context;
window.window = window;
roots.set("admin-modal-root", dashboardRoot);
vm.createContext(context);
vm.runInContext(source, context, { filename: "admin-control-mvp4.js" });
assert.equal(MutationObserver.instances.at(-1).target, dashboardRoot, "the delayed-detail observer is scoped to the dashboard modal root");

listeners.get("click")({ target: new Element((selector) => selector === "[data-admin-detail]" ? { dataset: { adminDetail: "character", adminId: "c1" } } : null) });
await Promise.resolve();
assert.equal(dashboardRoot.detailBody, null, "the original microtask runs before asynchronous dashboard detail rendering");

dashboardRoot.detailBody = makeDetailBody();
MutationObserver.callbacks.at(-1)();
assert.match(dashboardRoot.detailBody.injected?.innerHTML || "", /data-admin-control-open="character"/, "observer restores the entry after delayed detail rendering");
assert.equal(dashboardRoot.detailBody.appendCount, 1);
MutationObserver.callbacks.at(-1)();
assert.equal(dashboardRoot.detailBody.appendCount, 1, "own injection does not create an observer loop");

dashboardRoot.detailBody = makeDetailBody();
MutationObserver.callbacks.at(-1)();
assert.equal(dashboardRoot.detailBody.appendCount, 1, "detail tab rerender restores exactly one entry");
dashboardRoot.detailBody = null;
MutationObserver.callbacks.at(-1)();

dashboardRoot.detailBody = makeDetailBody();
listeners.get("click")({ target: new Element((selector) => selector === "[data-admin-modal-close]" ? {} : null) });
MutationObserver.callbacks.at(-1)();
assert.equal(dashboardRoot.detailBody.appendCount, 0, "closing the dashboard detail clears stale context before an unrelated modal renders");

listeners.get("click")({ preventDefault() {}, stopPropagation() {}, target: new Element((selector) => selector === "[data-admin-control-open]" ? { dataset: { adminControlOpen: "character", adminControlId: "c1" } } : null) });
await new Promise((resolve) => setImmediate(resolve));
assert.match(roots.get("admin-control-mvp4-root")?.innerHTML || "", /data-control-inventory-transfer="WORLD_CLAIM"/, "restored entry opens the character control modal");

console.log("PASS: asynchronous detail rendering restores one admin control entry without observer loops");
