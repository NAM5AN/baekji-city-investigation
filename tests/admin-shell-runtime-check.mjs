import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const source = read("admin-shell-runtime.js");
const html = read("admin-dashboard.html");
const dashboard = read("admin-dashboard.js");
const observation = read("admin-observation-mvp2.js");
const control = read("admin-control-mvp4.js");

const API_KEYS = ["roots", "tabs", "modal", "snapshot", "onCaptureClick"];
const ROOT_KEYS = ["panel", "connection", "worldMeta", "tabs", "modal"];
const TAB_KEYS = ["get", "set", "subscribe"];
const MODAL_KEYS = ["root", "getOwner", "render", "clear", "subscribe"];
const SNAPSHOT_KEYS = ["latest", "refresh", "subscribe"];

// The shell has to load after the canonical zone data, before every consumer that
// subscribes to it.  This keeps one snapshot/poll/capture owner for the page.
assert.ok(html.indexOf("admin-canonical-zones.js") < html.indexOf("admin-shell-runtime.js"), "shell loads after canonical zones");
for (const consumer of ["admin-dashboard.js", "admin-observation-mvp2.js", "admin-control-mvp4.js"]) {
  assert.ok(html.indexOf("admin-shell-runtime.js") < html.indexOf(consumer), `shell loads before ${consumer}`);
}
assert.doesNotMatch(html, /admin-modal-reopen-guard\.js/, "legacy modal reopen guard must no longer be loaded");

// Dashboard and observation become rendering subscribers.  Only the shell may
// fetch/poll the snapshot; control joins the sole physical window-capture path.
for (const [name, code] of [["dashboard", dashboard], ["observation", observation]]) {
  assert.doesNotMatch(code, /\/api\/admin-snapshot/, `${name} must not own an admin snapshot request`);
  assert.doesNotMatch(code, /setInterval\s*\(/, `${name} must not own a polling timer`);
}
assert.match(control, /const\s+\w+\s*=\s*window\.__BAEKJI_ADMIN_SHELL__/, "control reads the shared shell");
assert.match(control, /\w+\.onCaptureClick\s*\(/, "control registers capture handling through the shell");
assert.doesNotMatch(control, /window\.addEventListener\(\s*["']click["']/, "control must not install a physical window click listener");
assert.match(control, /snapshot\.refresh\(\{\s*force:\s*true\s*\}\)/, "control requests a fresh snapshot after a successful mutation");
const sessionOps = read("admin-session-ops-mvp5.js");
assert.match(sessionOps, /function\s+readSnapshot\(options\s*=\s*\{\}\)\s*\{\s*return\s+shell\.snapshot\.refresh\(options\);/s, "session operations relay refresh options through the shell");
assert.match(sessionOps, /await\s+shell\.snapshot\.refresh\(\{\s*force:\s*true\s*\}\)/, "session operations request a forced fresh snapshot after a successful mutation");
assert.match(sessionOps, /function\s+scheduleRefresh\(\)[\s\S]*?shell\.snapshot\.latest\(\)/, "session periodic refresh consumes the shell-held snapshot rather than starting another snapshot fetch");
assert.doesNotMatch(source, /localStorage|sessionStorage/, "shell is read-only and must not use browser storage");
assert.doesNotMatch(source, /\/api\/admin-control|\/api\/admin-login|\/api\/admin-audit|PUT|PATCH|DELETE/, "shell must not mutate or call admin mutation APIs");

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) { if (force === true) this.add(value); else if (force === false) this.remove(value); else if (this.contains(value)) this.remove(value); else this.add(value); return this.contains(value); }
}

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.classList = new ClassList();
    this.attributes = new Map();
    this.children = [];
    this.innerHTML = "";
    this.hidden = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.innerHTML = ""; }
  get childElementCount() { return this.children.length || (this.innerHTML ? 1 : 0); }
  contains(node) { return node === this || this.children.includes(node); }
  closest(selector) {
    if (selector === "[data-admin-tab]" && this.dataset.adminTab) return this;
    if (selector === "[data-admin-modal-close]" && this.dataset.adminModalClose !== undefined) return this;
    if (selector === "[data-admin-modal-backdrop]" && this.dataset.adminModalBackdrop !== undefined) return this;
    return null;
  }
  matches(selector) { return this.closest(selector) === this; }
}

const panel = new Element();
const modalRoot = new Element();
const tabs = ["overview", "zones", "parties", "characters", "logs"].map((tab) => new Element({ adminTab: tab }));
const windowListeners = [];
const documentListeners = [];
const timers = [];
let fetchCount = 0;
const pendingFetches = [];
const stalePayload = { ok: true, revision: 11, directory: [], state: { characters: {} } };
const freshPayload = { ok: true, revision: 12, directory: [], state: { characters: { c1: { id: "c1" } } } };
const document = {
  querySelector(selector) {
    if (selector === "[data-admin-panel]") return panel;
    if (selector === ".admin-tabs") return new Element();
    return null;
  },
  querySelectorAll(selector) { return selector === "[data-admin-tab]" ? tabs : []; },
  getElementById(id) { return id === "admin-modal-root" ? modalRoot : null; },
  addEventListener(type, handler, capture = false) { documentListeners.push({ type, handler, capture: Boolean(capture) }); },
  createElement: () => new Element(),
};
const window = {
  DAY1_DATA: { places: {}, variants: {}, meta: {} },
  addEventListener(type, handler, capture = false) { windowListeners.push({ type, handler, capture: Boolean(capture) }); },
  removeEventListener(type, handler) { const index = windowListeners.findIndex((entry) => entry.type === type && entry.handler === handler); if (index >= 0) windowListeners.splice(index, 1); },
  dispatchEvent() {},
};
const context = {
  window, document, Element, console, Object, Array, String, Number, Boolean, Set, Map, JSON, Date, Promise,
  queueMicrotask,
  setTimeout(handler, delay) { const id = { handler, delay }; timers.push(id); return id; },
  clearTimeout(id) { const index = timers.indexOf(id); if (index >= 0) timers.splice(index, 1); },
  fetch: async (url, options = {}) => {
    fetchCount += 1;
    assert.equal(url, "/api/admin-snapshot", "shell has exactly one allowed endpoint");
    assert.equal(options.credentials, "same-origin");
    const responsePayload = fetchCount === 1 ? stalePayload : freshPayload;
    return new Promise((resolve) => pendingFetches.push(() => resolve({ ok: true, json: async () => responsePayload })));
  },
};
context.globalThis = context;
window.window = window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "admin-shell-runtime.js" });

