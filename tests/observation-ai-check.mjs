import assert from "node:assert/strict";
import fs from "node:fs";
import { classifySpeechVisibility, classifyVisualVisibility, composeObservation, sanitizeObservationPayload } from "../api/narrate-observation.mjs";
import { derivePlayerWorldEffects as derive } from "../lib/player-world-derived-effects.mjs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const vercel = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
assert.doesNotMatch(index, /(?:observation-ai-sync|action-log-sync|observation-final-guard)\.js/, "observation decisions and finalization are not browser storage jobs");
assert.ok(vercel.rewrites.some((rule) => rule.source === "/api/narrate-observation" && rule.destination === "/api/narrate-observation.mjs"), "AI narration remains a server-only endpoint");

assert.deepEqual(classifySpeechVisibility('/"살려줘"라고 소리를 크게 지른다'), { mode: "PUBLIC_QUOTE", quote: "살려줘", volume: "LOUD" });
assert.equal(classifySpeechVisibility('/"문이 이상해"라고 혼잣말한다').mode, "PRIVATE");
assert.equal(classifySpeechVisibility('/"나가야겠다"라고 속으로 생각한다').mode, "INTERNAL");
assert.deepEqual(classifyVisualVisibility("주머니 속에서 손가락을 움직인다"), { mode: "OCCLUDED", kind: "POCKET" });

const hidden = sanitizeObservationPayload({ actorName: "테스트 캐릭터 B", actionText: "주머니 속에서 테스트C를 향해 뻐큐한다", fallback: "테스트 캐릭터 B가 테스트C에게 가운데손가락을 세운다." });
assert.equal(hidden.visualMode, "OCCLUDED");
assert.doesNotMatch(`${hidden.action} ${hidden.fallback}`, /테스트C|뻐큐|가운데손가락/, "server prompt and fallback redact hidden gesture meaning");
const loud = sanitizeObservationPayload({ actorName: "테스트 캐릭터 B", actionText: '/"살려줘"라고 크게 외친다', fallback: "테스트 캐릭터 B가 외친다." });
assert.doesNotMatch(loud.action, /살려줘/, "model input does not receive directly quoted speech");
assert.match(composeObservation("테스트 캐릭터 B가 몸을 앞으로 내민다", loud), /"살려줘"라는 말이 들린다/, "only public speech is reattached by the server");

const state = { version: 3, characters: { test_a: { name: "A" } }, sessions: {
  source: { id: "source", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", logs: [{ id: "act", type: "action-input", actorId: "test_a", text: "문을 살핀다", at: 1 }] },
  witness: { id: "witness", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", logs: [] },
} };
const fanned = derive({ state, effect: "ACTION_FANOUT", context: { sessionId: "source", actionLogId: "act" }, nowMs: 2 }).state;
const final = derive({ state: fanned, effect: "FINALIZE_OBSERVATION", context: { sourceActionLogId: "act", observation: "A가 문틈을 비춘다.", status: "final" }, nowMs: 3 }).state;
const replay = derive({ state: final, effect: "FINALIZE_OBSERVATION", context: { sourceActionLogId: "act", observation: "A가 문틈을 비춘다.", status: "final" }, nowMs: 4 }).state;
assert.equal(replay.sessions.witness.logs.length, 1, "observation finalization cannot append duplicate entries on replay");
assert.equal(replay.sessions.witness.logs[0].observationAiFinal, true);
assert.equal(replay.sessions.source.logs[0].fieldObservationAiStatus, "final");

console.log("PASS: observation privacy and exact-once finalization are server-derived");
