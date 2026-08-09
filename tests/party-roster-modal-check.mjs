import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-roster-modal.js", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "party-roster-modal.js" });

const api = sandbox.window.__BAEKJI_PARTY_ROSTER_TEST__;
assert.ok(api, "party roster test API must be exposed");

const snapshot = {
  version: 3,
  characters: {
    alpha: { contamination: 78, inventory: { secret: { quantity: 1 } }, currentNode: "SECRET_NODE" },
    beta: { contamination: 12, inventory: {}, currentNode: "OTHER_NODE" },
  },
  parties: {
    p1: {
      id: "p1",
      name: "해오름역 조사조 1",
      memberIds: ["alpha", "beta", "alpha"],
      creatorId: "alpha",
      confirmedBy: ["alpha"],
      readyBy: ["alpha"],
      status: "SESSION_CREATED",
      sessionId: "session_secret",
    },
  },
};

const roster = api.buildRoster(snapshot, "p1", {
  alpha: { id: "alpha", name: "산", profilePhoto: "data:image/jpeg;base64,AAA" },
  beta: { id: "beta", name: "남", profilePhoto: "" },
});

assert.deepEqual(JSON.parse(JSON.stringify(roster)), [
  { id: "alpha", name: "산", profilePhoto: "data:image/jpeg;base64,AAA" },
  { id: "beta", name: "남", profilePhoto: "" },
]);
assert.deepEqual(Object.keys(roster[0]).sort(), ["id", "name", "profilePhoto"], "roster must expose profile identity only");
assert.equal(JSON.stringify(roster).includes("contamination"), false);
assert.equal(JSON.stringify(roster).includes("inventory"), false);
assert.equal(JSON.stringify(roster).includes("currentNode"), false);
assert.equal(JSON.stringify(roster).includes("readyBy"), false);
assert.equal(JSON.stringify(roster).includes("confirmedBy"), false);
assert.match(source, /data-party-roster-open/);
assert.match(source, /조원 보기/);
assert.match(source, /현재 위치, 오염도, 소지품, 행동 기록과 준비 상태는 공개하지 않습니다/);
assert.match(source, /party\.sessionId \|\| party\.status === "SESSION_CREATED"/, "leader home open should become roster only after session creation");

console.log("PASS: party roster modal exposes only profile photo and name, without investigation spoilers");
