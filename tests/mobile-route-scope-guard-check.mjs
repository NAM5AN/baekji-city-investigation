import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-route-scope-guard.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile-viewport-recovery.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-route-scope-guard.js" });

const api = sandbox.window.__BAEKJI_MOBILE_ROUTE_SCOPE_TEST__;
assert.ok(api);
assert.equal(api.routePage("#/investigate/session_1"), "investigate");
assert.equal(api.routePage("#/home"), "home");
assert.equal(api.routeIsInvestigation("#/investigate/session_1"), true);
assert.equal(api.routeIsInvestigation("#/home"), false);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: true, mobile: true }), true);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/home", rootExists: true, mobile: true }), false);
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: false, mobile: true }), false);

assert.match(source, /clearStaleViewportStyles/);
assert.match(source, /blurActiveControl/);
assert.match(source, /resetHomeScrollPosition/);
assert.match(source, /observer\.observe\(appRoot/);
assert.doesNotMatch(source, /observer\.observe\(document\.documentElement/);
assert.match(css, /toast-root:empty/);
assert.match(css, /modal-root:empty/);
assert.match(css, /mobile-login-viewport-settling/);
assert.match(index, /viewport-fit=cover/);
assert.match(index, /mobile-viewport-recovery\.css\?v=0\.3\.26/);
assert.match(index, /mobile-investigation-ui\.js\?v=0\.3\.26/);
assert.match(index, /mobile-route-scope-guard\.js\?v=0\.3\.26/);

console.log("mobile route scope guard checks passed");
