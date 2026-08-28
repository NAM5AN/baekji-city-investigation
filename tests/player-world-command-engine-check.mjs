import assert from "node:assert/strict";
import { commandFingerprint, deterministicIdFactory, reducePlayerWorldCommand } from "../server/player-world-command-engine.mjs";

const commandId = "019ff986-b27a-7611-bc3b-fcdd9b429ac0";
assert.equal(commandFingerprint("CREATE_PARTY_V1", {}), commandFingerprint("CREATE_PARTY_V1", {}));
assert.notEqual(commandFingerprint("CREATE_PARTY_V1", {}), commandFingerprint("CONFIRM_BRIEFING_V1", {}));
assert.equal(deterministicIdFactory(commandId)("party"), `party_${commandId}`);

const state = {
  version: 3, sessionSeq: 0,
  characters: { a: { id: "a", currentPartyId: null, currentSessionId: null, inventory: {} } },
  parties: {}, sessions: {}, itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};
const result = reducePlayerWorldCommand({ state, actorId: "a", commandId, command: "CREATE_PARTY_V1", payload: {}, nowMs: 1234 });
assert.equal(result.status, "APPLIED");
assert.equal(result.state.characters.a.currentPartyId, `party_${commandId}`);
assert.equal(state.characters.a.currentPartyId, null, "engine must not mutate its source snapshot");
assert.match(result.fingerprint, /^[0-9a-f]{64}$/);

const aiState = { version: 3, characters: { a: { id: "a", currentSessionId: "s1", contamination: 0, inventory: {} }, b: { id: "b", currentSessionId: "s2", contamination: 0, inventory: {} } }, parties: {}, sessions: { s1: { id: "s1", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", memberIds: ["a"], logs: [] }, s2: { id: "s2", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", memberIds: ["b"], logs: [] } } };
const ai = reducePlayerWorldCommand({ state: aiState, actorId: "a", commandId, command: "CHARACTER_INTERACTION_V1", payload: { sessionId: "s1", targetId: "b", actionText: "손을 잡는다" }, serverDecision: { outcome: "EFFECTIVE", targetEffect: "CONTACT", narration: "A가 B의 손을 잡는다." }, nowMs: 1234, names: { a: "A", b: "B" } });
assert.equal(ai.status, "APPLIED");
assert.ok(ai.state.sessions.s2.logs.some((entry) => entry.kind === "CHARACTER_INTERACTION_RESULT"));

console.log("PASS: player world command engine routes the shared catalog through deterministic pure reducers");
