import assert from "node:assert/strict";
import fs from "node:fs";
import { reducePlayerWorldInvestigationCommand as reduce } from "../lib/player-world-investigation-reducer.mjs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
let sequence = 0;
const idFactory = (prefix) => `${prefix}-${++sequence}`;
const state = {
  version: 3,
  characters: { a: { id: "a", contamination: 0, inventory: {} }, b: { id: "b", contamination: 0, inventory: {} } },
  parties: { p1: { id: "p1", creatorId: "a" }, p2: { id: "p2", creatorId: "b" } },
  sessions: {
    s1: { id: "s1", partyId: "p1", memberIds: ["a"], status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", currentDetailId: null, movement: null, activeEncounter: null, logs: [] },
    s2: { id: "s2", partyId: "p2", memberIds: ["b"], status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", currentDetailId: null, movement: null, activeEncounter: null, logs: [] },
  },
};

const moved = reduce({ state, actorId: "a", command: "BEGIN_MOVEMENT_V1", payload: { sessionId: "s1", routeId: "E_R001" }, nowMs: 10_000, idFactory });
assert.equal(moved.status, "APPLIED");
const token = moved.state.sessions.s1.movement.token;
const departureId = `movement:${token}:s2:departure-presence`;
assert.equal(moved.state.sessions.s2.logs.filter((entry) => entry.id === departureId).length, 1, "the authoritative movement command must emit one deterministic departure-presence entry");

const duplicate = reduce({ state: moved.state, actorId: "a", command: "BEGIN_MOVEMENT_V1", payload: { sessionId: "s1", routeId: "E_R001" }, nowMs: 10_001, idFactory });
assert.notEqual(duplicate.status, "APPLIED");
assert.equal(duplicate.state.sessions.s2.logs.filter((entry) => entry.id === departureId).length, 1, "a repeated movement intent cannot duplicate departure presence");
assert.doesNotMatch(index, /entry-presence-fix\.js/, "the legacy polling writer must stay out of the Stage 8B boot path");

console.log("PASS: authoritative movement keeps departure presence exact-once without the legacy entry writer");
