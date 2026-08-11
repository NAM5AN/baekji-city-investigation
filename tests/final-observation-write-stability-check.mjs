import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const KEY = "baekji_city_mvp_state_v3";
const source = fs.readFileSync("final-observation-write-canonicalizer.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.nativeWrites = 0;
  }
  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }
  setItem(key, value) {
    this.nativeWrites += 1;
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    this.values.delete(String(key));
  }
}

function makeState({ generic = false, eventSeq = 0, fallback = false } = {}) {
  const actionId = "action_1";
  const finalText = fallback
    ? "가까운 곳에서 다른 조사자가 주변을 살피는 모습이 보인다."
    : "다른 조사자가 캐릭터A를 향해 손을 뻗어 몸을 밀친다.";
  return {
    version: 3,
    eventSeq,
    characters: {},
    parties: {},
    sessions: {
      source: {
        id: "source",
        logs: [{
          id: actionId,
          type: "action-input",
          actorId: "actor_b",
          text: "캐릭터A를 밀친다",
          fieldObservationAiStatus: "final",
          fieldObservationAiText: finalText,
          ...(fallback ? { fieldObservationResultSource: "fallback" } : {}),
        }],
      },
      witness: {
        id: "witness",
        logs: [{
          id: "field_1",
          type: "field-action",
          sourceActionLogId: actionId,
          observedActorId: "actor_b",
          text: generic ? "가까운 곳에서 다른 조사자가 두 손에 힘을 주어 눈앞의 물체를 밀거나 당기는 모습이 보인다." : finalText,
          observationAiPending: false,
          observationAiFinal: fallback ? false : true,
          observationSource: fallback ? "fallback" : "ai",
          observationTextVersion: generic ? 2 : (fallback ? 2 : 3),
        }],
      },
    },
  };
}

const localStorage = new FakeStorage();
const finalState = makeState();
localStorage.values.set(KEY, JSON.stringify(finalState));

const window = {};
const context = vm.createContext({
  console,
  window,
  Storage: FakeStorage,
  localStorage,
  JSON,
  String,
  Number,
  Object,
});
vm.runInContext(source, context, { filename: "final-observation-write-canonicalizer.js" });

const api = window.__BAEKJI_FINAL_OBSERVATION_WRITE_TEST__;
assert.ok(api, "canonicalizer test API must be exposed");

const genericState = makeState({ generic: true });
const changed = api.canonicalizeFinalObservationTexts(genericState);
assert.equal(changed, true);
const repaired = genericState.sessions.witness.logs[0];
assert.equal(repaired.text, finalState.sessions.witness.logs[0].text);
assert.equal(repaired.observationTextVersion, 3);
assert.equal(repaired.observationSource, "ai");
assert.equal(repaired.observationAiFinal, true);
assert.equal(repaired.observationAiPending, false);

localStorage.nativeWrites = 0;
localStorage.setItem(KEY, JSON.stringify(makeState({ generic: true })));
assert.equal(localStorage.nativeWrites, 0, "generic v2 regression must become a no-op write");
assert.equal(localStorage.getItem(KEY), JSON.stringify(finalState));

localStorage.setItem(KEY, JSON.stringify(makeState({ generic: true, eventSeq: 1 })));
assert.equal(localStorage.nativeWrites, 1, "legitimate world changes must still be stored");
const stored = JSON.parse(localStorage.getItem(KEY));
assert.equal(stored.eventSeq, 1);
assert.equal(stored.sessions.witness.logs[0].text, finalState.sessions.witness.logs[0].text);
assert.equal(stored.sessions.witness.logs[0].observationTextVersion, 3);

const fallback = makeState({ generic: true, fallback: true });
api.canonicalizeFinalObservationTexts(fallback);
assert.equal(fallback.sessions.witness.logs[0].observationSource, "fallback");
assert.equal(fallback.sessions.witness.logs[0].observationAiFinal, false);
assert.equal(fallback.sessions.witness.logs[0].observationTextVersion, 2);

const canonicalIndex = index.indexOf("final-observation-write-canonicalizer.js?v=0.4.2");
const actionLogIndex = index.indexOf("action-log-sync.js?v=0.3.33");
assert.ok(canonicalIndex >= 0, "canonicalizer must be loaded");
assert.ok(canonicalIndex < actionLogIndex, "canonicalizer must sit below action-log-sync in the Storage wrapper chain");

console.log("PASS: finalized field observations cannot oscillate from AI v3 back to generic v2 across storage writes");
