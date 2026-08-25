import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
const shellSource = await readFile(new URL("../admin-shell-runtime.js", import.meta.url), "utf8");
class Element { constructor(match) { this.match = match; } closest(selector) { return this.match?.(selector) || null; } matches(selector) { return this.match?.(selector) === this; } }
class MutationObserver { static callbacks = []; static instances = []; constructor(callback) { this.callback = callback; MutationObserver.callbacks.push(callback); MutationObserver.instances.push(this); } observe(target) { this.target = target; } }
const windowListeners = [];
const documentListeners = [];
const roots = new Map();
const selectorValues = {
  "[data-control-world-variant]": { value: "a" },
  "[data-control-world-source]": { selectedOptions: [{ dataset: { objectId: "E_OBJ_002", catalogItemId: "ITEM_TICKET" } }] },
};
const makeNode = () => ({ dataset: {}, id: "", isConnected: false, innerHTML: "", childElementCount: 1, querySelector: (selector) => selectorValues[selector] || null, querySelectorAll: () => [], append() {}, remove() {}, replaceChildren() { this.innerHTML = ""; this.childElementCount = 0; } });
const body = { append(node) { node.isConnected = true; if (node.id) roots.set(node.id, node); } };
const document = {
  body,
  getElementById: (id) => roots.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener(type, handler, capture = false) { documentListeners.push({ type, handler, capture: Boolean(capture) }); },
  createElement: makeNode,
};
const makeDetailBody = () => ({ injected: null, appendCount: 0, querySelector(selector) { return selector === "[data-admin-control-entry]" && this.injected ? this.injected : null; }, append(node) { this.injected = node; this.appendCount += 1; } });
const dashboardRoot = { detailBody: null, childElementCount: 0, querySelector(selector) { return selector === ".admin-modal-body" ? this.detailBody : null; }, replaceChildren() { this.childElementCount = 0; } };
const payload = { ok: true, revision: 7, directory: [{ id: "c1", name: "테스트 캐릭터" }], state: { characters: { c1: { inventory: {}, contamination: 0, symptom: "안정" } }, parties: {}, sessions: {}, itemClaimsByVariant: { a: {} } } };
const fetchCalls = [];
const window = {
  DAY1_DATA: { places: {}, variants: {}, itemCatalog: {}, objectItems: {} },
  addEventListener(type, handler, capture = false) { windowListeners.push({ type, handler, capture: Boolean(capture) }); },
  dispatchEvent() {},
};
let blockDocumentCapture = true;
let dashboardBefore = 0;
let dashboardAfter = 0;
document.addEventListener("click", (event) => { if (blockDocumentCapture) event.stopImmediatePropagation(); }, true);
document.addEventListener("click", () => { dashboardBefore += 1; });
const context = { window, document, console, JSON, Object, Array, String, Number, Math, Date, Promise, queueMicrotask, Element, MutationObserver, fetch: async (url, options = {}) => { fetchCalls.push({ url, options }); return { ok: true, json: async () => String(url).startsWith("/api/admin-audit") ? { ok: true, entries: [] } : payload }; }, setTimeout: () => 0, clearTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } };
context.globalThis = context;
window.window = window;
roots.set("admin-modal-root", dashboardRoot);
vm.createContext(context);
vm.runInContext(shellSource, context, { filename: "admin-shell-runtime.js" });
vm.runInContext(source, context, { filename: "admin-control-mvp4.js" });
document.addEventListener("click", () => { dashboardAfter += 1; });
assert.equal(windowListeners.filter((entry) => entry.type === "click" && entry.capture).length, 1, "shared shell owns one window capture click handler");
assert.equal(MutationObserver.instances.at(-1).target, dashboardRoot, "the delayed-detail observer is scoped to the dashboard modal root");

function eventFor(match) {
  return { target: new Element(match), prevented: false, stopped: false, immediate: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.immediate = true; this.stopped = true; } };
}
function dispatchClick(match) {
  const event = eventFor(match);
  for (const entry of windowListeners.filter((listener) => listener.type === "click" && listener.capture)) entry.handler(event);
  if (!event.stopped) for (const entry of documentListeners.filter((listener) => listener.type === "click" && listener.capture)) { entry.handler(event); if (event.immediate) break; }
  if (!event.stopped) for (const entry of documentListeners.filter((listener) => listener.type === "click" && !listener.capture)) { entry.handler(event); if (event.immediate) break; }
  return event;
}

dispatchClick((selector) => selector === "[data-admin-detail]" ? { dataset: { adminDetail: "character", adminId: "c1" } } : null);
await Promise.resolve();
assert.equal(dashboardBefore, 0, "earlier document capture ownership can stop dashboard bubbling");
assert.equal(dashboardRoot.detailBody, null, "the capture owner still records detail before delayed dashboard rendering");
dashboardRoot.detailBody = makeDetailBody();
MutationObserver.callbacks.at(-1)();
assert.match(dashboardRoot.detailBody.injected?.innerHTML || "", /data-admin-control-open="character"/, "async detail body receives exactly one entry");
assert.equal(dashboardRoot.detailBody.appendCount, 1);
MutationObserver.callbacks.at(-1)();
assert.equal(dashboardRoot.detailBody.appendCount, 1, "own injection does not loop");

blockDocumentCapture = false;
dispatchClick((selector) => selector === "[data-admin-detail]" ? { dataset: { adminDetail: "character", adminId: "c1" } } : null);
assert.equal(dashboardBefore, 1, "dashboard bubble listener registered before the control script still runs");
assert.equal(dashboardAfter, 1, "dashboard bubble listener registered after the control script still runs");
blockDocumentCapture = true;

dispatchClick((selector) => selector === "[data-admin-audit-open]" ? {} : null);
await new Promise((resolve) => setImmediate(resolve));
assert.match(roots.get("admin-control-mvp4-root")?.innerHTML || "", /admin-audit-list/, "audit click reaches the capture owner despite a document capture blocker");

dispatchClick((selector) => selector === "[data-admin-control-open]" ? { dataset: { adminControlOpen: "character", adminControlId: "c1" } } : null);
await new Promise((resolve) => setImmediate(resolve));
assert.match(roots.get("admin-control-mvp4-root")?.innerHTML || "", /data-control-inventory-transfer="WORLD_CLAIM"/, "control entry opens character control through the capture owner");
assert.ok(fetchCalls.some((call) => call.url === "/api/admin-snapshot"), "control open loads a fresh snapshot");

dispatchClick((selector) => selector === "[data-control-inventory-transfer]" ? { dataset: { controlInventoryTransfer: "WORLD_CLAIM" } } : null);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(fetchCalls.filter((call) => call.url === "/api/admin-control" && call.options.method === "POST").length, 1, "transfer click is handled once");

console.log("PASS: window capture owner survives document blockers while dashboard, audit, control, and transfer clicks remain single-shot");
