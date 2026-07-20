import assert from "node:assert/strict";
import fs from "node:fs";

const guard = fs.readFileSync(new URL("../retro-motion-replay-guard.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(guard, /motion-stable-existing/);
assert.match(guard, /retro-action-result-pending/);
assert.match(guard, /data-motion-replay-shield/);
assert.match(guard, /restoreExistingText/);
assert.match(guard, /requestAnimationFrame\(\(\) => requestAnimationFrame/);

const stability = index.indexOf("render-motion-stability.js?v=0.3.44");
const replayGuard = index.indexOf("retro-motion-replay-guard.js?v=0.3.45");
const motion = index.indexOf("retro-motion.js?v=0.3.33");
assert.ok(stability >= 0 && replayGuard > stability && motion > replayGuard);

console.log("retro motion replay guard checks passed");