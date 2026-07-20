import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("retro-motion.css", "utf8");
const js = fs.readFileSync("retro-motion.js", "utf8");

assert.match(html, /retro-motion\.css\?v=0\.3\.30/, "모션 CSS가 버전과 함께 로드되어야 합니다.");
assert.match(html, /retro-motion\.js\?v=0\.3\.30/, "모션 JS가 버전과 함께 로드되어야 합니다.");
assert.ok(html.indexOf("mobile-bidirectional-swipe.js") < html.indexOf("retro-motion.js"), "모션 레이어는 기존 모바일 전환 로직 뒤에 로드되어야 합니다.");

assert.match(js, /new MutationObserver\(scheduleProcess\)/, "앱 화면 교체를 감지해야 합니다.");
assert.match(js, /\.retro-system-line/, "SYSTEM 로그 신규 항목을 추적해야 합니다.");
assert.match(js, /\.retro-chat-message, \.retro-chat-divider/, "채팅 신규 항목을 추적해야 합니다.");
assert.match(js, /routeChanged/, "같은 화면 재렌더와 실제 화면 이동을 구분해야 합니다.");
assert.match(js, /knownSystem/, "기존 SYSTEM 로그의 반복 애니메이션을 방지해야 합니다.");
assert.match(js, /knownChat/, "기존 채팅의 반복 애니메이션을 방지해야 합니다.");
assert.match(js, /slice\(-8\)/, "한 번에 재생되는 신규 항목 수를 제한해야 합니다.");
assert.match(js, /prefers-reduced-motion: reduce/, "사용자의 동작 줄이기 설정을 확인해야 합니다.");
assert.doesNotMatch(js, /setInterval\(/, "애니메이션 감지를 위한 무한 주기 타이머를 사용하면 안 됩니다.");

assert.match(css, /motion-page-enter/, "페이지 진입 애니메이션이 필요합니다.");
assert.match(css, /motion-system-new/, "SYSTEM 로그 등장 애니메이션이 필요합니다.");
assert.match(css, /motion-chat-new/, "채팅 등장 애니메이션이 필요합니다.");
assert.match(css, /motion-scene-shift/, "장소 전환 애니메이션이 필요합니다.");
assert.match(css, /motion-modal-enter/, "모달 등장 애니메이션이 필요합니다.");
assert.match(css, /motion-toast-enter/, "알림 등장 애니메이션이 필요합니다.");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "동작 줄이기 CSS 안전장치가 필요합니다.");
assert.match(css, /pointer-events: none/, "화면 효과가 클릭과 드래그를 가로막으면 안 됩니다.");

console.log("retro motion checks passed");