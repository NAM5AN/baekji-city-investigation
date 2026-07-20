import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../sound-event-sync.js", import.meta.url), "utf8");
const inflectionSource = fs.readFileSync(new URL("../sound-event-inflection-fix.js", import.meta.url), "utf8");
const DAY1_DATA = {
  places: {
    A: { id: "A", floorId: "F1", floor: "1층", name: "중앙홀" },
    B: { id: "B", floorId: "F1", floor: "1층", name: "동쪽 통로" },
    C: { id: "C", floorId: "F2", floor: "2층", name: "계단참" },
    D: { id: "D", floorId: "F3", floor: "3층", name: "상부 통로" },
  },
  routes: [
    { fromNode: "A", targetNode: "B" },
    { fromNode: "B", targetNode: "C" },
    { fromNode: "C", targetNode: "D" },
  ],
};
const sandbox = { window: { DAY1_DATA }, globalThis: null, JSON, Object, String, Number, Map, Set, Date, Infinity, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "sound-event-sync.js" });
const api = sandbox.window.__BAEKJI_SOUND_EVENT_TEST__;
assert.ok(api, "소음 전파 테스트 API가 필요합니다.");

assert.equal(api.classifySound('/"괜찮아"라고 말했다').level, "LOCAL");
assert.deepEqual({ ...api.classifySound('/"누구 있어?"라고 큰 소리로 외치다') }, { level: "LOUD", kind: "SHOUT", quote: "누구 있어?" });
assert.equal(api.classifySound("의자를 집어던진다").kind, "IMPACT");
assert.equal(api.classifySound("폭탄을 터트린다").level, "EXTREME");
assert.equal(api.graphDistance("A", "C", 2), 2);
assert.equal(api.graphDistance("A", "D", 2), Infinity);

vm.runInContext(inflectionSource, sandbox, { filename: "sound-event-inflection-fix.js" });
const inflection = sandbox.window.__BAEKJI_SOUND_INFLECTION_TEST__;
assert.ok(inflection, "한국어 활용형 소음 테스트 API가 필요합니다.");
assert.deepEqual({ ...inflection.classify('/"누구 있어?"라고 크게 외친다') }, { level: "LOUD", kind: "SHOUT", quote: "누구 있어?" });
assert.deepEqual({ ...inflection.classify('/"도와줘"라고 소리친다') }, { level: "LOUD", kind: "SHOUT", quote: "도와줘" });

function makeState(actionText) {
  return {
    version: 3,
    sessions: {
      source: {
        id: "source", status: "ACTIVE", variant: "a", currentNode: "A", currentDetailId: "A_DETAIL", memberIds: ["test_a"],
        logs: [{ id: "act-1", type: "action-input", actorId: "test_a", at: 1000, text: actionText }],
      },
      sameScope: {
        id: "sameScope", status: "ACTIVE", variant: "a", currentNode: "A", currentDetailId: "A_DETAIL", memberIds: ["test_b"], logs: [],
      },
      sameFloor: {
        id: "sameFloor", status: "ACTIVE", variant: "a", currentNode: "B", currentDetailId: "B_DETAIL", memberIds: ["test_b"], logs: [],
      },
      distanceTwo: {
        id: "distanceTwo", status: "ACTIVE", variant: "a", currentNode: "C", currentDetailId: "C_DETAIL", memberIds: ["test_c"], logs: [],
      },
      distanceThree: {
        id: "distanceThree", status: "ACTIVE", variant: "a", currentNode: "D", currentDetailId: "D_DETAIL", memberIds: ["test_c"], logs: [],
      },
    },
  };
}

const previous = makeState("이전 행동");
previous.sessions.source.logs = [];
const ordinary = makeState('/"괜찮아"라고 말했다');
api.enrichSoundEvents(ordinary, previous);
assert.equal(ordinary.soundEvents.length, 0, "일반 말하기는 원거리 소음 이벤트를 만들지 않습니다.");
assert.equal(ordinary.sessions.sameFloor.logs.length, 0);

const shout = makeState('/"누구 있어?"라고 큰 소리로 외치다');
api.enrichSoundEvents(shout, previous);
assert.equal(shout.soundEvents.length, 1);
assert.equal(shout.soundEvents[0].mobReactionEligible, true);
assert.deepEqual([...shout.soundEvents[0].consumerTypes], ["PLAYER", "MOB_FUTURE"]);
assert.equal(shout.sessions.sameScope.logs.length, 0, "동일 세부 장소는 기존 시각 관찰문이 담당합니다.");
assert.equal(shout.sessions.sameFloor.logs.length, 1, "같은 층의 다른 장소까지 외침이 전달되어야 합니다.");
assert.match(shout.sessions.sameFloor.logs[0].text, /누구 있어/);
assert.equal(shout.sessions.distanceTwo.logs.length, 0, "일반적인 큰 소리는 두 경로 너머까지 전달하지 않습니다.");
assert.equal(shout.sessions.sameFloor.logs[0].observationMode, "AUDITORY_ONLY");

const conjugated = makeState('/"누구 있어?"라고 크게 외친다');
inflection.enrich(conjugated, previous);
assert.equal(conjugated.soundEvents.length, 1, "외친다 활용형도 소음 이벤트를 만듭니다.");
assert.match(conjugated.sessions.sameFloor.logs[0].text, /누구 있어/);

const impact = makeState("의자를 집어던진다");
api.enrichSoundEvents(impact, previous);
assert.match(impact.sessions.sameFloor.logs[0].text, /충돌음/);
assert.doesNotMatch(impact.sessions.sameFloor.logs[0].text, /보인다/);

const blast = makeState("폭탄을 터트린다");
api.enrichSoundEvents(blast, previous);
assert.equal(blast.sessions.distanceTwo.logs.length, 1, "대형 폭음은 인접 경로 두 칸까지 전달되어야 합니다.");
assert.equal(blast.sessions.distanceThree.logs.length, 0);
assert.match(blast.sessions.distanceTwo.logs[0].text, /폭음/);
assert.equal(blast.sessions.distanceTwo.logs[0].mobReactionEligible, true);

console.log("PASS: 일반 말하기는 현장 한정 · 큰 소리 전파 · 한국어 활용형 외침 · 모브 반응 확장점");
