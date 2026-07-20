import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mobile-bidirectional-swipe.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "mobile-bidirectional-swipe.js" });

const api = sandbox.window.__BAEKJI_MOBILE_BIDIRECTIONAL_SWIPE_TEST__;
assert.ok(api, "bidirectional swipe test API must be exposed");
assert.equal(api.decideFallbackSwipe({ x: 320, y: 200 }, { x: 180, y: 205 }, "field", 390), "chat");
assert.equal(api.decideFallbackSwipe({ x: 70, y: 200 }, { x: 250, y: 205 }, "chat", 390), "field");
assert.equal(api.decideFallbackSwipe({ x: 200, y: 200 }, { x: 190, y: 80 }, "field", 390), "field");
assert.equal(api.decideFallbackSwipe({ x: 200, y: 200 }, { x: 225, y: 201 }, "chat", 390), "chat");

assert.match(source, /setPointerCapture/);
assert.match(source, /pointercancel/);
assert.match(source, /touchstart/);
assert.match(source, /data-mobile-investigation-toggle/);
assert.match(index, /party-flow-sync\.js\?v=0\.3\.28/);
assert.match(index, /mobile-bidirectional-swipe\.js\?v=0\.3\.28/);

console.log("mobile bidirectional swipe checks passed");
