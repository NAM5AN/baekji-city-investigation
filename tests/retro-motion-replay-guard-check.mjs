import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const motion = fs.readFileSync(new URL("../retro-motion.js", import.meta.url), "utf8");

assert.doesNotMatch(index, /retro-motion-replay-guard\.js/, "재생 가드는 페이지에서 제거되어야 합니다.");
assert.match(index, /retro-motion\.js\?v=0\.3\.46/, "타이핑 제거 모션 버전이 로드되어야 합니다.");
assert.match(motion, /motion-stable-new/);
assert.match(motion, /data-motion-animated/);
assert.doesNotMatch(motion, /function typeText/);
assert.doesNotMatch(motion, /typingTimers/);
assert.doesNotMatch(motion, /target\.textContent = ""/);

console.log("retro motion replay guard removal checks passed");