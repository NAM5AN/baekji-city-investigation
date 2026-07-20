import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../action-log-sync.js", import.meta.url), "utf8");
const sandbox = { window: {}, structuredClone, Date, JSON, Set, Map, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "action-log-sync.js" });
const api = sandbox.window.__BAEKJI_ACTION_LOG_SYNC_TEST__;
assert.ok(api, "action log sync test API must be exposed");

const previous = {
  version: 3,
  sessions: {
    session_a: {
      id: "session_a", status: "ACTIVE", variant: "a", currentNode: "E_SURFACE_PLAZA",
      currentDetailId: null, movement: null, activeEncounter: null, memberIds: ["test_a"], logs: [],
    },
    session_b: {
      id: "session_b", status: "ACTIVE", variant: "a", currentNode: "E_SURFACE_PLAZA",
      currentDetailId: null, movement: null, activeEncounter: null, memberIds: ["test_b"], logs: [],
    },
    session_c: {
      id: "session_c", status: "ACTIVE", variant: "a", currentNode: "E_EAST_EXIT",
      currentDetailId: null, movement: null, activeEncounter: null, memberIds: ["test_c"], logs: [],
    },
  },
};
const next = structuredClone(previous);
next.sessions.session_a.logs.push({
  id: "action_1", type: "action-input", actorId: "test_a", at: 100,
  text: "방송 잡음을 듣는다",
});
api.enrichObservedActions(next, previous);

assert.equal(next.sessions.session_a.logs.length, 1, "자기 조사조에는 외부 관찰문을 중복 기록하지 않습니다.");
assert.equal(next.sessions.session_b.logs.length, 1, "같은 현장의 다른 조사조에는 관찰문을 기록합니다.");
assert.equal(next.sessions.session_c.logs.length, 0, "다른 장소에는 관찰문을 보내지 않습니다.");
const observation = next.sessions.session_b.logs[0];
assert.equal(observation.type, "field-action");
assert.equal(observation.actorId, null, "타 조사조의 행동은 일반 SYSTEM 문장으로 기록합니다.");
assert.match(observation.text, /테스트 캐릭터 A/);
assert.match(observation.text, /귀를 기울이는 모습이 보인다/);
assert.doesNotMatch(observation.text, /방송 잡음을 듣는다/, "입력한 행동 지문 원문은 노출하지 않습니다.");
assert.equal(observation.observationTextVersion, 2);
assert.equal(next.sessions.session_a.logs[0].fieldObservationBroadcasted, true);

const shouted = api.observationalActionText("test_b", "소리를 지른다");
assert.match(shouted, /큰 소리로 외치는 모습이 보인다/);
assert.doesNotMatch(shouted, /귀를 기울/);
const running = api.observationalActionText("test_b", "급히 통로를 달려간다");
assert.match(running, /빠른 걸음으로 현장을 가로지르는 모습이 보인다/);
const opening = api.observationalActionText("test_b", "문손잡이를 잡고 문을 연다");
assert.match(opening, /문을 조심스럽게 움직이는 모습이 보인다/);

const repairState = structuredClone(next);
repairState.sessions.session_b.logs[0].text = "가까운 곳에서 테스트 캐릭터 A가 주변 소리에 귀를 기울이는 모습이 보인다.";
repairState.sessions.session_a.logs[0].text = "소리를 지른다";
api.repairObservedActionTexts(repairState);
assert.match(repairState.sessions.session_b.logs[0].text, /큰 소리로 외치는 모습이 보인다/);
assert.doesNotMatch(repairState.sessions.session_b.logs[0].text, /귀를 기울/);

const repeated = structuredClone(next);
api.enrichObservedActions(repeated, next);
assert.equal(repeated.sessions.session_b.logs.length, 1, "같은 행동 관찰문을 중복 생성하지 않습니다.");

const pendingState = structuredClone(next);
pendingState.sessions.session_a.logs.push({
  id: "result_1", type: "scene", actorId: null, text: "로컬 결과",
  actionNarrationPending: true, actionNarrationPendingAt: 200,
});
assert.ok(api.visibleSystemEntries(pendingState.sessions.session_a).some((entry) => entry.id === "result_1"));
pendingState.sessions.session_a.logs.at(-1).aiNarrationFinal = true;
api.stripCompletedNarrationMarkers(pendingState);
assert.equal(pendingState.sessions.session_a.logs.at(-1).actionNarrationPending, undefined);

assert.match(source, /\/api\/narrate-action/);
assert.match(source, /markNarrationPending\(job\)/);
assert.match(source, /retro-action-result-pending/);
assert.match(source, /NARRATION_ABORT_MS = 15_000/);
assert.match(source, /Storage\.prototype\.setItem = function patchedSetItem/);
assert.match(source, /repairObservedActionTexts\(parsedNext\)/);

console.log("PASS: AI 결과 단일 노출 · 행동 의미 일치형 타 조사조 관찰문 동기화");
