import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.equal(packageJson.version, "0.3.18");
assert.ok(index.includes('styles.css?v=0.3.18'));
assert.ok(index.includes('app.js?v=0.3.18'));
assert.ok(index.includes('http-equiv="Cache-Control"'));
assert.ok(index.includes('<body class="retro-mode">'));
assert.ok(index.includes('rel="preload" href="assets/fonts/01-Ycomputer.otf?v=0.3.18"'));
assert.ok(index.includes('rel="preload" href="assets/fonts/02-DenkiChipHangul.woff2?v=0.3.18"'));
assert.ok(index.includes('rel="preload" href="assets/fonts/07-Cafe24PROUP.woff2?v=0.3.18"'));
assert.ok(app.includes('document.body.classList.add("retro-mode")'));
assert.ok(app.includes('["party", "briefing", "result"].includes(page)'));
assert.ok(app.includes('document.body.classList.add("retro-mode", "retro-page-mode")'));
assert.ok(!app.includes('page !== "investigate" && page !== "login" && page !== "home"'));
assert.ok(css.includes("body.retro-page-mode .card"));
assert.ok(css.includes("body.retro-page-mode .briefing"));
assert.ok(css.includes("body.retro-page-mode .stepper"));
assert.ok(css.includes("body.retro-page-mode .member"));
assert.ok(css.includes("body.retro-login-mode .login-form-heading strong"));
assert.ok(css.includes("body.retro-mode .retro-menu-head strong"));
assert.ok(css.includes("body.retro-mode .retro-investigation textarea"));

console.log("PASS: v0.3.18 로그인·홈·조사조·브리핑·조사·결과 전 화면 게임보이/Y콤퓨타 본문 폰트 계약");
