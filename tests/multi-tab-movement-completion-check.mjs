import assert from "node:assert/strict";
import fs from "node:fs";
import { createProjectionCloudHarness, projectionState } from "./helpers/projection-cloud-harness.mjs";

const commitSql = fs.readFileSync(new URL("../supabase/migrations/20260828055839_player_world_command_commit.sql", import.meta.url), "utf8");
assert.match(commitSql, /baekji_player_world_command_preflight_v1/, "DB commit must enter through the command ledger/CAS preflight");
assert.match(commitSql, /where store\.state_key = 'day1_world'\s+and store\.revision = v_preflight\.revision/i, "DB commit must compare canonical revision atomically");
assert.match(commitSql, /baekji_player_world_command_record_v1/, "DB commit must record exact command outcomes for replay");

const actor = "actor-a", commandId = "11111111-1111-4111-8111-111111111111", token = "movement-token";
let revision = 20;
const ledger = new Map();
function commit({ expectedRevision, id, movementToken }) {
  const existing = ledger.get(id);
  if (existing) return { ...existing, status: existing.movementToken === movementToken ? "REPLAY" : "COMMAND_ID_REUSED" };
  if (expectedRevision !== revision) return { status: "REVISION_CONFLICT", revision };
  revision += 1;
  const outcome = { status: "APPLIED", revision, commandId: id, movementToken };
  ledger.set(id, outcome);
  return outcome;
}

const tabA = createProjectionCloudHarness({ actorId: actor, revision: 20, state: projectionState(actor, 20) });
const tabB = createProjectionCloudHarness({ actorId: actor, revision: 20, state: projectionState(actor, 20) });
await Promise.all([tabA.settle(), tabB.settle()]);
const first = commit({ expectedRevision: 20, id: commandId, movementToken: token });
const second = commit({ expectedRevision: 20, id: commandId, movementToken: token });
const stale = commit({ expectedRevision: 20, id: "22222222-2222-4222-8222-222222222222", movementToken: token });
assert.equal(first.status, "APPLIED");
assert.equal(second.status, "REPLAY", "same command/token is ledger-idempotent across tabs");
assert.equal(stale.status, "REVISION_CONFLICT", "different stale command loses CAS without a second movement completion");
assert.equal(ledger.size, 1, "only one canonical settlement is committed");

for (const [tab, result] of [[tabA, first], [tabB, second]]) {
  const lease = tab.cloud.begin();
  tab.setProjection({ nextRevision: result.revision, nextState: projectionState(actor, result.revision, { sessions: { own: { id: "own", memberIds: [actor], lastMovementTransition: { token, kind: "ARRIVED" } } } }) });
  assert.equal(await tab.cloud.complete(lease, result.status, result.revision), true);
  assert.equal(tab.cloud.revision(), 21);
}

console.log("PASS: two tabs settle one movement through command ledger/CAS and exact-once projection settlement");
