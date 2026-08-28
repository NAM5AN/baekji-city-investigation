import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.doesNotMatch(source, /\b(?:JSON|parse|normalize|dispatchEvent|StorageEvent|addEventListener|setTimeout|setInterval|cloud|__BAEKJI_WORLD_STORE__|fetch|document)\b/i, "persistence owns raw writer ingress only; it must not parse, render, synthesize browser storage events, or own cloud/Store state");
assert.match(source, /queueMicrotask/, "same-turn raw writes must coalesce their subscriber delivery in a microtask");
assert.match(app, /persistence\.subscribe\(/, "app must consume adapter same-tab raw ingress rather than relying only on native storage events");
assert.match(app, /window\.addEventListener\("storage"/, "app must retain native cross-tab storage ingress");
assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)\(GLOBAL_KEY/, "canonical world reads/writes must stay behind persistence");
assert.match(index, /world-persistence\.js\?v=0\.1\.2&stage8b-projection=1/);
assert.match(index, /app\.js\?v=0\.4\.18[^"']*stage5-world-store=1[^"']*stage6a=1[^"']*stage6b=1[^"']*stage8b=1[^"']*stage8b-b5=1/);

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  let gets = 0;
  let sets = 0;
  return {
    getItem(key) { gets += 1; return values.get(key) ?? null; },
    setItem(key, value) { sets += 1; values.set(key, String(value)); },
    raw(key) { return values.get(key) ?? null; },
    counts() { return { gets, sets }; },
  };
}

const microtasks = [];
const first = makeStorage({ baekji_city_mvp_state_v3: "before" });
const window = { localStorage: first };
const context = vm.createContext({
  window, localStorage: first, Object, String, Set, queueMicrotask(callback) { microtasks.push(callback); }, console,
});
vm.runInContext(source, context, { filename: "world-persistence.js" });
const api = window.__BAEKJI_WORLD_PERSISTENCE__;

assert.equal(Object.isFrozen(api), true, "public persistence API must be immutable");
assert.deepEqual(Object.keys(api).sort(), ["clearRemoteRaw", "isRemoteActive", "key", "readRaw", "replaceRemoteRaw", "subscribe", "writeRaw"], "public persistence API must expose raw local ingress plus explicit in-memory projection replacement");
assert.equal(api.key, "baekji_city_mvp_state_v3");

const received = [];
const off = api.subscribe((raw) => received.push(raw));
const isolated = api.subscribe(() => { throw new Error("subscriber failure must be isolated"); });
assert.deepEqual(received, [], "subscribe must not emit an initial snapshot");

api.writeRaw("first");
assert.deepEqual(first.counts(), { gets: 2, sets: 1 }, "each raw write must late-read before, set once, then late-read final storage");
assert.equal(first.raw(api.key), "first", "raw bytes must pass through unchanged");
assert.deepEqual(received, [], "same-turn writer delivery must wait for the coalescing microtask");

api.writeRaw("second");
assert.deepEqual(first.counts(), { gets: 4, sets: 2 }, "a second same-turn writer call remains one physical set with final raw read");
assert.equal(microtasks.length, 1, "same-turn writes must schedule one coalesced delivery");
microtasks.splice(0).forEach((callback) => callback());
assert.deepEqual(received, ["second"], "same-turn writer ingress must deliver only the final raw bytes once");

api.writeRaw("second");
assert.deepEqual(first.counts(), { gets: 6, sets: 3 }, "equal raw writes still preserve the physical writer before/set/after contract");
microtasks.splice(0).forEach((callback) => callback());
assert.deepEqual(received, ["second"], "unchanged final raw must not re-notify subscribers or create a self-loop");

off();
off();
isolated();
api.writeRaw("after-off");
microtasks.splice(0).forEach((callback) => callback());
assert.deepEqual(received, ["second"], "idempotent unsubscribe must remove the listener permanently");

const late = makeStorage({ baekji_city_mvp_state_v3: "late-before" });
window.localStorage = late;
context.localStorage = late;
const lateReceived = [];
api.subscribe((raw) => lateReceived.push(raw));
api.writeRaw("late-final");
assert.deepEqual(late.counts(), { gets: 2, sets: 1 }, "writeRaw must traverse late-installed storage wrappers for every before/set/after operation");
microtasks.splice(0).forEach((callback) => callback());
assert.deepEqual(lateReceived, ["late-final"], "late storage writer delivery must use the final raw bytes");

console.log("PASS: WorldPersistence coalesces same-tab raw writer ingress without native-event loops");
