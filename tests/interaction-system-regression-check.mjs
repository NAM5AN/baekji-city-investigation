import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const UUID_B = "11111111-1111-4111-8111-111111111111";
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const domainRules = fs.readFileSync("runtime-domain-rules.js", "utf8");
const worldPersistence = fs.readFileSync("world-persistence.js", "utf8");
const registry = { values: () => [{ id: UUID_B, name: "테스트B", loginId: "테스트B" }] };

{
  const window = { __BAEKJI_TESTER_REGISTRY_GUARD__: registry };
  const context = vm.createContext({ window, structuredClone, Date, JSON, Set, Map, console, String, Number, Object, Array });
  vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
  vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
  vm.runInContext(fs.readFileSync("action-log-sync.js", "utf8"), context, { filename: "action-log-sync.js" });
  const api = window.__BAEKJI_ACTION_LOG_SYNC_TEST__;
  assert.equal(api.actorNameForId(UUID_B), "테스트B");
  assert.match(api.observationalActionText(UUID_B, "고개를 저으며 말한다"), /테스트B/);
  assert.doesNotMatch(api.observationalActionText(UUID_B, "고개를 저으며 말한다"), /다른 조사자/);
}

{
  const window = { __BAEKJI_TESTER_REGISTRY_GUARD__: registry };
  const context = vm.createContext({ window, Date, JSON, Set, Map, console, String, Number, Object, Array });
  vm.runInContext(fs.readFileSync("observation-ai-sync.js", "utf8"), context, { filename: "observation-ai-sync.js" });
  const api = window.__BAEKJI_OBSERVATION_AI_TEST__;
  const state = {
    version: 3,
    sessions: {
      source: { id: "source", logs: [{ id: "a1", type: "action-input", actorId: UUID_B, text: "테스트C를 비웃는다", at: 1 }] },
      witness: { id: "witness", logs: [{ id: "f1", type: "field-action", sourceActionLogId: "a1", observedActorId: UUID_B, text: "가까운 곳에서 다른 조사자가 무언가를 한다." }] },
    },
  };
  const jobs = api.collectJobs(state, 10);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].actorName, "테스트B", "AI 관찰 요청 단계부터 실제 캐릭터 이름을 사용합니다.");
}

{
  class FakeStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
  }
  const localStorage = new FakeStorage();
  const window = {
    __BAEKJI_TESTER_REGISTRY_GUARD__: registry,
    addEventListener() {}, dispatchEvent() {},
  };
  const context = vm.createContext({
    window, Storage: FakeStorage, localStorage, JSON, String, Number, Object, Array, Map, Set, console,
    Event: class Event { constructor(type) { this.type = type; } },
    queueMicrotask: (fn) => fn(), location: { href: "https://example.test/" },
  });
  vm.runInContext(fs.readFileSync("final-observation-write-canonicalizer.js", "utf8"), context, { filename: "final-observation-write-canonicalizer.js" });
  vm.runInContext(fs.readFileSync("character-interaction-result-visibility-fix.js", "utf8"), context, { filename: "character-interaction-result-visibility-fix.js" });
  const world = {
    version: 3,
    sessions: {
      source: { id: "source", logs: [{ id: "a1", type: "action-input", actorId: UUID_B, text: "고개를 저으며 말한다", fieldObservationAiStatus: "final", fieldObservationAiText: "다른 조사자가 고개를 저으며 짧게 말한다." }] },
      witness: { id: "witness", logs: [{ id: "f1", type: "field-action", sourceActionLogId: "a1", observedActorId: UUID_B, text: "다른 조사자가 고개를 저으며 짧게 말한다.", observationAiPending: false, observationAiFinal: true, observationSource: "ai", observationTextVersion: 3 }] },
    },
  };
  localStorage.setItem("baekji_city_mvp_state_v3", JSON.stringify(world));
  const stored = JSON.parse(localStorage.getItem("baekji_city_mvp_state_v3"));
  assert.match(stored.sessions.source.logs[0].fieldObservationAiText, /테스트B/);
  assert.match(stored.sessions.witness.logs[0].text, /테스트B/);
  assert.doesNotMatch(stored.sessions.source.logs[0].fieldObservationAiText, /다른 조사자/);
  assert.doesNotMatch(stored.sessions.witness.logs[0].text, /다른 조사자/);
}

{
  const window = { DAY1_DATA: {}, __BAEKJI_TESTER_REGISTRY_GUARD__: registry };
  const localStorage = { getItem() { return null; }, setItem() {} };
  const context = vm.createContext({ window, localStorage, queueMicrotask(callback) { callback(); }, Date, JSON, Set, Map, console, String, Number, Object, Array, Math });
  vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
  vm.runInContext(worldPersistence, context, { filename: "world-persistence.js" });
  vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
  vm.runInContext(fs.readFileSync("character-interaction-ai.js", "utf8"), context, { filename: "character-interaction-ai.js" });
  const api = window.__BAEKJI_CHARACTER_INTERACTION_TEST__;
  const mock = api.fallbackDecision("테스트C를 비웃는다", "테스트B", "테스트C", "seed");
  assert.match(mock.narration, /테스트B.*테스트C.*비웃/);
  assert.match(mock.narration, /분명한 조롱/);
  assert.doesNotMatch(mock.narration, /알아차리|표정|바라본|반응/);
  const sanitized = api.stripTargetAgencyNarration("테스트B는 테스트C를 향해 노골적으로 비웃는다. 분명한 조롱이다. 테스트C는 자신을 겨냥한 조롱을 알아차리고 표정을 굳힌 채 테스트B를 바라본다.", "테스트C");
  assert.equal(sanitized, "테스트B는 테스트C를 향해 노골적으로 비웃는다. 분명한 조롱이다.");
  const physical = api.stripTargetAgencyNarration("테스트B가 테스트C를 밀어낸다. 테스트C는 힘이 닿은 만큼 뒤로 밀린다.", "테스트C");
  assert.match(physical, /뒤로 밀린다/);
}

{
  const app = fs.readFileSync("app.js", "utf8");
  const match = app.match(/function isMultiAction\(text\) \{[\s\S]*?\n  \}/);
  assert(match, "isMultiAction must exist");
  const isMultiAction = vm.runInNewContext(`(${match[0]})`);
  assert.equal(isMultiAction("테스트C를 보고, 비웃는다."), false, "쉼표 하나만으로 다중 행동을 차단하지 않습니다.");
  assert.equal(isMultiAction("응."), false, "마침표는 전송 차단 사유가 아닙니다.");
  assert.equal(isMultiAction("문을 연 후에 안으로 들어간다"), true);
  assert.equal(isMultiAction("문을 열고 동시에 뛰어든다"), true);
}

{
  const server = fs.readFileSync("api/index.mjs", "utf8");
  assert.match(server, /자발적인 반응은 절대 생성하지 않는다/);
  assert.match(server, /stripTargetAgencyNarration/);
  assert.doesNotMatch(server, /이어서 상대의 반응/);
}

console.log("PASS: same-field names stay canonical, target agency is protected, and punctuation no longer blocks one-action sends");
