import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const start = app.indexOf("  function renderBriefing(sessionId)");
const end = app.indexOf("  function appendLog(", start);
assert.ok(start >= 0 && end > start, "renderBriefing source must be discoverable");
const renderBriefing = app.slice(start, end);

assert.ok(app.includes('a: "초록빛"') && app.includes('b: "파란빛"') && app.includes('c: "붉은빛"') && app.includes('d: "흰빛"'), "all variants need neutral briefing light names");
assert.ok(app.includes("해오름역은 지상 환승광장과 지하 대합실, 승강장으로 이어진다."), "briefing needs the neutral zone description");
assert.ok(renderBriefing.includes("briefingHeadline(session)"), "briefing title must be rendered from the safe headline directly");
assert.ok(renderBriefing.includes("구역 진입 후 장면, 시스템 로그, 조사 채팅을 함께 확인하세요."), "briefing guidance must render directly");
assert.ok(renderBriefing.includes("BRIEFING_TUTORIAL_RULES.map"), "all tutorial rules must render directly");
assert.ok(!renderBriefing.includes("${escapeHtml(v.situation)} ${escapeHtml(v.space)}"), "briefing must not render internal variant situation copy before replacing it");
assert.ok(!renderBriefing.includes("${escapeHtml(v.light)}이 역 내부에서 희미하게 번진다."), "briefing must not render the old title before replacing it");
assert.ok(!fs.existsSync("briefing-tutorial.js"), "the absorbed briefing DOM post-processor must be removed");
assert.ok(!index.includes("briefing-tutorial.js"), "the removed briefing DOM post-processor must not be loaded");
assert.ok(index.includes("stage2-briefing-ui=1"), "the direct briefing renderer must be cache-busted");

console.log("PASS: briefing title, guidance, and rules render directly without a MutationObserver post-processor");
