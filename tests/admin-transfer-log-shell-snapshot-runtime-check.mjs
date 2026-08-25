import assert from "node:assert/strict";
import fs from "node:fs";
import { createBrowserContext, createControlledClock, loadScripts } from "./helpers/browser-harness.mjs";

const source = fs.readFileSync(new URL("../admin-transfer-log-fix.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");

assert.match(source, /__BAEKJI_ADMIN_SHELL__/, "transfer log sidecar must consume the canonical shell snapshot");
assert.doesNotMatch(source, /\/api\/admin-snapshot|fetch\s*\(|setInterval\s*\(/, "transfer log sidecar must not own snapshot fetching or polling");
const shellIndex = html.indexOf("admin-shell-runtime.js?v=0.1.0");
const transferIndex = html.indexOf("admin-transfer-log-fix.js?v=0.5.3&stage7c=1");
assert.ok(shellIndex >= 0 && transferIndex >= 0 && shellIndex < transferIndex, "transfer sidecar must load once after the canonical shell runtime");

class Paragraph {
  constructor(text) { this.textContent = text; this.writeCount = 0; }
  set innerHTML(value) { this.writeCount += 1; this.textContent = String(value).replace(/<[^>]+>/g, "").trim(); }
}

class Row {
  constructor(text, partyName) {
    this.p = new Paragraph(text);
    this.spans = [{ textContent: "SYSTEM" }, { textContent: "시간" }, { textContent: partyName }];
    this.dataset = {};
    this.isConnected = true;
  }
  querySelector(selector) { return selector === "p" ? this.p : null; }
  querySelectorAll(selector) { return selector === "header span" ? this.spans : []; }
  remove() { this.isConnected = false; }
}

const rows = [
  new Row("SYSTEM · 2d2c7f31-1111-4444-8888-123456789abc의 조사조 소속이 다른 조사조로 이동되었다.", "조사조 1"),
  new Row("SYSTEM · 2d2c7f31-1111-4444-8888-123456789abc의 조사조 소속이 이 조사조로 이동되었다.", "조사조 2"),
  new Row("SYSTEM · test_c의 조사조 소속이 다른 조사조로 이동되었다.", "조사조 3"),
  new Row("SYSTEM · test_c의 조사조 소속이 이 조사조로 이동되었다.", "조사조 4"),
  new Row("SYSTEM · unpaired-out-1111의 조사조 소속이 다른 조사조로 이동되었다.", "조사조 5"),
  new Row("SYSTEM · unpaired-in-2222의 조사조 소속이 이 조사조로 이동되었다.", "조사조 6"),
];
const list = { querySelectorAll(selector) { return selector === ".admin-log-row" ? rows.filter((row) => row.isConnected) : []; }, isConnected: true };
let snapshot = null;
const subscribers = new Set();
const shell = Object.freeze({
  snapshot: Object.freeze({
    latest: () => snapshot,
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
  }),
});
const document = {
  querySelector(selector) { return selector === "[data-admin-log-list]" ? list : null; },
  addEventListener() {},
};
const clock = createControlledClock();
const window = { __BAEKJI_ADMIN_SHELL__: shell };
const browser = createBrowserContext({ clock, globals: { window, document, Element: class Element {} } });
loadScripts(browser.context, [{ source, filename: "admin-transfer-log-fix.js" }]);

clock.flushMicrotasks();
assert.equal(rows.filter((row) => row.isConnected).length, 4, "initial raw transfer pairs must collapse while unpaired rows stay visible without waiting for a snapshot");
assert.match(rows[0].p.textContent, /2d2c7f31-1111-4444-8888-123456789abc/, "missing UUID directory data must retain the raw actor fallback at boot");
assert.match(rows[2].p.textContent, /테스트 캐릭터 C/, "missing UUID directory data must retain the existing DEMO fallback at boot");
assert.match(rows[4].p.textContent, /unpaired-out-1111의 조사조 소속이 다른 조사조로 이동되었다/, "unpaired out rows must retain their exact direction with the raw fallback at boot");
assert.match(rows[5].p.textContent, /unpaired-in-2222의 조사조 소속이 이 조사조로 이동되었다/, "unpaired in rows must retain their exact direction with the raw fallback at boot");
const writesAfterBoot = rows.reduce((count, row) => count + row.p.writeCount, 0);
const offlineSnapshot = Object.freeze({ error: { code: "ADMIN_SNAPSHOT_OFFLINE" } });
subscribers.forEach((callback) => callback(offlineSnapshot));
clock.flushMicrotasks();
assert.equal(rows.filter((row) => row.isConnected).length, 4, "offline shell snapshots must not alter paired or unpaired rows");
assert.equal(rows.reduce((count, row) => count + row.p.writeCount, 0), writesAfterBoot, "offline shell snapshots must not rewrite canonical rows");
const firstSnapshot = Object.freeze({ state: {}, directory: [
  { id: "2d2c7f31-1111-4444-8888-123456789abc", name: "현장 조사원" },
  { id: "unpaired-out-1111", name: "외곽 조사원" },
  { id: "unpaired-in-2222", name: "내곽 조사원" },
] });
snapshot = firstSnapshot;
subscribers.forEach((callback) => callback(firstSnapshot));
clock.flushMicrotasks();
assert.equal(rows.filter((row) => row.isConnected).length, 4, "directory refresh must preserve paired collapse and unpaired visibility");
assert.match(rows[0].p.textContent, /현장 조사원이 조사조 1에서 조사조 2 소속으로 이동했다/, "UUID transfer actor must map through the shell directory");
assert.match(rows[2].p.textContent, /테스트 캐릭터 C가 조사조 3에서 조사조 4 소속으로 이동했다/, "missing directory entries must retain the DEMO fallback name");
assert.match(rows[4].p.textContent, /외곽 조사원의 조사조 소속이 다른 조사조로 이동되었다/, "unpaired out rows must refresh the actor name without changing direction text");
assert.match(rows[5].p.textContent, /내곽 조사원의 조사조 소속이 이 조사조로 이동되었다/, "unpaired in rows must refresh the actor name without changing direction text");
assert.equal(rows[0].dataset.partyTransferCanonical, "true");
assert.match(rows[0].dataset.logSearchText, /현장 조사원.*조사조 1.*조사조 2/);
const writesAfterFirst = rows.reduce((count, row) => count + row.p.writeCount, 0);
subscribers.forEach((callback) => callback(firstSnapshot));
clock.flushMicrotasks();
assert.equal(rows.reduce((count, row) => count + row.p.writeCount, 0), writesAfterFirst, "repeated identical snapshots must not duplicate DOM refreshes");

const renamedSnapshot = Object.freeze({ state: {}, directory: [
  { id: "2d2c7f31-1111-4444-8888-123456789abc", name: "갱신된 조사원" },
  { id: "unpaired-out-1111", name: "갱신 외곽" },
  { id: "unpaired-in-2222", name: "갱신 내곽" },
] });
snapshot = renamedSnapshot;
subscribers.forEach((callback) => callback(renamedSnapshot));
clock.flushMicrotasks();
assert.match(rows[0].p.textContent, /갱신된 조사원/, "later shell snapshots must refresh canonical names without stale rehydrate");
assert.match(rows[4].p.textContent, /갱신 외곽의 조사조 소속이 다른 조사조로 이동되었다/, "later snapshots must refresh unpaired out names without removal drift");
assert.match(rows[5].p.textContent, /갱신 내곽의 조사조 소속이 이 조사조로 이동되었다/, "later snapshots must refresh unpaired in names without removal drift");
assert.equal(rows.filter((row) => row.isConnected).length, 4, "unpaired rename updates must not add or remove rows");

console.log("PASS: transfer log sidecar consumes shell snapshots once while preserving pairing, names, search metadata, and fallback behavior");
