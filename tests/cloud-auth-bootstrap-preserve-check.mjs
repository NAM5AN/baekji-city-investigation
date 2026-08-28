import assert from "node:assert/strict";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const actor = "actor-a";
const localGuest = JSON.stringify(projectionState("guest", 0, { eventSeq: 99 }));
const harness = createProjectionCloudHarness({ actorId: actor, revision: 2, state: projectionState(actor, 2), payloadActorId: "actor-b" });
harness.localStorage.values.set("baekji_city_mvp_state_v3", localGuest);
await harness.settle();

assert.equal(harness.persistence.isRemoteActive(), false, "actorId mismatch must reject the projection before it becomes authoritative");
assert.equal(harness.persistence.readRaw(), localGuest, "mismatched authenticated data cannot overwrite local/guest bytes");
assert.equal(harness.localStorage.writes.length, 0);
assert.equal(harness.cloud.actorId(), "");

console.log("PASS: bootstrap rejects actor-mismatched projections without persisting private state");
