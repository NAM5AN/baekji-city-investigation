import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin-observation-mvp2.css", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../admin-observation-mvp2.js", import.meta.url), "utf8");

assert.match(html, /OBSERVE · COMMUNICATION · CONTROL/);
assert.match(html, /admin-observation-mvp2\.css\?v=0\.2\.1&stage4c=1/);
assert.match(html, /admin-observation-mvp2\.js\?v=0\.2\.2&shell-runtime=1&stage4c=1/);
assert.doesNotMatch(html, /admin-observation-people-polish\.(?:css|js)/, "direct observation rendering must not load a post-paint people polish lane");
assert.equal(fs.existsSync(new URL("../admin-observation-people-polish.css", import.meta.url)), false, "migrated people polish stylesheet must be removed");
assert.equal(fs.existsSync(new URL("../admin-observation-people-polish.js", import.meta.url)), false, "migrated people polish script must be removed");
assert.match(html, /admin-chat-badge">MVP 3/);

assert.match(js, /__BAEKJI_ADMIN_SHELL__/);
assert.match(js, /shell\.snapshot\.subscribe/);
assert.match(js, /data-admin-observe-launch/);
assert.match(js, /전체 구역 · 분기 관찰/);
assert.match(js, /function renderNavigator/);
assert.match(js, /function renderZone/);
assert.match(js, /function renderParty/);
assert.match(js, /function renderCharacter/);
assert.match(js, /historyStack/);
assert.match(js, /data-observe-back/);
assert.match(js, /data-observe-crumb-index/);
assert.match(js, /data-observe-modal-tab/);
assert.match(js, /\[\["summary", "현황"\], \["people", "조사조·인원"\], \["logs", "최근 로그"\]\]/);
assert.match(js, /\[\["summary", "상황"\], \["people", "조원"\], \["logs", "조 로그"\]\]/);
assert.match(js, /\[\["summary", "상태"\], \["items", "소지품"\], \["logs", "개인 행동 로그"\]\]/);
assert.match(js, /현재 현장 보기/);
assert.match(js, /다른 구역 바로 관찰/);
assert.match(js, /돌발 상황 감지/);
assert.match(js, /hazardSummary/);
assert.match(js, /event\.stopImmediatePropagation\(\)/);
assert.match(js, /shell\.onCaptureClick\(/);
assert.match(js, /admin-observe-party-members/);
assert.doesNotMatch(js, /MutationObserver|queueMicrotask/, "party member labels must render from the snapshot, without a post-paint observer");
assert.doesNotMatch(js, /localStorage/);
assert.doesNotMatch(js, /sessionStorage/);
assert.doesNotMatch(js, /PUT|PATCH|DELETE/);
assert.doesNotMatch(js, /admin-system|admin-mutation|put_state/i);

assert.match(css, /\.admin-tabs \.admin-observe-launch/);
assert.match(css, /\.admin-observe-breadcrumbs/);
assert.match(css, /\.admin-observe-modal-tabs/);
assert.match(css, /\.admin-observe-place-grid/);
assert.match(css, /\.admin-observe-alert/);
assert.match(css, /\.admin-observe-log-list/);
assert.match(css, /@media\(max-width:760px\)/);

[
  /\.admin-observe-person > \.admin-observe-avatar\{flex:0 0 36px;width:36px;height:36px;aspect-ratio:1\/1;border-radius:7px;overflow:hidden\}/,
  /\.admin-observe-person > \.admin-observe-avatar\.large\{flex-basis:44px;width:44px;height:44px\}/,
  /\.admin-observe-person > \.admin-observe-avatar img\{display:block;width:100%;height:100%;object-fit:cover\}/,
  /\.admin-observe-person > span:not\(\.admin-observe-avatar\)\{min-width:0;flex:1\}/,
  /\.admin-observe-party-members\{display:block!important;margin-top:4px!important;color:var\(--accent\)!important;font-size:8px!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/,
].forEach((rule, index) => assert.match(css, rule, `main observation stylesheet must retain migrated people rule ${index + 1}`));

console.log("PASS: admin MVP2 observation remains intact with square profile photos and party member names");
