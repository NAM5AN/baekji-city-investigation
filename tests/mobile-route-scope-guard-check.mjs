import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-route-scope-guard.js", import.meta.url), "utf8");
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
assert.equal(api.shouldKeepMobileInvestigationScope({ hashValue: "#/investigate/1", rootExists: true, mobile: false }), false);

assert.match(source, /mobile-investigation-active/);
assert.match(source, /resetOutsideInvestigation/);
assert.match(source, /observer\.observe\(appRoot, \{ childList: true \}\)/);
assert.match(source, /pointerdown/);
assert.match(source, /touchstart/);
assert.doesNotMatch(source, /observe\(document\.documentElement/);
assert.doesNotMatch(source, /subtree:\s*true/);
assert.doesNotMatch(source, /style\.setProperty/);
assert.doesNotMatch(source, /height["']?,\s*["']auto/);

assert.doesNotMatch(index, /mobile-route-scope-guard\.css/);
assert.match(index, /mobile-investigation-ui\.css\?v=0\.3\.25/);
assert.match(index, /mobile-investigation-ui\.js\?v=0\.3\.25/);
assert.match(index, /mobile-route-scope-guard\.js\?v=0\.3\.25/);

console.log("mobile route scope guard checks passed");