import assert from "node:assert/strict";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const actor = "actor-a";
const initial = projectionState(actor, 4);
const harness = createProjectionCloudHarness({ actorId: actor, revision: 4, state: initial });
await harness.settle();

assert.equal(harness.fetchCalls.length, 1);
assert.deepEqual(harness.fetchCalls[0], {
  url: "/api/player-world-projection",
  options: { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
});
assert.equal(harness.persistence.isRemoteActive(), true);
assert.deepEqual(JSON.parse(harness.persistence.readRaw()), initial);
assert.equal(harness.localStorage.writes.length, 0, "authoritative projection bytes stay in memory, not localStorage");
assert.throws(() => harness.persistence.writeRaw(JSON.stringify(initial)), /AUTHORITATIVE_PLAYER_STATE_READ_ONLY/);

const next = projectionState(actor, 5, { parties: { own: { id: "own" } } });
harness.setProjection({ nextRevision: 5, nextState: next });
await harness.cloud.refresh({ minRevision: 5, reason: "test" });
assert.deepEqual(JSON.parse(harness.persistence.readRaw()), next);
assert.equal(harness.localStorage.writes.length, 0);

console.log("PASS: projection refresh replaces memory-only authoritative state without local writer ingress");
