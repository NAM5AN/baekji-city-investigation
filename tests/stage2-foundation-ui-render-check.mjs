import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const foundation = fs.readFileSync("foundation-rule-fixes.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const correctHomeCopy = "조사조를 생성한 캐릭터가 조장을 맡으며, 조장은 조원 관리와 세션 시작을 담당합니다.";
const correctPartyCopy = "조사조는 매일 자율적으로 새로 편성합니다. 조사조를 생성한 캐릭터가 이번 조사조의 조장을 맡으며, 조원 관리와 세션 시작을 담당합니다.";
const correctHazardCopy = "한 메시지에는 한 가지 행동만 입력합니다. 한 행동이 여러 위험에 영향을 줄 수 있는지는 현재 상황과 행동 내용에 따라 시스템이 판정합니다.";

assert.ok(app.includes(correctHomeCopy), "home render must emit the leader explanation directly");
assert.ok(app.includes(correctPartyCopy), "party render must emit the leader explanation directly");
assert.match(app, /memberId === party\.creatorId \? "조장" : "참가 조원"/, "member rows must render the creator as 조장 directly");
assert.ok(app.includes(correctHazardCopy), "briefing render must emit the flexible multi-hazard rule directly");
assert.ok(!app.includes("고정 조장이나 직책은 없습니다."), "obsolete home copy must not be rendered");
assert.ok(!app.includes("편성 개설자"), "obsolete creator label must not be rendered");
assert.ok(!app.includes("복수 위험은 서로 다른 행동으로 순서대로 해결합니다."), "obsolete sequential-hazard copy must not be rendered");
assert.ok(!app.includes("data-reset-demo"), "player result render must not create a demo reset control");
assert.ok(!app.includes("function resetDemo"), "the hidden player reset handler must not remain as dead runtime code");

assert.ok(foundation.includes("applyMovementImpairment"), "movement impairment rules must remain installed");
assert.ok(foundation.includes("Storage.prototype"), "movement storage guard must remain installed");
assert.ok(!foundation.includes("MutationObserver"), "foundation rules must not observe the DOM for pure copy fixes");
assert.ok(!foundation.includes("querySelectorAll"), "foundation rules must not search rendered UI for copy fixes");
assert.ok(index.includes("foundation-rule-fixes.js?v=0.4.3"), "updated foundation rules must be cache-busted");
assert.ok(index.includes("stage2-foundation-ui=1"), "the direct app render change must be cache-busted");

console.log("PASS: stage 2 foundation UI copy and controls render correctly without DOM post-processing");
