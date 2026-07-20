import fs from "node:fs";
import assert from "node:assert/strict";

const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const svg = fs.readFileSync(new URL("../assets/maps/haeoreum-day1-map.svg", import.meta.url), "utf8");

const retroBodyPattern = css.slice(css.indexOf("body.retro-mode::before"), css.indexOf("body.retro-mode .topbar"));
assert.ok(retroBodyPattern.includes("display: none"), "전역 점무늬가 텍스트 카드 위에 겹치면 안 됩니다.");

const loginBrand = css.slice(css.indexOf("body.retro-login-mode .login-brand {"), css.indexOf("body.retro-login-mode .login-brand::before"));
assert.ok(loginBrand.includes("background: #deded7"));
assert.ok(!loginBrand.includes("repeating-linear-gradient"));

const homeHero = css.slice(css.indexOf("body.retro-home-mode .hero {"), css.indexOf("body.retro-home-mode .hero::before"));
assert.ok(homeHero.includes("background: #deded7"));
assert.ok(!homeHero.includes("repeating-linear-gradient"));

const pageHero = css.slice(css.indexOf("body.retro-page-mode .hero {"), css.indexOf("body.retro-page-mode .hero::before"));
assert.ok(pageHero.includes("background: #deded7"));
assert.ok(!pageHero.includes("repeating-linear-gradient"));

assert.ok(css.includes(".retro-map-note { font-family: var(--font-body); }"));
assert.ok(!svg.includes("<pattern"), "지도 방과 글자 뒤에는 격자·사선 패턴을 사용하지 않습니다.");
assert.ok(!svg.includes("stroke-dasharray"), "지도 경로는 긴 점선 대신 실선 동선이어야 합니다.");
assert.ok(svg.includes('marker-start:url(#arrow-start)'));
assert.ok(svg.includes("지상 서부 출입구"));
assert.ok(svg.includes("B1 개찰구 · 계단/에스컬레이터 연결"));
assert.ok(svg.includes("B1 제4쉘터 입구로 연결"));
assert.ok(app.includes("실선 양방향 화살표는 실제 이동 가능한 경로"));

console.log("PASS: v0.3.18 텍스트 단색 배경·무패턴 지도·층간 연결 가독성 계약");
