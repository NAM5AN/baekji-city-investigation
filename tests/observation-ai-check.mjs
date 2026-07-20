import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  classifySpeechVisibility,
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

const loud = client.speechVisibility('/"거기 누구 있어?"라고 소리를 크게 질러 주변을 확인한다');
assert.equal(loud.mode, "PUBLIC_QUOTE");
assert.equal(loud.quote, "거기 누구 있어?");

const mutter = client.speechVisibility('/"문이 이상해"라고 혼잣말한다');
assert.equal(mutter.mode, "PRIVATE");
assert.equal(mutter.quote, "문이 이상해");

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
assert.equal(state.sessions.witness.logs[0].observationAiPending, true);
assert.equal(client.collectJobs(state, 1600).length, 0, "대기 중인 행동은 중복 요청하지 않습니다.");

const serverLoud = classifySpeechVisibility('/"살려줘"라고 소리를 지른다');
assert.equal(serverLoud.mode, "PUBLIC_QUOTE");
const loudPayload = sanitizeObservationPayload({
  actorName: "테스트 캐릭터 B",
  actionText: '/"살려줘"라고 소리를 지른다',
  fallback: "테스트 캐릭터 B가 외친다.",
});
assert.doesNotMatch(loudPayload.action, /살려줘/, "모델 관찰문 입력에는 직접 인용 내용을 넣지 않습니다.");
const loudResult = composeObservation("테스트 캐릭터 B가 몸을 앞으로 내밀며 큰 소리로 외친다.", loudPayload);
assert.match(loudResult, /"살려줘"라는 말이 또렷하게 들린다/);

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

console.log("PASS: AI 우선 타 조사조 관찰문 · 공개 발화와 비공개 혼잣말 · 감각 특성 확장 계획");
