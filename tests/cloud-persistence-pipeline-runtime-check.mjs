import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { assertExactScriptOrder } from "./helpers/browser-harness.mjs";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const cloudSource = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const persistenceSource = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assertExactScriptOrder(index, [
  "world-persistence.js?v=0.1.1&stage6a=1&stage6b=1",
  "cloud-state-sync.js?v=0.4.5&fix=0b1&movement-terminal=1&result-party-disband=1&stage4-item-transfer=1&item-disposition=1&field-item-management=1&stage6c-ingress=1",
], "production must load WorldPersistence before the cloud ingress owner");
assert.match(cloudSource, /function ingestLocalWorldRaw\(raw\)/, "cloud ingress must have one canonical raw owner");
assert.match(cloudSource, /storageProto\.setItem\s*=\s*function patchedSetItem[\s\S]*?ingestLocalWorldRaw\(value\)/, "legacy raw writers must delegate through the canonical ingress owner");
assert.match(cloudSource, /persistence\?\.subscribe\?\.\(\(raw\)\s*=>\s*ingestLocalWorldRaw\(raw\)\)/, "WorldPersistence notifications must delegate through the canonical ingress owner");
const patchStart = cloudSource.indexOf("storageProto.setItem = function patchedSetItem");
const patchEnd = cloudSource.indexOf("\n    };", patchStart);
assert.ok(patchStart >= 0 && patchEnd > patchStart, "legacy patch body must remain individually auditable");
assert.doesNotMatch(cloudSource.slice(patchStart, patchEnd), /schedulePush\(/, "legacy patch must not schedule cloud writes directly");

class Storage {
  constructor(values) { this.values = values; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const timers = new Map();
let timerId = 0;
const listeners = new Map();
const microtasks = [];
const rawValues = new Map();
const sessionValues = new Map([["baekji_city_mvp_current_user_v034", "tester-a"]]);
const puts = [];
const context = vm.createContext({
  console,
  AbortController,
  Storage,
  localStorage: new Storage(rawValues),
  sessionStorage: new Storage(sessionValues),
  location: { href: "https://example.test/#/home", hash: "#/home" },
  document: { hidden: false, documentElement: { dataset: {} }, addEventListener() {} },
  setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout(id) { timers.delete(id); },
  queueMicrotask(callback) { microtasks.push(callback); },
  Event: class Event { constructor(type) { this.type = type; } },
  StorageEvent: class StorageEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  fetch: async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.p_state) puts.push(body);
    return { ok: true, status: 200, json: async () => [{ accepted: true, revision: puts.length, state: body.p_state }] };
  },
});
context.window = context;
context.addEventListener = (type, callback) => { listeners.set(type, callback); };
context.dispatchEvent = (event) => { listeners.get(event.type)?.(event); return true; };

const footer = /  ensureBootstrap\(\);\r?\n\}\)\(\);\s*$/;
assert.match(cloudSource, footer, "cloud runtime footer must remain discoverable for the ingress test harness");
const cloudHarness = cloudSource.replace(footer, `
  window.__CLOUD_PIPELINE_TEST__ = Object.freeze({
    flushPush,
    applyRemoteState,
    state() { return { initialized, pendingRaw, pendingGeneration, lastIngestedLocalRaw, revision }; },
    prime(raw, revisionValue = 0) {
      nativeSetItem.call(localStorage, GLOBAL_KEY, raw);
      initialized = true;
      applyingRemote = false;
      pendingRaw = null;
      revision = revisionValue;
      remoteBasisRaw = raw;
    },
  });
})();`);
vm.runInContext(persistenceSource, context, { filename: "world-persistence.js" });
vm.runInContext(cloudHarness, context, { filename: "cloud-state-sync.js" });
const cloud = context.__CLOUD_PIPELINE_TEST__;
const persistence = context.__BAEKJI_WORLD_PERSISTENCE__;
const first = JSON.stringify({ version: 3, characters: { "tester-a": { id: "tester-a" } }, parties: {}, sessions: {} });
cloud.prime(first, 1);

// Canonical adapter write is the only local writer path and schedules one PUT.
const generationBeforeCanonical = cloud.state().pendingGeneration;
persistence.writeRaw(JSON.stringify({ version: 3, characters: { "tester-a": { id: "tester-a", contamination: 1 } }, parties: {}, sessions: {} }));
while (microtasks.length) microtasks.shift()();
assert.ok(cloud.state().pendingRaw, "canonical adapter ingress must produce one pending cloud raw batch before flush");
assert.equal(cloud.state().pendingGeneration, generationBeforeCanonical + 1, "one canonical physical write observed by both patch and persistence subscriber must create one logical ingress generation");
await cloud.flushPush();
assert.equal(puts.length, 1, "one canonical raw adapter write must yield one cloud PUT batch");

// Repeating the final raw value must not create another cloud batch.
const stableRaw = persistence.readRaw();
persistence.writeRaw(stableRaw);
while (microtasks.length) microtasks.shift()();
await cloud.flushPush();
assert.equal(puts.length, 1, "same final raw bytes must not schedule or PUT again");

// Legacy decorator writers still use the physical storage path; that path must
// enter the same owner once and create one additional cloud batch.
const legacyRaw = JSON.stringify({ version: 3, characters: { "tester-a": { id: "tester-a", contamination: 3 } }, parties: {}, sessions: {} });
context.localStorage.setItem(GLOBAL_KEY, legacyRaw);
await cloud.flushPush();
assert.equal(puts.length, 2, "one legacy direct localStorage writer must yield one cloud PUT batch");

// Remote updates write through the captured native method, emit exactly one
// normal storage ingress event, and never re-enter the cloud writer pipeline.
let nativeIngresses = 0;
context.addEventListener("storage", () => { nativeIngresses += 1; });
const remote = { version: 3, characters: { "tester-a": { id: "tester-a", contamination: 2 } }, parties: {}, sessions: {} };
assert.equal(cloud.applyRemoteState({ revision: 2, state: remote }), true, "a newer remote state must apply once");
while (microtasks.length) microtasks.shift()();
await cloud.flushPush();
assert.equal(nativeIngresses, 1, "remote apply must dispatch one native storage ingress event");
assert.equal(puts.length, 2, "remote apply must not repush through cloud ingress");

persistence.writeRaw(JSON.stringify(remote));
while (microtasks.length) microtasks.shift()();
await cloud.flushPush();
assert.equal(puts.length, 2, "writing the accepted remote mirror through WorldPersistence must stay deduped");

context.dispatchEvent(new context.StorageEvent("storage", { key: GLOBAL_KEY, newValue: JSON.stringify(remote) }));
await cloud.flushPush();
assert.equal(puts.length, 2, "an external-tab storage event must not become a local cloud push");

console.log("PASS: canonical persistence ingress coalesces cloud scheduling and suppresses same-raw batches");
