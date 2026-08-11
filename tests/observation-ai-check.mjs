import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  classifySpeechVisibility,
  classifyVisualVisibility,
  composeObservation,
  sanitizeObservationPayload,
} from "../api/narrate-observation.mjs";

const clientSource = fs.readFileSync(new URL("../observation-ai-sync.js", import.meta.url), "utf8");
const clientSandbox = { window: {}, globalThis: {}, Date, JSON, Map, Set, Object, String, Number, console };
clientSandbox.globalThis.window = clientSandbox.window;
vm.createContext(clientSandbox);
vm.runInContext(clientSource, clientSandbox, { filename: "observation-ai-sync.js" });
const client = clientSandbox.window.__BAEKJI_OBSERVATION_AI_TEST__;
assert.ok(client, "관찰 AI 클라이언트 테스트 API가 필요합니다.");

const loud = client.speechVisibility('/"거기 누구 있어?"라고 소리를 질러 주변을 확인한다');
assert.equal(loud.mode, "PUBLIC_QUOTE");
assert.equal(loud.volume, "LOUD");
assert.equal(loud.quote, "거기 누구 있어?");

const ordinary = client.speechVisibility('/"거기서 기다려"라고 말한다');
assert.equal(ordinary.mode, "PUBLIC_QUOTE", "같은 장소의 평범하고 또렷한 발화도 원문을 들을 수 있어야 합니다.");
assert.equal(ordinary.volume, "NORMAL");
assert.equal(ordinary.quote, "거기서 기다려");

const mutter = client.speechVisibility('/"문이 이상해"라고 혼잣말한다');
assert.equal(mutter.mode, "PRIVATE");
assert.equal(mutter.quote, "문이 이상해");

const thought = client.speechVisibility('/"여기서 나가야겠다"라고 속으로 생각한다');
assert.equal(thought.mode, "INTERNAL");

assert.deepEqual({ ...client.visualVisibility("주머니 속에서 가운데손가락을 세운다") }, { mode: "OCCLUDED", kind: "POCKET" });
assert.deepEqual({ ...client.visualVisibility("책상 아래에서 손가락으로 욕을 한다") }, { mode: "OCCLUDED", kind: "UNDER_TABLE" });
const pocketFallback = client.observerSafeFallback("test_b", "주머니 속에서 가운데손가락을 세운다", "위험한 원문");
assert.match(pocketFallback, /주머니에.*손/);
assert.doesNotMatch(pocketFallback, /가운데손가락|욕|뻐큐|위험한 원문/, "가려진 행동의 의미를 관찰자에게 누설하면 안 됩니다.");

const state = {
  version: 3,
  sessions: {
    source: {
      id: "source",
      logs: [{ id: "action-1", type: "action-input", actorId: "test_b", at: 1000, text: '/"도와줘"라고 크게 외친다' }],
    },
    witness: {
      id: "witness",
      logs: [{ id: "field-action-1", type: "field-action", sourceActionLogId: "action-1", text: "규칙 폴백" }],
    },
  },
};
const jobs = client.collectJobs(state, 1500);
assert.equal(jobs.length, 1, "같은 행동은 AI 요청 한 건으로 묶어야 합니다.");
assert.equal(jobs[0].quotedSpeech, "도와줘");
assert.equal(jobs[0].eventId, state.sessions.source.logs[0].eventId, "원 행동과 관찰문은 같은 eventId를 공유해야 합니다.");
assert.equal(state.sessions.witness.logs[0].eventId, state.sessions.source.logs[0].eventId);
assert.equal(state.sessions.witness.logs[0].observationAiPending, true);
assert.equal(client.collectJobs(state, 1600).length, 0, "대기 중인 행동은 중복 요청하지 않습니다.");

const eventState = {
  version: 3,
  sessions: {
    s1: {
      id: "s1",
      logs: [
        { id: "a1", type: "action-input", actorId: "test_a", at: 100, text: "문을 민다" },
        { id: "a2", type: "action-input", actorId: "test_b", at: 110, text: "뒤를 본다" },
        { id: "r2", type: "success", at: 130, text: "테스트B의 결과", sourceActionLogId: "a2" },
        { id: "r1", type: "success", at: 140, text: "테스트A의 결과", sourceActionLogId: "a1" },
      ],
    },
  },
};
client.ensureEventIds(eventState);
const grouped = client.groupEventEntries(eventState.sessions.s1.logs);
assert.equal(grouped.length, 2, "동시에 여러 행동이 들어와도 사건 단위 두 묶음으로 유지되어야 합니다.");
assert.equal(Array.from(grouped[0].items, (item) => item.entry.id).join(","), "a1,r1", "늦게 도착한 A 결과도 A 선언 사건으로 돌아가야 합니다.");
assert.equal(Array.from(grouped[1].items, (item) => item.entry.id).join(","), "a2,r2", "B 결과는 B 선언 사건 안에 묶여야 합니다.");

