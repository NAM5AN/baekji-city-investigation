import assert from "node:assert/strict";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const actor = "actor-a";
const first = createProjectionCloudHarness({ actorId: actor, revision: 2, state: projectionState(actor, 2) });
await first.settle();
const channel = first.channels[0];
assert.deepEqual(channel.messages, [{ type: "revision", revision: 2, actorId: actor }], "initial projection publishes revision metadata only");
assert.doesNotMatch(JSON.stringify(channel.messages), /characters|parties|sessions|inventory/, "BroadcastChannel must never carry the projection payload");

const second = createProjectionCloudHarness({ actorId: actor, revision: 2, state: projectionState(actor, 2) });
await second.settle();
second.setProjection({ nextRevision: 3, nextState: projectionState(actor, 3, { parties: { own: { id: "own" } } }) });
const before = second.fetchCalls.length;
second.channels[0].receive({ type: "revision", revision: 3, actorId: actor });
await second.settle();
assert.equal(second.fetchCalls.length, before + 1, "a newer same-actor revision invalidates and refetches locally");
assert.equal(second.cloud.revision(), 3);

const otherActorBefore = second.fetchCalls.length;
second.channels[0].receive({ type: "revision", revision: 4, actorId: "actor-b" });
await second.settle();
assert.equal(second.fetchCalls.length, otherActorBefore, "another actor's revision signal is ignored");
assert.equal(second.localStorage.writes.length, 0, "cross-tab synchronization never stores projection bytes");

console.log("PASS: cross-tab synchronization broadcasts revision-only invalidations and refetches per actor");
