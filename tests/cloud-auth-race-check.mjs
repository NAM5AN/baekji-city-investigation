import assert from "node:assert/strict";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const a = "actor-a", b = "actor-b";
const harness = createProjectionCloudHarness({ actorId: a, revision: 4, state: projectionState(a, 4) });
await harness.settle();
assert.equal(harness.cloud.actorId(), a);

harness.sessionStorage.setItem("baekji_city_mvp_current_user_v034", b);
harness.setProjection({ actor: b, nextRevision: 7, nextState: projectionState(b, 7) });
harness.emit("baekji-player-session-adopted", { user: { id: b } });
await harness.settle();
assert.equal(harness.cloud.actorId(), b, "identity switch discards A projection before applying B");
assert.equal(harness.cloud.revision(), 7);
const active = JSON.parse(harness.persistence.readRaw());
assert.deepEqual(Object.keys(active.characters), [b]);
assert.equal(harness.localStorage.writes.length, 0, "A projection is not persisted for B or any other tab");

harness.emit("baekji-player-session-ready", { user: null });
assert.equal(harness.persistence.isRemoteActive(), false, "logout clears the in-memory projection only");
assert.equal(harness.cloud.actorId(), "");

console.log("PASS: identity churn cannot carry a private projection across actors");