const serverLoud = classifySpeechVisibility('/"살려줘"라고 소리를 크게 질러 주변을 확인한다');
assert.equal(serverLoud.mode, "PUBLIC_QUOTE");
const serverOrdinary = classifySpeechVisibility('/"괜찮아"라고 말한다');
assert.equal(serverOrdinary.mode, "PUBLIC_QUOTE");
assert.equal(serverOrdinary.volume, "NORMAL");
const loudPayload = sanitizeObservationPayload({
  actorName: "테스트 캐릭터 B",
  actionText: '/"살려줘"라고 소리를 크게 질러 주변을 확인한다',
  fallback: "테스트 캐릭터 B가 외친다.",
});
assert.doesNotMatch(loudPayload.action, /살려줘/, "모델 관찰문 입력에는 직접 인용 내용을 넣지 않습니다.");
const loudResult = composeObservation("테스트 캐릭터 B가 몸을 앞으로 내밀며 큰 소리로 외친다.", loudPayload);
assert.match(loudResult, /"살려줘"라는 말이 들린다/);

const ordinaryPayload = sanitizeObservationPayload({
  actorName: "테스트 캐릭터 B",
  actionText: '/"괜찮아"라고 말한다',
  fallback: "테스트 캐릭터 B가 말을 한다.",
});
const ordinaryResult = composeObservation("테스트 캐릭터 B가 또렷한 목소리로 말을 건넨다.", ordinaryPayload);
assert.match(ordinaryResult, /"괜찮아"라는 말이 들린다/, "일반 발화도 같은 현장에서는 원문을 보존해야 합니다.");

const privatePayload = sanitizeObservationPayload({
  actorName: "테스트 캐릭터 B",
  actionText: '/"문이 이상해"라고 혼잣말한다',
  fallback: "테스트 캐릭터 B가 혼자 중얼거린다.",
});
assert.equal(privatePayload.speechMode, "PRIVATE");
assert.doesNotMatch(privatePayload.action, /문이 이상해/);
const privateResult = composeObservation("테스트 캐릭터 B가 고개를 숙인 채 작게 중얼거린다.", privatePayload);
assert.doesNotMatch(privateResult, /문이 이상해/);
assert.match(privateResult, /중얼/);

const hiddenPayload = sanitizeObservationPayload({
  actorName: "테스트 캐릭터 B",
  actionText: "주머니 속에서 테스트C를 향해 뻐큐한다",
  fallback: "테스트 캐릭터 B가 테스트C에게 가운데손가락을 세운다.",
});
assert.equal(classifyVisualVisibility(hiddenPayload.action).mode, "OCCLUDED");
assert.equal(hiddenPayload.visualMode, "OCCLUDED");
assert.match(hiddenPayload.action, /주머니.*손/);
assert.doesNotMatch(hiddenPayload.action, /테스트C|뻐큐|가운데손가락/, "서버 모델 입력에서도 가려진 세부 의미를 제거해야 합니다.");
assert.doesNotMatch(hiddenPayload.fallback, /테스트C|뻐큐|가운데손가락/);

const html = fs.readFileSync("index.html", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.ok(html.indexOf("storage-sync-bridge.js") < html.indexOf("observation-ai-sync.js"));
assert.ok(html.indexOf("observation-ai-sync.js") < html.indexOf("action-log-sync.js"));
assert.ok(html.indexOf("action-log-sync.js") < html.indexOf("observation-final-guard.js"));
assert.ok(vercel.rewrites.some((rule) => rule.source === "/api/narrate-observation" && rule.destination === "/api/narrate-observation.mjs"));
assert.match(packageJson.scripts.check, /observation-ai-check\.mjs/);
assert.match(fs.readFileSync("observation-final-guard.js", "utf8"), /restoreFinalTexts/);
assert.match(fs.readFileSync("docs/perception-traits-plan.md", "utf8"), /perception\.vision/);
assert.match(clientSource, /retro-system-event-results/);
assert.match(clientSource, /world_event_/);

console.log("PASS: 관찰자 시점 비공개 행동 · 일반/큰 발화 · 사건별 선언/AI 결과 묶음 · 감각 특성 확장점");
