import assert from "node:assert/strict";
import { reducePlayerWorldAiCommand as reduce } from "../lib/player-world-ai-reducer.mjs";
let n = 0; const ids = (prefix) => `${prefix}_${++n}`;
const state = { version: 3, characters: { a: { id: "a", currentSessionId: "s1", contamination: 0, inventory: {} }, b: { id: "b", currentSessionId: "s2", contamination: 0, inventory: {} } }, parties: {}, sessions: { s1: { id: "s1", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", memberIds: ["a"], logs: [] }, s2: { id: "s2", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", memberIds: ["b"], logs: [] } } };
const result = reduce({ state, actorId: "a", command: "CHARACTER_INTERACTION_V1", payload: { sessionId: "s1", targetId: "b", actionText: "손을 잡는다" }, decision: { outcome: "EFFECTIVE", targetEffect: "CONTACT", narration: "A가 B의 손을 잡는다." }, nowMs: 1, idFactory: ids, names: { a: "A", b: "B" } });
assert.equal(result.status, "APPLIED");
assert.equal(result.state.sessions.s2.logs.at(-1).kind, "CHARACTER_INTERACTION_RESULT");
assert.equal(state.sessions.s2.logs.length, 0);
console.log("PASS: AI command reducer applies server decisions only after canonical actor and field validation");
