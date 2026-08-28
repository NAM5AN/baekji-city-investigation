import assert from "node:assert/strict";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const actor = "actor-a";
const harness = createProjectionCloudHarness({ actorId: actor, revision: 10, state: projectionState(actor, 10) });
await harness.settle();
for (const [status, targetRevision] of [["APPLIED", 11], ["REPLAY", 12], ["REVISION_CONFLICT", 13]]) {
  const lease = harness.cloud.begin();
  assert.equal(lease.ready, true, `${status} obtains one exclusive settlement lease`);
  assert.equal(harness.cloud.begin().ready, false, "a second command cannot overlap settlement");
  harness.setProjection({ nextRevision: targetRevision, nextState: projectionState(actor, targetRevision) });
  assert.equal(await harness.cloud.complete(lease, status, targetRevision), true, `${status} settles only after its minRevision projection read`);
  assert.equal(harness.cloud.revision(), targetRevision);
}

const retryLease = harness.cloud.begin();
harness.setProjection({ status: 503 });
await assert.rejects(() => harness.cloud.complete(retryLease, "APPLIED", 14));
assert.equal(harness.cloud.begin().ready, true, "failed projection settlement releases the lease for controlled recovery");

console.log("PASS: APPLIED/REPLAY/CONFLICT settle through minRevision projection reads and failures release leases");
