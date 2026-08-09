import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const css = await readFile(new URL("../admin-observation-mvp2.css", import.meta.url), "utf8");
const js = await readFile(new URL("../admin-observation-mvp2.js", import.meta.url), "utf8");

assert.match(html, /OBSERVE · COMMUNICATION · CONTROL · MVP 4/);
assert.match(html, /admin-observation-mvp2\.css\?v=0\.2\.0/);
assert.match(html, /admin-observation-mvp2\.js\?v=0\.2\.0/);
assert.match(html, /admin-chat-badge">MVP 3/);

assert.match(js, /const POLL_MS = 3000/);
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
assert.match(js, /credentials: "same-origin"/);
assert.match(js, /event\.stopImmediatePropagation\(\)/);
assert.match(js, /}, true\);/);
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

console.log("PASS: admin MVP2 observation remains intact inside the MVP4 control shell");
