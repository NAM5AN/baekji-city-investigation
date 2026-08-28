import assert from "node:assert/strict";
import fs from "node:fs";
import { derivePlayerWorldEffects as derive } from "../lib/player-world-derived-effects.mjs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.doesNotMatch(index, /action-log-sync\.js/, "legacy browser action-log writer must be retired from the production boot path");

const state = {
  version: 3,
  characters: { test_a: { name: "테스트 캐릭터 A" } },
  sessions: {
    source: { id: "source", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", logs: [{ id: "act-1", type: "action-input", actorId: "test_a", text: "문 쪽으로 손전등을 비춘다", at: 10 }] },
    witness: { id: "witness", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", logs: [] },
    elsewhere: { id: "elsewhere", status: "ACTIVE", variant: "a", currentNode: "E_G_PLAZA", logs: [] },
  },
};
const fanout = derive({ state, effect: "ACTION_FANOUT", context: { sessionId: "source", actionLogId: "act-1" }, nowMs: 20 });
assert.equal(fanout.applied, true);
assert.equal(fanout.state.sessions.witness.logs.length, 1, "same-scope witness gets exactly one server-derived observation");
assert.equal(fanout.state.sessions.elsewhere.logs.length, 0, "other scopes never receive the action observation");
assert.equal(state.sessions.witness.logs.length, 0, "derivation cannot mutate the source snapshot");
const entry = fanout.state.sessions.witness.logs[0];
assert.equal(entry.sourceActionLogId, "act-1");
assert.equal(entry.observationAiPending, true);
assert.match(entry.text, /테스트 캐릭터 A/);

const repeated = derive({ state: fanout.state, effect: "ACTION_FANOUT", context: { sessionId: "source", actionLogId: "act-1" }, nowMs: 21 });
assert.equal(repeated.state.sessions.witness.logs.length, 1, "same command replay cannot duplicate a derived observation");
const finalized = derive({ state: repeated.state, effect: "FINALIZE_OBSERVATION", context: { sourceActionLogId: "act-1", observation: "손전등 빛이 문틈을 훑는다.", status: "final" }, nowMs: 22 });
assert.equal(finalized.state.sessions.witness.logs[0].text, "손전등 빛이 문틈을 훑는다.");
assert.equal(finalized.state.sessions.witness.logs[0].observationAiFinal, true);
assert.equal(finalized.state.sessions.source.logs[0].fieldObservationAiStatus, "final");

console.log("PASS: action observations are server-derived, scope-bound, immutable, and exact-once");