const shell = window.__BAEKJI_ADMIN_SHELL__;
assert.ok(shell, "admin shell publishes the actual shared runtime API");
assert.ok(Object.isFrozen(shell), "shared runtime API is frozen");
assert.deepEqual(Object.keys(shell).sort(), [...API_KEYS].sort(), "shell public API is exact: no hidden competing owners");
for (const [name, keys] of [["roots", ROOT_KEYS], ["tabs", TAB_KEYS], ["modal", MODAL_KEYS], ["snapshot", SNAPSHOT_KEYS]]) {
  assert.ok(Object.isFrozen(shell[name]), `${name} API is frozen`);
  assert.deepEqual(Object.keys(shell[name]).sort(), [...keys].sort(), `${name} API keys are exact`);
}

// One physical capture listener fans out in registration order, and each
// consumer may unsubscribe without duplicating or retaining its callback.
assert.equal(windowListeners.filter((entry) => entry.type === "click" && entry.capture).length, 1, "exactly one physical window capture listener");
const captured = [];
const disposeFirst = shell.onCaptureClick(() => captured.push("first"));
shell.onCaptureClick(() => captured.push("second"));
const event = { target: new Element(), preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
windowListeners.find((entry) => entry.type === "click" && entry.capture).handler(event);
assert.deepEqual(captured, ["first", "second"], "capture subscribers run once in registration order");
disposeFirst();
windowListeners.find((entry) => entry.type === "click" && entry.capture).handler(event);
assert.deepEqual(captured, ["first", "second", "second"], "removed capture subscriber is not called again");

// Tab activation validates names, updates all tab classes, and notifies only on a
// real transition.  New subscribers receive the current state immediately.
const tabEvents = [];
const stopTabs = shell.tabs.subscribe((tab) => tabEvents.push(tab));
assert.deepEqual(tabEvents, ["overview"]);
assert.equal(shell.tabs.set("not-a-tab"), false, "unknown tab is ignored");
assert.equal(shell.tabs.set("characters"), true);
assert.equal(shell.tabs.get(), "characters");
assert.ok(tabs.find((tab) => tab.dataset.adminTab === "characters").classList.contains("active"));
assert.ok(!tabs.find((tab) => tab.dataset.adminTab === "overview").classList.contains("active"));
assert.deepEqual(tabEvents, ["overview", "characters"]);
assert.equal(shell.tabs.set("characters"), true, "reselecting the active tab remains valid");
assert.deepEqual(tabEvents, ["overview", "characters"], "same tab does not re-render subscribers");
stopTabs();

// A modal has one owner.  Wrong-owner clears are ignored, valid clears notify
// subscribers exactly once, and the visible root follows the owner lifecycle.
const modalEvents = [];
shell.modal.subscribe((state) => modalEvents.push(state));
assert.equal(shell.modal.render("observation", "<section>observe</section>"), true);
assert.equal(modalRoot.innerHTML, "<section>observe</section>");
assert.equal(shell.modal.getOwner(), "observation");
assert.equal(shell.modal.clear("control"), false, "another owner cannot close the modal");
assert.equal(shell.modal.getOwner(), "observation");
assert.equal(shell.modal.clear("observation"), true);
assert.equal(modalRoot.innerHTML, "");
assert.equal(shell.modal.getOwner(), "");
assert.equal(JSON.stringify(modalEvents), JSON.stringify([
  { owner: "", open: false },
  { owner: "observation", open: true },
  { owner: "", open: false },
]), "modal close is broadcast once");

// Concurrent refreshes collapse into one request.  All snapshot subscribers get
// the same held immutable payload; one polling timer uses that same refresh path.
const snapshots = [];
shell.snapshot.subscribe((next) => snapshots.push(next));
const first = shell.snapshot.refresh();
const second = shell.snapshot.refresh();
assert.strictEqual(first, second, "concurrent snapshot refreshes share one promise");
assert.equal(fetchCount, 1, "one concurrent refresh produces one fetch");
const forcedFirst = shell.snapshot.refresh({ force: true });
const forcedSecond = shell.snapshot.refresh({ force: true });
assert.strictEqual(forcedFirst, forcedSecond, "concurrent forced refreshes share one queued fresh request");
assert.equal(fetchCount, 1, "force waits for the stale in-flight request before fetching again");
pendingFetches.shift()();
const [firstPayload, secondPayload] = await Promise.all([first, second]);
assert.strictEqual(firstPayload, stalePayload);
assert.strictEqual(secondPayload, stalePayload);
await Promise.resolve();
await Promise.resolve();
assert.equal(fetchCount, 2, "forced refresh performs exactly one second request after stale data settles");
assert.equal(pendingFetches.length, 1, "one queued fresh request is pending");
pendingFetches.shift()();
const [forcedPayload, forcedDuplicate] = await Promise.all([forcedFirst, forcedSecond]);
assert.strictEqual(forcedPayload, freshPayload);
assert.strictEqual(forcedDuplicate, freshPayload);
assert.strictEqual(shell.snapshot.latest(), forcedPayload);
assert.ok(Object.isFrozen(shell.snapshot.latest()), "latest snapshot is exposed as a read-only payload");
assert.equal(snapshots.length, 3, "subscriber sees held, stale, then forced-fresh payload once each");
assert.strictEqual(snapshots[0], null);
assert.strictEqual(snapshots[1], stalePayload);
assert.strictEqual(snapshots[2], freshPayload);
assert.equal(timers.length, 1, "only one snapshot poll timer exists");
assert.equal(timers[0].delay, 3000, "polling keeps the established cadence");
const firedTimer = timers.shift();
firedTimer.handler();
await Promise.resolve();
assert.equal(fetchCount, 3, "the poll timer reuses the same snapshot refresh path");
assert.equal(timers.length, 1, "poll rescheduling still keeps one live timer");

console.log("PASS: admin shell owns tabs, modal lifecycle, capture delivery, and one immutable snapshot/poll pipeline");
