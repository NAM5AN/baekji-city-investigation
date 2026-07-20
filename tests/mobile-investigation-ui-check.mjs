import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-investigation-ui.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile-investigation-ui.css", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-investigation-ui.js" });

const api = sandbox.window.__BAEKJI_MOBILE_INVESTIGATION_TEST__;
assert.ok(api, "mobile investigation test API must be exposed");
assert.equal(api.decideSwipe(320, 200, 120, 210, "field", 390), "chat");
assert.equal(api.decideSwipe(70, 200, 280, 190, "chat", 390), "field");
assert.equal(api.decideSwipe(200, 200, 180, 90, "field", 390), "field", "vertical motion must not switch panes");
assert.equal(api.decideSwipe(200, 200, 170, 200, "chat", 390), "chat", "short swipe must be ignored");
assert.equal(api.paneTransform("chat"), "translate3d(-100vw, 0, 0)");
assert.equal(api.paneTransform("field"), "translate3d(0, 0, 0)");

assert.match(source, /data-mobile-investigation-toggle/);
assert.match(source, /pointerdown/);
assert.match(source, /pointermove/);
assert.match(source, /pointerup/);
assert.match(source, /sessionStorage\.setItem/);
assert.match(css, /@media \(max-width: 980px\)/);
assert.match(css, /width: 200vw/);
assert.match(css, /height: 100dvh/);
assert.match(css, /retro-mobile-panel-toggle/);
assert.match(css, /retro-chat-composer/);

console.log("mobile investigation UI checks passed");
