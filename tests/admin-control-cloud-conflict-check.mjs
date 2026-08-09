import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");

class StorageMock {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const windowMock = {
  addEventListener() {},
  dispatchEvent() {},
};
const documentMock = {
  hidden: false,
  documentElement: { dataset: {} },
  addEventListener() {},
};
const context = {
  console,
  Storage: StorageMock,
  localStorage: new StorageMock(),
  sessionStorage: new StorageMock(),
  window: windowMock,
  document: documentMock,
  CustomEvent: class CustomEventMock { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  Event: class EventMock { constructor(type) { this.type = type; } },
  StorageEvent: class StorageEventMock { constructor(type, init) { this.type = type; Object.assign(this, init); } },
  AbortController,
  setTimeout: () => 0,
  clearTimeout: () => {},
  fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
  Math,
  Date,
  JSON,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Set,
  Map,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "cloud-state-sync.js" });
const api = windowMock.__BAEKJI_CLOUD_SYNC_TEST__;
assert.ok(api, "cloud sync test API must be exposed");

const remote1 = {
  version: 3,
  adminControlSeq: 1,
  adminControlPatches: [{
    seq: 1,
    requestId: "admin-1",
    at: 1000,
    action: "CHARACTER_STATUS",
    targetKind: "CHARACTER",
    targetId: "c1",
    data: { contamination: 40 },
  }],
  characters: { c1: { id: "c1", contamination: 40, symptom: "안정", inventory: {} } },
  sessions: {},
};
const staleLocal = {
  version: 3,
  adminControlSeq: 0,
  adminControlPatches: [],
  characters: { c1: { id: "c1", contamination: 5, symptom: "안정", inventory: {} } },
  sessions: {},
  localOnly: "keep-me",
};
let merged = api.mergeValues(remote1, staleLocal);
assert.equal(merged.characters.c1.contamination, 5, "normal merge is intentionally local-last before admin reconciliation");
merged = api.reconcileAdminControl(remote1, staleLocal, merged);
assert.equal(merged.characters.c1.contamination, 40, "unseen admin contamination patch must win over stale local state");
assert.equal(merged.localOnly, "keep-me", "unrelated local data must survive reconciliation");
assert.equal(merged.adminControlSeq, 1);

const localAfterAdmin = {
  ...JSON.parse(JSON.stringify(remote1)),
  characters: { c1: { id: "c1", contamination: 47, symptom: "안정", inventory: {} } },
};
const remoteSameSeq = JSON.parse(JSON.stringify(remote1));
let sameSeqMerged = api.reconcileAdminControl(remoteSameSeq, localAfterAdmin, api.mergeValues(remoteSameSeq, localAfterAdmin));
assert.equal(sameSeqMerged.characters.c1.contamination, 47, "already-seen admin patch must not freeze later legitimate gameplay changes");

const remote2 = JSON.parse(JSON.stringify(remote1));
remote2.adminControlSeq = 2;
remote2.characters.c1.contamination = 47;
remote2.characters.c1.symptom = "백색 반점";
remote2.adminControlPatches.push({
  seq: 2,
  requestId: "admin-2",
  at: 2000,
  action: "CHARACTER_STATUS",
  targetKind: "CHARACTER",
  targetId: "c1",
  data: { symptom: "백색 반점" },
});
const localSeq1 = JSON.parse(JSON.stringify(localAfterAdmin));
localSeq1.characters.c1.contamination = 52;
localSeq1.characters.c1.symptom = "안정";
const next = api.reconcileAdminControl(remote2, localSeq1, api.mergeValues(remote2, localSeq1));
assert.equal(next.characters.c1.contamination, 52, "new symptom-only admin patch must not overwrite unrelated contamination gameplay changes");
assert.equal(next.characters.c1.symptom, "백색 반점", "new unseen admin symptom patch must be replayed");
assert.equal(next.adminControlSeq, 2);

console.log("PASS: stale cloud writes replay only unseen admin control fields without freezing later gameplay changes");
