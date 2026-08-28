import assert from "node:assert/strict";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const actor = "actor-reload";
const stale = JSON.stringify(projectionState("stale-actor", 1));
const fresh = projectionState(actor, 8, { eventSeq: 80 });
const harness = createProjectionCloudHarness({ actorId: actor, revision: 8, state: fresh });
harness.localStorage.values.set("baekji_city_mvp_state_v3", stale);
await harness.settle();

assert.equal(harness.persistence.isRemoteActive(), true);
assert.deepEqual(JSON.parse(harness.persistence.readRaw()), fresh, "reload reads the actor-bound server projection, not stale shared storage");
assert.equal(harness.localStorage.getItem("baekji_city_mvp_state_v3"), stale, "projection does not rewrite the legacy local key");
assert.equal(harness.localStorage.writes.length, 0);

console.log("PASS: authenticated reload bootstraps from private projection memory only");
