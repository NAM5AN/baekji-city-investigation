import assert from "node:assert/strict";
import fs from "node:fs";
import { reducePlayerWorldCommand as reduce } from "../server/player-world-command-engine.mjs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const active = (id, partyId, variant = "a") => ({
  id,
  partyId,
  memberIds: [id],
  status: "ACTIVE",
  variant,
  currentNode: "E_ENTRY",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [],
});
const state = {
  version: 3,
  characters: { a: { id: "a", name: "테스트 A" }, b: { id: "b", name: "테스트 B" }, c: { id: "c", name: "테스트 C" } },
  parties: {
    p1: { id: "p1", name: "해오름역 조사조 1", creatorId: "a", memberIds: ["a"], confirmedBy: ["a"] },
    p2: { id: "p2", name: "해오름역 조사조 2", creatorId: "b", memberIds: ["b"], confirmedBy: ["b"] },
    p3: { id: "p3", name: "해오름역 조사조 3", creatorId: "c", memberIds: ["c"], confirmedBy: ["c"] },
  },
  sessions: {
    s1: { ...active("s1", "p1"), status: "BRIEFING", memberIds: ["a"] },
    s2: active("s2", "p2"),
    s3: active("s3", "p3", "b"),
  },
};

assert.equal(Object.values(state.sessions).flatMap((session) => session.logs).length, 0, "booting an unchanged snapshot must remain side-effect free");
const activated = reduce({ state, actorId: "a", commandId: "10000000-0000-4000-8000-000000000001", command: "ACTIVATE_SESSION_V1", payload: { sessionId: "s1" }, nowMs: 10_000 });
assert.equal(activated.status, "APPLIED");
const entryLogs = Object.values(activated.state.sessions).flatMap((session) => session.logs.filter((entry) => String(entry.id).startsWith("entry:")));
assert.equal(entryLogs.length, 2, "activation must add one deterministic meeting entry to each same-variant entry session");
assert.match(activated.state.sessions.s1.logs.find((entry) => entry.entryPresence)?.text || "", /테스트 B와 해오름역 구역 입구/, "the activating session must see the canonical witness party label");
assert.equal(activated.state.sessions.s3.logs.length, 0, "a different variant at the same node must remain invisible");

const repeated = reduce({ state: activated.state, actorId: "a", commandId: "10000000-0000-4000-8000-000000000002", command: "ACTIVATE_SESSION_V1", payload: { sessionId: "s1" }, nowMs: 10_001 });
assert.notEqual(repeated.status, "APPLIED");
assert.equal(Object.values(repeated.state.sessions).flatMap((session) => session.logs.filter((entry) => String(entry.id).startsWith("entry:"))).length, 2, "a repeated activation cannot duplicate entry presence");
assert.doesNotMatch(index, /entry-presence-fix\.js/, "entry presence must be command-derived, never boot-time polling");

console.log("PASS: entry activation derives exact-once same-variant presence without a boot writer");
