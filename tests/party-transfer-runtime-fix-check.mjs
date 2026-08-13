import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-transfer-runtime-fix.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "party-transfer-runtime-fix.js" });
const api = sandbox.window.__BAEKJI_PARTY_TRANSFER_RUNTIME_FIX_TEST__;
assert.ok(api, "runtime transfer fix test API must exist");

const state = {
  version: 3,
  characters: { test_c: { currentPartyId: "party_3", currentSessionId: "session_3" } },
  parties: {},
  sessions: {
    session_2: { id: "session_2", status: "ACTIVE", memberIds: ["test_a"] },
    session_3: { id: "session_3", status: "ACTIVE", memberIds: ["test_b", "test_c"] },
  },
  partyTransferRequests: {
    transfer_1: {
      id: "transfer_1",
      requesterId: "test_c",
      sourcePartyId: "party_2",
      sourceSessionId: "session_2",
      targetPartyId: "party_3",
      targetSessionId: "session_3",
      status: "APPROVED",
      resolvedAt: 1000,
    },
  },
};

assert.equal(api.continuationTarget(state, "test_c", ["investigate", "session_2"], "session_2", 1001), "session_3", "approved transfer must continue directly in target active session");
assert.equal(api.continuationTarget(state, "test_c", ["briefing", "session_3"], "session_2", 1001), "session_3", "briefing fallback must be repaired back to investigation");
assert.equal(api.continuationTarget(state, "test_c", ["home"], "session_2", 1001), "session_3", "short transient home ejection must be repaired");
assert.equal(api.continuationTarget(state, "test_c", ["home"], "session_2", 50000), "", "old transfers must not hijack later home navigation");
assert.equal(api.replaceAccountIdsInText("test_c의 조사조 소속이 이 조사조로 이동되었다."), "테스트 캐릭터 C의 조사조 소속이 이 조사조로 이동되었다.");
assert.equal(api.isTransferLogText("test_c의 조사조 소속이 다른 조사조로 이동되었다."), true);
assert.match(source, /addEventListener\("storage"[\s\S]*true\);/, "storage continuity repair must run in capture phase before app storage rendering");
assert.match(index, /party-transfer-runtime-fix\.js\?v=0\.3\.83/);

console.log("PASS: party transfer keeps the active investigation view and replaces internal IDs in player transfer logs");
