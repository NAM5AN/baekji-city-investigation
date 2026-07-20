import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-panel-layout-fix.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile-panel-layout-fix.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: { innerWidth: 390, setTimeout, clearTimeout }, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-panel-layout-fix.js" });

const api = sandbox.window.__BAEKJI_MOBILE_PANEL_LAYOUT_TEST__;
assert.ok(api, "mobile panel layout test API must be exposed");
assert.equal(api.qualifiesAsPaneSwipe({ x: 320, y: 200 }, { x: 100, y: 205 }), true);
assert.equal(api.qualifiesAsPaneSwipe({ x: 200, y: 300 }, { x: 205, y: 120 }), false);
assert.equal(api.qualifiesAsPaneSwipe({ x: 200, y: 200 }, { x: 170, y: 200 }), false);

assert.match(css, /grid-template-rows:\s*62% 38%/);
assert.match(css, /grid-template-rows:\s*64% 36%/);
assert.doesNotMatch(css, /grid-template-rows:[^;]*\b0\b[^;]*36%/);
assert.match(css, /mobile-investigation-chat[\s\S]*mobile-investigation-topbar[\s\S]*58px/);
assert.match(css, /transition:\s*none\s*!important/);
assert.match(css, /mobile-pane-user-switching[\s\S]*transition:\s*transform/);
assert.match(source, /data-mobile-investigation-toggle/);
assert.match(source, /pointerup/);
assert.match(index, /mobile-panel-layout-fix\.css\?v=0\.3\.27/);
assert.match(index, /mobile-panel-layout-fix\.js\?v=0\.3\.27/);

console.log("mobile panel layout fix checks passed");
