import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-route-scope-guard.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile-route-scope-guard.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-route-scope-guard.js" });

const api = sandbox.window.__BAEKJI_MOBILE_ROUTE_SCOPE_TEST__;
assert.ok(api, "mobile route scope test API must be exposed");
assert.equal(api.routePage("#/investigate/session_1"), "investigate");
assert.equal(api.routePage("#/home"), "home");
assert.equal(api.routeIsInvestigation("#/investigate/session_1"), true);
assert.equal(api.routeIsInvestigation("#/home"), false);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: true, mobile: true }), true);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/home", rootExists: true, mobile: true }), false);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: false, mobile: true }), false);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: true, mobile: true, homeMode: true }), false);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: true, mobile: true, pageMode: true }), false);

assert.match(source, /mobile-investigation-active/);
assert.match(source, /restoreDocumentScrolling/);
assert.match(source, /clearRestorationStyles/);
assert.match(source, /retro-home-mode/);
assert.match(source, /retro-page-mode/);
assert.match(source, /pointerdown/);
assert.match(source, /touchstart/);
assert.match(source, /attributeFilter: \["class"\]/);
assert.match(css, /body\.retro-home-mode/);
assert.match(css, /body\.retro-home-mode \.shell/);
assert.match(css, /body\.retro-page-mode \.shell/);
assert.match(css, /overflow-y: auto !important/);
assert.match(css, /height: auto !important/);
assert.match(css, /min-height: 0 !important/);
assert.match(css, /touch-action: pan-y !important/);
assert.match(css, /contain: none !important/);
assert.match(css, /#modal-root:empty/);
assert.match(css, /#toast-root:empty/);
assert.doesNotMatch(css, /min-height: 100dvh !important/);
assert.match(index, /mobile-route-scope-guard\.css\?v=0\.3\.24/);
assert.match(index, /mobile-route-scope-guard\.js\?v=0\.3\.24/);

console.log("mobile route scope guard checks passed");