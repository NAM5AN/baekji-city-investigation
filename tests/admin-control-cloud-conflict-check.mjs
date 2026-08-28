import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const remoteWrites = [];
const sessionStorage = { getItem(key) { return key === "baekji_city_mvp_current_user_v034" ? "c1" : null; } };
const persistence = { replaceRemoteRaw(raw) { remoteWrites.push(JSON.parse(raw)); }, clearRemoteRaw() {} };
const context = {
  console, sessionStorage, document: { hidden: false, addEventListener() {} },
  window: { __BAEKJI_WORLD_PERSISTENCE__: persistence, addEventListener() {}, dispatchEvent() {} },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  BroadcastChannel: class { addEventListener() {} postMessage() {} },
  setTimeout: () => 0, clearTimeout() {}, JSON, Object, Array, Number, String, Boolean, Set, Map,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "cloud-state-sync.js" });
const api = context.window.__BAEKJI_CLOUD_SYNC_TEST__;
assert.ok(api, "projection sync test API must be exposed");

const projection = { revision: 18, actorId: "c1", state: { version: 3, characters: { c1: { id: "c1", contamination: 40, inventory: {} } }, parties: {}, sessions: {} } };
assert.equal(api.applyProjection(projection, "admin-control"), true);
assert.equal(remoteWrites.length, 1);
assert.equal(remoteWrites[0].characters.c1.contamination, 40, "an admin change reaches a stale tab only as the server projection");
assert.equal(api.applyProjection({ ...projection, actorId: "other" }, "wrong-actor"), false, "one actor cannot adopt another actor's projection");
assert.doesNotMatch(source, /(?:mergeValues|reconcileAdminControl|applyAdminControlPatch|rebaseUnsyncedOverlay)/, "there is no local-last conflict merge or admin patch replay path");

console.log("PASS: admin changes converge by replacing the stale player view with an actor-bound server projection");
