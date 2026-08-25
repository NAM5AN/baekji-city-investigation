import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin-dashboard.css", import.meta.url), "utf8");
const legacyStatus = new URL("../admin-control-status-mvp4.js", import.meta.url);

assert.match(html, /admin-dashboard\.css\?v=0\.1\.1&stage4d=1/, "dashboard must load direct-owned status styles with the Stage 4-D cache key");
assert.match(html, /admin-dashboard\.js\?v=0\.1\.2&shell-runtime=1&stage4d=1/, "dashboard must load direct-owned status rendering with the Stage 4-D cache key");
assert.doesNotMatch(html, /admin-control-status-mvp4\.js/, "dashboard must not load the legacy status decorator");
assert.equal(fs.existsSync(legacyStatus), false, "legacy status decorator file must be removed after dashboard absorbs it");
assert.doesNotMatch(dashboard, /MutationObserver|document\.body\.append|document\.head\.append|createElement\(\s*["']style["']\s*\)/, "dashboard status must render directly without observer, node relocation, or runtime style injection");
assert.match(css, /\[data-admin-connection\]\[data-admin-sync-visible="true"\]\s*\{\s*display:\s*inline-flex/, "dashboard stylesheet must own visible status presentation");
assert.match(css, /\[data-admin-connection\]\[data-admin-sync-kind="error"\]\s*\{\s*color:\s*var\(--danger\)/, "dashboard stylesheet must own error status presentation");

class Element {
  constructor() { this.dataset = {}; }
  closest() { return null; }
}

const topbar = { id: "topbar" };
const panel = {
  writes: 0,
  _html: "",
  set innerHTML(value) { this.writes += 1; this._html = String(value); },
  get innerHTML() { return this._html; },
};
const connection = {
  parentElement: topbar,
  dataset: {},
  style: {},
  hidden: true,
  history: [],
  _text: "LOCKED",
  set textContent(value) { this._text = String(value); this.history.push(this._text); },
  get textContent() { return this._text; },
};
const worldMeta = { textContent: "" };
const documentListeners = [];
let bodyAppendCalls = 0;
let headAppendCalls = 0;
const document = {
  querySelector(selector) {
    if (selector === "[data-admin-panel]") return panel;
    if (selector === "[data-admin-connection]") return connection;
    if (selector === "[data-admin-world-meta]") return worldMeta;
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener(type, callback) { documentListeners.push({ type, callback }); },
  body: { append() { bodyAppendCalls += 1; } },
  head: { append() { headAppendCalls += 1; } },
};

let captureConsumers = 0;
const snapshotConsumers = [];
const tabConsumers = [];
let refreshCalls = 0;
let resolveRefresh;
const refreshPromise = new Promise((resolve) => { resolveRefresh = resolve; });
const shell = Object.freeze({
  tabs: Object.freeze({
    get: () => "overview",
    set: () => true,
    subscribe(callback) { tabConsumers.push(callback); callback("overview"); return () => {}; },
  }),
  modal: Object.freeze({ render() {} }),
  onCaptureClick() { captureConsumers += 1; return () => {}; },
  snapshot: Object.freeze({
    latest: () => null,
    refresh() { refreshCalls += 1; return refreshPromise; },
    subscribe(callback) { snapshotConsumers.push(callback); callback(null); return () => {}; },
  }),
});
const window = { __BAEKJI_ADMIN_SHELL__: shell, DAY1_DATA: { places: {}, variants: {}, meta: {} } };
const context = vm.createContext({ window, document, Element, Object, Array, String, Number, Boolean, Set, Map, Date, JSON, Promise, console });
vm.runInContext(dashboard, context, { filename: "admin-dashboard.js" });

assert.equal(captureConsumers, 1, "dashboard must retain exactly one shell capture consumer");
assert.equal(snapshotConsumers.length, 1, "dashboard must retain exactly one shell snapshot subscriber");
assert.equal(refreshCalls, 1, "dashboard must delegate initial refresh to the shell exactly once");
assert.equal(connection.parentElement, topbar, "connection node must remain in its original topbar parent without relocation");
assert.equal(bodyAppendCalls, 0, "dashboard must not append the connection node to body");
assert.equal(headAppendCalls, 0, "dashboard must not inject status styles into head");
assert.equal(connection.textContent, "동기화 중…", "initial shell refresh must directly show the sync status");
assert.equal(connection.dataset.adminSyncVisible, "true");
assert.equal(connection.dataset.adminSyncKind, "sync");
assert.equal(connection.hidden, false);

const livePayload = {
  ok: true,
  state: { storyDay: 1, loopId: "LOOP-1", characters: {}, parties: {}, sessions: {} },
  directory: [],
};
function deliver(payload, expectedText, { visible = false, kind = undefined, color = "" } = {}) {
  const previousConnectionWrites = connection.history.length;
  const previousPanelWrites = panel.writes;
  snapshotConsumers.forEach((consumer) => consumer(payload));
  assert.equal(connection.history.length, previousConnectionWrites + 1, `one snapshot delivery must perform one direct ${expectedText} status transition`);
  assert.equal(connection.textContent, expectedText);
  assert.equal(panel.writes, previousPanelWrites + 1, "one snapshot delivery must render the dashboard exactly once");
  assert.equal(connection.hidden, !visible);
  assert.equal(connection.dataset.adminSyncVisible, visible ? "true" : undefined);
  assert.equal(connection.dataset.adminSyncKind, kind);
  assert.equal(connection.style.color, color, `${expectedText} must leave the canonical inline color state`);
  assert.equal(connection.parentElement, topbar, "status transitions must not relocate the connection node");
}

deliver(livePayload, "READ ONLY", { color: "var(--green)" });
deliver({ code: "ADMIN_SNAPSHOT_OFFLINE" }, "연결 끊김", { visible: true, kind: "error", color: "" });
deliver({ code: "HTTP_503", status: 503 }, "설정 확인 필요", { visible: true, kind: "error", color: "" });
deliver({ code: "ADMIN_SESSION_REQUIRED", status: 401 }, "LOCKED", { color: "" });

resolveRefresh(livePayload);
await Promise.resolve();
assert.equal(refreshCalls, 1, "settling the shell-owned refresh cannot trigger a second dashboard refresh path");
assert.equal(documentListeners.filter((entry) => entry.type === "input" || entry.type === "change").length, 2, "dashboard retains only its existing direct log filter listeners");

console.log("PASS: dashboard directly renders sync, read-only, offline, setup, and locked connection status without a decorator");
