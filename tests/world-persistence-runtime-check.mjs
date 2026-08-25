import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.doesNotMatch(source, /\b(?:JSON|parse|normalize|dispatchEvent|addEventListener|setTimeout|setInterval|cloud|__BAEKJI_WORLD_STORE__|fetch|document)\b/i, "WorldPersistence must only forward raw world bytes through dynamic storage access");
assert.match(index, /world-persistence\.js\?v=0\.1\.0&stage6a=1/);
assert.match(index, /app\.js\?v=0\.4\.14&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1&stage5-world-store=1&stage6a=1/);
const baseline = index.indexOf("runtime-baseline-stability.js?v=0.4.5&stage3a=1&stage3b=1&transfer-privacy=1");
const persistenceIndex = index.indexOf("world-persistence.js?v=0.1.0&stage6a=1");
const storeIndex = index.indexOf("world-store.js?v=0.1.0&stage5=1");
const appIndex = index.indexOf("app.js?v=0.4.14");
assert.ok(baseline >= 0 && baseline < persistenceIndex && persistenceIndex < storeIndex && storeIndex < appIndex, "startup must remain baseline → persistence → Store → app");
assert.match(app, /__BAEKJI_WORLD_PERSISTENCE__/);
assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)\(GLOBAL_KEY/, "app world storage must use persistence adapter only");
assert.match(app, /localStorage\.getItem\(LAYOUT_KEY/, "layout storage must remain nonworld direct storage");
assert.match(app, /sessionStorage\.getItem\(USER_KEY/, "session identity storage must remain nonworld direct storage");

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  let reads = 0; let writes = 0;
  return {
    getItem(key) { reads += 1; return values.get(key) ?? null; },
    setItem(key, raw) { writes += 1; values.set(key, String(raw)); },
    counts() { return { reads, writes }; }, value(key) { return values.get(key) ?? null; },
  };
}
const first = storage({ baekji_city_mvp_state_v3: '{"raw":"first"}' });
const window = { localStorage: first };
const context = vm.createContext({ window, localStorage: first, Object, String, console });
vm.runInContext(source, context, { filename: "world-persistence.js" });
const api = window.__BAEKJI_WORLD_PERSISTENCE__;
assert.equal(Object.isFrozen(api), true);
assert.deepEqual(Object.keys(api).sort(), ["key", "readRaw", "writeRaw"]);
assert.equal(api.key, "baekji_city_mvp_state_v3");
assert.equal(api.readRaw(), '{"raw":"first"}');
assert.deepEqual(first.counts(), { reads: 1, writes: 0 }, "readRaw must make exactly one physical read");
const late = storage({ baekji_city_mvp_state_v3: '{"raw":"late"}' });
window.localStorage = late;
context.localStorage = late;
assert.equal(api.readRaw(), '{"raw":"late"}', "late localStorage wrappers must be traversed dynamically");
const raw = '{"version":3,"payload":"  exact bytes  "}';
api.writeRaw(raw);
assert.equal(late.value(api.key), raw, "writeRaw must preserve raw bytes without parsing or normalization");
assert.deepEqual(late.counts(), { reads: 1, writes: 1 }, "writeRaw must call the late wrapper exactly once");

console.log("PASS: WorldPersistence forwards exact raw world bytes through late-bound localStorage only");
