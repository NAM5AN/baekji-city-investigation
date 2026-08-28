import assert from "node:assert/strict";
import fs from "node:fs";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
assert.match(app, /renderExternalUpdate\(/, "investigation rendering retains a single external-state ingress");
assert.match(cloud, /persistence\.replaceRemoteRaw\(JSON\.stringify\(projection\.state\)\)/, "canonical projection refresh owns the rendered state replacement");
assert.doesNotMatch(cloud, /beginMove|movementToken|baekji_mvp_put_state/, "cloud transport must not fabricate movement tokens or whole-state writes");

const actor = "actor-a";
const initial = projectionState(actor, 1, {
  sessions: { own: { id: "own", status: "ACTIVE", memberIds: [actor], currentNode: "A", movement: null } },
});
const canonical = projectionState(actor, 2, {
  sessions: { own: { id: "own", status: "ACTIVE", memberIds: [actor], currentNode: "B", movement: null, lastMovementTransition: { kind: "ARRIVED", token: "server-token" } } },
});
const harness = createProjectionCloudHarness({ actorId: actor, revision: 1, state: initial });
await harness.settle();
harness.setProjection({ nextRevision: 2, nextState: canonical });
await harness.cloud.refresh({ minRevision: 2, reason: "movement-settle" });
const rendered = JSON.parse(harness.persistence.readRaw());
assert.equal(rendered.sessions.own.currentNode, "B");
assert.equal(rendered.sessions.own.lastMovementTransition.token, "server-token", "only a canonical projection may publish a movement terminal token");
assert.equal(harness.localStorage.writes.length, 0);

console.log("PASS: investigation external refresh renders canonical movement settlement without local token synthesis");
