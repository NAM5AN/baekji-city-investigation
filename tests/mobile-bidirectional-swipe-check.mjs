import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-bidirectional-swipe.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-bidirectional-swipe.js" });

const api = sandbox.window.__BAEKJI_MOBILE_BIDIRECTIONAL_SWIPE_TEST__;
assert.ok(api, "bidirectional swipe test API must be exposed");
assert.equal(api.decideFallbackSwipe({ x: 250, y: 200 }, { x: 224, y: 204 }, "field", 390), "chat", "짧고 느린 왼쪽 밀기도 채팅으로 전환되어야 합니다.");
assert.equal(api.decideFallbackSwipe({ x: 140, y: 200 }, { x: 165, y: 205 }, "chat", 390), "field", "짧은 오른쪽 밀기도 현장으로 복귀해야 합니다.");
assert.equal(api.decideFallbackSwipe({ x: 280, y: 260 }, { x: 210, y: 180 }, "field", 390), "chat", "손가락이 대각선으로 흔들려도 수평 의도가 충분하면 인식해야 합니다.");
assert.equal(api.decideFallbackSwipe({ x: 200, y: 200 }, { x: 185, y: 80 }, "field", 390), "field", "거의 수직인 스크롤은 화면 전환으로 오인하면 안 됩니다.");
assert.equal(api.decideFallbackSwipe({ x: 200, y: 200 }, { x: 188, y: 201 }, "chat", 390), "chat", "아주 짧은 터치는 무시해야 합니다.");

assert.match(source, /SWIPE_MIN_PX = 20/);
assert.match(source, /SWIPE_RATIO = 0\.6/);
assert.match(source, /setPointerCapture/);
assert.match(source, /deferCancelledPointer/);
assert.match(source, /CANCEL_GRACE_MS/);
assert.match(source, /document\.addEventListener\("touchstart"/);
assert.doesNotMatch(source, /if \(!\("PointerEvent" in window\)\)/, "PointerEvent 브라우저에서도 touch 백업을 유지해야 합니다.");
assert.match(source, /data-mobile-investigation-toggle/);
assert.match(source, /suppressClickUntil/);
assert.match(index, /party-flow-sync\.js\?v=0\.3\.28/);
assert.match(index, /mobile-bidirectional-swipe\.js\?v=0\.3\.32/);

console.log("mobile bidirectional swipe checks passed");