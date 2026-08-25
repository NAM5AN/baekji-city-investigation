import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../world-store.js", import.meta.url);
assert.equal(fs.existsSync(sourcePath), true, "Stage 5 must provide the standalone world-store runtime");
const source = fs.readFileSync(sourcePath, "utf8");
const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|Storage|fetch|document|addEventListener|setTimeout|setInterval|cloud|api|log)\b/i, "WorldStore must own only in-memory snapshots, never persistence, ingress, DOM, timers, cloud, APIs, or logs");
assert.match(index, /world-store\.js\?v=0\.1\.0&stage5=1/, "WorldStore must load with its Stage 5 cache key");
assert.match(index, /app\.js\?v=0\.4\.15&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1&stage5-world-store=1&stage6a=1&stage6b=1/, "app must retain the Stage 5 world-store cache key and append Stage 6A");
assert.ok(index.indexOf("runtime-baseline-stability.js?v=0.4.5&stage3a=1&stage3b=1&transfer-privacy=1") < index.indexOf("world-store.js?v=0.1.0&stage5=1"), "WorldStore must load after the existing baseline runtime");
assert.ok(index.indexOf("world-store.js?v=0.1.0&stage5=1") < index.indexOf("app.js?v=0.4.15"), "WorldStore must load before app owns the in-memory world");
assert.doesNotMatch(app, /\blet\s+state\s*=/, "app must not retain a second mutable world-state owner");
assert.match(app, /__BAEKJI_WORLD_STORE__/, "app must bootstrap through the WorldStore runtime");
assert.match(app, /\.transact\(/, "ordinary app mutations must commit through WorldStore");
assert.match(app, /persistence\.writeRaw\(JSON\.stringify\(currentState\(\)\)\)/, "existing persistence write path must delegate raw bytes through WorldPersistence");
assert.match(app, /addEventListener\("storage"/, "existing two-tab storage ingress must remain in app");

const window = {};
const context = vm.createContext({ window, Object, Array, String, Number, Boolean, Set, Map, JSON, Error, TypeError, structuredClone, console });
vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
vm.runInContext(source, context, { filename: "world-store.js" });

const store = window.__BAEKJI_WORLD_STORE__;
assert.ok(store, "WorldStore must expose its actual runtime instance");
assert.equal(Object.isFrozen(store), true, "WorldStore API must be frozen");
assert.deepEqual(Object.keys(store).sort(), ["get", "subscribe", "transact"], "WorldStore public API must remain exactly get/transact/subscribe");
assert.equal(store.get(), undefined, "uninitialized store reads undefined until bootstrap replacement");

const seenA = [];
const seenB = [];
const unsubscribeA = store.subscribe((next, meta) => seenA.push({ next, meta }));
const unsubscribeB = store.subscribe((next, meta) => seenB.push({ next, meta }));

let bootstrapDraft;
const boot = store.transact("bootstrap", () => ({ version: 3, nested: { value: 1 }, entries: ["a"] }));
assert.equal(boot, store.get(), "transaction returns the committed immutable snapshot");
assert.equal(Object.isFrozen(boot), true);
assert.equal(Object.isFrozen(boot.nested), true, "nested snapshot objects must be frozen");
assert.equal(Object.isFrozen(boot.entries), true, "nested snapshot arrays must be frozen");
assert.deepEqual(JSON.parse(JSON.stringify(boot)), { version: 3, nested: { value: 1 }, entries: ["a"] });
assert.equal(seenA.length, 1, "each active subscriber receives bootstrap exactly once");
assert.equal(seenB.length, 1, "each active subscriber receives bootstrap exactly once");
assert.equal(seenA[0].meta.reason, "bootstrap");
assert.equal(seenA[0].meta.previous, undefined, "bootstrap metadata retains undefined previous snapshot");

const beforeEdit = store.get();
store.transact("edit", (draft) => {
  bootstrapDraft = draft;
  draft.nested.value = 2;
  draft.entries.push("b");
});
assert.equal(store.get().nested.value, 2);
assert.deepEqual(JSON.parse(JSON.stringify(beforeEdit)), { version: 3, nested: { value: 1 }, entries: ["a"] }, "commits cannot mutate retained prior snapshots");
assert.notEqual(bootstrapDraft, store.get(), "transaction draft must never be the committed snapshot object");
assert.equal(Object.isFrozen(store.get().nested), true);
assert.equal(seenA.length, 2);
assert.equal(seenB.length, 2);
assert.equal(seenA.at(-1).meta.reason, "edit");
assert.equal(seenA.at(-1).meta.previous, beforeEdit, "subscriber metadata preserves the immutable prior snapshot identity");

unsubscribeA();
unsubscribeA();
store.transact("only-b", (draft) => { draft.entries.push("c"); });
assert.equal(seenA.length, 2, "idempotent unsubscribe removes the subscriber once");
assert.equal(seenB.length, 3, "remaining subscriber still receives one commit notification");

const beforeThrow = store.get();
const beforeThrowNotifications = seenB.length;
assert.throws(() => store.transact("throw", () => { throw new Error("reject"); }), /reject/);
assert.equal(store.get(), beforeThrow, "throwing recipe rolls back without replacing state");
assert.equal(seenB.length, beforeThrowNotifications, "throwing recipe cannot notify subscribers");

const order = [];
const unsubscribeOrder = store.subscribe((_next, meta) => {
  order.push(meta.reason);
  if (meta.reason === "outer") store.transact("inner", (draft) => { draft.entries.push("inner"); });
});
store.transact("outer", (draft) => { draft.entries.push("outer"); });
assert.deepEqual(order, ["outer", "inner"], "reentrant transactions must drain FIFO after the outer commit notification");
assert.deepEqual(JSON.parse(JSON.stringify(store.get().entries)), ["a", "b", "c", "outer", "inner"], "FIFO reentrancy preserves both commits without loss");

const beforeFailedParent = store.get();
const beforeFailedParentOrder = [...order];
assert.throws(() => store.transact("failed-parent", () => {
  store.transact("discarded-child", (draft) => { draft.entries.push("discarded"); });
  throw new Error("parent abort");
}), /parent abort/);
assert.equal(store.get(), beforeFailedParent, "failed parent cannot commit its draft");
assert.deepEqual(order, beforeFailedParentOrder, "child transaction queued by a failed parent must be discarded without notification");
assert.doesNotMatch(JSON.stringify(store.get()), /discarded/);
unsubscribeOrder();

const queuedFailureOrder = [];
const unsubscribeQueuedFailure = store.subscribe((_next, meta) => {
  queuedFailureOrder.push(meta.reason);
  if (meta.reason !== "queued-parent") return;
  store.transact("queued-failure", () => { throw new Error("queued child abort"); });
  store.transact("queued-sibling", (draft) => { draft.entries.push("queued-sibling"); });
});
store.transact("queued-parent", (draft) => { draft.entries.push("queued-parent"); });
assert.deepEqual(queuedFailureOrder, ["queued-parent", "queued-sibling"], "a failed queued child must notify zero times and not block its following FIFO sibling");
assert.deepEqual(JSON.parse(JSON.stringify(store.get().entries)).slice(-2), ["queued-parent", "queued-sibling"], "successful outer and following sibling commits survive an isolated queued-child failure");
unsubscribeQueuedFailure();

const fallbackWindow = {};
const fallbackContext = vm.createContext({ window: fallbackWindow, Object, Array, String, Number, Boolean, Set, Map, JSON, Error, TypeError, console });
vm.runInContext(runtimeUtils, fallbackContext, { filename: "runtime-utils-json-fallback.js" });
vm.runInContext(source, fallbackContext, { filename: "world-store-json-fallback.js" });
const fallbackStore = fallbackWindow.__BAEKJI_WORLD_STORE__;
const fallbackBoot = fallbackStore.transact("bootstrap-fallback", () => ({ nested: { value: 7 } }));
assert.equal(fallbackStore.get(), fallbackBoot, "WorldStore must bootstrap without structuredClone");
assert.equal(Object.isFrozen(fallbackBoot), true, "JSON clone fallback must still freeze the root snapshot");
assert.equal(Object.isFrozen(fallbackBoot.nested), true, "JSON clone fallback must still freeze nested snapshots");
assert.equal(fallbackBoot.nested.value, 7);

console.log("PASS: WorldStore owns immutable in-memory get/transact/subscribe commits without persistence or ingress side effects");
