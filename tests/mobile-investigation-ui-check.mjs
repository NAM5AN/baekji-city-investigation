import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-investigation-ui.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile-investigation-ui.css", import.meta.url), "utf8");
const topbarFixCss = fs.readFileSync(new URL("../mobile-investigation-topbar-fix.css", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-investigation-ui.js" });

const api = sandbox.window.__BAEKJI_MOBILE_INVESTIGATION_TEST__;
assert.ok(api, "mobile investigation test API must be exposed");
assert.equal(api.decideSwipe(320, 200, 120, 210, "field", 390), "chat");
assert.equal(api.decideSwipe(70, 200, 280, 190, "chat", 390), "field");
assert.equal(api.decideSwipe(200, 200, 180, 90, "field", 390), "field", "vertical motion must not switch panes");
assert.equal(api.decideSwipe(200, 200, 170, 200, "chat", 390), "chat", "short swipe must be ignored");

const mock = { innerHTML: "same" };
assert.equal(api.updateMarkup(mock, "same"), false, "unchanged control markup must not rewrite DOM");
assert.equal(api.updateMarkup(mock, "next"), true);
assert.equal(mock.innerHTML, "next");

assert.match(source, /data-mobile-investigation-toggle/);
assert.match(source, /pointerdown/);
assert.match(source, /pointermove/);
assert.match(source, /pointerup/);
assert.match(source, /sessionStorage\.setItem/);
assert.match(source, /observer\.observe\(appRoot, \{ childList: true \}\)/);
assert.doesNotMatch(source, /observer\.observe\(document\.documentElement/);
assert.match(css, /@media \(max-width: 980px\)/);
assert.match(css, /body\.mobile-investigation-field \.retro-right-panel\s*\{\s*display: none !important;/s);
assert.match(css, /body\.mobile-investigation-chat \.retro-left-column\s*\{\s*display: none !important;/s);
assert.match(css, /body\.mobile-investigation-field \.retro-left-column\s*\{\s*display: grid !important;/s);
assert.match(css, /body\.mobile-investigation-chat \.retro-right-panel\s*\{\s*display: flex !important;/s);
assert.match(css, /width: 100% !important/);
assert.match(css, /transform: none !important/);
assert.doesNotMatch(css, /width: 200vw/);
assert.match(css, /height: 100dvh/);
assert.match(css, /retro-mobile-panel-toggle/);
assert.match(css, /retro-chat-composer/);

assert.match(topbarFixCss, /body\.mobile-investigation-active \.topbar\s*\{[^}]*position: fixed !important;/s, "mobile investigation topbar must stay fixed outside the pane swap");
assert.match(topbarFixCss, /body\.mobile-investigation-active \.topbar\s*\{[^}]*display: flex !important;/s, "mobile investigation topbar must remain visible");
assert.match(topbarFixCss, /body\.mobile-investigation-active \.shell\s*\{[^}]*padding-top: var\(--mobile-investigation-topbar, 50px\) !important;/s, "shell must reserve the measured topbar height");
assert.match(topbarFixCss, /height: calc\(100dvh - var\(--mobile-investigation-topbar, 50px\)\) !important/, "pane height must exclude the fixed topbar");

console.log("mobile investigation UI checks passed with hard-separated panes and persistent topbar");
