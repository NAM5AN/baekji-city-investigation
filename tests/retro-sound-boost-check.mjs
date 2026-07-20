import assert from "node:assert/strict";
import fs from "node:fs";

const sound = fs.readFileSync(new URL("../retro-sound-boost.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(sound, /out\.gain\.value = 0\.95/);
assert.match(sound, /volume = 0\.075/);
assert.match(sound, /\[data-send-chat\]/);
assert.match(sound, /\[data-move-route\], \[data-enter-investigation\]/);
assert.match(sound, /data-transfer-accept/);
assert.match(sound, /MutationObserver/);
assert.match(index, /retro-sound-boost\.js\?v=0\.3\.45/);

console.log("retro sound boost checks passed");