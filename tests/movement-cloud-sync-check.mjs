import assert from "node:assert/strict";
import fs from "node:fs";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const cloud = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const catalog = fs.readFileSync(new URL("../player-world-command-catalog.js", import.meta.url), "utf8");
assert.match(catalog, /BEGIN_MOVEMENT_V1/);
assert.match(catalog, /SETTLE_MOVEMENT_V1/);
assert.doesNotMatch(cloud, /baekji_mvp_put_state|p_state|rebaseUnsynced|Storage\.prototype/, "movement sync cannot recover snapshot PUT/rebase paths");
assert.match(cloud, /\/api\/player-world-projection/);

const actor = "actor-a";
const harness = createProjectionCloudHarness({ actorId: actor, revision: 30, state: projectionState(actor, 30) });
await harness.settle();
const beginLease = harness.cloud.begin();
assert.equal(beginLease.ready, true, "BEGIN command obtains an authoritative projection lease");
harness.setProjection({ nextRevision: 31, nextState: projectionState(actor, 31, { sessions: { own: { id: "own", memberIds: [actor], movement: { token: "token-1", fromNode: "A", targetNode: "B" } } } }) });
assert.equal(await harness.cloud.complete(beginLease, "APPLIED", 31), true);
const settleLease = harness.cloud.begin();
harness.setProjection({ nextRevision: 32, nextState: projectionState(actor, 32, { sessions: { own: { id: "own", memberIds: [actor], movement: null, lastMovementTransition: { token: "token-1", kind: "ARRIVED" } } } }) });
assert.equal(await harness.cloud.complete(settleLease, "APPLIED", 32), true);
assert.equal(harness.fetchCalls.every((call) => call.url === "/api/player-world-projection" && call.options.method === "GET"), true, "movement lifecycle performs projection GETs only");
assert.equal(harness.localStorage.writes.length, 0, "movement lifecycle stores no snapshot or rebase overlay");

console.log("PASS: BEGIN/SETTLE movement commands converge through projection GET with zero snapshot PUT/rebase");
