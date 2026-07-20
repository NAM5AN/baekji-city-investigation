import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../retro-sound.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(source, /AudioContext|webkitAudioContext/);
assert.match(source, /filter\.type = "lowpass"/);
assert.match(source, /frequency:\s*92/);
assert.match(source, /popup\(\)/);
assert.match(source, /move\(\)/);
assert.match(source, /confirm\(\)/);
assert.match(source, /cancel\(\)/);
assert.match(source, /event\.isTrusted/);
assert.match(source, /data-send-chat/);
assert.match(source, /retro-motion-overlay/);
assert.match(index, /retro-sound\.js\?v=0\.3\.41/);

console.log("retro sound checks passed");
