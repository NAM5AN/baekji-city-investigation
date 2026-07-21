import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("retro-motion.css", "utf8");
const js = fs.readFileSync("retro-motion.js", "utf8");

assert.match(html, /retro-motion\.css\?v=0\.3\.31/, "모션 CSS가 버전과 함께 로드되어야 합니다.");
assert.match(html, /retro-motion\.js\?v=0\.3\.46/, "타이핑을 제거한 모션 JS가 로드되어야 합니다.");
assert.ok(html.indexOf("render-motion-stability.js") < html.indexOf("retro-motion.js"), "로그 분류가 모션보다 먼저 로드되어야 합니다.");
assert.doesNotMatch(html, /retro-motion-replay-guard\.js/, "충돌을 만들던 재생 가드는 로드하면 안 됩니다.");

assert.match(js, /const appObserver = new MutationObserver/, "앱 화면 교체를 감지해야 합니다.");
assert.match(js, /motion-stable-new/, "로그 ID로 분류된 신규 항목만 선택해야 합니다.");
assert.match(js, /data-motion-animated/, "같은 DOM 항목을 중복 재생하지 않아야 합니다.");
assert.match(js, /function cleanupTypingArtifacts/, "과거 타이핑 클래스가 남으면 완성 문장으로 복구해야 합니다.");
assert.doesNotMatch(js, /function typeText/, "텍스트를 한 글자씩 변경하는 타이핑 함수가 없어야 합니다.");
assert.doesNotMatch(js, /typingTimers/, "타이핑 타이머를 생성하면 안 됩니다.");
assert.doesNotMatch(js, /target\.textContent = ""/, "문장을 비운 뒤 다시 출력하면 안 됩니다.");
assert.doesNotMatch(js, /characterData:\s*true/, "글자 변화를 관찰하면 안 됩니다.");
assert.match(js, /appObserver\.observe\(app, \{ childList: true \}\)/, "앱 루트 교체만 관찰해야 합니다.");
assert.match(js, /prefers-reduced-motion: reduce/, "사용자의 동작 줄이기 설정을 확인해야 합니다.");
assert.doesNotMatch(js, /setInterval\(/, "애니메이션 감지를 위한 무한 주기 타이머를 사용하면 안 됩니다.");
assert.match(js, /motion-map-unfold/, "지도 모달의 세로 전개 효과가 필요합니다.");

assert.match(css, /motion-page-enter/, "페이지 진입 애니메이션이 필요합니다.");
assert.match(css, /motion-system-new/, "신규 SYSTEM 로그 등장 애니메이션이 필요합니다.");
assert.match(css, /motion-chat-new/, "신규 채팅 등장 애니메이션이 필요합니다.");
assert.match(css, /motion-scene-shift/, "장소 전환 애니메이션이 필요합니다.");
assert.match(css, /motion-modal-enter/, "모달 등장 애니메이션이 필요합니다.");
assert.match(css, /motion-toast-enter/, "알림 등장 애니메이션이 필요합니다.");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "동작 줄이기 CSS 안전장치가 필요합니다.");
assert.match(css, /pointer-events: none/, "화면 효과가 클릭과 드래그를 가로막으면 안 됩니다.");

console.log("retro motion checks passed");